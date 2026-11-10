// Saved Misskey-primary identities, kept in localStorage.
//
// Shaped like `bluesky-identity-store.ts`, for the same reasons: the profile
// collection (who, on which server) is exportable `private` data, and the token
// collection is a `secret` that never is, so they live under two keys joined by
// an identity key. Unscoped, because the identity key is what the account scope
// is derived from.
//
// An identity key is `<origin>#<userId>`. Misskey user ids are per server
// (like Mastodon's), so the origin must be part of it.

export const ACCOUNT_MODE_KEY = 'mastodon_mock_account_mode';
export const MK_IDENTITY_PROFILE_KEY = 'mockingbird_misskey_identity_profile';
export const MK_IDENTITY_CREDENTIALS_KEY = 'mockingbird_misskey_identity_credentials';
export const MK_ACTIVE_IDENTITY_KEY = 'mockingbird_misskey_active_identity';
export const MK_VISITOR_KEY = 'mockingbird_misskey_visitor';
/** The visitor's follows (`misskey-visitor-follows.ts`); forgotten with the visitor. */
export const MK_VISITOR_FOLLOWS_KEY = 'mockingbird_misskey_visitor_follows';

/**
 * The identity key of the **Misskey visitor**: the virtual, account-less
 * Misskey user, one per browser (Anonymous's counterpart on Misskey). It reads
 * one Misskey server's public notes without a token; its follows live in this
 * browser. Fixed rather than `<origin>#…`, so changing the visited server
 * keeps the visitor's account scope, and with it the follows and settings.
 */
export const MISSKEY_VISITOR = 'visitor';

export function isMisskeyVisitor(key: string | null | undefined): boolean {
  return key === MISSKEY_VISITOR;
}

export interface MisskeyIdentityProfile {
  /** Server origin, e.g. `https://misskey.io`. No trailing slash. */
  server: string;
  userId: string;
  username: string;
  /** Display name; null when unset. */
  name: string | null;
  avatarUrl: string | null;
  /** Custom emoji in the display name, shortcode → URL. */
  emojis?: Record<string, string>;
}

export interface MisskeyIdentityCredentials {
  /** Empty for the visitor, which calls the API without one. */
  token: string;
  connectedAt?: number;
  /**
   * The MiAuth permissions this token was granted. Absent on tokens from the
   * read-only M1 sign-in, which is how they are recognised as needing one
   * more approval before anything can be written.
   */
  permissions?: string[];
}

export interface MisskeyIdentity {
  key: string;
  profile: MisskeyIdentityProfile;
  credentials: MisskeyIdentityCredentials;
}

type ProfileMap = Record<string, MisskeyIdentityProfile>;
type CredentialsMap = Record<string, MisskeyIdentityCredentials>;

/** Normalise a server to its lowercase origin, accepting a bare host. */
export function misskeyOrigin(server: string): string | null {
  const trimmed = server.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

export function misskeyIdentityKey(server: string, userId: string): string {
  return `${misskeyOrigin(server) ?? server}#${userId}`;
}

function parseObject(key: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function normalizedProfile(value: unknown): MisskeyIdentityProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const server = typeof raw['server'] === 'string' ? misskeyOrigin(raw['server']) : null;
  if (!server || typeof raw['userId'] !== 'string' || typeof raw['username'] !== 'string') {
    return null;
  }
  const emojis = raw['emojis'];
  return {
    server,
    userId: raw['userId'],
    username: raw['username'],
    name: typeof raw['name'] === 'string' ? raw['name'] : null,
    avatarUrl: typeof raw['avatarUrl'] === 'string' ? raw['avatarUrl'] : null,
    ...(emojis && typeof emojis === 'object' && !Array.isArray(emojis)
      ? { emojis: emojis as Record<string, string> }
      : {}),
  };
}

function isCredentials(value: unknown): value is MisskeyIdentityCredentials {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  return (
    typeof raw['token'] === 'string' &&
    raw['token'].length > 0 &&
    (raw['connectedAt'] === undefined || typeof raw['connectedAt'] === 'number') &&
    (raw['permissions'] === undefined ||
      (Array.isArray(raw['permissions']) && raw['permissions'].every((p) => typeof p === 'string')))
  );
}

function stores(): { profiles: ProfileMap; credentials: CredentialsMap } {
  const profiles: ProfileMap = {};
  for (const [key, value] of Object.entries(parseObject(MK_IDENTITY_PROFILE_KEY))) {
    const profile = normalizedProfile(value);
    if (profile && misskeyIdentityKey(profile.server, profile.userId) === key) {
      profiles[key] = profile;
    }
  }
  const credentials: CredentialsMap = {};
  for (const [key, value] of Object.entries(parseObject(MK_IDENTITY_CREDENTIALS_KEY))) {
    if (isCredentials(value)) credentials[key] = value;
  }
  return { profiles, credentials };
}

function persistMap(key: string, value: ProfileMap | CredentialsMap): void {
  if (Object.keys(value).length === 0) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

/** The server the visitor reads, or null when there is no visitor. */
export function misskeyVisitorServer(): string | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(MK_VISITOR_KEY) ?? 'null');
    const server =
      raw && typeof raw === 'object' ? (raw as Record<string, unknown>)['server'] : null;
    return typeof server === 'string' ? misskeyOrigin(server) : null;
  } catch {
    return null;
  }
}

/** Create the visitor, or point it at another server. Returns its identity key. */
export function saveMisskeyVisitor(server: string, activate = false): string {
  const origin = misskeyOrigin(server) ?? server;
  localStorage.setItem(MK_VISITOR_KEY, JSON.stringify({ server: origin }));
  if (activate) localStorage.setItem(MK_ACTIVE_IDENTITY_KEY, MISSKEY_VISITOR);
  return MISSKEY_VISITOR;
}

function visitorIdentity(): MisskeyIdentity | null {
  const server = misskeyVisitorServer();
  if (!server) return null;
  return {
    key: MISSKEY_VISITOR,
    profile: { server, userId: '', username: 'visitor', name: null, avatarUrl: null },
    credentials: { token: '' },
  };
}

/** Every saved identity that has both a profile and a token, then the visitor. */
export function misskeyIdentities(): MisskeyIdentity[] {
  try {
    const { profiles, credentials } = stores();
    const signedIn = Object.entries(profiles).flatMap(([key, profile]) => {
      const creds = credentials[key];
      return creds ? [{ key, profile, credentials: creds }] : [];
    });
    const visitor = visitorIdentity();
    return visitor ? [...signedIn, visitor] : signedIn;
  } catch {
    return [];
  }
}

export function misskeyIdentity(
  key: string | null = misskeyIdentityKeyActive(),
): MisskeyIdentity | null {
  if (!key) return null;
  return misskeyIdentities().find((identity) => identity.key === key) ?? null;
}

/** Save (or refresh) an identity and return its identity key. */
export function saveMisskeyIdentity(
  profile: MisskeyIdentityProfile,
  credentials: MisskeyIdentityCredentials,
  activate = false,
): string {
  const key = misskeyIdentityKey(profile.server, profile.userId);
  const current = stores();
  current.profiles[key] = { ...profile, server: misskeyOrigin(profile.server) ?? profile.server };
  current.credentials[key] = credentials;
  persistMap(MK_IDENTITY_PROFILE_KEY, current.profiles);
  persistMap(MK_IDENTITY_CREDENTIALS_KEY, current.credentials);
  if (activate) localStorage.setItem(MK_ACTIVE_IDENTITY_KEY, key);
  return key;
}

/** Refresh the stored profile only (name, avatar), keeping the token. */
export function updateMisskeyProfile(key: string, profile: Partial<MisskeyIdentityProfile>): void {
  const current = stores();
  const existing = current.profiles[key];
  if (!existing) return;
  current.profiles[key] = {
    ...existing,
    ...profile,
    server: existing.server,
    userId: existing.userId,
  };
  persistMap(MK_IDENTITY_PROFILE_KEY, current.profiles);
}

export function setActiveMisskeyIdentity(key: string): boolean {
  if (!misskeyIdentity(key)) return false;
  localStorage.setItem(MK_ACTIVE_IDENTITY_KEY, key);
  return true;
}

/**
 * The selected identity's key, if it is still complete in storage.
 *
 * Falls back to the first saved identity only while Misskey is the active
 * account kind, mirroring the Bluesky store: a stale pointer must not strand
 * an account that still has a usable alt.
 */
export function misskeyIdentityKeyActive(): string | null {
  try {
    const active = localStorage.getItem(MK_ACTIVE_IDENTITY_KEY)?.trim() || null;
    const all = misskeyIdentities();
    if (active && all.some((identity) => identity.key === active)) return active;
    if (localStorage.getItem(ACCOUNT_MODE_KEY) !== 'misskey') return null;
    const first = all[0]?.key ?? null;
    if (first) localStorage.setItem(MK_ACTIVE_IDENTITY_KEY, first);
    return first;
  } catch {
    return null;
  }
}

export function misskeyIdentityPresent(key: string | null = misskeyIdentityKeyActive()): boolean {
  return misskeyIdentity(key) !== null;
}

export function clearMisskeyIdentity(key: string | null = misskeyIdentityKeyActive()): void {
  if (!key) return;
  if (isMisskeyVisitor(key)) {
    localStorage.removeItem(MK_VISITOR_KEY);
    localStorage.removeItem(MK_VISITOR_FOLLOWS_KEY);
    if (localStorage.getItem(MK_ACTIVE_IDENTITY_KEY) === key) {
      localStorage.removeItem(MK_ACTIVE_IDENTITY_KEY);
    }
    return;
  }
  const current = stores();
  delete current.profiles[key];
  delete current.credentials[key];
  persistMap(MK_IDENTITY_PROFILE_KEY, current.profiles);
  persistMap(MK_IDENTITY_CREDENTIALS_KEY, current.credentials);
  if (localStorage.getItem(MK_ACTIVE_IDENTITY_KEY) === key) {
    localStorage.removeItem(MK_ACTIVE_IDENTITY_KEY);
  }
}

/** Whether this identity's token may write (post, react, follow). */
export function misskeyIdentityCanWrite(key: string | null = misskeyIdentityKeyActive()): boolean {
  return !!misskeyIdentity(key)?.credentials.permissions?.includes('write:notes');
}

export function clearAllMisskeyIdentities(): void {
  localStorage.removeItem(MK_IDENTITY_PROFILE_KEY);
  localStorage.removeItem(MK_IDENTITY_CREDENTIALS_KEY);
  localStorage.removeItem(MK_ACTIVE_IDENTITY_KEY);
  localStorage.removeItem(MK_VISITOR_KEY);
  localStorage.removeItem(MK_VISITOR_FOLLOWS_KEY);
}
