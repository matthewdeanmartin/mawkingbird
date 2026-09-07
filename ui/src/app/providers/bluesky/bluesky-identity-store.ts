/** Persistence helpers for first-class Bluesky identities. */

export const ACCOUNT_MODE_KEY = 'mastodon_mock_account_mode';
export const BSKY_IDENTITY_PROFILE_KEY = 'mockingbird_bsky_identity_profile';
export const BSKY_IDENTITY_CREDENTIALS_KEY = 'mockingbird_bsky_identity_credentials';
export const BSKY_ACTIVE_IDENTITY_DID_KEY = 'mockingbird_bsky_active_identity_did';

const LEGACY_ACTIVE_DID_KEY = 'mockingbird_bsky_identity_did';

export interface BlueskyIdentityProfile {
  service: string;
  handle: string;
  did: string;
  displayName?: string;
  avatar?: string;
  pdsUrl?: string;
}

export interface BlueskyLegacyIdentityCredentials {
  authMethod?: 'app-password';
  accessJwt: string;
  refreshJwt: string;
  connectedAt?: number;
  appPassword?: string;
}

/** OAuth secrets remain in the official SDK's IndexedDB; this is only a join marker. */
export interface BlueskyOAuthIdentityCredentials {
  authMethod: 'oauth';
  connectedAt?: number;
}

export type BlueskyIdentityCredentials =
  | BlueskyLegacyIdentityCredentials
  | BlueskyOAuthIdentityCredentials;

export interface BlueskyIdentity {
  profile: BlueskyIdentityProfile;
  credentials: BlueskyIdentityCredentials;
}

type ProfileMap = Record<string, BlueskyIdentityProfile>;
type CredentialsMap = Record<string, BlueskyIdentityCredentials>;

function parseObject(key: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function normalizedProfile(value: unknown): BlueskyIdentityProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const profile = value as Record<string, unknown>;
  if (typeof profile['handle'] !== 'string' || typeof profile['did'] !== 'string') return null;
  return {
    // The earliest singleton shape did not persist this field. Its login could
    // only use bsky.social, so that is a lossless migration default.
    service: typeof profile['service'] === 'string' ? profile['service'] : 'https://bsky.social',
    handle: profile['handle'],
    did: profile['did'],
    ...(typeof profile['displayName'] === 'string' ? { displayName: profile['displayName'] } : {}),
    ...(typeof profile['avatar'] === 'string' ? { avatar: profile['avatar'] } : {}),
    ...(typeof profile['pdsUrl'] === 'string' ? { pdsUrl: profile['pdsUrl'] } : {}),
  };
}

function isCredentials(value: unknown): value is BlueskyIdentityCredentials {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const credentials = value as Record<string, unknown>;
  if (credentials['authMethod'] === 'oauth') {
    return (
      credentials['connectedAt'] === undefined || typeof credentials['connectedAt'] === 'number'
    );
  }
  return (
    typeof credentials['accessJwt'] === 'string' &&
    typeof credentials['refreshJwt'] === 'string' &&
    (credentials['connectedAt'] === undefined || typeof credentials['connectedAt'] === 'number')
  );
}

function profileMapFromStorage(): { map: ProfileMap; wasLegacy: boolean } {
  const raw = parseObject(BSKY_IDENTITY_PROFILE_KEY);
  if (!raw) return { map: {}, wasLegacy: false };
  const legacy = normalizedProfile(raw);
  if (legacy) return { map: { [legacy.did]: legacy }, wasLegacy: true };

  const map: ProfileMap = {};
  for (const [did, value] of Object.entries(raw)) {
    const profile = normalizedProfile(value);
    if (profile && profile.did === did) map[did] = profile;
  }
  return { map, wasLegacy: false };
}

function credentialsMapFromStorage(profiles: ProfileMap): {
  map: CredentialsMap;
  wasLegacy: boolean;
} {
  const raw = parseObject(BSKY_IDENTITY_CREDENTIALS_KEY);
  if (!raw) return { map: {}, wasLegacy: false };
  if (isCredentials(raw)) {
    const did = Object.keys(profiles)[0];
    return { map: did ? { [did]: raw } : {}, wasLegacy: true };
  }

  const map: CredentialsMap = {};
  for (const [did, value] of Object.entries(raw)) {
    if (isCredentials(value)) map[did] = value;
  }
  return { map, wasLegacy: false };
}

function persistMap(key: string, value: ProfileMap | CredentialsMap): void {
  if (Object.keys(value).length === 0) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

function stores(): { profiles: ProfileMap; credentials: CredentialsMap } {
  const profilesResult = profileMapFromStorage();
  const credentialsResult = credentialsMapFromStorage(profilesResult.map);
  if (profilesResult.wasLegacy) persistMap(BSKY_IDENTITY_PROFILE_KEY, profilesResult.map);
  if (credentialsResult.wasLegacy) {
    persistMap(BSKY_IDENTITY_CREDENTIALS_KEY, credentialsResult.map);
  }

  if (profilesResult.wasLegacy && !localStorage.getItem(BSKY_ACTIVE_IDENTITY_DID_KEY)) {
    const did = Object.keys(profilesResult.map)[0];
    if (did) localStorage.setItem(BSKY_ACTIVE_IDENTITY_DID_KEY, did);
  }

  const legacyActiveDid = localStorage.getItem(LEGACY_ACTIVE_DID_KEY)?.trim();
  if (legacyActiveDid && !localStorage.getItem(BSKY_ACTIVE_IDENTITY_DID_KEY)) {
    localStorage.setItem(BSKY_ACTIVE_IDENTITY_DID_KEY, legacyActiveDid);
  }
  localStorage.removeItem(LEGACY_ACTIVE_DID_KEY);
  return { profiles: profilesResult.map, credentials: credentialsResult.map };
}

/** Return every usable Bluesky identity, preserving insertion order. */
export function blueskyIdentities(): BlueskyIdentity[] {
  const { profiles, credentials } = stores();
  return Object.entries(profiles).flatMap(([did, profile]) => {
    const identityCredentials = credentials[did];
    return identityCredentials ? [{ profile, credentials: identityCredentials }] : [];
  });
}

/** Return a usable Bluesky identity by DID, or the active identity by default. */
export function blueskyIdentity(did: string | null = blueskyIdentityDid()): BlueskyIdentity | null {
  if (!did) return null;
  const { profiles, credentials } = stores();
  const profile = profiles[did];
  const identityCredentials = credentials[did];
  return profile && identityCredentials ? { profile, credentials: identityCredentials } : null;
}

/** Persist or replace an identity without affecting any other Bluesky account. */
export function saveBlueskyIdentity(
  profile: BlueskyIdentityProfile,
  credentials: BlueskyIdentityCredentials,
  activate = false,
): void {
  const current = stores();
  current.profiles[profile.did] = profile;
  current.credentials[profile.did] = credentials;
  persistMap(BSKY_IDENTITY_PROFILE_KEY, current.profiles);
  persistMap(BSKY_IDENTITY_CREDENTIALS_KEY, current.credentials);
  if (activate) localStorage.setItem(BSKY_ACTIVE_IDENTITY_DID_KEY, profile.did);
}

/** Select an existing, usable Bluesky identity. */
export function setActiveBlueskyIdentity(did: string): boolean {
  if (!blueskyIdentity(did)) return false;
  localStorage.setItem(BSKY_ACTIVE_IDENTITY_DID_KEY, did);
  return true;
}

/** DID of the active first-class Bluesky identity. */
export function blueskyIdentityDid(): string | null {
  const activeDid = localStorage.getItem(BSKY_ACTIVE_IDENTITY_DID_KEY)?.trim() || null;
  if (activeDid) {
    const { profiles, credentials } = stores();
    if (profiles[activeDid] && credentials[activeDid]) return activeDid;
  }

  if (localStorage.getItem(ACCOUNT_MODE_KEY) !== 'bluesky') return null;
  const first = blueskyIdentities()[0]?.profile.did ?? null;
  if (first) localStorage.setItem(BSKY_ACTIVE_IDENTITY_DID_KEY, first);
  return first;
}

/** True when the requested (or active) identity has both stored halves. */
export function blueskyIdentityPresent(did: string | null = blueskyIdentityDid()): boolean {
  return blueskyIdentity(did) !== null;
}

/** Remove one identity, leaving every other Bluesky alt intact. */
export function clearBlueskyIdentity(did: string | null = blueskyIdentityDid()): void {
  if (!did) return;
  const current = stores();
  delete current.profiles[did];
  delete current.credentials[did];
  persistMap(BSKY_IDENTITY_PROFILE_KEY, current.profiles);
  persistMap(BSKY_IDENTITY_CREDENTIALS_KEY, current.credentials);
  if (localStorage.getItem(BSKY_ACTIVE_IDENTITY_DID_KEY) === did) {
    localStorage.removeItem(BSKY_ACTIVE_IDENTITY_DID_KEY);
  }
}

/** Remove all first-class Bluesky identities. */
export function clearAllBlueskyIdentities(): void {
  localStorage.removeItem(BSKY_IDENTITY_PROFILE_KEY);
  localStorage.removeItem(BSKY_IDENTITY_CREDENTIALS_KEY);
  localStorage.removeItem(BSKY_ACTIVE_IDENTITY_DID_KEY);
  localStorage.removeItem(LEGACY_ACTIVE_DID_KEY);
}

/** True only when a complete first-class Bluesky identity is the active mode. */
export function blueskyIsPrimaryKind(): boolean {
  return localStorage.getItem(ACCOUNT_MODE_KEY) === 'bluesky' && blueskyIdentityPresent();
}
