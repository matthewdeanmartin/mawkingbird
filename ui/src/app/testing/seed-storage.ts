/**
 * Helpers for seeding browser storage in specs.
 *
 * Several credentials are deliberately stored in two halves — a non-secret part
 * a settings export may carry, and a secret part it never may (see
 * `storage-registry.ts`). Specs that hand-wrote the single-object shape all
 * broke when those were split, and would break again on the next change. These
 * helpers are the one place that knows the on-disk layout, so a future split
 * costs one edit here instead of one per spec.
 */

import { Session } from '../auth';
import { BskySession } from '../providers/bluesky/bluesky-session';
import { saveBlueskyIdentity } from '../providers/bluesky/bluesky-identity-store';
import { GitHubUser } from '../providers/github/github-session';

/** Seed a linked Bluesky account, writing the profile and JWTs to their own keys. */
export function seedBskySession(session: BskySession, scopeSuffix = ''): void {
  const { accessJwt, refreshJwt, connectedAt, ...profile } = session;
  localStorage.setItem(`mockingbird_bsky_profile${scopeSuffix}`, JSON.stringify(profile));
  localStorage.setItem(
    `mockingbird_bsky_credentials${scopeSuffix}`,
    JSON.stringify({ accessJwt, refreshJwt, connectedAt: connectedAt ?? Date.now() }),
  );
}

/** True when a linked Bluesky account is present in storage (either half). */
export function bskySessionStored(scopeSuffix = ''): boolean {
  return (
    localStorage.getItem(`mockingbird_bsky_profile${scopeSuffix}`) !== null ||
    localStorage.getItem(`mockingbird_bsky_credentials${scopeSuffix}`) !== null
  );
}

/** The stored Bluesky profile (the exportable half), or null. */
export function storedBskyProfile(scopeSuffix = ''): Record<string, unknown> | null {
  const raw = localStorage.getItem(`mockingbird_bsky_profile${scopeSuffix}`);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

/**
 * Seed a **Bluesky-primary** identity — the account the app is signed in *as*,
 * not a connector link. Unscoped, and split into its two halves, matching
 * `bluesky-identity-store.ts`.
 */
export function seedBskyIdentity(
  identity: { did: string; handle: string; displayName?: string; avatar?: string },
  credentials: { accessJwt?: string; refreshJwt?: string; connectedAt?: number } = {},
): void {
  const { did, handle, displayName, avatar } = identity;
  saveBlueskyIdentity(
    { did, handle, displayName, avatar, service: 'https://bsky.social' },
    {
      accessJwt: credentials.accessJwt ?? 'access-jwt',
      refreshJwt: credentials.refreshJwt ?? 'refresh-jwt',
      connectedAt: credentials.connectedAt ?? Date.now(),
    },
  );
}

/** True when a Bluesky-primary identity is present in storage (either half). */
export function bskyIdentityStored(): boolean {
  return (
    localStorage.getItem('mockingbird_bsky_identity_profile') !== null ||
    localStorage.getItem('mockingbird_bsky_identity_credentials') !== null
  );
}

/** Seed a connected GitHub account, writing the profile and PAT to their own keys. */
export function seedGitHubConnection(
  accessToken: string,
  user: GitHubUser,
  scopeSuffix = '',
): void {
  localStorage.setItem(`mockingbird_github_user${scopeSuffix}`, JSON.stringify(user));
  localStorage.setItem(
    `mockingbird_github_credentials${scopeSuffix}`,
    JSON.stringify({ accessToken, connectedAt: Date.now() }),
  );
}

/** The stored GitHub access token, or null when not connected. */
export function storedGitHubToken(scopeSuffix = ''): string | null {
  const raw = localStorage.getItem(`mockingbird_github_credentials${scopeSuffix}`);
  return raw ? ((JSON.parse(raw) as { accessToken?: string }).accessToken ?? null) : null;
}

/** True when either half of a GitHub connection is present. */
export function gitHubConnectionStored(scopeSuffix = ''): boolean {
  return (
    localStorage.getItem(`mockingbird_github_user${scopeSuffix}`) !== null ||
    localStorage.getItem(`mockingbird_github_credentials${scopeSuffix}`) !== null
  );
}

/**
 * Seed saved logins, writing the account list and the bearer tokens to their own
 * keys. `id` is filled in when omitted, since callers usually only care about
 * the token and the account snapshot.
 */
export function seedSessions(sessions: (Omit<Session, 'id'> & { id?: string })[]): void {
  const rows = sessions.map((session, index) => ({ ...session, id: session.id ?? `s${index}` }));
  localStorage.setItem(
    'mastodon_mock_sessions',
    JSON.stringify(rows.map(({ token: _token, ...rest }) => rest)),
  );
  localStorage.setItem(
    'mastodon_mock_session_tokens',
    JSON.stringify(Object.fromEntries(rows.map((row) => [row.id, row.token]))),
  );
}
