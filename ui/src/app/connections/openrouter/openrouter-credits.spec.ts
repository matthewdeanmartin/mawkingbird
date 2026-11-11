import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeCredits, OpenRouterCredits } from './openrouter-credits';
import { OpenRouterSession } from './openrouter-session';

describe('OpenRouterCredits', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;
  let disconnect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    disconnect = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: OpenRouterSession,
          useValue: { apiKey: () => 'sk-or-v1-test', disconnect },
        },
      ],
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function credits(): OpenRouterCredits {
    return TestBed.inject(OpenRouterCredits);
  }

  function jsonResponse(body: unknown, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response;
  }

  /** The normal case: an inference key, so /credits 403s and /key answers. */
  function respond(keyBody: unknown, keyStatus = 200) {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/credits')
          ? jsonResponse({ error: { message: 'management key required' } }, 403)
          : jsonResponse(keyBody, keyStatus),
      ),
    );
  }

  it('treats a 403 from /credits as normal, not as an error', async () => {
    respond({ data: { usage: 1.25, limit: null, limit_remaining: null } });

    const state = await credits().load();

    // The 403 must not leak into the UI in any form.
    expect(state.kind).toBe('uncapped');
    expect(describeCredits(state)).not.toMatch(/error|403|management/i);
  });

  it('reports remaining against the cap when the key has one', async () => {
    respond({ data: { usage: 5.88, limit: 10, limit_remaining: 4.12 } });

    const state = await credits().load();

    expect(state).toEqual({ kind: 'capped', remaining: 4.12, limit: 10 });
    expect(describeCredits(state)).toBe('$4.12 of $10.00 remaining on this key');
  });

  it('reports usage only when the key has no cap — never a fake remaining', async () => {
    respond({ data: { usage: 5.88, limit: null, limit_remaining: null } });

    const state = await credits().load();

    expect(state).toEqual({ kind: 'uncapped', used: 5.88 });
    expect(describeCredits(state)).toBe('$5.88 used — no spending cap on this key');
  });

  it('prefers account-wide credits when a management key answers', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/credits')
          ? jsonResponse({ data: { total_credits: 100, total_usage: 25.75 } })
          : jsonResponse({ data: { usage: 25.75, limit: null } }),
      ),
    );

    const state = await credits().load();

    expect(state).toEqual({ kind: 'account', remaining: 74.25, total: 100 });
    expect(describeCredits(state)).toBe('$74.25 of $100.00 remaining on your account');
  });

  it('disconnects when OpenRouter says the key is gone', async () => {
    respond({ error: { message: 'no auth' } }, 401);

    const state = await credits().load();

    expect(disconnect).toHaveBeenCalled();
    expect(state.kind).toBe('unknown');
  });

  it('reports a network failure without throwing', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    const state = await credits().load();

    expect(state).toEqual({ kind: 'unknown', reason: "Couldn't reach OpenRouter." });
  });

  it('says so when nothing is connected, without calling the API', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: OpenRouterSession, useValue: { apiKey: () => null, disconnect: vi.fn() } },
      ],
    });

    const state = await TestBed.inject(OpenRouterCredits).load();

    expect(state.kind).toBe('unknown');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
