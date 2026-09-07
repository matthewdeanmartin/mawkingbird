import { computed, inject, Injectable } from '@angular/core';
import {
  catchError,
  concatMap,
  from,
  map,
  Observable,
  of,
  switchMap,
  takeWhile,
  tap,
  toArray,
} from 'rxjs';
import { Account, Status } from '../../models';
import { TwitterApi, TwitterPage } from './twitter-api';
import { TwitterCache } from './twitter-cache';
import { TwitterFollow, TwitterFollows } from './twitter-follows';
import { TwitterUsage } from './twitter-usage';

/**
 * How long a fetched timeline is reused before another request is allowed.
 *
 * The spec suggests 30–120 seconds for a first timeline page (§13). Five
 * minutes is deliberately at the generous end of "fresh enough", because
 * freshness here is not free: every miss is a billable request. Someone
 * navigating between the Feeds hub and an account's page three times in a
 * minute should pay once.
 */
export const TIMELINE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  page: TwitterPage;
  fetchedAt: number;
  /**
   * True when this came off disk rather than the network this session.
   *
   * Distinguishes "old but shown deliberately" from "fresh", which is what lets
   * a reload render instantly without also making the app refetch on open.
   */
  persisted?: boolean;
}

/**
 * One followed account's posts, cached and cost-aware.
 *
 * ## Why the cache is a correctness feature, not an optimization
 *
 * Everywhere else in this app a cache saves latency. Here it saves money, which
 * changes what the right behaviour is at the margins:
 *
 * - A cache hit is preferred even when slightly stale, because the alternative
 *   costs a credit rather than a few hundred milliseconds.
 * - A *failed* fetch is not retried on the next navigation. Without that, a
 *   handle that no longer exists would bill a 404 every time its page is
 *   opened.
 * - Refresh is always an explicit act. Nothing here polls, and nothing
 *   refetches on focus or reconnect.
 *
 * ## Two layers, and why
 *
 * The `Map` below is the synchronous source of truth; {@link TwitterCache}
 * backs it with IndexedDB. That split is deliberate rather than incidental:
 * `isCached()`, `estimateCost()` and `findCached()` are called from templates
 * and from cost labels that must answer *now*, so making them async would push
 * `await` into the render path for no benefit. Instead the persisted entries are
 * hydrated into the map once at startup, and writes go to both.
 *
 * This class previously kept the cache in memory only, on the reasoning that
 * media URLs expire and persisting a stranger's posts "buys little". That was
 * wrong about the trade-off: a reload cost one request *per followed account*,
 * which at any real follow count is the largest avoidable spend in the product.
 * Expiring media URLs argue for refetching an image that fails to load, not for
 * discarding the text.
 */
@Injectable({ providedIn: 'root' })
export class TwitterFeed {
  private api = inject(TwitterApi);
  private follows = inject(TwitterFollows);
  private usage = inject(TwitterUsage);
  private store = inject(TwitterCache);

  private cache = new Map<string, CacheEntry>();
  /** Handles whose last fetch failed, so a broken one is not billed repeatedly. */
  private failed = new Map<string, { message: string; at: number }>();

  /**
   * Resolves once persisted entries have been read into {@link cache}.
   *
   * Callers do not await this — a timeline read that arrives before hydration
   * finishes simply misses and fetches, which is the old behaviour and is
   * correct, just not free. Exposed so specs can settle it deterministically.
   */
  readonly hydrated: Promise<void> = this.hydrate();

  private async hydrate(): Promise<void> {
    for (const record of await this.store.load()) {
      // Never overwrite a fetch that already happened this session: it is newer
      // than anything on disk by definition.
      if (this.cache.has(record.handle)) {
        continue;
      }
      this.cache.set(record.handle, {
        page: { statuses: record.statuses, cursor: null, hasMore: false, skipped: 0 },
        fetchedAt: record.fetchedAt,
        persisted: true,
      });
    }
  }

  /**
   * Requests spent, delegated to {@link TwitterUsage}.
   *
   * Kept as a passthrough rather than a second counter: the transport is the
   * only thing that can count accurately (it sees retries and the direct probe),
   * and two counters that disagree would be worse than one.
   */
  readonly requestCount = computed(() => this.usage.total());

  batchAvailable(): boolean {
    return this.api.batchAvailable?.() ?? false;
  }

  /**
   * Whether a held entry is worth spending a request to replace.
   *
   * A restored entry is *never* refetched automatically, however old it is. This
   * is the rule that keeps opening the app free: hydrated posts are minutes or
   * hours old, so a plain age test would make every cold start bill one request
   * per followed account — precisely the cost the persistence was added to
   * avoid. Restored entries are shown, flagged {@link isStale}, and replaced
   * only when the reader asks.
   */
  private shouldRefetch(entry: CacheEntry, now: number = Date.now()): boolean {
    if (entry.persisted) {
      return false;
    }
    return now - entry.fetchedAt >= TIMELINE_TTL_MS;
  }

  /** Whether this account's posts can be served without a request. */
  isCached(username: string): boolean {
    const entry = this.cache.get(key(username));
    return !!entry && !this.shouldRefetch(entry);
  }

  /**
   * Whether what we would show came off disk rather than the network.
   *
   * Drives the "Saved copy — Refresh for new posts" note. Saying so matters: the
   * alternative is silently presenting yesterday's timeline as though it were
   * current, which is worse than either refetching or showing nothing.
   */
  isStale(username: string): boolean {
    return this.cache.get(key(username))?.persisted === true;
  }

  /** When this account was last fetched, or null. */
  fetchedAt(username: string): number | null {
    return this.cache.get(key(username))?.fetchedAt ?? null;
  }

  /**
   * Whether anything at all is held for this account, fresh or not.
   *
   * Distinct from {@link isCached}, which asks "is this good enough to serve
   * without refetching". This asks "is there anything to show", which is the
   * question the home feed needs: a day-old tweet belongs in Home, and fetching
   * a newer one is a decision only the reader should make.
   */
  hasAnything(username: string): boolean {
    return this.cache.has(key(username));
  }

  /**
   * Whatever is held for this account, without ever fetching.
   *
   * The home feed's only read path. Deliberately incapable of spending: the
   * aggregator pages providers in a loop, so a `cached()` that could fall
   * through to the network would bill once per followed account per scroll.
   *
   * Waits for hydration, so a cold page load reads from disk rather than
   * finding an empty map and reporting the reader has no tweets.
   */
  cached(username: string): Observable<Status[]> {
    return from(this.hydrated).pipe(map(() => this.cache.get(key(username))?.page.statuses ?? []));
  }

  /**
   * The accounts most worth spending a request on, stalest first.
   *
   * The whole of "rotation": with 200 follows and a proxy that allows 60
   * requests a minute, refreshing everything is minutes of waiting, and most of
   * it is re-fetching accounts that were current a moment ago. Refreshing the
   * *oldest* N gets the feed most of the way fresh for a fraction of the cost.
   *
   * Never-fetched accounts sort first (treated as infinitely stale), because an
   * account with nothing cached contributes nothing to Home at all — it is the
   * one case where a request definitely buys something new.
   *
   * Deliberately a pure selector rather than a scheduler. Nothing here decides
   * *when* to refresh; that stays an explicit press, as everywhere else in this
   * connector.
   */
  stalest(follows: TwitterFollow[], count: number): TwitterFollow[] {
    return [...follows]
      .sort((a, b) => (this.fetchedAt(a.username) ?? 0) - (this.fetchedAt(b.username) ?? 0))
      .slice(0, Math.max(0, count));
  }

  /**
   * How many requests loading these accounts would cost right now.
   *
   * Drives the "Refresh all (7 requests)" label. Counts only what would
   * actually go to the network, so a second press moments later honestly
   * reports a smaller number rather than repeating the first estimate.
   */
  estimateCost(usernames: string[], force = false): number {
    return force ? usernames.length : usernames.filter((u) => !this.isCached(u)).length;
  }

  /**
   * One account's recent posts.
   *
   * @param force Bypass the cache. Only ever set from an explicit user action —
   * never from a navigation, a focus event, or a retry.
   */
  timeline(follow: TwitterFollow, force = false): Observable<Status[]> {
    // Wait for the disk read before deciding whether to spend anything. Without
    // this the very navigation that persistence exists to make free — a cold
    // page load — would race hydration, miss the cache and bill a request, and
    // the saved copy would land moments later having been paid for twice.
    return from(this.hydrated).pipe(switchMap(() => this.read(follow, force)));
  }

  private read(follow: TwitterFollow, force: boolean): Observable<Status[]> {
    const cacheKey = key(follow.username);
    const cached = this.cache.get(cacheKey);
    if (!force && cached && !this.shouldRefetch(cached)) {
      return of(cached.page.statuses);
    }
    // A handle that just failed is not re-billed on the next navigation. An
    // explicit refresh still gets through, because that is the user asking.
    const failure = this.failed.get(cacheKey);
    if (!force && failure && Date.now() - failure.at < TIMELINE_TTL_MS) {
      return cached ? of(cached.page.statuses) : of([]);
    }

    return this.api.getUserPosts({ userId: follow.userId, username: follow.username }).pipe(
      tap((page) => {
        const fetchedAt = Date.now();
        this.cache.set(cacheKey, { page, fetchedAt });
        this.failed.delete(cacheKey);
        // Bank the stable id and current profile details for free, from a fetch
        // that was happening anyway.
        const author = page.statuses[0]?.reblog?.account ?? page.statuses[0]?.account;
        const userId = authorIdOf(page, follow.username);
        this.follows.recordProfile(follow.username, {
          userId,
          displayName: author?.display_name,
          avatar: author?.avatar,
        });
        // Fire-and-forget: a storage failure must not fail a fetch whose posts
        // are already in hand and about to render.
        void this.store.put({
          handle: cacheKey,
          statuses: page.statuses,
          fetchedAt,
          userId,
        });
      }),
      map((page) => page.statuses),
      catchError((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Could not load posts.';
        this.failed.set(cacheKey, { message, at: Date.now() });
        throw error;
      }),
    );
  }

  /** The last failure for an account, for a row to explain itself. */
  lastError(username: string): string | null {
    return this.failed.get(key(username))?.message ?? null;
  }

  /**
   * Load several accounts at once, sequentially.
   *
   * Sequential rather than `forkJoin`, which is the opposite of what this app
   * does everywhere else and is deliberate. Ten parallel requests through a free
   * CORS proxy is the exact shape that trips its per-origin rate limit — which
   * was observed happening during development — and once throttled, the
   * remaining requests fail *having already been billed*. Paying for ten
   * failures is the worst possible outcome, so the requests go one at a time and
   * stop at the first sign of trouble.
   *
   * A per-account failure does not abort the batch — one dead handle should not
   * cost the reader the other nine — but a rate limit does, because continuing
   * would spend money on requests that are now certain to fail.
   */
  refreshMany(
    follows: TwitterFollow[],
    force = false,
  ): Observable<{ loaded: number; failed: string[]; stopped: boolean }> {
    const failed: string[] = [];
    let loaded = 0;

    return from(follows).pipe(
      concatMap((follow) =>
        this.timeline(follow, force).pipe(
          map(() => {
            loaded++;
            return { fatal: false };
          }),
          catchError((error: unknown) => {
            failed.push(follow.username);
            // Once throttled, every further request in this batch is money spent
            // on a certain failure.
            const fatal =
              error instanceof Error && /rate-limit|429|daily limit/i.test(error.message);
            return of({ fatal });
          }),
        ),
      ),
      takeWhile((result) => !result.fatal, true),
      toArray(),
      map((results) => ({
        loaded,
        failed,
        stopped: results.some((result) => result.fatal),
      })),
    );
  }

  /**
   * A post already held in the cache, by its namespaced id.
   *
   * Lets the thread page render the post someone just clicked without paying to
   * fetch it again — they were looking at it a moment ago, so the app already
   * has it. Returns null when the cache has been dropped (a reload, a new tab),
   * and the caller falls back to a real lookup.
   *
   * Searches nested reblogs and quotes too, since those are clickable in their
   * own right.
   */
  findCached(statusId: string): Status | null {
    for (const entry of this.cache.values()) {
      for (const status of entry.page.statuses) {
        if (status.id === statusId) {
          return status;
        }
        if (status.reblog?.id === statusId) {
          return status.reblog;
        }
        const quoted = status.quote?.quoted_status;
        if (quoted?.id === statusId) {
          return quoted;
        }
      }
    }
    return null;
  }

  /** Drop everything cached for one account, so the next read refetches. */
  evict(username: string): void {
    this.cache.delete(key(username));
    this.failed.delete(key(username));
    void this.store.evict(key(username));
  }

  /**
   * Forget every cached timeline, on disk and in memory.
   *
   * Offered on the connector page next to the follow list. Unlike Refresh this
   * costs nothing and spends nothing — it is for someone who wants the stored
   * posts gone, not someone who wants newer ones.
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.failed.clear();
    await this.store.clear();
  }

  /** How many handles have posts held on disk, for the connector page to report. */
  async storedCount(): Promise<number> {
    return (await this.store.entries()).length;
  }
}

function key(username: string): string {
  return username.toLowerCase();
}

/**
 * The followed account's own numeric id, read off a post they authored.
 *
 * Deliberately not just `statuses[0].account.id`: the first post may be a
 * retweet, whose outer account *is* the follow but whose id we want, or a reply.
 * The namespaced account id is a handle, so this digs the raw provider id out of
 * `providerRef` where the adapter recorded it.
 */
function authorIdOf(page: TwitterPage, username: string): string | undefined {
  const needle = username.toLowerCase();
  for (const status of page.statuses) {
    if (status.account.username.toLowerCase() === needle) {
      const ref = status.providerRef as { authorId?: string } | undefined;
      if (ref?.authorId) {
        return ref.authorId;
      }
    }
  }
  return undefined;
}

/** Convenience for a page that has an `Account` rather than a follow. */
export function followFromAccount(account: Account): TwitterFollow {
  return {
    username: account.username,
    displayName: account.display_name,
    avatar: account.avatar,
    addedAt: Date.now(),
    enabled: true,
  };
}
