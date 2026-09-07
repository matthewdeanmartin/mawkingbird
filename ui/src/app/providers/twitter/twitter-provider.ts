import { computed, inject, Injectable, signal } from '@angular/core';
import {
  catchError,
  concatMap,
  forkJoin,
  from,
  map,
  Observable,
  of,
  switchMap,
  tap,
  toArray,
} from 'rxjs';
import { Status } from '../../models';
import { PageDiagnostics } from '../../page-diagnostics';
import { FeedProvider } from '../provider';
import { TwitterFeed } from './twitter-feed';
import { TwitterFollow, TwitterFollows } from './twitter-follows';
import { TwitterSettings } from './twitter-settings';

/**
 * Followed Twitter accounts as a home-timeline source.
 *
 * ## Why this one is not like the other providers
 *
 * Every other provider here is free to call, so `FeedAggregator` may page them
 * as hard as it likes — and it does: `fetchForeignPage` re-invokes `fetchPage()`
 * in a loop until a source yields 20 posts or returns empty. For RSS that is a
 * few extra HTTP requests to publishers who do not mind. Applied naively to
 * Twitter it would be **one billed request per followed account per scroll**,
 * with the bill growing as the reader scrolls further.
 *
 * So this provider inverts the usual relationship with the network: it is a
 * *reader of the cache*, not a fetcher. `fetchPage()` returns everything it
 * already has in one page and then reports exhausted, which ends the
 * aggregator's loop after exactly one call. Nothing here ever fetches on
 * scroll, on focus, or on reconnect.
 *
 * ## Where the posts come from, then
 *
 * {@link TwitterFeed}, which is backed by IndexedDB. The practical effect is
 * that opening Mawkingbird shows the tweets from the last refresh mixed into
 * Home for free, and getting *newer* ones is an explicit act on the connector
 * page ("Refresh all") or the account's own page. That is the same bargain the
 * rest of this connector makes: reading what you already paid for is free,
 * spending is always something you asked for.
 *
 * The first `fetchPage()` after a `reset()` *may* fetch, but only for accounts
 * with nothing cached at all and only up to {@link COLD_START_BUDGET}. Without
 * that, a reader who connects Twitter and goes straight to Home would see an
 * empty section and no explanation — the feature would look broken rather than
 * unpaid-for.
 */

/**
 * How many accounts a cold Home may fetch before giving up and asking.
 *
 * Small on purpose. This exists so Home is not mysteriously empty right after
 * setup, not so Home can populate 200 follows by itself: at one request each
 * that would be a surprise bill triggered by navigation, which is exactly what
 * this connector refuses to do anywhere else. Past this, the section says how
 * to load the rest and what it will cost.
 */
export const COLD_START_BUDGET = 3;

/**
 * Consecutive cold-start failures before Home stops trying for a while.
 *
 * Two, because one failure is a bad handle and two in a row is the network. The
 * case this exists for is every free CORS proxy refusing at once, which does
 * happen: without it, each Home round re-attempts the same doomed fetches, and
 * `fillToMinimum()` starts a fresh round after every page — so a dead proxy is
 * retried continuously for as long as the reader stays on the page.
 */
export const FAILURE_THRESHOLD = 2;

/**
 * How long Home leaves the network alone after tripping the breaker.
 *
 * Long enough for a rate-limited free proxy to forgive us, short enough that a
 * reader who leaves Home open gets their tweets back without a reload. Cached
 * posts are unaffected throughout — the breaker only stops *fetching*, and
 * everything already on disk keeps rendering, which is the whole bargain this
 * connector makes anyway.
 */
export const COOLDOWN_MS = 5 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class TwitterProvider implements FeedProvider {
  private feed = inject(TwitterFeed);
  private follows = inject(TwitterFollows);
  private settings = inject(TwitterSettings);
  private diagnostics = inject(PageDiagnostics);

  readonly id = 'twitter' as const;
  readonly label = 'Twitter';
  readonly badge = '🐦 Twitter';

  /**
   * Linked once the connector works *and* someone is followed.
   *
   * Both halves matter: a key with no follows produces an empty section that
   * looks broken, and follows with no working key produce an error on every
   * Home load. Neither is worth showing a chip for.
   */
  readonly linked = computed(() => this.settings.usable() && this.follows.enabled().length > 0);

  readonly errors = signal<string[]>([]);

  /**
   * The failures as one line, because the list was worse than useless.
   *
   * When every free CORS proxy refuses at once — which is the common case, they
   * share rate limits and go down together — the old per-account list printed the
   * same sentence once per followed account, pushing the actual feed off the
   * screen behind a wall of identical text. It read as the app being broken in
   * many ways rather than unavailable in one.
   *
   * So: how many, and the reason once. Null when there is nothing to say.
   */
  readonly errorSummary = computed<string | null>(() => {
    const failures = this.errors();
    if (!failures.length) {
      return null;
    }
    const count = failures.length;
    const subject = count === 1 ? '1 Twitter account' : `${count} Twitter accounts`;
    // Every message is usually the same underlying failure; naming it once is
    // the useful part. Only claim they match when they actually do.
    const reasons = new Set(failures.map((line) => line.replace(/^@[^:]+:\s*/, '')));
    const reason = reasons.size === 1 ? [...reasons][0] : 'Several accounts failed to load.';
    return `Couldn't load ${subject}. ${reason}`;
  });

  /**
   * How many followed accounts have nothing to show, so Home can offer to load
   * them rather than silently omitting them.
   */
  readonly unloaded = signal(0);

  /**
   * When the breaker is open, the moment it closes again — otherwise null.
   *
   * Exposed so Home can say "Twitter is resting until 14:32" rather than quietly
   * omitting the section, which would look identical to having no follows.
   */
  readonly pausedUntil = signal<number | null>(null);

  /** True while the breaker is open. Cached posts still render; only fetching stops. */
  readonly paused = computed(() => {
    const until = this.pausedUntil();
    return until !== null && until > Date.now();
  });

  private exhausted = false;
  /** Consecutive cold-start failures. Reset by any success. */
  private consecutiveFailures = 0;

  reset(): void {
    this.exhausted = false;
    this.errors.set([]);
  }

  /**
   * Try the network again now, at the user's request.
   *
   * The breaker protects against an app that retries on its own forever; a person
   * who presses "Retry" has new information (they reconnected, they switched
   * proxy) and is entitled to override it.
   */
  resume(): void {
    this.pausedUntil.set(null);
    this.consecutiveFailures = 0;
    this.errors.set([]);
    this.diagnostics.info('Twitter', 'breaker:reset', { reason: 'user asked to retry' });
  }

  private trip(): void {
    const until = Date.now() + COOLDOWN_MS;
    this.pausedUntil.set(until);
    this.diagnostics.warn('Twitter', 'breaker:open', {
      consecutiveFailures: this.consecutiveFailures,
      threshold: FAILURE_THRESHOLD,
      cooldownMs: COOLDOWN_MS,
      until: new Date(until).toISOString(),
      note: 'Home will keep showing cached tweets; only fetching is paused',
    });
  }

  fetchPage(): Observable<Status[]> {
    // One page, ever. See the class comment: the aggregator's paging loop is
    // free for other providers and billable here.
    if (this.exhausted) {
      return of([]);
    }
    this.exhausted = true;
    // Wait for the saved timelines before deciding what is "cold". Reading the
    // cache too early would classify every account as unfetched and spend the
    // cold-start budget re-buying tweets already on disk.
    return from(this.feed.hydrated).pipe(switchMap(() => this.readPage()));
  }

  private readPage(): Observable<Status[]> {
    const follows = this.follows.enabled();
    if (!follows.length) {
      this.unloaded.set(0);
      return of([]);
    }

    const cold = follows.filter((follow) => !this.feed.hasAnything(follow.username));
    // Everything already on disk costs nothing, so it is always included.
    const warm = follows.filter((follow) => this.feed.hasAnything(follow.username));
    // With the breaker open, fetch nothing and show what is on disk. The cold
    // accounts are still counted as unloaded so Home can explain the gap.
    const open = this.paused();
    const toFetch = open ? [] : cold.slice(0, COLD_START_BUDGET);
    this.unloaded.set(cold.length - toFetch.length);
    if (open) {
      this.diagnostics.info('Twitter', 'page:skipped-cold-start', {
        reason: 'breaker open',
        pausedUntil: new Date(this.pausedUntil() ?? 0).toISOString(),
        warm: warm.length,
        cold: cold.length,
      });
    }

    // Cached reads are free and can all resolve together. Cold starts begin
    // together only when Mawkingbird can enclose them in one invocation;
    // third-party proxies keep the established one-at-a-time path.
    const cachedPages = warm.length
      ? forkJoin(warm.map((follow) => this.feed.cached(follow.username)))
      : of<Status[][]>([]);

    const fetchOne = (follow: TwitterFollow) =>
      // Once the breaker trips mid-batch, abandon the rest of the cold
      // starts: they are queued behind the same dead proxy and would each
      // pay the full failure latency before reporting the same thing.
      this.paused()
        ? of<Status[]>([])
        : this.feed.timeline(follow).pipe(
            tap(() => {
              this.consecutiveFailures = 0;
            }),
            catchError((error: unknown) => {
              const message = error instanceof Error ? error.message : 'Could not load an account.';
              this.errors.update((all) => [...all, `@${follow.username}: ${message}`]);
              this.consecutiveFailures += 1;
              this.diagnostics.error('Twitter', 'page:account-error', error, {
                handle: follow.username,
                consecutiveFailures: this.consecutiveFailures,
                threshold: FAILURE_THRESHOLD,
              });
              if (this.consecutiveFailures >= FAILURE_THRESHOLD) this.trip();
              return of<Status[]>([]);
            }),
          );

    const fetchedPages = !toFetch.length
      ? of<Status[][]>([])
      : this.feed.batchAvailable()
        ? forkJoin(toFetch.map(fetchOne))
        : from(toFetch).pipe(
            concatMap((follow) => fetchOne(follow)),
            toArray(),
          );

    return forkJoin([cachedPages, fetchedPages]).pipe(
      map(([cached, fetched]) =>
        [...cached, ...fetched]
          .flat()
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
      ),
    );
  }
}
