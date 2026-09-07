import { inject, Injectable, signal } from '@angular/core';
import {
  catchError,
  forkJoin,
  map,
  Observable,
  of,
  switchMap,
  tap,
  throwError,
  timeout,
  TimeoutError,
} from 'rxjs';
import { Api } from '../api';
import { Auth } from '../auth';
import { ClientPrefs, homeWindowMs } from '../client-prefs';
import { HomeDiagnostics } from '../home-diagnostics';
import { Status } from '../models';
import { byNewestFirst } from '../status-sort';
import { MastodonConnector } from './mastodon/mastodon-connector';
import { FeedProvider } from './provider';
import { ProviderRegistry } from './provider-registry';

/** Each active source earns at least this many posts in one loading round. */
const SOURCE_PAGE_SIZE = 20;

/**
 * How long one foreign source may hold up the whole round.
 *
 * The round is a `forkJoin`, so Home renders nothing until every source settles
 * — which means the slowest source sets the time-to-first-post for all of them.
 * That was fine while "slow" meant a sluggish RSS host. It stopped being fine
 * when the free CORS proxies this app depends on started refusing in bulk:
 * a provider that retries with backoff behind a dead proxy can legitimately take
 * a minute to fail, and for that minute Home looked frozen with a spinner.
 *
 * Ten seconds is past any healthy response and well short of the retry budget
 * that caused the freeze. A source that misses it is dropped **from this round
 * only** — it is not marked exhausted, because a timeout is not evidence the
 * source is empty, and its own cache may well answer instantly next round.
 */
const SOURCE_TIMEOUT_MS = 10_000;

/**
 * The most posts one source may contribute to a single round, whatever it says.
 *
 * `SOURCE_PAGE_SIZE` is a *quota* — "keep paging until you have at least this
 * many" — and it stops the loop, but it cannot stop a source that answers the
 * very first call with more than the loop ever intended to collect. Nothing
 * downstream did either, so an oversized page went straight into the feed.
 *
 * Which is what happened: one RSS feed returned 15,291 items in a single page,
 * Home stored 15,411 posts against a configured `feedMax` of 500, and rendering
 * that many status cards froze the tab.
 *
 * This is the backstop rather than the fix — the RSS provider now caps its own
 * output, which is the right place for a fix to live. But "no provider can flood
 * Home" should be an invariant of the thing that merges providers, not a promise
 * each provider is trusted to keep, because the next provider to break it will
 * be a new one and Home will look broken again.
 *
 * Generous on purpose. It is not a paging parameter and must never bite a
 * well-behaved source; it exists so a misbehaving one is truncated instead of
 * fatal.
 */
const SOURCE_HARD_CAP = 500;

interface ForeignSource {
  provider: FeedProvider;
  exhausted: boolean;
}

/**
 * Loads the home feed in per-source rounds, then merges each round newest-first.
 *
 * Every visible active source contributes at least 20 posts when available:
 * Mastodon first, then each linked foreign provider. Provider pages are kept
 * whole, so a page that crosses 20 may make the round larger. This prevents a
 * busy Mastodon timeline from squeezing RSS or Bluesky out of the loaded feed.
 */
@Injectable({ providedIn: 'root' })
export class FeedAggregator {
  private api = inject(Api);
  private auth = inject(Auth);
  private prefs = inject(ClientPrefs);
  private registry = inject(ProviderRegistry);
  private connector = inject(MastodonConnector);
  private diagnostics = inject(HomeDiagnostics);

  private mastodonMaxId: string | undefined;
  private mastodonExhausted = false;
  private foreign: ForeignSource[] = [];
  /** Epoch ms before which posts are not loaded, or null for no limit. */
  private cutoff: number | null = null;

  /**
   * How many posts the current window dropped, so Home can offer to widen it.
   *
   * Counted rather than inferred: "you are only seeing today" is useful, but
   * only if the app can say there is actually something older to see.
   */
  readonly droppedByWindow = signal(0);

  /**
   * Whether a post is inside the loading window.
   *
   * An unparseable date counts as *inside*. `normalizeTimestamp` already yields
   * null rather than now() for a bad date, and those statuses carry epoch 0 —
   * dropping them would silently hide a post because its provider sent a date
   * we could not read, which is a worse failure than showing it.
   */
  private withinWindow(status: Status): boolean {
    if (this.cutoff === null) {
      return true;
    }
    const ms = Date.parse(status.created_at);
    return Number.isNaN(ms) || ms === 0 || ms >= this.cutoff;
  }

  /** Start over from the top using the providers currently visible to the user. */
  reset(): void {
    const windowMs = homeWindowMs(this.prefs.homeWindow());
    this.cutoff = windowMs === null ? null : Date.now() - windowMs;
    this.droppedByWindow.set(0);
    this.mastodonMaxId = undefined;
    // Anonymous *or* Bluesky-primary: neither can call /api/v1/timelines/home.
    // A Bluesky-primary account has no Mastodon token until Sprint 4 attaches
    // one, and querying anyway returns 401 — which, because the round is a
    // forkJoin, took the *whole* round down and discarded the Bluesky posts that
    // had loaded perfectly well. A Bluesky-primary home feed was empty for
    // exactly this reason.
    //
    // Deliberately not `lacksMastodonToken`, which is also true when signed out:
    // a signed-out session never reaches Home in the real app (the auth guard
    // redirects), so treating it as Mastodon-capable is both harmless and what
    // the aggregator's own specs assume.
    // A Bluesky-primary account reaches Mastodon's home timeline only through a
    // **signed-in** connector. The other two connector states are both excluded,
    // for different reasons:
    //
    //   absent    — the user never opted into Mastodon. Calling anyway spends
    //               their bandwidth on a network they declined.
    //   anonymous — no follows exist, so /timelines/home is a public firehose:
    //               strangers mixed into a timeline that otherwise contains only
    //               people the user chose. Explore, trends and tags still work —
    //               they never went through the aggregator. Merging Home is the
    //               payoff for signing the connector in, and is what makes the
    //               upgrade mean something.
    const connectorFeedsHome = this.auth.isBlueskyPrimary && this.connector.signedIn();
    this.mastodonExhausted =
      this.auth.isAnonymous ||
      (this.auth.isBlueskyPrimary && !connectorFeedsHome) ||
      !this.prefs.isProviderVisible('mastodon');
    this.foreign = this.registry
      .linked()
      .filter((provider) => this.prefs.isProviderVisible(provider.id))
      .map((provider) => {
        provider.reset();
        return { provider, exhausted: false };
      });
    // Safety net: an authenticated reader whose persisted filters hide *every*
    // source (e.g. mastodon + all linked providers toggled off, from a shared
    // localStorage prefs blob) would otherwise get a permanently empty home
    // feed with no visible chip to recover — Mastodon is their primary network,
    // so keep it enabled rather than honour a filter that shows nothing.
    //
    // Not for anonymous readers, nor for a Bluesky-primary reader without a
    // signed-in connector: re-enabling Mastodon for them would reinstate the 401
    // above, and "every source is hidden" is not the situation they are in
    // anyway. A Bluesky-primary reader *with* a signed-in connector does have a
    // usable Mastodon token, so the net catches them like anyone else.
    if (
      !this.auth.isAnonymous &&
      (!this.auth.isBlueskyPrimary || connectorFeedsHome) &&
      this.mastodonExhausted &&
      !this.foreign.length
    ) {
      this.mastodonExhausted = false;
      this.diagnostics.warn('aggregator:all-sources-hidden-fallback');
    }
    this.diagnostics.info('aggregator:reset', {
      mode: this.auth.mode() ?? 'unauthenticated',
      mastodonVisible: this.prefs.isProviderVisible('mastodon'),
      mastodonEnabled: !this.mastodonExhausted,
      mastodonConnector: this.connector.current().state,
      linkedProviders: this.registry.linked().map((provider) => provider.id),
      enabledForeignProviders: this.foreign.map((source) => source.provider.id),
    });
  }

  hasMore(): boolean {
    return !this.mastodonExhausted || this.foreign.some((source) => !source.exhausted);
  }

  /** Fetch one quota-sized round from every active source and merge it by date. */
  nextPage(): Observable<Status[]> {
    const sourcePages: Observable<Status[]>[] = [];
    // The round is a forkJoin: nothing renders until the slowest source settles,
    // so pairing this with `round-success`'s elapsedMs and the per-source timeout
    // warnings is what names the culprit behind a Home feed that felt frozen.
    const roundStartedAt = Date.now();
    this.diagnostics.info('aggregator:round-start', {
      mastodonEnabled: !this.mastodonExhausted,
      foreignProviders: this.foreign
        .filter((source) => !source.exhausted)
        .map((source) => source.provider.id),
      sourceTimeoutMs: SOURCE_TIMEOUT_MS,
    });

    if (!this.mastodonExhausted) {
      sourcePages.push(
        this.api.homeTimeline(this.mastodonMaxId).pipe(
          map((items) => {
            this.mastodonMaxId = items.at(-1)?.id ?? this.mastodonMaxId;
            if (items.length < SOURCE_PAGE_SIZE) {
              this.mastodonExhausted = true;
            }
            // A page is newest-first, so once it crosses the cutoff everything
            // beyond it is older still — stop rather than paging into the
            // archive. This is what keeps "Today" from loading a year.
            const fresh = items.filter((item) => this.withinWindow(item));
            if (fresh.length < items.length) {
              this.droppedByWindow.update((n) => n + (items.length - fresh.length));
              this.mastodonExhausted = true;
            }
            return fresh;
          }),
          tap({
            next: (items) =>
              this.diagnostics.info('mastodon:page-success', {
                posts: items.length,
                exhausted: this.mastodonExhausted,
              }),
            error: (error: unknown) => this.diagnostics.error('mastodon:page-error', error),
          }),
        ),
      );
    }

    sourcePages.push(
      ...this.foreign
        .filter((source) => !source.exhausted)
        .map((source) => this.fetchForeignPage(source)),
    );

    if (!sourcePages.length) {
      this.diagnostics.warn('aggregator:no-enabled-sources');
      return of([]);
    }
    return forkJoin(sourcePages).pipe(
      map((pages) => pages.flat().sort(byNewestFirst)),
      tap((items) =>
        this.diagnostics.info('aggregator:round-success', {
          posts: items.length,
          elapsedMs: Date.now() - roundStartedAt,
          providerCounts: this.providerCounts(items),
          hasMore: this.hasMore(),
        }),
      ),
    );
  }

  /**
   * Keep paging one foreign source until its round reaches the quota or exhausts.
   *
   * `deadline` is shared across the recursion so the *source* gets
   * {@link SOURCE_TIMEOUT_MS} in total, not that much per page. Applying the
   * timeout to each call individually would let a source that pages five times
   * hold the round for fifty seconds while never once tripping the limit.
   */
  private fetchForeignPage(
    source: ForeignSource,
    collected: Status[] = [],
    deadline = Date.now() + SOURCE_TIMEOUT_MS,
  ): Observable<Status[]> {
    if (source.exhausted || collected.length >= SOURCE_PAGE_SIZE) {
      return of(collected);
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      this.diagnostics.warn('foreign:round-deadline', {
        provider: source.provider.id,
        collected: collected.length,
        budgetMs: SOURCE_TIMEOUT_MS,
      });
      return of(collected);
    }
    const startedAt = Date.now();
    return source.provider.fetchPage().pipe(
      // A source that has stopped answering must not hold Home hostage. It keeps
      // whatever it already collected and is left *unexhausted*: a timeout says
      // "not now", not "nothing left", and next round its cache may answer at once.
      timeout({
        each: remaining,
        with: () => throwError(() => new TimeoutError()),
      }),
      // A browser-only source can fail for reasons outside our control (most
      // commonly an RSS server without CORS headers). One unavailable source
      // must never reject forkJoin and discard every healthy Home source.
      catchError((error: unknown) => {
        const timedOut = error instanceof TimeoutError;
        // Only a real failure exhausts the source. Marking a timed-out source
        // exhausted would drop it for the rest of the session over one slow round.
        source.exhausted = !timedOut;
        if (timedOut) {
          this.diagnostics.warn('foreign:page-timeout', {
            provider: source.provider.id,
            waitedMs: Date.now() - startedAt,
            budgetMs: SOURCE_TIMEOUT_MS,
            collected: collected.length,
            note: 'dropped from this round only; source stays eligible',
          });
        } else {
          this.diagnostics.error('foreign:page-error', error, {
            provider: source.provider.id,
            waitedMs: Date.now() - startedAt,
            collected: collected.length,
          });
        }
        // `null`, not `[]`: an empty page below means "this source is spent" and
        // exhausts it. A timeout must not be read that way, and the exhaustion
        // decision for a real failure has already been made right here.
        return of<Status[] | null>(null);
      }),
      switchMap((rawItems) => {
        if (rawItems === null) {
          return of(collected);
        }
        if (!rawItems.length) {
          source.exhausted = true;
          return of(collected);
        }
        // Truncate before anything else looks at the page. A source that
        // overruns this badly is not paging, it is dumping an archive, so there
        // is nothing more to collect from it this round either.
        let items = rawItems;
        if (rawItems.length > SOURCE_HARD_CAP) {
          this.diagnostics.warn('foreign:page-oversized', {
            provider: source.provider.id,
            returned: rawItems.length,
            cap: SOURCE_HARD_CAP,
            note: 'page truncated and source stopped for this round; the provider should cap its own output',
          });
          items = rawItems.slice(0, SOURCE_HARD_CAP);
          source.exhausted = true;
          return of([...collected, ...items.filter((item) => this.withinWindow(item))]);
        }
        // Same rule as Mastodon: a source that has gone past the cutoff has
        // nothing newer left to give, so stop paging it. Without this, a
        // provider that merges many low-rate sources (RSS, and Anonymous
        // client-side follows worst of all) keeps paging until it has loaded
        // every post it has ever seen.
        const fresh = items.filter((item) => this.withinWindow(item));
        if (fresh.length < items.length) {
          this.droppedByWindow.update((n) => n + (items.length - fresh.length));
          source.exhausted = true;
        }
        return this.fetchForeignPage(source, [...collected, ...fresh], deadline);
      }),
    );
  }

  private providerCounts(statuses: Status[]): Record<string, number> {
    return statuses.reduce<Record<string, number>>((counts, status) => {
      const provider = status.provider ?? 'mastodon';
      counts[provider] = (counts[provider] ?? 0) + 1;
      return counts;
    }, {});
  }
}
