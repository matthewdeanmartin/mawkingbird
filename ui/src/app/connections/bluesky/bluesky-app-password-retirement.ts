import { BSKY_IDENTITY_CREDENTIALS_KEY } from './bluesky-identity-store';

/** The connector credentials key, before its per-account scope suffix. */
const CONNECTOR_CREDENTIALS_BASE = 'mockingbird_bsky_credentials';

/**
 * Retire every stored Bluesky app-password link (spec/bsky_parity.md, phase 2).
 *
 * Bluesky's own sign-in (OAuth with PKCE and DPoP) replaced app passwords. Each
 * app-password credential, for a Bluesky-first identity or a connector under
 * any account, loses its tokens and its password and becomes
 * `{ authMethod: 'retired' }`. The account stays where it was, so nothing is
 * signed out of the list; using it asks for Bluesky's sign-in for the same
 * account, which replaces the retired marker. A vaulted password is dropped by
 * `BlueskySession` when that account next runs.
 *
 * Idempotent and synchronous, run once at start-up before anything reads the
 * keys. Returns how many links it retired.
 */
export function retireBlueskyAppPasswords(storage: Storage = localStorage): number {
  let retired = 0;
  const retire = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const credentials = value as Record<string, unknown>;
    const method = credentials['authMethod'];
    if (method === 'oauth' || method === 'retired') return null;
    if (typeof credentials['accessJwt'] !== 'string' && method !== 'app-password') return null;
    retired++;
    return {
      authMethod: 'retired',
      ...(typeof credentials['connectedAt'] === 'number'
        ? { connectedAt: credentials['connectedAt'] }
        : {}),
    };
  };

  for (const key of Object.keys(storage)) {
    if (key === BSKY_IDENTITY_CREDENTIALS_KEY) {
      const map = parse(storage.getItem(key));
      if (!map) continue;
      // An older single-identity blob is the credentials object itself.
      const single = retire(map);
      if (single) {
        storage.setItem(key, JSON.stringify(single));
        continue;
      }
      let changed = false;
      for (const [did, value] of Object.entries(map)) {
        const next = retire(value);
        if (next) {
          map[did] = next;
          changed = true;
        }
      }
      if (changed) storage.setItem(key, JSON.stringify(map));
    } else if (key.startsWith(CONNECTOR_CREDENTIALS_BASE)) {
      const next = retire(parse(storage.getItem(key)));
      if (next) storage.setItem(key, JSON.stringify(next));
    }
  }
  return retired;
}

function parse(raw: string | null): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
