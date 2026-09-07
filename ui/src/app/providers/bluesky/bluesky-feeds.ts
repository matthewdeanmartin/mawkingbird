import { inject, Injectable, signal } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, switchMap, tap } from 'rxjs';
import { Status } from '../../models';
import { adaptFeedItem } from './bluesky-adapter';
import { BlueskyApi } from './bluesky-api';
import { BSKY_CURATE_LIST, BskySavedFeed } from './bluesky-types';

/** A saved feed or list, hydrated enough to render a row. */
export interface BlueskyFeedEntry {
  /** at-uri; also the id used in routes. */
  uri: string;
  kind: 'feed' | 'list';
  displayName: string;
  description: string;
  avatar: string | null;
  /** Handle of whoever runs it — the honest attribution for a third-party feed. */
  creatorHandle: string;
  pinned: boolean;
  /** Members, for lists. Feeds have none by construction. */
  memberCount: number | null;
}

export interface BlueskyFeedPage {
  statuses: Status[];
  cursor: string | null;
}

/** How many popular feeds the Lists page offers. Enough to browse, not a firehose. */
const POPULAR_LIMIT = 20;

/** Max uris `getFeedGenerators` will describe in one call. */
const GENERATOR_BATCH = 25;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * The reader's saved Bluesky feeds and lists.
 *
 * Discovery is a *preferences* read, not a feed endpoint: `getPreferences`
 * carries a `savedFeedsPrefV2` entry whose items are at-uris. Those are then
 * described in one batched `getFeedGenerators` call (lists are one call each,
 * and there are usually few).
 *
 * Read-only on purpose. Pinning and saving are `putPreferences` writes that
 * would rewrite the list the official app depends on, and a bug there is
 * expensive to the reader — so this reads `pinned` and never sets it.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyFeeds {
  private api = inject(BlueskyApi);

  /** Cached for the tab's lifetime; preferences change rarely. */
  private cache = signal<BlueskyFeedEntry[] | null>(null);
  /** Popular feeds, cached for the session — discovery data moves slowly. */
  private popularCache = signal<BlueskyFeedEntry[] | null>(null);

  readonly entries = this.cache.asReadonly();

  /** Everything saved, pinned first within each kind. */
  load(force = false): Observable<BlueskyFeedEntry[]> {
    const cached = this.cache();
    if (cached && !force) {
      return of(cached);
    }
    return this.api.getPreferences().pipe(
      map((prefs) => savedFeeds(prefs.preferences)),
      switchMap((items) =>
        forkJoin([
          this.describeFeeds(items.filter((i) => i.type === 'feed')),
          this.describeLists(items.filter((i) => i.type === 'list')),
        ]),
      ),
      map(([feeds, lists]) => [...feeds, ...lists]),
      tap((entries) => this.cache.set(entries)),
    );
  }

  /** One batched describe call per 25 saved feeds. */
  private describeFeeds(saved: BskySavedFeed[]): Observable<BlueskyFeedEntry[]> {
    if (!saved.length) {
      return of([]);
    }
    const pinnedByUri = new Map(saved.map((s) => [s.value, s.pinned]));
    const batches = chunk(
      saved.map((s) => s.value),
      GENERATOR_BATCH,
    ).map((uris) =>
      this.api.getFeedGenerators(uris).pipe(
        map(({ feeds }) => feeds),
        // A describe failure loses the names, not the feature; the feeds are
        // simply absent from the list rather than breaking the whole page.
        catchError(() => of([])),
      ),
    );
    return forkJoin(batches).pipe(
      map((results) =>
        results.flat().map(
          (generator): BlueskyFeedEntry => ({
            uri: generator.uri,
            kind: 'feed',
            displayName: generator.displayName,
            description: generator.description ?? '',
            avatar: generator.avatar ?? null,
            creatorHandle: generator.creator.handle,
            pinned: pinnedByUri.get(generator.uri) ?? false,
            memberCount: null,
          }),
        ),
      ),
    );
  }

  /**
   * Lists are described one at a time — `getList` takes a single uri — and
   * filtered to curatelists. A modlist is a blocklist and a referencelist backs
   * a starter pack; neither is something to read.
   */
  private describeLists(saved: BskySavedFeed[]): Observable<BlueskyFeedEntry[]> {
    if (!saved.length) {
      return of([]);
    }
    const calls = saved.map((item) =>
      this.api.getList(item.value).pipe(
        map((response): BlueskyFeedEntry | null => {
          const list = response.list;
          if (list.purpose !== BSKY_CURATE_LIST) {
            return null;
          }
          return {
            uri: list.uri,
            kind: 'list',
            displayName: list.name,
            description: list.description ?? '',
            avatar: list.avatar ?? null,
            creatorHandle: list.creator.handle,
            pinned: item.pinned,
            memberCount: list.listItemCount ?? 0,
          };
        }),
        catchError(() => of<BlueskyFeedEntry | null>(null)),
      ),
    );
    return forkJoin(calls).pipe(
      map((entries) => entries.filter((e): e is BlueskyFeedEntry => e !== null)),
    );
  }

  /** One page of an entry's posts. Both kinds return `feedViewPost[]`. */
  page(
    entry: Pick<BlueskyFeedEntry, 'uri' | 'kind'>,
    cursor: string | null,
  ): Observable<BlueskyFeedPage> {
    const call =
      entry.kind === 'list'
        ? this.api.getListFeed(entry.uri, cursor)
        : this.api.getFeed(entry.uri, cursor);
    return call.pipe(
      map((timeline) => ({
        statuses: timeline.feed.map(adaptFeedItem),
        cursor: timeline.cursor && timeline.cursor !== cursor ? timeline.cursor : null,
      })),
    );
  }

  /** Drop the cache, e.g. after linking a different account. */
  clear(): void {
    this.cache.set(null);
    this.popularCache.set(null);
  }

  /**
   * Feeds that are popular across Bluesky — discovery, not your saved list.
   *
   * This is the one widget in the Bluesky-rails sprint with **no Mastodon
   * counterpart at all**: Mastodon has no user-authored algorithmic feeds to be
   * popular. It lives on the Lists page rather than in the rail because that
   * page is already the hub for every custom feed, and the rail is the scarcest
   * space in the app.
   *
   * Available to **everyone**, not just Bluesky accounts:
   * `getPopularFeedGenerators` is anonymous on the public AppView, so gating it
   * on having a linked account would withhold browsable content for no reason.
   * A Mastodon-primary reader who has never touched Bluesky can still find a
   * feed worth reading here.
   *
   * `unspecced` by name and therefore unstable — a refusal yields an empty list
   * and the section hides, exactly as the trends card does.
   */
  loadPopular(): Observable<BlueskyFeedEntry[]> {
    const cached = this.popularCache();
    if (cached) {
      return of(cached);
    }
    return this.api.getPopularFeedGenerators(POPULAR_LIMIT).pipe(
      map(({ feeds }) =>
        feeds.map(
          (generator): BlueskyFeedEntry => ({
            uri: generator.uri,
            kind: 'feed',
            displayName: generator.displayName,
            description: generator.description ?? '',
            avatar: generator.avatar ?? null,
            creatorHandle: generator.creator.handle,
            // Popularity is not pinning. These are other people's feeds that the
            // reader has not saved, so nothing here is promoted to a tab.
            pinned: false,
            memberCount: null,
          }),
        ),
      ),
      tap((entries) => this.popularCache.set(entries)),
      catchError(() => of([] as BlueskyFeedEntry[])),
    );
  }
}

/**
 * Pull the saved-feed items out of the preferences union.
 *
 * The union has 16+ member types and grows; anything unrecognized is skipped
 * rather than treated as an error. `timeline` items are dropped too — that is
 * the reader's own follows feed, which the home timeline already provides.
 */
export function savedFeeds(preferences: { $type?: string }[]): BskySavedFeed[] {
  for (const pref of preferences) {
    if (!pref.$type?.includes('savedFeedsPrefV2')) {
      continue;
    }
    const items = (pref as { items?: BskySavedFeed[] }).items ?? [];
    return items.filter((item) => item.type === 'feed' || item.type === 'list');
  }
  return [];
}
