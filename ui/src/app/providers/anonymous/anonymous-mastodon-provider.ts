import { HttpClient, HttpParams } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import {
  catchError,
  map,
  mergeMap,
  Observable,
  of,
  scan,
  tap,
  throwError,
  timeout,
  toArray,
} from 'rxjs';
import { Auth } from '../../auth';
import { Account, Status } from '../../models';
import { FeedProvider } from '../provider';
import {
  AnonymousFollow,
  AnonymousFollows,
  AnonymousReadRef,
  AnonymousReadRoute,
} from './anonymous-follows';
import { RssFetch } from '../rss/rss-fetch';
import { feedToStatuses } from '../rss/rss-adapter';
import { AnonymousAccount } from './anonymous-account';
import { AnonymousTags } from './anonymous-tags';
import { externalFetch } from '../external-fetch';
import { AnonymousPreferences } from './anonymous-preferences';
import { PasteFeedProvider } from '../paste/paste-feed-provider';
import { FeatureFlags } from '../../feature-flags';

const PAGE_SIZE = 20;
const MAX_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 8_000;

interface SourceCursor {
  follow: AnonymousFollow;
  maxId?: string;
  routeKey?: string;
  exhausted: boolean;
}

interface TagCursor {
  tag: string;
  maxId?: string;
  exhausted: boolean;
}

interface ActiveSource {
  label: string;
  cursor: { exhausted: boolean };
  fetch: () => Observable<Status[]>;
}

/**
 * Why one followed account stopped contributing to this page.
 *
 * The provider has always known this and always thrown it away: the branches below
 * already distinguish "errored" from "filtered out" from "ran out", then collapse
 * all three into an empty feed that looks identical to the reader. `filtered` is the
 * one that surprises people — an aggressive calm-mode or language filter can end a
 * feed the user believes is simply empty. See `feed-doctor.ts`.
 */
export type SourceEnding = 'ok' | 'empty' | 'error' | 'filtered';

export interface SourceOutcome {
  handle: string;
  ending: SourceEnding;
  /** Posts this source contributed to the page, after filtering. */
  fetched: number;
}

export interface AnonymousFollowFeedPage {
  statuses: Status[];
  warnings: string[];
  hasMore: boolean;
  /**
   * Per-source diagnosis for this page. Additive — existing consumers ignore it —
   * and the only thing that can answer "why did my feed end".
   */
  outcomes: SourceOutcome[];
}

export interface AnonymousFollowFeedSession {
  fetchPage(): Observable<AnonymousFollowFeedPage>;
}

export interface AnonymousProviderRef {
  server: string;
  statusId: string;
  accountId: string;
}

function host(server: string): string {
  try {
    return new URL(server).host;
  } catch {
    return server;
  }
}

export function adaptAnonymousAccount(account: Account, server: string): Account {
  const accountHost = host(server);
  const acct = typeof account.acct === 'string' ? account.acct : '';
  return {
    ...account,
    acct: acct.includes('@') ? acct : `${account.username}@${accountHost}`,
  };
}

export function adaptAnonymousStatus(status: Status, server: string): Status {
  const rawId = status.id;
  const account = adaptAnonymousAccount(status.account, server);
  const namespace = `anonymous-mastodon:${host(server)}:`;
  return {
    ...status,
    id: `${namespace}${rawId}`,
    // Namespaced with the id, not left raw.
    //
    // `in_reply_to_id` points at a sibling in the same thread, and every one of
    // those siblings has just had its own `id` rewritten. Leaving this raw
    // means no post in an anonymously-read thread can be matched to its parent:
    // reply threading, and the reader's tweetstorm chain, both silently see a
    // conversation of unrelated posts. Found via a two-post thread rendering as
    // one post in reader mode.
    in_reply_to_id: status.in_reply_to_id ? `${namespace}${status.in_reply_to_id}` : null,
    provider: 'anonymous-mastodon',
    providerRef: {
      server,
      statusId: rawId,
      accountId: status.account.id,
    } satisfies AnonymousProviderRef,
    account,
    reblog: status.reblog ? adaptAnonymousStatus(status.reblog, server) : null,
  };
}

/** Pull-based public Mastodon feed for the accounts followed by Anonymous. */
@Injectable({ providedIn: 'root' })
export class AnonymousMastodonProvider implements FeedProvider {
  private http = inject(HttpClient);
  private auth = inject(Auth);
  private followStore = inject(AnonymousFollows);
  private tagStore = inject(AnonymousTags);
  private preferences = inject(AnonymousPreferences);
  private pasteFeed = inject(PasteFeedProvider);
  private featureFlags = inject(FeatureFlags);
  private anonymous = inject(AnonymousAccount);
  private rss = inject(RssFetch);

  readonly id = 'anonymous-mastodon' as const;
  readonly label = 'Anonymous Mastodon';
  readonly badge = '🐘 Mastodon';
  readonly linked = computed(
    () =>
      this.auth.isAnonymous &&
      (this.followStore.count() > 0 ||
        this.tagStore.count() > 0 ||
        (this.featureFlags.enabled('pastebin') && this.pasteFeed.linked())),
  );
  readonly errors = signal<string[]>([]);

  /**
   * Per-source diagnosis for the last Home page, for `/feed-doctor`.
   *
   * A signal rather than part of the returned page because `fetchPage()` hands back
   * a bare `Status[]` that a dozen callers already destructure — and because the
   * Doctor is a separate page that wants to read this without re-fetching anything.
   *
   * Labels carry their kind (`@handle`, `#tag`, or a provider name), which is what
   * makes the "are the sources mixing" verdict free.
   */
  readonly lastOutcomes = signal<SourceOutcome[]>([]);

  private cursors: SourceCursor[] = [];
  private tagCursors: TagCursor[] = [];
  private rssFallbacks = new Set<string>();
  private seen = new Set<string>();
  private pasteCursor = { exhausted: false };

  reset(): void {
    this.errors.set([]);
    this.lastOutcomes.set([]);
    this.rssFallbacks.clear();
    this.seen.clear();
    this.pasteCursor = { exhausted: false };
    this.pasteFeed.reset();
    this.cursors = this.followStore.follows().map((follow) => ({ follow, exhausted: false }));
    this.tagCursors = this.tagStore.tags().map((tag) => ({ tag, exhausted: false }));
  }

  fetchPage(): Observable<Status[]> {
    const active: ActiveSource[] = [
      ...this.cursors
        .filter((source) => !source.exhausted)
        .map((source) => ({
          label: `@${source.follow.handle}`,
          cursor: source,
          fetch: () => this.fetchHomeFollowSource(source),
        })),
      ...this.tagCursors
        .filter((source) => !source.exhausted)
        .map((source) => ({
          label: `#${source.tag}`,
          cursor: source,
          fetch: () => this.fetchTag(source),
        })),
      ...(this.featureFlags.enabled('pastebin') &&
      this.pasteFeed.linked() &&
      !this.pasteCursor.exhausted
        ? [
            {
              label: 'Paste public feed',
              cursor: this.pasteCursor,
              fetch: () =>
                this.pasteFeed.fetchPage().pipe(tap(() => (this.pasteCursor.exhausted = true))),
            },
          ]
        : []),
    ];
    if (!active.length) {
      return of([]);
    }
    const failures: string[] = [];
    const outcomes: SourceOutcome[] = [];
    return of(...active).pipe(
      mergeMap(
        (source) =>
          source.fetch().pipe(
            tap((statuses) =>
              outcomes.push({
                handle: source.label,
                ending: statuses.length ? 'ok' : 'empty',
                fetched: statuses.length,
              }),
            ),
            catchError(() => {
              source.cursor.exhausted = true;
              failures.push(`Could not load ${source.label}.`);
              outcomes.push({ handle: source.label, ending: 'error', fetched: 0 });
              return of<Status[]>([]);
            }),
          ),
        MAX_CONCURRENCY,
      ),
      toArray(),
      tap(() => this.lastOutcomes.set(outcomes)),
      map((pages) => {
        this.errors.set([
          ...[...this.rssFallbacks].map((handle) => `Using RSS fallback for @${handle}.`),
          ...this.pasteFeed.errors(),
          ...failures,
        ]);
        return pages
          .flat()
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
          .filter((status) => {
            const key = status.url || status.id;
            if (this.seen.has(key)) {
              return false;
            }
            this.seen.add(key);
            return true;
          });
      }),
    );
  }

  /**
   * Like {@link fetchPage}, but emits progressively: a fresh, growing snapshot
   * after *each* source resolves rather than one array once every source is in.
   *
   * The anonymous home can span ~25 slow RSS/API sources; waiting for all of
   * them (as `fetchPage`'s `toArray` does) leaves the page looking dead for
   * seconds. Streaming lets Home paint posts as they trickle in. Each snapshot
   * appends the newly-arrived source's posts in arrival order (no full re-sort
   * per emission — Home does one final newest-first sort on completion), and
   * carries forward the running dedupe so a post never appears twice.
   */
  fetchPageStreaming(): Observable<Status[]> {
    const active: ActiveSource[] = [
      ...this.cursors
        .filter((source) => !source.exhausted)
        .map((source) => ({
          label: `@${source.follow.handle}`,
          cursor: source,
          fetch: () => this.fetchHomeFollowSource(source),
        })),
      ...this.tagCursors
        .filter((source) => !source.exhausted)
        .map((source) => ({
          label: `#${source.tag}`,
          cursor: source,
          fetch: () => this.fetchTag(source),
        })),
      ...(this.featureFlags.enabled('pastebin') &&
      this.pasteFeed.linked() &&
      !this.pasteCursor.exhausted
        ? [
            {
              label: 'Paste public feed',
              cursor: this.pasteCursor,
              fetch: () =>
                this.pasteFeed.fetchPage().pipe(tap(() => (this.pasteCursor.exhausted = true))),
            },
          ]
        : []),
    ];
    if (!active.length) {
      return of([]);
    }
    const failures: string[] = [];
    return of(...active).pipe(
      mergeMap(
        (source) =>
          source.fetch().pipe(
            catchError(() => {
              source.cursor.exhausted = true;
              failures.push(`Could not load ${source.label}.`);
              return of<Status[]>([]);
            }),
          ),
        MAX_CONCURRENCY,
      ),
      // Append each source's posts to the running feed, skipping ones already
      // seen; surface any accumulated warnings alongside every snapshot.
      scan((feed: Status[], page: Status[]) => {
        const additions = page.filter((status) => {
          const key = status.url || status.id;
          if (this.seen.has(key)) {
            return false;
          }
          this.seen.add(key);
          return true;
        });
        this.errors.set([
          ...[...this.rssFallbacks].map((handle) => `Using RSS fallback for @${handle}.`),
          ...this.pasteFeed.errors(),
          ...failures,
        ]);
        return additions.length ? [...feed, ...additions] : feed;
      }, [] as Status[]),
    );
  }

  /** Fetch one public page for an explicit set of follows (used by local lists). */
  fetchFollows(follows: AnonymousFollow[]): Observable<Status[]> {
    return this.createFollowFeed(follows)
      .fetchPage()
      .pipe(map((page) => page.statuses));
  }

  /** Independent, demand-driven cursor set for a local list timeline. */
  createFollowFeed(
    follows: AnonymousFollow[],
    allowsStatus: (status: Status) => boolean = () => true,
  ): AnonymousFollowFeedSession {
    const cursors: SourceCursor[] = follows.map((follow) => ({ follow, exhausted: false }));
    const seen = new Set<string>();
    return { fetchPage: () => this.fetchFollowFeedPage(cursors, seen, allowsStatus) };
  }

  private fetchFollowFeedPage(
    cursors: SourceCursor[],
    seen: Set<string>,
    allowsStatus: (status: Status) => boolean,
  ): Observable<AnonymousFollowFeedPage> {
    const active = cursors.filter((source) => !source.exhausted);
    if (!active.length) return of({ statuses: [], warnings: [], hasMore: false, outcomes: [] });
    const warnings: string[] = [];
    // Recorded where each ending is already decided, rather than inferred later:
    // by the time the page is assembled, "returned nothing" and "was filtered to
    // nothing" and "threw" all look the same.
    const outcomes: SourceOutcome[] = [];
    return of(...active).pipe(
      mergeMap(
        (source) =>
          this.fetchSource(source).pipe(
            map((statuses) => {
              const allowed = statuses.filter(allowsStatus);
              const filtered = allowed.length !== statuses.length;
              if (filtered) source.exhausted = true;
              outcomes.push({
                handle: source.follow.handle,
                ending: filtered ? 'filtered' : allowed.length ? 'ok' : 'empty',
                fetched: allowed.length,
              });
              return allowed;
            }),
            catchError(() => {
              source.exhausted = true;
              warnings.push(`Could not load @${source.follow.handle}.`);
              outcomes.push({ handle: source.follow.handle, ending: 'error', fetched: 0 });
              return of<Status[]>([]);
            }),
          ),
        MAX_CONCURRENCY,
      ),
      toArray(),
      map((pages) => ({
        statuses: pages
          .flat()
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
          .filter((status) => {
            const key = status.url || status.id;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }),
        warnings,
        hasMore: cursors.some((source) => !source.exhausted),
        outcomes,
      })),
    );
  }

  private fetchSource(source: SourceCursor): Observable<Status[]> {
    return this.fetchPreferredApi(source).pipe(
      catchError(() => this.fetchCanonicalApi(source)),
      catchError(() => this.fetchRss(source)),
    );
  }

  /** Home-only age gate for followed accounts; hashtag timelines remain untouched. */
  private fetchHomeFollowSource(source: SourceCursor): Observable<Status[]> {
    return this.fetchSource(source).pipe(
      map((statuses) => {
        const allowed = statuses.filter((status) =>
          this.preferences.allowsFollowedPost(status.created_at),
        );
        // Account timelines are newest-first. Once this page crosses the age
        // boundary, every subsequent page can only be older.
        if (allowed.length !== statuses.length) source.exhausted = true;
        return allowed;
      }),
    );
  }

  /**
   * Read through the server Anonymous currently selected. Account ids are local to
   * an instance, so a reference learned elsewhere (including a compiled Starter
   * Collection id) must first be resolved into the selected server's namespace.
   */
  private fetchPreferredApi(source: SourceCursor): Observable<Status[]> {
    const selectedServer = this.anonymous.server();
    const storedRef = source.follow.readRef;
    if (host(storedRef.server) === host(selectedServer) && storedRef.accountId) {
      return this.fetchApi(source, storedRef, 'read-api');
    }
    if (this.followStore.routeDeferred(source.follow, 'read-api')) {
      return throwError(() => new Error('Selected-server public API is temporarily deferred.'));
    }
    return this.lookupAccountOn(selectedServer, source.follow.handle).pipe(
      mergeMap((account) =>
        this.fetchApi(source, { server: selectedServer, accountId: account.id }, 'read-api'),
      ),
      catchError((error: unknown) => {
        this.followStore.markRouteFailure(source.follow.key, 'read-api');
        return throwError(() => error);
      }),
    );
  }

  private fetchCanonicalApi(source: SourceCursor): Observable<Status[]> {
    if (this.followStore.routeDeferred(source.follow, 'canonical-api')) {
      return throwError(() => new Error('Canonical public API is temporarily deferred.'));
    }
    return this.lookupAccount(source.follow).pipe(
      mergeMap((account) =>
        this.fetchApi(
          source,
          { server: source.follow.server, accountId: account.id },
          'canonical-api',
        ),
      ),
      catchError((error: unknown) => {
        this.followStore.markRouteFailure(source.follow.key, 'canonical-api');
        return throwError(() => error);
      }),
    );
  }

  private fetchApi(
    source: SourceCursor,
    ref: AnonymousReadRef,
    route: Exclude<AnonymousReadRoute, 'rss'>,
  ): Observable<Status[]> {
    if (this.followStore.routeDeferred(source.follow, route)) {
      return throwError(() => new Error('Public API route is temporarily deferred.'));
    }
    const routeKey = `${ref.server}:${ref.accountId}`;
    let params = new HttpParams().set('limit', String(PAGE_SIZE)).set('exclude_replies', 'true');
    if (source.maxId && source.routeKey === routeKey) {
      params = params.set('max_id', source.maxId);
    }
    const url = `${ref.server}/api/v1/accounts/${encodeURIComponent(ref.accountId)}/statuses`;
    return this.http.get<Status[]>(url, { params, context: externalFetch() }).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map((statuses) => {
        source.routeKey = routeKey;
        source.maxId = statuses.at(-1)?.id ?? source.maxId;
        if (statuses.length < PAGE_SIZE) source.exhausted = true;
        this.followStore.markApiSuccess(source.follow.key, ref);
        source.follow = { ...source.follow, readRef: ref };
        return statuses.map((status) => adaptAnonymousStatus(status, ref.server));
      }),
      catchError((error: unknown) => {
        this.followStore.markRouteFailure(source.follow.key, route);
        return throwError(() => error);
      }),
    );
  }

  private fetchRss(source: SourceCursor): Observable<Status[]> {
    if (this.followStore.routeDeferred(source.follow, 'rss')) {
      return throwError(() => new Error('RSS route is temporarily deferred.'));
    }
    const feedUrl = `${source.follow.profileUrl.replace(/\/$/, '')}.rss`;
    // Not a subscription: this is a followed profile's `.rss` fallback, already
    // rate-managed by the follow store's per-route deferral.
    return this.rss.fetchFeed(feedUrl, { noCache: true }).pipe(
      map((feed) => {
        source.exhausted = true;
        this.rssFallbacks.add(source.follow.handle);
        const fetchedAt = new Date().toISOString();
        return feedToStatuses(feedUrl, feed, fetchedAt).map((status) => ({
          ...status,
          id: `anonymous-mastodon:rss:${status.id}`,
          provider: 'anonymous-mastodon' as const,
          providerRef: {
            server: source.follow.server,
            statusId: status.id,
            accountId: source.follow.account.id,
          },
          account: adaptAnonymousAccount(source.follow.account, source.follow.server),
        }));
      }),
      catchError((error: unknown) => {
        this.followStore.markRouteFailure(source.follow.key, 'rss');
        return throwError(() => error);
      }),
    );
  }

  private fetchTag(source: TagCursor): Observable<Status[]> {
    let params = new HttpParams().set('limit', String(PAGE_SIZE));
    if (source.maxId) {
      params = params.set('max_id', source.maxId);
    }
    const server = this.anonymous.server();
    return this.http
      .get<Status[]>(`${server}/api/v1/timelines/tag/${encodeURIComponent(source.tag)}`, {
        params,
        context: externalFetch(),
      })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((statuses) => {
          source.maxId = statuses.at(-1)?.id ?? source.maxId;
          if (statuses.length < PAGE_SIZE) {
            source.exhausted = true;
          }
          return statuses.map((status) => adaptAnonymousStatus(status, server));
        }),
      );
  }

  private lookupAccount(follow: AnonymousFollow): Observable<Account> {
    const params = new HttpParams().set('acct', follow.account.username);
    return this.http
      .get<Account>(`${follow.server}/api/v1/accounts/lookup`, {
        params,
        context: externalFetch(),
      })
      .pipe(timeout(REQUEST_TIMEOUT_MS));
  }

  private lookupAccountOn(server: string, handle: string): Observable<Account> {
    const normalized = handle.replace(/^@/, '').toLowerCase();
    const params = new HttpParams().set('q', handle).set('type', 'accounts').set('limit', '5');
    return this.http
      .get<{ accounts: Account[] }>(`${server}/api/v2/search`, {
        params,
        context: externalFetch(),
      })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((results) => {
          const account =
            results.accounts.find((candidate) => candidate.acct.toLowerCase() === normalized) ??
            results.accounts[0];
          if (!account) throw new Error(`Could not resolve @${handle} through ${server}.`);
          return account;
        }),
      );
  }
}
