import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterSession } from './openrouter-session';
import { stubLocation } from '../../testing/stub-location';
import { VAULT_TEST_ROLLOUT } from '../vault/vault-preference';

const KEY_KEY = 'mockingbird_openrouter_key';
const VERIFIER_KEY = 'mockingbird_openrouter_pkce_verifier';
const STATE_KEY = 'mockingbird_openrouter_oauth_state';

/**
 * Specs share one jsdom realm, so anything stubbed on a global here has to be
 * put back — see ui/docs/shared-jsdom-realm-in-tests.md.
 */
describe('OpenRouterSession', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let navigatedTo: string[];
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    // jsdom won't navigate and won't let location.assign be spied in place —
    // see docs/shared-jsdom-realm-in-tests.md and the stubLocation comment.
    navigatedTo = [];
    stubLocation({ onAssign: (url) => navigatedTo.push(url) });
    TestBed.configureTestingModule({
      providers: [{ provide: VAULT_TEST_ROLLOUT, useValue: true }],
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function session(): OpenRouterSession {
    return TestBed.inject(OpenRouterSession);
  }

  function jsonResponse(body: unknown, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response;
  }

  // --------------------------------------------------------------- authorize

  it('sends the state inside callback_url, since OpenRouter takes no state param', async () => {
    await session().connect();

    expect(navigatedTo).toHaveLength(1);
    const url = new URL(navigatedTo[0]);
    expect(url.origin + url.pathname).toBe('https://openrouter.ai/auth');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();

    // The state is not a top-level param — it rides in the callback URL.
    expect(url.searchParams.get('state')).toBeNull();
    const callback = new URL(url.searchParams.get('callback_url')!);
    expect(callback.pathname).toContain('integrations/openrouter/callback');
    expect(callback.searchParams.get('state')).toBe(sessionStorage.getItem(STATE_KEY));
  });

  it('returns to THIS deployment, not whichever one owns the site root', async () => {
    // Canary is https://mawkingbird.com/canary/ on the same origin as production.
    // Building the callback from location.origin sent the code to production,
    // which has no pending verifier and fails the flow. The base href is the
    // only thing that distinguishes the two.
    const base = document.createElement('base');
    base.href = 'https://mawkingbird.com/canary/';
    document.head.appendChild(base);
    try {
      await session().connect();

      const url = new URL(navigatedTo[0]);
      expect(url.searchParams.get('callback_url')).toContain(
        'https://mawkingbird.com/canary/integrations/openrouter/callback',
      );
    } finally {
      // Specs share one jsdom realm — a stray <base> would rewrite every
      // relative URL in every later file. See docs/shared-jsdom-realm-in-tests.md.
      base.remove();
    }
  });

  it('keeps the verifier in this browser and sends only the challenge', async () => {
    await session().connect();
    const url = new URL(navigatedTo[0]);
    const verifier = sessionStorage.getItem(VERIFIER_KEY)!;

    expect(verifier).toBeTruthy();
    expect(url.toString()).not.toContain(verifier);
  });

  // ----------------------------------------------------------------- exchange

  async function beginFlow(): Promise<{ state: string }> {
    await session().connect();
    return { state: sessionStorage.getItem(STATE_KEY)! };
  }

  it('exchanges a code for a key when the state matches', async () => {
    const { state } = await beginFlow();
    fetchMock.mockResolvedValue(jsonResponse({ key: 'sk-or-v1-abc', user_id: 'user_1' }));

    const svc = session();
    await svc.finishAuthorization(new URLSearchParams({ code: 'auth-code', state }));

    expect(svc.connected()).toBe(true);
    expect(svc.apiKey()).toBe('sk-or-v1-abc');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/auth/keys');
    expect(JSON.parse(init.body as string)).toMatchObject({
      code: 'auth-code',
      code_challenge_method: 'S256',
    });
    // The verifier must be sent, and the pending flow cleared afterwards.
    expect(JSON.parse(init.body as string).code_verifier).toBeTruthy();
    expect(sessionStorage.getItem(VERIFIER_KEY)).toBeNull();
    expect(sessionStorage.getItem(STATE_KEY)).toBeNull();
  });

  it('refuses a mismatched state and stores nothing', async () => {
    await beginFlow();
    const svc = session();

    await expect(
      svc.finishAuthorization(new URLSearchParams({ code: 'auth-code', state: 'not-the-state' })),
    ).rejects.toThrow(/invalid or expired/i);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(svc.connected()).toBe(false);
    expect(localStorage.getItem(KEY_KEY)).toBeNull();
  });

  it('refuses a missing state — the check must fail closed', async () => {
    await beginFlow();
    const svc = session();

    await expect(
      svc.finishAuthorization(new URLSearchParams({ code: 'auth-code' })),
    ).rejects.toThrow(/invalid or expired/i);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY_KEY)).toBeNull();
  });

  it('surfaces an OAuth error from the callback without exchanging', async () => {
    await beginFlow();

    await expect(
      session().finishAuthorization(new URLSearchParams({ error: 'access_denied' })),
    ).rejects.toThrow('access_denied');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports the API error message when the exchange is rejected', async () => {
    const { state } = await beginFlow();
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 400, message: 'Invalid code_verifier' } }, 400),
    );

    await expect(
      session().finishAuthorization(new URLSearchParams({ code: 'bad', state })),
    ).rejects.toThrow('Invalid code_verifier');
    expect(localStorage.getItem(KEY_KEY)).toBeNull();
  });

  // ------------------------------------------------------------------ storage

  it('stores the key unscoped, so every account in this browser shares it', async () => {
    const { state } = await beginFlow();
    fetchMock.mockResolvedValue(jsonResponse({ key: 'sk-or-v1-shared' }));
    await session().finishAuthorization(new URLSearchParams({ code: 'c', state }));

    // No account-scope suffix: the exact base key, and nothing else.
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('mockingbird_openrouter'));
    expect(keys).toEqual([KEY_KEY]);
  });

  it('survives per-account data deletion, which works by scope suffix', async () => {
    const { state } = await beginFlow();
    fetchMock.mockResolvedValue(jsonResponse({ key: 'sk-or-v1-shared' }));
    await session().finishAuthorization(new URLSearchParams({ code: 'c', state }));

    // Simulate removing another account's local data: everything with a suffix.
    localStorage.setItem('mockingbird_bsky_profile_abc123', '{}');
    for (const key of Object.keys(localStorage)) {
      if (key.endsWith('_abc123')) {
        localStorage.removeItem(key);
      }
    }

    expect(localStorage.getItem(KEY_KEY)).toContain('sk-or-v1-shared');
  });

  it('disconnects on demand and forgets the key', async () => {
    const { state } = await beginFlow();
    fetchMock.mockResolvedValue(jsonResponse({ key: 'sk-or-v1-abc' }));
    const svc = session();
    await svc.finishAuthorization(new URLSearchParams({ code: 'c', state }));

    svc.disconnect();

    expect(svc.connected()).toBe(false);
    expect(svc.apiKey()).toBeNull();
    expect(localStorage.getItem(KEY_KEY)).toBeNull();
  });

  it('locks rather than disconnects a key that outlived the retention policy', () => {
    // Changed when the connection vault shipped, and the change is the point.
    //
    // The OpenRouter key is vaulted, so local expiry no longer means "there is
    // no copy left" — it means "the plaintext is not in this browser". Reporting
    // that as *disconnected* would tell the user to reconnect something that is
    // still connected, and the next vault read would contradict them by bringing
    // it straight back.
    //
    // So: plaintext gone, connection kept, `needsFetch` set. The local exposure
    // window still shrinks, which was the original point of the policy.
    const longAgo = Date.now() - 400 * 24 * 60 * 60 * 1000;
    localStorage.setItem(KEY_KEY, JSON.stringify({ key: 'sk-or-v1-old', connectedAt: longAgo }));

    const svc = session();
    expect(localStorage.getItem(KEY_KEY)).toBeNull();
    expect(svc.connected()).toBe(true);
    expect(svc.needsFetch()).toBe(true);
  });

  it('ignores a malformed stored key rather than throwing on boot', () => {
    localStorage.setItem(KEY_KEY, 'not json');
    expect(session().connected()).toBe(false);
  });
});
