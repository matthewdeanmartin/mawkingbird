import { inject, Injectable, signal } from '@angular/core';
import {
  appCallbackUrl,
  codeChallengeFor,
  createCodeVerifier,
  createOAuthState,
  statesMatch,
} from '../../pkce';
import {
  credentialExpiresAt,
  ensureStamped,
  ExpiringConnection,
  ExpiringCredential,
  stampCredential,
} from '../credential-lifetime';
import { VaultBridge, type SyncOutcome } from '../vault/vault-bridge';
import { reconcileScalar, type VaultReconcileOutcome } from '../vault/vault-reconcile';

/**
 * A browser-only OpenRouter OAuth/PKCE session.
 *
 * Two things make this different from every other connector here, and both are
 * deliberate:
 *
 * **1. The key is not account-scoped.** Every other credential in the app goes
 * through `scopedKey()`, because a Bluesky link belongs to the Mastodon persona
 * that made it. An LLM key belongs to the *human*: it is the same key whether
 * you are signed in as your main, your alt, or Anonymous, and making you
 * reconnect per persona would be busywork protecting nothing. So these keys are
 * plain, unsuffixed, and shared across every account in this browser. See
 * `storage-registry.ts`, where they are registered `suffix: 'none'`.
 *
 * **2. OpenRouter's authorization step has no `state` parameter.** It accepts
 * only `callback_url`, `code_challenge` and `code_challenge_method`. `state` is
 * not optional security theatre — without it, an attacker can hand this browser
 * a code minted for *their* account and we would silently connect to it. So the
 * state rides inside `callback_url` as a query parameter, which OpenRouter
 * preserves when it appends `code`, and {@link finishAuthorization} verifies it
 * exactly as the Dropbox flow does. If OpenRouter ever starts stripping unknown
 * query params, every connection attempt fails loudly rather than quietly
 * dropping the check — which is the direction you want to fail in.
 */

const KEY_KEY = 'mockingbird_openrouter_key';
const VERIFIER_KEY = 'mockingbird_openrouter_pkce_verifier';
const STATE_KEY = 'mockingbird_openrouter_oauth_state';

const AUTHORIZE_URL = 'https://openrouter.ai/auth';
const EXCHANGE_URL = 'https://openrouter.ai/api/v1/auth/keys';

/** The stored credential, plus the retention stamp that governs it. */
interface StoredOpenRouterKey extends ExpiringCredential {
  key: string;
  userId?: string;
}

interface ExchangeResponse {
  key: string;
  user_id?: string;
}

@Injectable({ providedIn: 'root' })
export class OpenRouterSession implements ExpiringConnection {
  private bridge = inject(VaultBridge);
  private stored = signal<StoredOpenRouterKey | null>(readKey());

  readonly connected = signal(this.stored() !== null);

  /**
   * Connected, but the key is not in this browser right now.
   *
   * Reached when local retention expired a vaulted credential: the plaintext is
   * gone and the encrypted copy is not. The connections page renders this as
   * locked rather than disconnected, because telling someone to reconnect
   * something that is still connected is how they end up pasting a key they did
   * not need to.
   */
  readonly needsFetch = signal(false);

  constructor() {
    this.enforceLifetime();
  }

  /**
   * The API key for callers that need it, or null when not connected.
   *
   * `localStorage` first; the vault only answers a miss. That ordering is what
   * keeps this connector working with the vault locked, unavailable, or never
   * set up — which it must, because it worked before the vault existed.
   */
  apiKey(): string | null {
    const local = this.stored()?.key;
    if (local) {
      return local;
    }
    const fromVault = this.bridge.readThrough(KEY_KEY);
    if (fromVault) {
      // Repopulate, so the next call is local again and the retention clock
      // restarts from this use rather than from the original connection.
      this.store(stampCredential({ key: fromVault }), false);
      this.needsFetch.set(false);
    }
    return fromVault;
  }

  /** Begin authorization. Navigates away; the callback page finishes the job. */
  async connect(): Promise<void> {
    const verifier = createCodeVerifier();
    const state = createOAuthState();
    const challenge = await codeChallengeFor(verifier);
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);

    const authorizeUrl = new URL(AUTHORIZE_URL);
    authorizeUrl.search = new URLSearchParams({
      callback_url: redirectUri(state),
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
    location.assign(authorizeUrl.toString());
  }

  /**
   * Complete authorization from the callback URL's query string.
   *
   * `params` carries both OpenRouter's `code` and the `state` we smuggled
   * through `callback_url`. A missing or mismatched state is fatal: no key is
   * stored, the pending flow is cleared, and the caller shows the error.
   */
  async finishAuthorization(params: URLSearchParams): Promise<void> {
    const oauthError = params.get('error_description') ?? params.get('error');
    if (oauthError) {
      this.clearPendingAuthorization();
      throw new Error(oauthError);
    }

    const code = params.get('code');
    const state = params.get('state');
    const expectedState = sessionStorage.getItem(STATE_KEY);
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    if (!code || !statesMatch(expectedState, state) || !verifier) {
      this.clearPendingAuthorization();
      throw new Error(
        'OpenRouter returned an invalid or expired authorization response. Please try again.',
      );
    }

    try {
      const response = await fetch(EXCHANGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          code_verifier: verifier,
          code_challenge_method: 'S256',
        }),
      });
      if (!response.ok) {
        throw new Error(
          await openRouterError(response, 'OpenRouter rejected the authorization code.'),
        );
      }
      const result = (await response.json()) as ExchangeResponse;
      if (!result.key) {
        throw new Error('OpenRouter did not return an API key.');
      }
      this.store(stampCredential({ key: result.key, userId: result.user_id }));
    } finally {
      this.clearPendingAuthorization();
    }
  }

  /**
   * Disconnect, and remove the stored copy too.
   *
   * Deliberate disconnection has to reach the vault, or "disconnect" here is
   * undone by the next sync from another device — the same resurrection problem
   * local expiry had, and just as confusing.
   */
  disconnect(): void {
    void this.bridge.removeThrough(KEY_KEY);
    this.forgetLocally();
    this.connected.set(false);
    this.needsFetch.set(false);
  }

  /**
   * {@link ExpiringConnection}: apply the local retention policy.
   *
   * For a vaulted key this is a **lock**, not a disconnection: the plaintext
   * goes, the connection stays, and the next `apiKey()` fetches it back. See
   * `VaultBridge.verdictFor`.
   */
  enforceLifetime(): void {
    const stored = this.stored();
    if (!stored) {
      return;
    }
    const verdict = this.bridge.verdictFor(KEY_KEY, stored.connectedAt);
    if (verdict.kind === 'disconnect') {
      this.disconnect();
    } else if (verdict.kind === 'lock') {
      this.forgetLocally();
      // Still connected. The credential exists; it is simply not here.
      this.needsFetch.set(true);
    }
  }

  /** Clear the local plaintext without touching the vault or the connected flag. */
  private forgetLocally(): void {
    try {
      localStorage.removeItem(KEY_KEY);
    } catch {
      // Nothing to do — the in-memory clear below still takes effect.
    }
    this.stored.set(null);
  }

  /** {@link ExpiringConnection}: when the key ages out, or null. */
  expiresAt(): number | null {
    return credentialExpiresAt(this.stored()?.connectedAt);
  }

  /**
   * Persist a key locally, then push it to the vault.
   *
   * The vault write is not awaited: pasting a key should feel instant. It is
   * still returned by {@link syncToVault} for the settings page to observe,
   * because a silently swallowed failure is the bug where someone believes their
   * key synced and finds nothing on their phone a week later.
   */
  private store(value: StoredOpenRouterKey, sync = true): void {
    try {
      localStorage.setItem(KEY_KEY, JSON.stringify(value));
    } catch {
      // Storage full or blocked: honour the connection for this session anyway.
    }
    this.stored.set(value);
    this.connected.set(true);
    this.needsFetch.set(false);
    if (sync) {
      void this.bridge.writeThrough(KEY_KEY, value.key);
    }
  }

  /**
   * Push the current key to the vault and report what happened.
   *
   * For the settings page, which offers "store this key with Mawkingbird" as an
   * explicit per-connector act rather than a global switch.
   */
  async syncToVault(): Promise<SyncOutcome> {
    const key = this.stored()?.key;
    return key ? this.bridge.writeThrough(KEY_KEY, key) : { kind: 'skipped' };
  }

  /** Fill an empty browser from the vault, or an empty vault from this browser. */
  reconcileVault(): Promise<VaultReconcileOutcome> {
    return reconcileScalar({
      local: this.stored()?.key ?? null,
      remote: this.bridge.readThrough(KEY_KEY),
      restore: (key) => {
        if (!key) {
          return false;
        }
        this.store(stampCredential({ key }), false);
        return true;
      },
      store: () => this.syncToVault(),
      conflictMessage:
        'OpenRouter has different non-empty keys here and in Mawkingbird; neither copy was replaced.',
    });
  }

  private clearPendingAuthorization(): void {
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
  }
}

/**
 * Where OpenRouter sends the user back, carrying our anti-CSRF state.
 *
 * OpenRouter appends `?code=…` (or `&code=…`) to whatever it is given, so a
 * query parameter of ours survives the round trip.
 *
 * Built via {@link appCallbackUrl} rather than `location.origin`: canary lives
 * at `/canary/` on the same origin as production, and an origin-only callback
 * would hand the code to whichever deployment owns the site root.
 */
function redirectUri(state: string): string {
  const url = new URL(appCallbackUrl('integrations/openrouter/callback'));
  url.searchParams.set('state', state);
  return url.toString();
}

function readKey(): StoredOpenRouterKey | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY_KEY);
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as StoredOpenRouterKey;
    if (typeof parsed?.key !== 'string' || !parsed.key) {
      throw new Error('malformed');
    }
    // Records written before the retention stamp existed start their clock now
    // rather than being treated as instantly expired.
    return ensureStamped(KEY_KEY, parsed);
  } catch {
    try {
      localStorage.removeItem(KEY_KEY);
    } catch {
      // Ignore: unreadable and unremovable is still "not connected".
    }
    return null;
  }
}

/** OpenRouter's error envelope is `{ error: { code, message } }`. */
export async function openRouterError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}
