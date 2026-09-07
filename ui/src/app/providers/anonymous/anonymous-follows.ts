import { computed, inject, Injectable, signal } from '@angular/core';
import { Account, Relationship } from '../../models';
import { AnonymousHomeFeedCache } from './anonymous-home-feed-cache';

const STORAGE_KEY = 'mockingbird_anonymous_follows';
/**
 * 3 — added {@link AnonymousFollow.network}, so an anonymous visitor can follow
 * Bluesky accounts in the same list as Mastodon ones. v2 rows migrate to
 * `'mastodon'`; see {@link loadState}.
 */
const STATE_VERSION = 3;
// Large enough for the shipped starter collection, while still bounding browser-local work.
export const ANONYMOUS_FOLLOW_LIMIT = 50;

export type AnonymousReadRoute = 'read-api' | 'canonical-api' | 'rss';

export interface AnonymousReadRef {
  server: string;
  accountId: string;
}

type RouteRetryAfter = Record<AnonymousReadRoute, string | null>;

/**
 * Which network an anonymous follow points at.
 *
 * **One follow list, two networks — deliberately.** The alternative was a
 * parallel `AnonymousBskyFollows` store, which is smaller but produces two
 * follow lists, two counts, and a dozen consumers (the hover card, algo-feed,
 * bulk-add, import-follows, the directory, feed-doctor, client-lists) that each
 * either merge them or silently show half. That is the road to two separate
 * anonymous experiences, and the whole point of anonymous mode is that it is
 * *one* experience with both networks in it: someone who will not log into
 * either service can still follow people on both and get a real feed.
 */
export type AnonymousFollowNetwork = 'mastodon' | 'bluesky';

export interface AnonymousFollow {
  key: string;
  handle: string;
  /**
   * Origin of the Mastodon instance this account lives on. Empty string for a
   * Bluesky follow — Bluesky has no per-user instance, and the DID in
   * {@link readRef} is what identifies the account instead.
   */
  server: string;
  profileUrl: string;
  account: Account;
  followedAt: string;
  /**
   * Which network to read this account from. Absent in v2 blobs, where every
   * anonymous follow was Mastodon by construction — {@link loadState} fills it in.
   */
  network: AnonymousFollowNetwork;
  readRef: AnonymousReadRef;
  routeRetryAfter: RouteRetryAfter;
}

interface AnonymousFollowState {
  version: typeof STATE_VERSION;
  follows: AnonymousFollow[];
}

export type FollowResult =
  | { ok: true; relationship: Relationship }
  | { ok: false; relationship: Relationship; error: string };

function hostFromAccount(account: Account, fallbackServer: string): string {
  try {
    if (account.url) {
      return new URL(account.url).host.toLowerCase();
    }
  } catch {
    // Fall through to the federated handle or selected home instance.
  }
  const acct = typeof account.acct === 'string' ? account.acct : '';
  const acctHost = acct.includes('@') ? acct.split('@').at(-1) : null;
  if (acctHost) {
    return acctHost.toLowerCase();
  }
  try {
    return new URL(fallbackServer).host.toLowerCase();
  } catch {
    return 'mastodon.social';
  }
}

function serverFor(host: string, account: Account): string {
  try {
    if (account.url) {
      return new URL(account.url).origin;
    }
  } catch {
    // A synthesized HTTPS origin is the safest fallback for a federated handle.
  }
  return `https://${host}`;
}

function origin(value: string): string | null {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

function emptyRetryState(): RouteRetryAfter {
  return { 'read-api': null, 'canonical-api': null, rss: null };
}

function validRetryState(value: unknown): value is RouteRetryAfter {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<RouteRetryAfter>;
  return [state['read-api'], state['canonical-api'], state.rss].every(
    (retryAfter) => retryAfter === null || typeof retryAfter === 'string',
  );
}

/**
 * Which network an account belongs to, from its id alone.
 *
 * Ids are namespaced at the provider edge (`bsky:<did>`), which is the standing
 * rule for foreign ids — so no extra parameter has to be threaded through the
 * dozen call sites that already pass an `Account` around.
 */
export function networkForAccount(account: Account): AnonymousFollowNetwork {
  return typeof account.id === 'string' && account.id.startsWith('bsky:') ? 'bluesky' : 'mastodon';
}

function keyFor(account: Account, fallbackServer: string): string {
  // A Bluesky account is keyed by its DID, which is the durable identity —
  // handles are rentable and change. Already namespaced (`bsky:<did>`), so it
  // can never collide with a Mastodon `user@host` key in the same list.
  if (networkForAccount(account) === 'bluesky') {
    return account.id;
  }
  const username = typeof account.username === 'string' ? account.username : '';
  return `${username.toLowerCase()}@${hostFromAccount(account, fallbackServer)}`;
}

function relationship(id: string, following: boolean): Relationship {
  return {
    id,
    following,
    followed_by: false,
    requested: false,
    blocking: false,
    muting: false,
  };
}

function loadState(): AnonymousFollowState {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<AnonymousFollowState> | null;
    // v2 and v3 share a row shape apart from `network`, so v2 is migrated
    // rather than dropped — losing these would silently empty a user's Home.
    if (
      (parsed?.version !== STATE_VERSION && parsed?.version !== 2) ||
      !Array.isArray(parsed.follows)
    ) {
      return { version: STATE_VERSION, follows: [] };
    }
    const follows = parsed.follows
      .map((item) => ({
        ...item,
        // Every follow predating this field was Mastodon by construction:
        // Bluesky ones could not be stored at all.
        network: item?.network === 'bluesky' ? ('bluesky' as const) : ('mastodon' as const),
      }))
      .filter(
        (item): item is AnonymousFollow =>
          typeof item?.key === 'string' &&
          typeof item.server === 'string' &&
          typeof item.profileUrl === 'string' &&
          typeof item.readRef?.accountId === 'string' &&
          validRetryState(item.routeRetryAfter) &&
          typeof item.account?.username === 'string' &&
          // The one genuinely per-network rule. A Mastodon row is unreadable
          // without an instance origin to fetch from; a Bluesky row has no
          // instance at all and is identified by the DID in `readRef.accountId`,
          // so requiring an origin there would discard every Bluesky follow on
          // the next load.
          (item.network === 'bluesky'
            ? item.readRef.accountId.startsWith('did:')
            : typeof item.readRef.server === 'string' && !!origin(item.readRef.server)),
      );
    return { version: STATE_VERSION, follows: follows.slice(0, ANONYMOUS_FOLLOW_LIMIT) };
  } catch {
    return { version: STATE_VERSION, follows: [] };
  }
}

/** Owns Anonymous Mastodon relationships; no server mutation ever leaves this service. */
@Injectable({ providedIn: 'root' })
export class AnonymousFollows {
  private state = signal(loadState());
  private homeFeedCache = inject(AnonymousHomeFeedCache);

  readonly follows = computed(() => this.state().follows);
  readonly count = computed(() => this.follows().length);

  isFollowing(account: Account, fallbackServer: string): boolean {
    const key = keyFor(account, fallbackServer);
    return this.follows().some((follow) => follow.key === key);
  }

  relationship(account: Account, fallbackServer: string): Relationship {
    return relationship(account.id, this.isFollowing(account, fallbackServer));
  }

  findByAccountId(accountId: string): AnonymousFollow | null {
    return this.follows().find((follow) => follow.account.id === accountId) ?? null;
  }

  find(account: Account, fallbackServer: string): AnonymousFollow | null {
    const key = keyFor(account, fallbackServer);
    return this.follows().find((follow) => follow.key === key) ?? null;
  }

  routeDeferred(follow: AnonymousFollow, route: AnonymousReadRoute): boolean {
    const retryAfter = follow.routeRetryAfter[route];
    return !!retryAfter && Date.parse(retryAfter) > Date.now();
  }

  hasBackoff(follow: AnonymousFollow): boolean {
    return (Object.keys(follow.routeRetryAfter) as AnonymousReadRoute[]).some((route) =>
      this.routeDeferred(follow, route),
    );
  }

  markApiSuccess(key: string, readRef: AnonymousReadRef): void {
    this.updateFollow(key, (follow) => ({
      ...follow,
      readRef,
      routeRetryAfter: { ...follow.routeRetryAfter, 'read-api': null, 'canonical-api': null },
    }));
  }

  markRouteFailure(key: string, route: AnonymousReadRoute): void {
    this.updateFollow(key, (follow) => {
      if (this.routeDeferred(follow, route)) return follow;
      return {
        ...follow,
        routeRetryAfter: {
          ...follow.routeRetryAfter,
          [route]: new Date(Date.now() + 15 * 60_000).toISOString(),
        },
      };
    });
  }

  /** User-requested, one-shot retry. The next page load will try the public API again. */
  clearBackoff(key: string): void {
    this.updateFollow(key, (follow) => ({ ...follow, routeRetryAfter: emptyRetryState() }));
  }

  follow(account: Account, fallbackServer: string): FollowResult {
    const key = keyFor(account, fallbackServer);
    if (this.follows().some((follow) => follow.key === key)) {
      return { ok: true, relationship: relationship(account.id, true) };
    }
    if (this.count() >= ANONYMOUS_FOLLOW_LIMIT) {
      return {
        ok: false,
        relationship: relationship(account.id, false),
        error: `Anonymous accounts can follow up to ${ANONYMOUS_FOLLOW_LIMIT} accounts.`,
      };
    }
    // Bluesky: no instance, no RSS fallback, no route backoff to negotiate —
    // the public AppView answers an author feed directly. The DID is stored as
    // the read ref, which is what `loadState` validates these rows on.
    if (networkForAccount(account) === 'bluesky') {
      const did = account.id.replace(/^bsky:/, '');
      const bskyFollow: AnonymousFollow = {
        key,
        handle: account.acct || account.username,
        server: '',
        profileUrl: account.url || `https://bsky.app/profile/${account.acct || did}`,
        account,
        followedAt: new Date().toISOString(),
        network: 'bluesky',
        readRef: { server: '', accountId: did },
        routeRetryAfter: emptyRetryState(),
      };
      this.homeFeedCache.invalidate();
      this.persist([...this.follows(), bskyFollow]);
      return { ok: true, relationship: relationship(account.id, true) };
    }
    const host = hostFromAccount(account, fallbackServer);
    const server = serverFor(host, account);
    const readServer = origin(fallbackServer) ?? server;
    const follow: AnonymousFollow = {
      key,
      handle: `${account.username}@${host}`,
      server,
      profileUrl: account.url || `${server}/@${account.username}`,
      account: { ...account, acct: `${account.username}@${host}` },
      followedAt: new Date().toISOString(),
      network: 'mastodon',
      readRef: { server: readServer, accountId: account.id },
      routeRetryAfter: emptyRetryState(),
    };
    this.homeFeedCache.invalidate();
    this.persist([...this.follows(), follow]);
    return { ok: true, relationship: relationship(account.id, true) };
  }

  /**
   * Replace the stored copy of an account already followed.
   *
   * Follows cache the whole `Account` because the timeline renders author cards
   * from it, which means an avatar or display name captured at follow time can
   * go stale and never recover — {@link follow} returns early for an account
   * already followed, so it cannot be used to refresh one. Does nothing if the
   * account is not followed: this refreshes, it never adds.
   */
  refreshAccount(account: Account, fallbackServer: string): void {
    const key = keyFor(account, fallbackServer);
    if (!this.follows().some((follow) => follow.key === key)) {
      return;
    }
    this.updateFollow(key, (follow) => ({
      ...follow,
      account: { ...account, acct: follow.account.acct },
    }));
  }

  unfollow(account: Account, fallbackServer: string): Relationship {
    const key = keyFor(account, fallbackServer);
    if (this.follows().some((follow) => follow.key === key)) this.homeFeedCache.invalidate();
    this.persist(this.follows().filter((follow) => follow.key !== key));
    return relationship(account.id, false);
  }

  private persist(follows: AnonymousFollow[]): void {
    const state: AnonymousFollowState = { version: STATE_VERSION, follows };
    this.state.set(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  private updateFollow(key: string, update: (follow: AnonymousFollow) => AnonymousFollow): void {
    this.persist(this.follows().map((follow) => (follow.key === key ? update(follow) : follow)));
  }
}
