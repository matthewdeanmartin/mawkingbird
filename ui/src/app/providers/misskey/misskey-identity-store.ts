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
  token: string;
  connectedAt?: number;
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
    (raw['connectedAt'] === undefined || typeof raw['connectedAt'] === 'number')
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

/** Every saved identity that has both a profile and a token. */
export function misskeyIdentities(): MisskeyIdentity[] {
  try {
    const { profiles, credentials } = stores();
    return Object.entries(profiles).flatMap(([key, profile]) => {
      const creds = credentials[key];
      return creds ? [{ key, profile, credentials: creds }] : [];
    });
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
  const current = stores();
  delete current.profiles[key];
  delete current.credentials[key];
  persistMap(MK_IDENTITY_PROFILE_KEY, current.profiles);
  persistMap(MK_IDENTITY_CREDENTIALS_KEY, current.credentials);
  if (localStorage.getItem(MK_ACTIVE_IDENTITY_KEY) === key) {
    localStorage.removeItem(MK_ACTIVE_IDENTITY_KEY);
  }
}

export function clearAllMisskeyIdentities(): void {
  localStorage.removeItem(MK_IDENTITY_PROFILE_KEY);
  localStorage.removeItem(MK_IDENTITY_CREDENTIALS_KEY);
  localStorage.removeItem(MK_ACTIVE_IDENTITY_KEY);
}
