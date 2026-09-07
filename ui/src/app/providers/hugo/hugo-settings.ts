import { computed, inject, Injectable, signal } from '@angular/core';
import { scopedKey } from '../../account-scope';
import { ProfileAccountKey } from '../account/profile-account-key';
import { VaultBridge, type SyncOutcome } from '../vault/vault-bridge';
import { storedOutcome, type VaultReconcileOutcome } from '../vault/vault-reconcile';
import {
  credentialExpiresAt,
  ensureStamped,
  ExpiringConnection,
  ExpiringCredential,
  stampCredential,
} from '../credential-lifetime';
import { normalizeContentPath, predictedPermalink } from './hugo-post';

/**
 * The Hugo repo this account publishes to, and the token that may write to it.
 *
 * Split into two localStorage keys the same way {@link GitHubSession} is, and
 * for the same reason: a settings export can carry "which repo is my blog"
 * without carrying a write credential. The repo coordinates are `private`, the
 * token is `secret`. See `storage-registry.ts`.
 *
 * **This token is deliberately not the one `GitHubSession` holds.** That one is
 * a read-only PAT for notifications and profile lookups; this one can write to
 * a repository. Sharing a single token would mean silently widening the scope
 * an existing user's connection needs, and would put every repo they own behind
 * one leaked string. A fine-grained token scoped to the one Hugo repo is the
 * whole point — see `sprint/hugo-0-overview.md`, decision 1.
 *
 * ## What the vault stores
 *
 * The token and repo coordinates travel together inside the encrypted record.
 * Ordinary settings sync carries global preferences only; this repo is
 * account-scoped private data, so a fresh phone otherwise receives a token it
 * cannot use. Reconciliation fills a missing repo but never replaces two
 * explicit, different repos.
 */
const REPO_KEY_BASE = 'mockingbird_hugo_repo';
const CREDENTIALS_KEY_BASE = 'mockingbird_hugo_credentials';

/** Hugo's own default, and the archetype path `hugo new` writes into. */
export const DEFAULT_CONTENT_PATH = 'content/posts';

/** The half that identifies the blog. Safe to export; not a secret. */
export interface HugoRepo {
  owner: string;
  repo: string;
  /** The branch the site is built from. */
  branch: string;
  /** Repo-relative folder holding the posts, normalized (no leading slash). */
  contentPath: string;
  /**
   * The public address of the built site, or null.
   *
   * Optional on purpose: it is needed only to *predict* a permalink and to find
   * the RSS feed (sprint 3). Publishing works without it, and a wrong guess is
   * worse than linking to the file on GitHub.
   */
  siteUrl: string | null;
  /**
   * The feed URL that was actually found on this site, once one has been.
   *
   * Hugo's default is `<site>/index.xml`, but a theme or an `outputs` config can
   * rename or move it, so {@link HugoFeed.probe} tries several names. Recording
   * the winner means "is my blog subscribed?" and the profile feed both ask
   * about the real URL rather than re-deriving a guess that may be wrong.
   * Absent until a probe has succeeded.
   */
  feedUrl?: string | null;
  /** Show this blog's posts on the Mawkingbird profile (sprint 3). */
  includeInProfile: boolean;
  /**
   * Record likes, boosts and replies to this blog (POSSE).
   *
   * Not a preference so much as an **assertion about the blog**: that it has a
   * webmention endpoint, a template that renders these records, and a job
   * pulling mentions in — i.e. that `posse-1-receive.md` has been done. Ticking
   * it before that produces files nothing renders, which is not harmful but is
   * confusing, so the copy says so. Off by default.
   */
  posse?: boolean;
}

interface StoredCredentials extends ExpiringCredential {
  accessToken: string;
}

interface VaultedHugoSettings {
  v: 1;
  credentials: StoredCredentials;
  repo: HugoRepo | null;
}

function loadRepo(key: string): HugoRepo | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<HugoRepo> | null;
    if (
      !parsed ||
      typeof parsed.owner !== 'string' ||
      typeof parsed.repo !== 'string' ||
      !parsed.owner ||
      !parsed.repo
    ) {
      return null;
    }
    return {
      owner: parsed.owner,
      repo: parsed.repo,
      branch: typeof parsed.branch === 'string' && parsed.branch ? parsed.branch : 'main',
      contentPath:
        typeof parsed.contentPath === 'string' && parsed.contentPath
          ? parsed.contentPath
          : DEFAULT_CONTENT_PATH,
      siteUrl: typeof parsed.siteUrl === 'string' && parsed.siteUrl ? parsed.siteUrl : null,
      feedUrl: typeof parsed.feedUrl === 'string' && parsed.feedUrl ? parsed.feedUrl : null,
      includeInProfile: parsed.includeInProfile === true,
      posse: parsed.posse === true,
    };
  } catch {
    return null;
  }
}

function loadCredentials(key: string): StoredCredentials | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(key) ?? 'null',
    ) as Partial<StoredCredentials> | null;
    if (typeof parsed?.accessToken !== 'string' || !parsed.accessToken) {
      return null;
    }
    // Expiry is *not* decided here any more. This function has no injector and
    // so cannot ask whether the token is vaulted; dropping it unconditionally
    // would delete the plaintext of a vaulted token while reporting it as never
    // connected. `enforceLifetime` owns that decision and can tell lock from
    // disconnect.
    return ensureStamped(key, parsed as StoredCredentials);
  } catch {
    return null;
  }
}

/** One Hugo-on-GitHub blog linked to the current Mawkingbird account. */
@Injectable({ providedIn: 'root' })
export class HugoSettings implements ExpiringConnection {
  private bridge = inject(VaultBridge);
  private accountKey = inject(ProfileAccountKey);
  private readonly repoKey = scopedKey(REPO_KEY_BASE);
  private readonly credentialsKey = scopedKey(CREDENTIALS_KEY_BASE);

  private readonly repoState = signal<HugoRepo | null>(loadRepo(this.repoKey));
  private readonly credentials = signal<StoredCredentials | null>(
    loadCredentials(this.credentialsKey),
  );

  readonly repo = this.repoState.asReadonly();

  /**
   * Connected means *both* halves are present.
   *
   * The repo can outlive the token — that is exactly the state a machine is in
   * after importing settings but before pasting a token — and in that state
   * nothing can be published, so the composer must not offer the target.
   */
  readonly connected = computed(() => this.repoState() !== null && this.credentials() !== null);

  /**
   * The repo is configured, but the token is not in this browser right now.
   *
   * Set when local retention expired a vaulted token. The connections page
   * renders this as locked rather than disconnected: the blog is still linked
   * and the next {@link token} pulls the credential back.
   */
  readonly needsFetch = signal(false);

  constructor() {
    // Retention is applied here rather than in `loadCredentials`, which cannot
    // tell a vaulted token from a local-only one.
    this.enforceLifetime();
  }

  /** `owner/repo`, for display. */
  readonly slug = computed(() => {
    const repo = this.repoState();
    return repo ? `${repo.owner}/${repo.repo}` : null;
  });

  readonly siteUrl = computed(() => this.repoState()?.siteUrl ?? null);
  readonly includeInProfile = computed(() => this.repoState()?.includeInProfile === true);

  /**
   * Whether interactions should be recorded to this blog.
   *
   * Requires a live connection as well as the opt-in: the repo half can outlive
   * the token, and queueing records that can never be published would be a
   * queue that only grows.
   */
  readonly posseEnabled = computed(() => this.connected() && this.repoState()?.posse === true);

  /**
   * The site's RSS feed: the one a probe actually found, else Hugo's default.
   *
   * Mirrors `MataroaSettings.feedUrl`, which the profile page already consumes.
   * The stored value wins because a theme can move the feed — falling back to
   * the default keeps this useful before any probe has run.
   */
  readonly feedUrl = computed(() => {
    const found = this.repoState()?.feedUrl;
    if (found) {
      return found;
    }
    const siteUrl = this.siteUrl();
    if (!siteUrl) {
      return null;
    }
    try {
      return new URL('index.xml', siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`).toString();
    } catch {
      return null;
    }
  });

  /**
   * The write token, falling back to the vault on a local miss.
   *
   * `localStorage` first, always — this connector worked before the vault
   * existed and must keep working with it locked, unavailable or never set up.
   */
  token(): string | null {
    const local = this.credentials()?.accessToken;
    if (local) {
      return local;
    }
    const raw = this.bridge.readThrough(CREDENTIALS_KEY_BASE, this.accountKey.current());
    const fromVault = raw ? parseVaulted(raw) : null;
    if (fromVault) {
      this.writeCredentials(fromVault.credentials);
      if (!this.repoState() && fromVault.repo) {
        this.writeRepo(fromVault.repo);
      }
    }
    return fromVault?.credentials.accessToken ?? null;
  }

  /**
   * Where a slug will live on the built site, or null with no site address.
   *
   * A convenience over {@link predictedPermalink} so callers do not each have
   * to unpack the repo to pass its content path and site URL.
   */
  permalinkFor(slug: string): string | null {
    const repo = this.repoState();
    return repo ? predictedPermalink(repo.siteUrl, repo.contentPath, slug) : null;
  }

  /**
   * Persist a validated connection.
   *
   * Callers validate against the live API *first* — a stored connection that
   * points at a repo that does not exist is worse than no connection, because
   * the composer will offer a target that can only fail.
   */
  connect(token: string, repo: HugoRepo): void {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new Error('Paste a GitHub token with write access to your blog repository.');
    }
    const normalized: HugoRepo = { ...repo, contentPath: normalizeContentPath(repo.contentPath) };
    this.writeRepo(normalized);
    const credentials = stampCredential({ accessToken: trimmed });
    this.writeCredentials(credentials);
    // Not awaited: connecting should feel instant. Failures are observable via
    // `syncToVault()`, which the settings page calls when the user opts in.
    void this.bridge.writeThrough(
      CREDENTIALS_KEY_BASE,
      serializeVaulted(credentials, normalized),
      this.accountKey.current(),
    );
  }

  /** Persist the token locally and clear the locked flag. */
  private writeCredentials(credentials: StoredCredentials): void {
    localStorage.setItem(this.credentialsKey, JSON.stringify(credentials));
    this.credentials.set(credentials);
    this.needsFetch.set(false);
  }

  private writeRepo(repo: HugoRepo): void {
    localStorage.setItem(this.repoKey, JSON.stringify(repo));
    this.repoState.set(repo);
  }

  /** Push the current token to the vault and report what happened. */
  async syncToVault(): Promise<SyncOutcome> {
    const credentials = this.credentials();
    return credentials
      ? this.bridge.writeThrough(
          CREDENTIALS_KEY_BASE,
          serializeVaulted(credentials, this.repoState()),
          this.accountKey.current(),
        )
      : { kind: 'skipped' };
  }

  /** Restore missing token/repo halves in either direction without clobbering conflicts. */
  async reconcileVault(): Promise<VaultReconcileOutcome> {
    const localCredentials = this.credentials();
    const localRepo = this.repoState();
    const remoteRaw = this.bridge.readThrough(CREDENTIALS_KEY_BASE, this.accountKey.current());
    if (!remoteRaw) {
      return localCredentials ? storedOutcome(await this.syncToVault()) : { kind: 'skipped' };
    }
    const remote = parseVaulted(remoteRaw);
    if (!remote) {
      return { kind: 'failed', message: 'The encrypted Hugo record is unreadable.' };
    }
    if (localCredentials && localCredentials.accessToken !== remote.credentials.accessToken) {
      return {
        kind: 'conflict',
        message:
          'Hugo has different non-empty tokens here and in Mawkingbird; neither copy was replaced.',
      };
    }

    if (!localCredentials) {
      this.writeCredentials(remote.credentials);
    }
    if (!localRepo && remote.repo) {
      this.writeRepo(remote.repo);
    }

    const nextVaultRepo = remote.repo ?? localRepo;
    const remoteChanged = remote.legacy || (!remote.repo && nextVaultRepo !== null);
    if (remoteChanged) {
      const stored = await this.bridge.writeThrough(
        CREDENTIALS_KEY_BASE,
        serializeVaulted(remote.credentials, nextVaultRepo),
        this.accountKey.current(),
      );
      if (stored.kind === 'failed') {
        return stored;
      }
    }

    if (!localCredentials) {
      return { kind: 'restored' };
    }
    return remoteChanged || (!localRepo && remote.repo)
      ? { kind: 'merged' }
      : { kind: 'unchanged' };
  }

  setIncludeInProfile(include: boolean): void {
    const current = this.repoState();
    if (!current) {
      return;
    }
    const next = { ...current, includeInProfile: include };
    localStorage.setItem(this.repoKey, JSON.stringify(next));
    this.repoState.set(next);
    void this.syncToVault();
  }

  setPosse(enabled: boolean): void {
    const current = this.repoState();
    if (!current) {
      return;
    }
    const next = { ...current, posse: enabled };
    localStorage.setItem(this.repoKey, JSON.stringify(next));
    this.repoState.set(next);
    void this.syncToVault();
  }

  /** Remember the feed URL a probe actually found on this site. */
  setFeedUrl(url: string | null): void {
    const current = this.repoState();
    if (!current) {
      return;
    }
    const next = { ...current, feedUrl: url };
    localStorage.setItem(this.repoKey, JSON.stringify(next));
    this.repoState.set(next);
    void this.syncToVault();
  }

  /** Disconnect here, and remove the stored copy so it cannot come back. */
  disconnect(): void {
    void this.bridge.removeThrough(CREDENTIALS_KEY_BASE, this.accountKey.current());
    localStorage.removeItem(this.repoKey);
    this.repoState.set(null);
    this.forgetTokenLocally();
    this.needsFetch.set(false);
  }

  /** Clear the local token only. The repo and any vault copy survive. */
  private forgetTokenLocally(): void {
    localStorage.removeItem(this.credentialsKey);
    this.credentials.set(null);
  }

  expiresAt(): number | null {
    return credentialExpiresAt(this.credentials()?.connectedAt);
  }

  /**
   * Apply the local retention policy to the token.
   *
   * Only the token ages out either way. The repo coordinates are not a secret,
   * and keeping them means reconnecting is one paste rather than a form — which
   * is also why the vaulted case is a *lock*: the blog stays linked, the
   * plaintext goes, and the next {@link token} fetches it back.
   */
  enforceLifetime(): void {
    const current = this.credentials();
    if (!current) {
      return;
    }
    const verdict = this.bridge.verdictFor(CREDENTIALS_KEY_BASE, current.connectedAt);
    if (verdict.kind === 'keep') {
      return;
    }
    this.forgetTokenLocally();
    this.needsFetch.set(verdict.kind === 'lock');
  }
}

function parseVaulted(raw: string): (VaultedHugoSettings & { legacy: boolean }) | null {
  try {
    const parsed = JSON.parse(raw) as Partial<VaultedHugoSettings>;
    if (
      parsed?.v === 1 &&
      typeof parsed.credentials?.accessToken === 'string' &&
      parsed.credentials.accessToken
    ) {
      return {
        v: 1,
        credentials: parsed.credentials,
        repo: normalizeVaultedRepo(parsed.repo),
        legacy: false,
      };
    }
    if (raw.trimStart().startsWith('{')) {
      return null;
    }
  } catch {
    // Legacy records are raw GitHub tokens, so non-JSON is expected.
  }
  return raw
    ? {
        v: 1,
        credentials: stampCredential({ accessToken: raw }),
        repo: null,
        legacy: true,
      }
    : null;
}

function serializeVaulted(credentials: StoredCredentials, repo: HugoRepo | null): string {
  const record: VaultedHugoSettings = { v: 1, credentials, repo };
  return JSON.stringify(record);
}

function normalizeVaultedRepo(value: unknown): HugoRepo | null {
  const repo = value as Partial<HugoRepo> | null;
  if (
    !repo ||
    typeof repo.owner !== 'string' ||
    !repo.owner ||
    typeof repo.repo !== 'string' ||
    !repo.repo
  ) {
    return null;
  }
  return {
    owner: repo.owner,
    repo: repo.repo,
    branch: typeof repo.branch === 'string' && repo.branch ? repo.branch : 'main',
    contentPath:
      typeof repo.contentPath === 'string' && repo.contentPath
        ? normalizeContentPath(repo.contentPath)
        : DEFAULT_CONTENT_PATH,
    siteUrl: typeof repo.siteUrl === 'string' && repo.siteUrl ? repo.siteUrl : null,
    feedUrl: typeof repo.feedUrl === 'string' && repo.feedUrl ? repo.feedUrl : null,
    includeInProfile: repo.includeInProfile === true,
    posse: repo.posse === true,
  };
}

/**
 * Pull `owner` and `repo` out of whatever the user pasted.
 *
 * They paste a full GitHub URL, or `owner/repo`, or fill the two boxes
 * separately. All three are the same intent and the form should not care.
 */
export function parseRepoInput(value: string): { owner: string; repo: string } | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const withoutHost = trimmed
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');
  const parts = withoutHost.split('/').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  return { owner: parts[0], repo: parts[1] };
}

/** Normalize the public site address, or null if the user left it blank. */
export function normalizeSiteUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) {
    return null;
  }
  // Reject a wrong scheme before defaulting one, or `ftp://example.com` gets
  // silently mangled into `https://ftp//example.com` rather than refused.
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(raw)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https') {
    throw new Error('The site address must start with https:// or http://.');
  }
  const withScheme = scheme ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error('Enter a valid site address, for example https://you.github.io/blog/.');
  }
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`;
  }
  return url.toString();
}
