import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Status } from '../../platform/api/models';
import { translatedMessage } from '../../i18n/translated';
import { MbButton } from '../../design-system/button/button';
import { StatusCard } from '../../posts/status-card/status-card';
import { PageDiagnostics } from '../../platform/diagnostics/page-diagnostics';
import { BlueskyFeedEntry, BlueskyFeeds } from '../../connections/bluesky/bluesky-feeds';

// i18n blueskyFeed.back: ← Feeds
// i18n blueskyFeed.kind.list: List
// i18n blueskyFeed.kind.feed: Feed
// i18n blueskyFeed.by: by @{{handle}}
// i18n blueskyFeed.members.one: {{count}} member
// i18n blueskyFeed.members.other: {{count}} members
// i18n blueskyFeed.pinned: · 📌 pinned
// i18n blueskyFeed.algorithm: This feed is an algorithm run by @{{handle}}, not by Bluesky.
// i18n blueskyFeed.invalidLink: That feed link is not valid.
// i18n blueskyFeed.loadFailed: This feed could not be loaded. Its server may not be responding.
// i18n blueskyFeed.retry: Try again
// i18n blueskyFeed.openOnBluesky: Open it on bsky.app
// i18n blueskyFeed.loading: Loading…
// i18n blueskyFeed.empty: This feed has no posts right now.
// i18n blueskyFeed.loadMore: Load more
// i18n blueskyFeed.forYou: For you

/** Bluesky's own Discover generator, also used as a default feed in its app. */
const DISCOVER_FEED = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';

/**
 * One saved Bluesky feed or list, as a timeline.
 *
 * A small page of its own rather than a branch inside `ListTimeline`: that page
 * is built around Mastodon list *management* — bulk add, list-to-collection
 * conversion, member editing — none of which exists here. A Bluesky feed is
 * read-only by construction (it is somebody else's algorithm) and a saved list
 * is edited in the Bluesky app.
 *
 * Route param is `<kind>:<at-uri>`, e.g. `feed:at://did:plc:…/…/whats-hot`.
 */
@Component({
  selector: 'app-bluesky-feed',
  imports: [MbButton, RouterLink, StatusCard, TranslocoPipe],
  templateUrl: './bluesky-feed.html',
  styleUrl: './bluesky-feed.css',
})
export class BlueskyFeedPage implements OnInit {
  private feeds = inject(BlueskyFeeds);
  private route = inject(ActivatedRoute);
  protected readonly forYou = this.route.snapshot.data['blueskyDiscover'] === true;
  private diagnostics = inject(PageDiagnostics);
  private destroyRef = inject(DestroyRef);

  protected statuses = signal<Status[]>([]);
  protected loading = signal(true);
  protected loadingMore = signal(false);
  /** Held as a key: a fast failure can land before the dictionary does. */
  protected error = translatedMessage();
  protected entry = signal<BlueskyFeedEntry | null>(null);
  private cursor = signal<string | null>(null);

  /** at-uri and kind parsed from the route. */
  private ref = signal<{ uri: string; kind: 'feed' | 'list' } | null>(null);

  protected exhausted = computed(() => !this.loading() && !this.cursor());

  /** Title before the describe call lands — the uri's rkey is a decent stand-in. */
  protected title = computed(() => {
    const entry = this.entry();
    if (entry) {
      return entry.displayName;
    }
    const uri = this.ref()?.uri;
    return uri ? (uri.split('/').pop() ?? 'Bluesky feed') : 'Bluesky feed';
  });

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const raw = params.get('ref');
      const ref = this.forYou
        ? { kind: 'feed' as const, uri: DISCOVER_FEED }
        : raw
          ? parseFeedRef(raw)
          : null;
      if (!ref) {
        this.loading.set(false);
        this.error.set('blueskyFeed.invalidLink');
        return;
      }
      this.ref.set(ref);
      this.statuses.set([]);
      this.cursor.set(null);
      this.loading.set(true);
      this.error.set(null);
      this.describe(ref.uri);
      this.fetch();
    });
  }

  /**
   * Name and creator, out of the saved-feeds cache when it is warm.
   *
   * Deliberately no network call of its own: a reader arriving from the Feeds
   * tab already has this, and one arriving from a deep link gets the rkey as a
   * title rather than paying a request for cosmetics.
   */
  private describe(uri: string): void {
    if (this.forYou) {
      this.entry.set(null);
      return;
    }
    const cached = this.feeds.entries()?.find((e) => e.uri === uri);
    this.entry.set(cached ?? null);
  }

  /** Try the first page again after a failure. */
  protected retry(): void {
    this.statuses.set([]);
    this.cursor.set(null);
    this.loading.set(true);
    this.error.set(null);
    this.fetch();
  }

  /**
   * The feed or list on bsky.app, for when it will not load here: a feed
   * generator that is down for this app may still be reachable there.
   */
  protected readonly bskyUrl = computed(() => {
    const match = /^at:\/\/([^/]+)\/app\.bsky\.(feed\.generator|graph\.list)\/([^/]+)$/.exec(
      this.ref()?.uri ?? '',
    );
    if (!match) return null;
    const kind = match[2] === 'graph.list' ? 'lists' : 'feed';
    return `https://bsky.app/profile/${match[1]}/${kind}/${match[3]}`;
  });

  loadMore(): void {
    if (!this.cursor() || this.loadingMore() || this.loading()) {
      return;
    }
    this.loadingMore.set(true);
    this.fetch();
  }

  private fetch(): void {
    const ref = this.ref();
    if (!ref) {
      return;
    }
    this.feeds.page(ref, this.cursor()).subscribe({
      next: (page) => {
        this.cursor.set(page.cursor);
        const seen = new Set(this.statuses().map((s) => s.id));
        this.statuses.update((list) => [...list, ...page.statuses.filter((s) => !seen.has(s.id))]);
        this.loading.set(false);
        this.loadingMore.set(false);
        this.diagnostics.info('BlueskyFeed', 'load:page', {
          kind: ref.kind,
          posts: page.statuses.length,
          more: !!page.cursor,
        });
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.loadingMore.set(false);
        this.cursor.set(null);
        this.diagnostics.error('BlueskyFeed', 'load:error', error, { uri: ref.uri });
        // A third-party generator that is down is the common case here, and it
        // is different from "this feed is empty" — say which.
        // The technical reason is in the diagnostics log above, not the page.
        this.error.set('blueskyFeed.loadFailed');
      },
    });
  }
}

/**
 * `feed:at://…` / `list:at://…` → its parts, or null when malformed.
 *
 * The at-uri is percent-encoded into the route (it contains slashes, which
 * would otherwise become path segments). Angular's `paramMap` decodes params
 * for us, but decoding again is harmless for an already-decoded at-uri and
 * makes the function safe to call on a raw URL fragment too.
 */
export function parseFeedRef(raw: string): { uri: string; kind: 'feed' | 'list' } | null {
  const separator = raw.indexOf(':');
  if (separator === -1) {
    return null;
  }
  const kind = raw.slice(0, separator);
  if (kind !== 'feed' && kind !== 'list') {
    return null;
  }
  let uri = raw.slice(separator + 1);
  if (!uri.startsWith('at://')) {
    try {
      uri = decodeURIComponent(uri);
    } catch {
      return null;
    }
  }
  return uri.startsWith('at://') ? { uri, kind } : null;
}
