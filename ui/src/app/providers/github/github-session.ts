import { inject, Injectable, signal } from '@angular/core';
import { scopedKey } from '../../account-scope';
import { ProfileAccountKey } from '../account/profile-account-key';
import { VaultBridge, type SyncOutcome } from '../vault/vault-bridge';
import { reconcileScalar, type VaultReconcileOutcome } from '../vault/vault-reconcile';
import {
  credentialExpiresAt,
  ensureStamped,
  ExpiringCredential,
  ExpiringConnection,
  stampCredential,
} from '../credential-lifetime';

/**
 * Split so a settings export can carry the linked identity without the token:
 * the user profile is `private`, the PAT is `secret`. See `storage-registry.ts`.
 */
const USER_KEY_BASE = 'mockingbird_github_user';
const CREDENTIALS_KEY_BASE = 'mockingbird_github_credentials';
const API_ROOT = 'https://api.github.com';
const API_VERSION = '2026-03-10';

/** The secret half, plus the retention stamp that governs it. */
interface StoredGitHubCredentials extends ExpiringCredential {
  accessToken: string;
}

/** Both halves rejoined, as the service holds them in memory. */
interface StoredGitHubToken extends StoredGitHubCredentials {
  user: GitHubUser;
}

export interface GitHubUser {
  login: string;
  avatar_url: string;
  html_url: string;
  name: string | null;
}

export interface GitHubNotification {
  id: string;
  reason: string;
  unread: boolean;
  updated_at: string;
  repository: {
    full_name: string;
    html_url: string;
  };
  subject: {
    title: string;
    type: string;
    url: string | null;
  };
}

export interface GitHubSocialAccount {
  provider: string;
  displayName: string | null;
  url: string;
}

export interface GitHubFollowedUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  url: string;
  bio: string | null;
  websiteUrl: string | null;
  socialAccounts: {
    nodes: GitHubSocialAccount[];
  };
}

export interface GitHubFollowingPage {
  users: GitHubFollowedUser[];
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface GitHubStarredRepository {
  nameWithOwner: string;
  url: string;
  description: string | null;
}

export interface GitHubStarredOwner {
  profile: GitHubFollowedUser;
  repositories: GitHubStarredRepository[];
}

export interface GitHubStarredOwnerPage {
  owners: GitHubStarredOwner[];
  repositoryCount: number;
  hasNextPage: boolean;
  endCursor: string | null;
}

interface GitHubGraphQlResponse {
  data?: {
    viewer?: {
      following?: {
        nodes: GitHubFollowedUser[];
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
      };
      starredRepositories?: {
        nodes: {
          nameWithOwner: string;
          url: string;
          description: string | null;
          owner: GitHubFollowedUser & {
            description?: string | null;
            socialAccounts?: { nodes: GitHubSocialAccount[] };
          };
        }[];
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
      };
    };
  };
  errors?: { message: string }[];
}

/** Browser-only GitHub REST session using a user-supplied classic token. */
@Injectable({ providedIn: 'root' })
export class GitHubSession implements ExpiringConnection {
  private bridge = inject(VaultBridge);
  private accountKey = inject(ProfileAccountKey);
  private readonly userKey = scopedKey(USER_KEY_BASE);
  private readonly credentialsKey = scopedKey(CREDENTIALS_KEY_BASE);
  private token = signal<StoredGitHubToken | null>(readToken(this.userKey, this.credentialsKey));

  readonly user = signal<GitHubUser | null>(this.token()?.user ?? null);
  readonly connected = signal(this.token() !== null);
  readonly notifications = signal<GitHubNotification[] | null>(null);
  readonly following = signal<GitHubUser[] | null>(null);

  /**
   * Connected, but the token is not in this browser right now.
   *
   * Set when local retention expired a vaulted token. Rendered as locked rather
   * than disconnected — see `VaultBridge.verdictFor`.
   */
  readonly needsFetch = signal(false);

  constructor() {
    // Retention is applied here rather than in `readToken`, which cannot tell a
    // vaulted token from a local-only one.
    this.enforceLifetime();
  }

  async connect(accessToken: string): Promise<GitHubUser> {
    const trimmed = accessToken.trim();
    if (!trimmed) {
      throw new Error('Paste a GitHub personal access token (classic).');
    }

    const user = await githubRequest<GitHubUser>('/user', trimmed);
    this.persist(stampCredential({ accessToken: trimmed }), user);
    // Not awaited: connecting should feel instant. Failures are observable via
    // `syncToVault()`, which the settings page calls when the user opts in.
    void this.bridge.writeThrough(
      CREDENTIALS_KEY_BASE,
      serialize(trimmed, user),
      this.accountKey.current(),
    );
    return user;
  }

  /**
   * The access token, falling back to the vault on a local miss.
   *
   * `localStorage` first, always — this connector worked before the vault
   * existed and must keep working with it locked, unavailable or never set up.
   *
   * The vaulted record carries the profile as well as the token, because
   * {@link readToken} treats a token with no profile as unusable and clears it.
   */
  accessToken(): string | null {
    const local = this.token()?.accessToken;
    if (local) {
      return local;
    }
    const fromVault = this.bridge.readThrough(CREDENTIALS_KEY_BASE, this.accountKey.current());
    if (!fromVault) {
      return null;
    }
    const parsed = parseVaulted(fromVault);
    if (!parsed) {
      return null;
    }
    this.persist(stampCredential({ accessToken: parsed.accessToken }), parsed.user);
    return parsed.accessToken;
  }

  /** Write both halves locally and update the signals. */
  private persist(credentials: StoredGitHubCredentials, user: GitHubUser): void {
    localStorage.setItem(this.userKey, JSON.stringify(user));
    localStorage.setItem(this.credentialsKey, JSON.stringify(credentials));
    this.token.set({ ...credentials, user });
    this.user.set(user);
    this.connected.set(true);
    this.needsFetch.set(false);
  }

  /** Push the current credential to the vault and report what happened. */
  async syncToVault(): Promise<SyncOutcome> {
    const stored = this.token();
    return stored
      ? this.bridge.writeThrough(
          CREDENTIALS_KEY_BASE,
          serialize(stored.accessToken, stored.user),
          this.accountKey.current(),
        )
      : { kind: 'skipped' };
  }

  /** Reconcile the token-plus-profile record without silently choosing a conflict winner. */
  reconcileVault(): Promise<VaultReconcileOutcome> {
    const current = this.token();
    return reconcileScalar({
      local: current ? serialize(current.accessToken, current.user) : null,
      remote: this.bridge.readThrough(CREDENTIALS_KEY_BASE, this.accountKey.current()),
      restore: (raw) => {
        const parsed = parseVaulted(raw);
        if (!parsed) {
          return false;
        }
        this.persist(stampCredential({ accessToken: parsed.accessToken }), parsed.user);
        return true;
      },
      store: () => this.syncToVault(),
      conflictMessage:
        'GitHub has different non-empty credentials here and in Mawkingbird; neither copy was replaced.',
    });
  }

  /** When this token ages out under the retention policy, or null. */
  expiresAt(): number | null {
    return credentialExpiresAt(this.token()?.connectedAt);
  }

  /**
   * Apply the local retention policy: lock if vaulted, disconnect otherwise.
   *
   * For a vaulted token this clears the plaintext and keeps the connection —
   * the next {@link accessToken} pulls it back. See `VaultBridge.verdictFor`.
   */
  enforceLifetime(): void {
    const token = this.token();
    if (!token) {
      return;
    }
    const verdict = this.bridge.verdictFor(CREDENTIALS_KEY_BASE, token.connectedAt);
    if (verdict.kind === 'disconnect') {
      this.disconnect();
    } else if (verdict.kind === 'lock') {
      this.forgetLocally();
      this.needsFetch.set(true);
    }
  }

  async runProof(): Promise<void> {
    // Through `accessToken()` rather than the signal, so a call made while the
    // local copy is locked pulls the vault copy back instead of telling the user
    // to connect something that is already connected.
    const accessToken = this.accessToken();
    if (!accessToken) {
      throw new Error('Connect GitHub first.');
    }

    try {
      const [notifications, following] = await Promise.all([
        githubRequest<GitHubNotification[]>(
          '/notifications?all=false&participating=false&per_page=10',
          accessToken,
        ),
        githubRequest<GitHubUser[]>('/user/following?per_page=10', accessToken),
      ]);
      this.notifications.set(notifications);
      this.following.set(following);
    } catch (error: unknown) {
      if (error instanceof GitHubApiError && error.status === 401) {
        this.disconnect();
      }
      throw error;
    }
  }

  async followedUsers(cursor: string | null = null): Promise<GitHubFollowingPage> {
    const body = await this.graphQl(FOLLOWED_USERS_QUERY, cursor);
    const following = body.data?.viewer?.following;
    if (!following) {
      throw new Error(body.errors?.[0]?.message ?? 'GitHub did not return followed accounts.');
    }
    return {
      users: following.nodes,
      hasNextPage: following.pageInfo.hasNextPage,
      endCursor: following.pageInfo.endCursor,
    };
  }

  async starredRepositoryOwners(cursor: string | null = null): Promise<GitHubStarredOwnerPage> {
    const body = await this.graphQl(STARRED_REPOSITORY_OWNERS_QUERY, cursor);
    const starred = body.data?.viewer?.starredRepositories;
    if (!starred) {
      throw new Error(
        body.errors?.[0]?.message ?? 'GitHub did not return your starred repositories.',
      );
    }
    const owners = new Map<string, GitHubStarredOwner>();
    for (const repository of starred.nodes) {
      const profile = {
        ...repository.owner,
        bio: repository.owner.bio ?? repository.owner.description ?? null,
        socialAccounts: repository.owner.socialAccounts ?? { nodes: [] },
      };
      const key = profile.login.toLowerCase();
      const existing = owners.get(key);
      const context = {
        nameWithOwner: repository.nameWithOwner,
        url: repository.url,
        description: repository.description,
      };
      if (existing) {
        existing.repositories.push(context);
      } else {
        owners.set(key, { profile, repositories: [context] });
      }
    }
    return {
      owners: [...owners.values()],
      repositoryCount: starred.nodes.length,
      hasNextPage: starred.pageInfo.hasNextPage,
      endCursor: starred.pageInfo.endCursor,
    };
  }

  /** Disconnect here, and remove the stored copy so it cannot come back. */
  disconnect(): void {
    void this.bridge.removeThrough(CREDENTIALS_KEY_BASE, this.accountKey.current());
    this.forgetLocally();
    this.connected.set(false);
    this.needsFetch.set(false);
  }

  /**
   * Clear the local copies and anything derived from them.
   *
   * The fetched notifications and following list go too: they were read with a
   * credential this browser no longer holds, and leaving them on screen would
   * show private data behind a connection that is locked.
   */
  private forgetLocally(): void {
    localStorage.removeItem(this.userKey);
    localStorage.removeItem(this.credentialsKey);
    this.token.set(null);
    this.user.set(null);
    this.notifications.set(null);
    this.following.set(null);
  }

  private async graphQl(query: string, cursor: string | null): Promise<GitHubGraphQlResponse> {
    const accessToken = this.accessToken();
    if (!accessToken) {
      throw new Error('Connect GitHub first.');
    }
    const response = await fetch(`${API_ROOT}/graphql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': API_VERSION,
      },
      body: JSON.stringify({ query, variables: { cursor } }),
    });
    if (!response.ok) {
      if (response.status === 401) this.disconnect();
      throw new GitHubApiError(response.status, await githubError(response));
    }
    return (await response.json()) as GitHubGraphQlResponse;
  }
}

const FOLLOWED_USERS_QUERY = `
  query FollowedUsers($cursor: String) {
    viewer {
      following(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          login
          name
          avatarUrl
          url
          bio
          websiteUrl
          socialAccounts(first: 10) {
            nodes {
              provider
              displayName
              url
            }
          }
        }
      }
    }
  }
`;

const STARRED_REPOSITORY_OWNERS_QUERY = `
  query StarredRepositoryOwners($cursor: String) {
    viewer {
      starredRepositories(
        first: 100
        after: $cursor
        orderBy: { field: STARRED_AT, direction: DESC }
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          nameWithOwner
          url
          description
          owner {
            login
            avatarUrl
            url
            ... on User {
              name
              bio
              websiteUrl
              socialAccounts(first: 10) {
                nodes {
                  provider
                  displayName
                  url
                }
              }
            }
            ... on Organization {
              name
              description
              websiteUrl
            }
          }
        }
      }
    }
  }
`;

class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function githubRequest<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION,
    },
  });
  if (!response.ok) {
    throw new GitHubApiError(response.status, await githubError(response));
  }
  return (await response.json()) as T;
}

async function githubError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (response.status === 401) {
      return 'GitHub rejected that token. Check that it is active, then try again.';
    }
    if (response.status === 403 && body.message?.toLowerCase().includes('scope')) {
      return 'That token is missing the notifications scope.';
    }
    return body.message ?? `GitHub returned HTTP ${response.status}.`;
  } catch {
    return `GitHub returned HTTP ${response.status}.`;
  }
}

/**
 * Rejoin the two halves. A profile with no token is not a usable connection, so
 * the orphan is cleared — the state a machine that imported settings but has not
 * reconnected GitHub yet will be in.
 */
function readToken(userKey: string, credentialsKey: string): StoredGitHubToken | null {
  try {
    const user = JSON.parse(localStorage.getItem(userKey) ?? 'null') as GitHubUser | null;
    const credentials = JSON.parse(
      localStorage.getItem(credentialsKey) ?? 'null',
    ) as Partial<StoredGitHubCredentials> | null;
    if (
      typeof credentials?.accessToken !== 'string' ||
      !credentials.accessToken ||
      typeof user?.login !== 'string'
    ) {
      localStorage.removeItem(userKey);
      localStorage.removeItem(credentialsKey);
      return null;
    }
    // Expiry is *not* decided here any more. This function has no injector and
    // so cannot ask whether the token is vaulted; dropping it unconditionally
    // would delete the plaintext of a vaulted token while reporting it as never
    // connected. `enforceLifetime` owns that decision and can tell lock from
    // disconnect.
    const stamped = ensureStamped(credentialsKey, credentials as StoredGitHubCredentials);
    return { ...stamped, user };
  } catch {
    localStorage.removeItem(userKey);
    localStorage.removeItem(credentialsKey);
    return null;
  }
}

/** The vaulted form: the token and the profile it belongs to. */
function serialize(accessToken: string, user: GitHubUser): string {
  return JSON.stringify({ accessToken, user });
}

/** Parse a record read back out of the vault. */
function parseVaulted(raw: string): { accessToken: string; user: GitHubUser } | null {
  try {
    const parsed = JSON.parse(raw) as { accessToken?: unknown; user?: GitHubUser };
    if (typeof parsed?.accessToken !== 'string' || !parsed.accessToken) {
      return null;
    }
    // A token with no profile is exactly what `readToken` refuses to keep, so
    // refuse it here too rather than writing a record the next read would clear.
    if (typeof parsed.user?.login !== 'string' || !parsed.user.login) {
      return null;
    }
    return { accessToken: parsed.accessToken, user: parsed.user };
  } catch {
    return null;
  }
}
