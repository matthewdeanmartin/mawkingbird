import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, firstValueFrom, forkJoin, map, Observable, of, switchMap, tap } from 'rxjs';
import { Status } from '../../platform/api/models';
import { adaptFeedItem } from './bluesky-adapter';
import { BlueskyApi } from './bluesky-api';
import { BSKY_CURATE_LIST, BskyFeedItem, BskyGeneratorView, BskySavedFeed } from './bluesky-types';
import { BlueskyPds } from './bluesky-pds';
import {
  BlueskyPreferences,
  BskyPreference,
  SAVED_FEEDS_PREF,
  savedFeedItems,
  withPinMoved,
  withPinned,
  withSaved,
  withoutSaved,
} from './bluesky-preferences';

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
  /** The feed service's DID, when it takes "show more / less like this". */
  feedbackDid?: string;
  /** The record's CID and the reader's like of it, for liking a feed. */
  cid?: string;
  likeUri?: string | null;
  likeCount?: number;
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
 * Saving, pinning and reordering write the same `savedFeedsPrefV2` entry
 * bsky.app uses, through {@link BlueskyPreferences} (re-read, change only this
 * entry, write back), so both apps show the same tabs. Until 2026-11 this was
 * read-only on purpose; the owner lifted that once the shared
 * read-modify-write service existed (spec/bsky_parity.md, sprint 3).
 */
@Injectable({ providedIn: 'root' })
export class BlueskyFeeds {
  private api = inject(BlueskyApi);
  private pds = inject(BlueskyPds);
  private prefs = inject(BlueskyPreferences);

  /** Cached for the tab's lifetime; preferences change rarely. */
  private cache = signal<BlueskyFeedEntry[] | null>(null);
  /** Popular feeds, cached for the session — discovery data moves slowly. */
  private popularCache = signal<BlueskyFeedEntry[] | null>(null);

  readonly entries = this.cache.asReadonly();
  /** Saved feed and list uris, from the last load. */
  readonly savedUris = computed(() => new Set((this.cache() ?? []).map((e) => e.uri)));

  /** Save a feed or list to the account; it appears in bsky.app too. */
  async save(uri: string, kind: 'feed' | 'list', pinned = false): Promise<void> {
    await this.editSaved((items) => withSaved(items, uri, kind, pinned));
  }

  async unsave(uri: string): Promise<void> {
    await this.editSaved((items) => withoutSaved(items, uri));
  }

  /** Pinned feeds are the tabs on bsky.app's Home and here. */
  async setPinned(uri: string, pinned: boolean): Promise<void> {
    await this.editSaved((items) => withPinned(items, uri, pinned));
  }

  async movePinned(uri: string, delta: -1 | 1): Promise<void> {
    await this.editSaved((items) => withPinMoved(items, uri, delta));
  }

  /** Like or unlike a feed generator; resolves to the like record's uri, or null. */
  async setLiked(
    entry: Pick<BlueskyFeedEntry, 'uri' | 'cid' | 'likeUri'>,
    liked: boolean,
  ): Promise<string | null> {
    if (liked) {
      if (!entry.cid) throw new Error('This feed cannot be liked yet.');
      return (await firstValueFrom(this.api.like(entry.uri, entry.cid))).uri;
    }
    if (entry.likeUri) await firstValueFrom(this.api.deleteRecord(entry.likeUri));
    return null;
  }

  /** One feed or list described by itself, for a page reached by a link. */
  describeOne(uri: string, kind: 'feed' | 'list'): Observable<BlueskyFeedEntry | null> {
    const known = [...(this.cache() ?? []), ...(this.popularCache() ?? [])];
    const cached = known.find((e) => e.uri === uri);
    if (cached?.cid || (cached && kind === 'list')) return of(cached);
    if (kind === 'list') {
      return this.api.getList(uri).pipe(
        map(({ list }): BlueskyFeedEntry => ({
          uri: list.uri,
          kind: 'list',
          displayName: list.name,
          description: list.description ?? '',
          avatar: list.avatar ?? null,
          creatorHandle: list.creator.handle,
          pinned: false,
          memberCount: list.listItemCount ?? 0,
        })),
        catchError(() => of(null)),
      );
    }
    return this.api.getFeedGenerators([uri]).pipe(
      map(({ feeds }) => (feeds[0] ? generatorEntry(feeds[0], cached?.pinned ?? false) : null)),
      catchError(() => of(cached ?? null)),
    );
  }

  private async editSaved(change: (items: BskySavedFeed[]) => BskySavedFeed[]): Promise<void> {
    await this.prefs.edit(SAVED_FEEDS_PREF, (current: BskyPreference | undefined) => ({
      ...current,
      $type: SAVED_FEEDS_PREF,
      items: change(savedFeedItems(current)),
    }));
    await firstValueFrom(this.load(true));
  }

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
          of(items),
          this.describeFeeds(items.filter((i) => i.type === 'feed')),
          this.describeLists(items.filter((i) => i.type === 'list')),
        ]),
      ),
      // In the account's own order: pinned feeds are tabs, and their order is
      // the reader's choice, shared with bsky.app.
      map(([items, feeds, lists]) => {
        const order = new Map(items.map((item, index) => [item.value, index]));
        return [...feeds, ...lists].sort(
          (a, b) => (order.get(a.uri) ?? 0) - (order.get(b.uri) ?? 0),
        );
      }),
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
        results
          .flat()
          .map((generator) => generatorEntry(generator, pinnedByUri.get(generator.uri) ?? false)),
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
    entry: Pick<BlueskyFeedEntry, 'uri' | 'kind' | 'feedbackDid'>,
    cursor: string | null,
  ): Observable<BlueskyFeedPage> {
    // Callers often pass a bare uri; the saved or popular entry knows whether
    // the feed takes "show more / less like this".
    const feedback = {
      feedbackDid:
        entry.feedbackDid ??
        [...(this.cache() ?? []), ...(this.popularCache() ?? [])].find((e) => e.uri === entry.uri)
          ?.feedbackDid,
    };
    const call =
      entry.kind === 'list'
        ? this.api.getListFeed(entry.uri, cursor)
        : this.api.getFeed(entry.uri, cursor);
    return call.pipe(
      map((timeline) => ({
        statuses: timeline.feed.map((item) => withFeedback(adaptFeedItem(item), item, feedback)),
        cursor: timeline.cursor && timeline.cursor !== cursor ? timeline.cursor : null,
      })),
    );
  }

  /**
   * Tell a feed to show more or less like a post (`sendInteractions`). It goes
   * to the feed's own service, proxied through the account's PDS, the only
   * host that can vouch for the account to a third party.
   */
  sendFeedback(
    feedback: { generatorDid: string; feedContext?: string },
    postUri: string,
    more: boolean,
  ): Observable<unknown> {
    return this.pds.resolve().pipe(
      switchMap((pds) =>
        this.api.request(
          'app.bsky.feed.sendInteractions',
          {
            interactions: [
              {
                item: postUri,
                event: more ? 'app.bsky.feed.defs#requestMore' : 'app.bsky.feed.defs#requestLess',
                ...(feedback.feedContext ? { feedContext: feedback.feedContext } : {}),
              },
            ],
          },
          { 'atproto-proxy': `${feedback.generatorDid}#bsky_fg` },
          pds || undefined,
        ),
      ),
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
      // Popularity is not pinning. These are other people's feeds that the
      // reader has not saved, so nothing here is promoted to a tab.
      map(({ feeds }) => feeds.map((generator) => generatorEntry(generator, false))),
      tap((entries) => this.popularCache.set(entries)),
      catchError(() => of([] as BlueskyFeedEntry[])),
    );
  }
}

/** A feed generator as a row, with what liking it needs. */
function generatorEntry(generator: BskyGeneratorView, pinned: boolean): BlueskyFeedEntry {
  return {
    uri: generator.uri,
    kind: 'feed',
    displayName: generator.displayName,
    description: generator.description ?? '',
    avatar: generator.avatar ?? null,
    creatorHandle: generator.creator.handle,
    ...(generator.acceptsInteractions ? { feedbackDid: generator.did } : {}),
    pinned,
    memberCount: null,
    cid: generator.cid,
    likeUri: generator.viewer?.like ?? null,
    likeCount: generator.likeCount ?? 0,
  };
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

/** Mark a post from a feed that takes feedback, so its card can offer it. */
function withFeedback(
  status: Status,
  item: BskyFeedItem,
  entry: Pick<BlueskyFeedEntry, 'feedbackDid'>,
): Status {
  if (!entry.feedbackDid) return status;
  const feedback = {
    generatorDid: entry.feedbackDid,
    ...(item.feedContext ? { feedContext: item.feedContext } : {}),
  };
  return { ...status, providerRef: { ...(status.providerRef as object), feedFeedback: feedback } };
}
