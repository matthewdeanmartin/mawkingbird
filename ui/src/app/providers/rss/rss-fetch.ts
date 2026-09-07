import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  catchError,
  defer,
  from,
  map,
  Observable,
  of,
  Subscriber,
  shareReplay,
  switchMap,
  tap,
  throwError,
  timeout,
} from 'rxjs';
import { ClientPrefs } from '../../client-prefs';
import { PageDiagnostics } from '../../page-diagnostics';
import { CorsProxy } from '../cors-proxy/cors-proxy';
import { CorsProxyUsageStore, toResponse } from '../cors-proxy/cors-proxy-usage';
import { externalFetch } from '../external-fetch';
import { FAILURE_COOLDOWN_MS, RssCache } from './rss-cache';
import { ParsedFeed, parseFeed } from './rss-parser';

/**
 * Fetches and parses a feed, going to the network as rarely as it can.
 *
 * Direct from the browser by default, which is the only mode that involves
 * nobody but the reader and the publisher. Feeds whose hosts don't send CORS
 * headers can't be read that way; for those the user may opt *that feed* in to
 * the CORS proxy they configured, which is the only way this class ever uses
 * one. There is no automatic fallback: a proxy operator can read and rewrite
 * everything that passes through it, so routing traffic through one is a
 * decision the user makes per feed rather than a silent retry.
 *
 * ## Three layers stand between a caller and a request
 *
 * 1. **The persistent cache** ({@link RssCache}, IndexedDB). A feed fetched
 *    successfully is reused for {@link ClientPrefs.rssCacheTtlHours} — 24 hours
 *    by default.
 * 2. **In-flight sharing.** Concurrent callers for the same feed share one
 *    request. The global `dedupeInterceptor` deliberately skips external
 *    fetches, so without this the home timeline, a profile page and an article
 *    view opening together would each issue their own.
 * 3. **A failure cooldown.** After a failed attempt the feed is left alone for
 *    {@link FAILURE_COOLDOWN_MS} and the stale copy is served instead. This is
 *    what stops a throttled proxy from being hammered into staying throttled.
 *
 * Before this existed, opening one article cost at least two full feed
 * downloads (the item, then its comment feed) with nothing shared or retained —
 * which is how a free proxy's rate limit gets exhausted by ordinary reading.
 */
/**
 * How long a repeated diagnostic stays silent.
 *
 * Long enough that browsing around a set of feeds does not narrate itself,
 * short enough that a developer reading the console after a few minutes of use
 * still sees the current state rather than only the first page load.
 */
const LOG_QUIET_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class RssFetch {
  private http = inject(HttpClient);
  private corsProxy = inject(CorsProxy);
  private proxyUsage = inject(CorsProxyUsageStore);
  private cache = inject(RssCache);
  private prefs = inject(ClientPrefs);
  private diagnostics = inject(PageDiagnostics);

  /**
   * Requests currently on the wire, by feed URL.
   *
   * Keyed on the *feed* URL rather than the proxied request URL so a direct and
   * a proxied caller for the same feed still share, and so the entry survives a
   * proxy configuration change mid-flight.
   */
  private inFlight = new Map<string, Observable<ParsedFeed>>();

  /** Proxy-eligible misses waiting for the short coalescing window to close. */
  private batchQueue: PendingBatchFeed[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private batchSequence = 0;

  /**
   * When each diagnostic key was last emitted, for rate-limiting the log.
   *
   * Cache hits are the common case by design — every view that shows a feed
   * resolves it from cache — so logging each one would bury the events that
   * actually matter (a fetch, a failure, a throttle). Each distinct fact is
   * said at most once per {@link LOG_QUIET_MS}.
   *
   * A full page navigation rebuilds this service and legitimately starts the
   * window again; within a session, repeated renders stay quiet.
   */
  private lastLoggedAt = new Map<string, number>();

  private logOnce(key: string, event: string, details: Record<string, unknown>): void {
    const previous = this.lastLoggedAt.get(key);
    const now = Date.now();
    if (previous !== undefined && now - previous < LOG_QUIET_MS) {
      return;
    }
    this.lastLoggedAt.set(key, now);
    this.diagnostics.info('RSS', event, details);
  }

  /**
   * Fetch and parse one feed.
   *
   * @param options.useProxy Route through the configured CORS proxy. Only ever
   * set from a subscription's own opt-in flag, or from the user explicitly
   * retrying a feed that just failed.
   *
   * A refusal from the proxy guard propagates rather than falling back to a
   * direct fetch: it means the guard rejected this target, which the user needs
   * to see.
   */
  fetchFeed(
    url: string,
    options: { useProxy?: boolean; forceRefresh?: boolean; noCache?: boolean } = {},
  ): Observable<ParsedFeed> {
    // `noCache` is for one-off reads of URLs that are not subscriptions — the
    // anonymous provider's `<profile>.rss` fallback, which has its own
    // per-follow deferral and would otherwise fill the cache with entries no
    // feed list ever refers to.
    if (options.noCache) {
      return this.buildRequest(url, options);
    }

    const ttlMs = options.forceRefresh ? 0 : this.prefs.rssCacheTtlHours() * 60 * 60 * 1000;

    // `defer` so the cache lookup happens per subscription rather than at call
    // time — callers build these observables and subscribe later.
    const viaProxy = options.useProxy === true;

    return defer(() =>
      from(this.cache.get(url, ttlMs)).pipe(
        switchMap((cached) => {
          if (cached && !cached.stale) {
            // Logged at most once per feed per session (see `logged`), so a
            // timeline that renders twenty cached items stays quiet.
            this.logOnce(`hit:${url}`, 'cache-hit', {
              feed: url,
              items: cached.feed.items.length,
              ageMinutes: Math.round((Date.now() - cached.fetchedAt) / 60000),
            });
            return of(cached.feed);
          }
          return from(this.shouldSkipNetwork(url, options.forceRefresh === true, viaProxy)).pipe(
            switchMap((skip) => {
              // Throttled or recently failed: the stale copy is the best answer
              // available, and going to the network would only deepen the hole.
              //
              // `cached` is null when the feed has only ever failed, so this
              // never hands back an empty placeholder — a feed that has never
              // been read successfully must report the failure, not render as
              // an empty feed with zero posts.
              if (skip && cached) {
                this.logOnce(`cooldown:${routeKey(url, viaProxy)}`, 'serving-stale-in-cooldown', {
                  feed: url,
                  viaProxy,
                  ageMinutes: Math.round((Date.now() - cached.fetchedAt) / 60000),
                  note: 'A recent fetch failed; not retrying for a few minutes.',
                });
                return of(cached.feed);
              }
              if (skip) {
                // Nothing cached and still cooling down: report the throttle
                // rather than rendering an empty feed.
                this.logOnce(`blocked:${routeKey(url, viaProxy)}`, 'fetch-suppressed', {
                  feed: url,
                  viaProxy,
                  note: 'A recent fetch failed and nothing is cached yet.',
                });
                return throwError(
                  () =>
                    new Error(
                      "This feed couldn't be read a moment ago, so it isn't being retried yet. " +
                        'Use Refresh on Settings → RSS to try again now.',
                    ),
                );
              }
              return this.networkFetch(url, options).pipe(
                catchError((error: unknown) => {
                  // Serving day-old articles beats showing an error, so a stale
                  // copy wins over a failure — but only after the failure has
                  // been recorded, so the cooldown actually engages.
                  //
                  // A proxy *refusal* is the exception: it means the guard or
                  // the configuration rejected this feed, which is the user's
                  // to fix and must not be masked by stale content.
                  if (cached && !isConfigurationError(error)) {
                    return of(cached.feed);
                  }
                  return throwError(() => error);
                }),
              );
            }),
          );
        }),
      ),
    );
  }

  /**
   * Whether a recent failure means this feed should be left alone for now.
   *
   * A cooldown only ever suppresses a *repeat of the route that failed*. The
   * direct and proxied routes fail for unrelated reasons — a direct fetch that
   * failed on CORS says nothing about whether the proxy can read the feed — so
   * a direct failure must not block the proxied retry the user just asked for,
   * which is precisely the sequence "add a blocked feed, then retry via proxy"
   * performs.
   *
   * Keyed per route rather than per feed, because the *content* is shared
   * between routes even though the failures are not.
   */
  private async shouldSkipNetwork(
    url: string,
    forceRefresh: boolean,
    viaProxy: boolean,
  ): Promise<boolean> {
    if (forceRefresh) {
      return false;
    }
    return this.cache.inCooldown(routeKey(url, viaProxy));
  }

  /**
   * Go to the network for this feed, sharing one request between concurrent
   * callers and writing the result to the cache.
   */
  private networkFetch(url: string, options: { useProxy?: boolean }): Observable<ParsedFeed> {
    const existing = this.inFlight.get(url);
    if (existing) {
      return existing;
    }

    const viaProxy = options.useProxy === true;
    const key = routeKey(url, viaProxy);
    const startedAt = Date.now();

    const request = this.buildRequest(url, options).pipe(
      switchMap((feed) => {
        // This route works, so anything it was cooling down from is moot.
        this.cache.clearCooldown(key);
        this.diagnostics.info('RSS', 'fetched', {
          feed: url,
          viaProxy,
          items: feed.items.length,
          ms: Date.now() - startedAt,
        });
        return from(this.cache.put(url, feed)).pipe(map(() => feed));
      }),
      catchError((error: unknown) => {
        // A misconfigured proxy is not the feed failing, so it must not start a
        // cooldown — the user fixes the setting and expects the next try to go.
        if (isConfigurationError(error)) {
          this.diagnostics.warn('RSS', 'proxy-refused', {
            feed: url,
            reason: error instanceof Error ? error.message : String(error),
          });
          return throwError(() => error);
        }
        this.cache.markFailure(key);
        this.diagnostics.error('RSS', 'fetch-failed', error, {
          feed: url,
          viaProxy,
          ms: Date.now() - startedAt,
          note: `Not retrying this route for ${Math.round(FAILURE_COOLDOWN_MS / 60000)} minutes.`,
        });
        return throwError(() => error);
      }),
      // The in-flight entry must be dropped however the request ends, or one
      // failure would be replayed to every later caller.
      tap({
        complete: () => this.inFlight.delete(url),
        error: () => this.inFlight.delete(url),
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.inFlight.set(url, request);
    return request;
  }

  private buildRequest(url: string, options: { useProxy?: boolean }): Observable<ParsedFeed> {
    const viaProxy = options.useProxy === true;

    if (viaProxy && this.corsProxy.batchCapacity('feeds') > 1) {
      return this.buildBatchedRequest(url);
    }

    return this.buildSingleRequest(url, viaProxy);
  }

  /**
   * Hold a proxy request very briefly so sibling RSS cache misses can share one
   * Worker invocation. A lone request falls back to the ordinary GET endpoint,
   * avoiding a batch envelope when it would save nothing.
   */
  private buildBatchedRequest(url: string): Observable<ParsedFeed> {
    return new Observable((subscriber) => {
      const pending: PendingBatchFeed = {
        id: `rss-${++this.batchSequence}`,
        url,
        subscriber,
      };
      this.batchQueue.push(pending);
      if (this.batchTimer === null) {
        this.batchTimer = setTimeout(() => this.flushBatchQueue(), PROXY_BATCH_WINDOW_MS);
      }
      return () => {
        const index = this.batchQueue.indexOf(pending);
        if (index >= 0) {
          this.batchQueue.splice(index, 1);
        }
      };
    });
  }

  private flushBatchQueue(): void {
    this.batchTimer = null;
    const pending = this.batchQueue.filter((item) => !item.subscriber.closed);
    this.batchQueue = [];
    const capacity = this.corsProxy.batchCapacity('feeds');

    if (capacity < 2) {
      pending.forEach((item) => this.sendSingle(item));
      return;
    }
    for (let index = 0; index < pending.length; index += capacity) {
      const group = pending.slice(index, index + capacity);
      if (group.length === 1) {
        this.sendSingle(group[0]);
      } else {
        this.sendBatch(group);
      }
    }
  }

  private sendSingle(item: PendingBatchFeed): void {
    this.buildSingleRequest(item.url, true).subscribe(item.subscriber);
  }

  private sendBatch(items: readonly PendingBatchFeed[]): void {
    let request;
    try {
      request = this.corsProxy.proxyBatchRequest(
        items.map(({ id, url }) => ({ id, url })),
        'feeds',
      );
    } catch (error: unknown) {
      const failure = error instanceof Error ? error : new Error('These feeds cannot be proxied.');
      items.forEach((item) => item.subscriber.error(failure));
      return;
    }

    this.http
      .post<unknown>(request.url, request.body, {
        headers: request.headers,
        observe: 'response',
        context: externalFetch(),
      })
      .pipe(
        // The Worker waits for all upstreams before returning the envelope. Give
        // its own per-feed timeout a little room to become an item-level result.
        timeout({
          each: BATCH_TIMEOUT_MS,
          with: () => throwError(() => new Error(TIMEOUT_MESSAGE)),
        }),
      )
      .subscribe({
        next: (response) => this.deliverBatch(items, response.body),
        error: (error: unknown) => {
          this.proxyUsage.record(false);
          const failure = new Error(describe(error, true));
          items.forEach((item) => item.subscriber.error(failure));
        },
      });
  }

  private deliverBatch(items: readonly PendingBatchFeed[], body: unknown): void {
    const results = readBatchResults(body);
    if (!results) {
      this.proxyUsage.recordBatch(false, null);
      const failure = new Error('The CORS proxy returned an invalid batch response.');
      items.forEach((item) => item.subscriber.error(failure));
      return;
    }

    const byId = new Map(results.map((result) => [result.id, result]));
    const accountTotal = results.reduce<number | null>(
      (highest, result) => (result.usage === null ? highest : Math.max(highest ?? 0, result.usage)),
      null,
    );
    this.proxyUsage.recordBatch(
      items.every((item) => byId.get(item.id)?.ok === true),
      accountTotal,
    );

    for (const item of items) {
      const result = byId.get(item.id);
      if (!result) {
        item.subscriber.error(new Error('The CORS proxy omitted a feed from its batch response.'));
        continue;
      }
      if (!result.ok) {
        item.subscriber.error(
          new Error(
            describe(
              new HttpErrorResponse({
                status: result.status,
                error: result.body,
                url: item.url,
              }),
              true,
            ),
          ),
        );
        continue;
      }
      try {
        item.subscriber.next(parseFeed(result.body));
        item.subscriber.complete();
      } catch (error: unknown) {
        item.subscriber.error(error);
      }
    }
  }

  private buildSingleRequest(url: string, viaProxy: boolean): Observable<ParsedFeed> {
    let requestUrl = url;
    let headers: HttpHeaders | undefined;
    if (viaProxy) {
      try {
        const proxied = this.corsProxy.proxyRequest(url);
        requestUrl = proxied.url;
        headers = proxied.headers;
      } catch (error: unknown) {
        return throwError(() =>
          error instanceof Error ? error : new Error('This feed cannot be proxied.'),
        );
      }
    }

    return this.http
      .get(requestUrl, {
        responseType: 'text',
        // `observe: 'response'` so the proxy's `X-Proxy-Usage` header is
        // readable. The body is still the text this parser wants; only the
        // wrapper changes.
        observe: 'response',
        context: externalFetch(),
        ...(headers ? { headers } : {}),
      })
      .pipe(
        // Without this a request that never settles hangs forever, and it does
        // not hang alone: `RssProvider.getFeeds` joins every subscribed feed
        // with `forkJoin`, which emits only once *all* of them complete. So one
        // silent socket leaves the whole reading pane on "Loading items…"
        // indefinitely — no error, no partial list, and the same feed stalls it
        // again after a refresh.
        //
        // A timeout turns that into an ordinary per-feed failure: the feed is
        // reported in `failed`, every other feed still renders, and the cooldown
        // in `shouldSkipNetwork` stops it being retried on a loop.
        timeout({
          each: FEED_TIMEOUT_MS,
          with: () => throwError(() => new Error(TIMEOUT_MESSAGE)),
        }),
        tap({
          next: (response) => viaProxy && this.proxyUsage.record(true, toResponse(response)),
          error: () => viaProxy && this.proxyUsage.record(false),
        }),
        map((response) => parseFeed(response.body ?? '')),
        catchError((err: unknown) => throwError(() => new Error(describe(err, viaProxy)))),
      );
  }
}

/**
 * How long one feed fetch may take before it is called a failure.
 *
 * Generous: a slow blog on a cheap host behind a CORS proxy is doing two hops,
 * and a feed that takes eight seconds is annoying rather than broken. What this
 * exists to catch is the request that never settles at all — the case that
 * otherwise hangs the entire pane, because `forkJoin` waits for every feed.
 */
const FEED_TIMEOUT_MS = 20_000;

/** Long enough to catch siblings created by the same `forkJoin`, imperceptible to a person. */
const PROXY_BATCH_WINDOW_MS = 10;

/** Worker-side fetches may consume the full single-feed timeout before the envelope returns. */
const BATCH_TIMEOUT_MS = FEED_TIMEOUT_MS + 5_000;

/** Shown for a feed that never answered. */
const TIMEOUT_MESSAGE =
  'This feed took too long to answer. It may be slow, or temporarily unreachable.';

interface PendingBatchFeed {
  id: string;
  url: string;
  subscriber: Subscriber<ParsedFeed>;
}

interface BatchFeedResult {
  id: string;
  status: number;
  ok: boolean;
  body: string;
  usage: number | null;
}

/** Narrow an untrusted proxy envelope before matching results back to callers. */
function readBatchResults(value: unknown): BatchFeedResult[] | null {
  if (!isRecord(value) || !Array.isArray(value['results'])) {
    return null;
  }
  const results: BatchFeedResult[] = [];
  const ids = new Set<string>();
  for (const candidate of value['results']) {
    if (
      !isRecord(candidate) ||
      typeof candidate['id'] !== 'string' ||
      candidate['id'].length === 0 ||
      ids.has(candidate['id']) ||
      typeof candidate['status'] !== 'number' ||
      !Number.isInteger(candidate['status']) ||
      typeof candidate['ok'] !== 'boolean' ||
      typeof candidate['body'] !== 'string' ||
      !isUsage(candidate['usage'])
    ) {
      return null;
    }
    ids.add(candidate['id']);
    results.push({
      id: candidate['id'],
      status: candidate['status'],
      ok: candidate['ok'],
      body: candidate['body'],
      usage: candidate['usage'],
    });
  }
  return results;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUsage(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
}

/**
 * Whether an error is the app's own configuration refusing, rather than the
 * network failing.
 *
 * These must reach the user unchanged: they are fixed by editing a setting, and
 * hiding one behind a stale cached copy would leave someone staring at
 * yesterday's articles wondering why their new proxy never took effect.
 */
/**
 * Cooldown identity: one feed has two independent routes.
 *
 * A direct fetch blocked by CORS says nothing about whether the proxy can read
 * the same feed, so the failure of one must never suppress the other.
 */
function routeKey(url: string, viaProxy: boolean): string {
  return `${viaProxy ? 'proxy' : 'direct'}:${url}`;
}

function isConfigurationError(error: unknown): boolean {
  // Matched by name rather than `instanceof` so this module needn't import the
  // cors-proxy package just for a type guard.
  return error instanceof Error && error.name === 'CorsProxyRefusal';
}

function describe(err: unknown, viaProxy: boolean): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return viaProxy
        ? "Couldn't reach this feed through the CORS proxy either. The proxy may be down, " +
            'rate-limiting you, or refusing this address — check it on Settings → ' +
            'Connections → CORS proxy.'
        : "Couldn't reach this feed from the browser. Either the address is wrong or the " +
            "site doesn't allow cross-origin (CORS) access. Mockingbird has no server of " +
            'its own, so a blocked feed can only be read through a CORS proxy — you can set ' +
            'one up on Settings → Connections → CORS proxy, then turn it on for this feed.';
    }
    if (viaProxy && (err.status === 401 || err.status === 403)) {
      return `The CORS proxy rejected the request (${err.status}). It probably needs an API key, or the key it has is wrong or out of quota.`;
    }
    if (viaProxy && err.status === 429) {
      return 'The CORS proxy is rate-limiting you. Wait a little, or switch to a proxy you hold a key for.';
    }
    return viaProxy
      ? `The CORS proxy answered ${err.status}.`
      : `The feed's server answered ${err.status}.`;
  }
  return err instanceof Error ? err.message : 'Unknown error reading the feed.';
}
