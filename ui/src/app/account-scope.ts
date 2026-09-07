import { blueskyIdentityDid } from './providers/bluesky/bluesky-identity-store';
import { STORAGE_KEYS } from './storage-registry';

const TOKEN_KEY = 'mastodon_mock_token';
const SESSIONS_KEY = 'mastodon_mock_sessions';
const SESSION_TOKENS_KEY = 'mastodon_mock_session_tokens';
const ACCOUNT_MODE_KEY = 'mastodon_mock_account_mode';
const adoptedScopes = new Set<string>();
const MIGRATABLE_ACCOUNT_KEYS = STORAGE_KEYS.filter(
  (spec) =>
    spec.suffix === 'account' &&
    spec.base !== 'mockingbird_drafts' &&
    spec.base !== 'mockingbird_compose_autosave',
);

interface StoredMastodonSession {
  id?: unknown;
  server?: unknown;
  account?: { id?: unknown } | null;
}

export const ANONYMOUS_SCOPE_SUFFIX = '_anonymous';
export const BLUESKY_SCOPE_PREFIX = '_bluesky_';
export const MASTODON_SCOPE_PREFIX = '_mastodon_';

/** Return the active account's stable browser-storage identity. */
export function accountScopeSuffix(): string {
  try {
    const mode = localStorage.getItem(ACCOUNT_MODE_KEY);
    if (mode === 'anonymous') return ANONYMOUS_SCOPE_SUFFIX;
    if (mode === 'bluesky') {
      const did = blueskyIdentityDid();
      if (!did) return '';
      const stable = scopeSuffixForDid(did);
      migrateScope(legacyScopeSuffixForDid(did), stable);
      return stable;
    }
  } catch {
    return '';
  }

  let token: string | null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    return '';
  }
  if (!token) return '';

  const identity = mastodonIdentityForToken(token);
  if (!identity) return scopeSuffixForToken(token);
  const stable = scopeSuffixForMastodonAccount(identity.accountId, identity.server);
  migrateScope(scopeSuffixForToken(token), stable);
  return stable;
}

/** Historical token suffix, retained for existing-data adoption and unverified logins. */
export function scopeSuffixForToken(token: string): string {
  return token ? `_${hash(token)}` : '';
}

/** Build a collision-free suffix from provider, server, and verified account id. */
export function scopeSuffixForMastodonAccount(accountId: string, server: string): string {
  const origin = normalizeServer(server);
  return accountId && origin
    ? `${MASTODON_SCOPE_PREFIX}${encodeIdentity(`mastodon\0${origin}\0${accountId}`)}`
    : '';
}

/** Adopt non-draft values written before a Mastodon identity was verified. */
export function adoptMastodonStorageScope(
  accountId: string,
  server: string,
  legacyTokens: readonly string[],
): string {
  const stable = scopeSuffixForMastodonAccount(accountId, server);
  for (const token of legacyTokens) migrateScope(scopeSuffixForToken(token), stable);
  return stable;
}

/** Build a collision-free suffix for a Bluesky-primary DID. */
export function scopeSuffixForDid(did: string): string {
  return did ? `${BLUESKY_SCOPE_PREFIX}${encodeIdentity(`bluesky\0${did}`)}` : '';
}

/** The old Bluesky suffix, used only to adopt and delete existing data. */
export function legacyScopeSuffixForDid(did: string): string {
  return did ? `_bsky_${hash(did)}` : '';
}

export function scopedKey(baseKey: string): string {
  return `${baseKey}${accountScopeSuffix()}`;
}

function normalizeServer(server: string): string {
  const value = server || (typeof location === 'undefined' ? '' : location.origin);
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return value.replace(/\/$/, '').toLowerCase();
  }
}

/** Collision-free UTF-8 encoding without putting the readable identity in the key. */
function encodeIdentity(identity: string): string {
  const bytes = new TextEncoder().encode(identity);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function mastodonIdentityForToken(token: string): { accountId: string; server: string } | null {
  try {
    const rows = JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '[]') as unknown;
    const tokens = JSON.parse(localStorage.getItem(SESSION_TOKENS_KEY) ?? '{}') as unknown;
    if (!Array.isArray(rows) || !tokens || typeof tokens !== 'object') return null;
    const tokenMap = tokens as Record<string, unknown>;
    const row = (rows as StoredMastodonSession[]).find(
      (candidate) => typeof candidate?.id === 'string' && tokenMap[candidate.id] === token,
    );
    const accountId = row?.account?.id;
    if (typeof accountId !== 'string' || !accountId) return null;
    return { accountId, server: typeof row.server === 'string' ? row.server : '' };
  } catch {
    return null;
  }
}

/**
 * Adopt old non-draft account data after the verified identity is known. Drafts
 * and autosaves intentionally stay put; the owner confirmed there is no draft
 * data to migrate.
 */
function migrateScope(from: string, to: string): void {
  if (!from || !to || from === to) return;
  const adoption = `${from}\0${to}`;
  if (adoptedScopes.has(adoption)) return;
  try {
    migrateStorage(localStorage, from, to);
  } catch {
    // Retry on the next lookup; a transient storage failure must not orphan data.
    return;
  }
  try {
    migrateStorage(sessionStorage, from, to);
  } catch {
    // sessionStorage may be unavailable while localStorage remains usable.
  }
  adoptedScopes.add(adoption);
}

function migrateStorage(storage: Storage, from: string, to: string): void {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => key !== null && key.endsWith(from))
    .filter((key) =>
      MIGRATABLE_ACCOUNT_KEYS.some(
        (spec) =>
          spec.storage === (storage === localStorage ? 'local' : 'session') &&
          key.startsWith(spec.base),
      ),
    );
  for (const key of keys) {
    const destination = `${key.slice(0, -from.length)}${to}`;
    if (storage.getItem(destination) !== null) continue;
    const value = storage.getItem(key);
    if (value === null) continue;
    storage.setItem(destination, value);
    storage.removeItem(key);
  }
}

/** Historical FNV-1a used only to locate pre-stable namespaces. */
function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
