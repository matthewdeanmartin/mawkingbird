import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { Status } from '../../models';
import { RssSubscriptions, RssFeedSub } from '../../providers/rss/rss-subscriptions';
import { PER_FEED_ITEM_CAP, RssProvider } from '../../providers/rss/rss-provider';
import { PageDiagnostics } from '../../page-diagnostics';
import { StatusCard } from '../../status-card/status-card';
import { AddFeedDialog } from './add-feed-dialog/add-feed-dialog';
import { RssStarterKitsPanel } from './starter-kits/rss-starter-kits-panel';
import { RssStarterKitInstall } from '../../providers/rss/rss-starter-kit-install';
import { RssReadState } from '../../providers/rss/rss-read-state';
import { ClientPrefs, RssDensity } from '../../client-prefs';
import { HeadlineRow } from './headline-row/headline-row';
import { SeenWhenScrolled } from './seen-when-scrolled';
import { FriendFeedsDialog } from '../../friend-feeds-dialog/friend-feeds-dialog';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

// i18n pages.rss.subscriptions: Subscriptions
// i18n pages.rss.title: 📡 RSS
// i18n pages.rss.pasteLink: Paste a link
// i18n pages.rss.done: Done
// i18n pages.rss.starterKits: Starter kits
// i18n pages.rss.friendFeeds: Friends’ blogs
// i18n pages.rss.allItems: All items
// i18n pages.rss.unsorted: Unsorted
// i18n pages.rss.feedOff: · off
// i18n pages.rss.itemCount.one: · {{count}} item
// i18n pages.rss.itemCount.other: · {{count}} items
// i18n pages.rss.noFeedsYet: No feeds yet — try
// i18n pages.rss.starterKit: a starter kit
// i18n pages.rss.noFeedsAdd: , add one above, or
// i18n pages.rss.importOpml: import an OPML file
// i18n pages.rss.period: .
// i18n pages.rss.manageHint: To remove feeds, import OPML, or route one through a proxy, see
// i18n pages.rss.manageFeeds: Manage RSS feeds
// i18n pages.rss.openAsProfile: Open as profile
// i18n pages.rss.filter: Filter
// i18n pages.rss.all: All
// i18n pages.rss.readLater: Read later
// i18n pages.rss.density: Density
// i18n pages.rss.full: Full
// i18n pages.rss.headlines: Headlines
// i18n pages.rss.markReadCount: Mark {{count}} read
// i18n pages.rss.couldntLoadFeed: Couldn't load {{feed}}.
// i18n pages.rss.couldntLoadFeeds: Couldn't load {{count}} feeds.
// i18n pages.rss.checkInSettings: Check them in settings
// i18n pages.rss.corsWarning:  — a feed that fails here usually needs a CORS proxy.
// i18n pages.rss.loadingItems: Loading items…
// i18n pages.rss.saved: ★ Saved
// i18n pages.rss.markUnread: Mark unread
// i18n pages.rss.markRead: Mark read
// i18n pages.rss.readInReader: Long text reader
// i18n pages.rss.nothingSaved: Nothing saved for later yet.
// i18n pages.rss.nothingToRead: Nothing to read here.
// i18n pages.rss.subscribeToRead: Subscribe to a feed to start reading.

/** A URL's hostname, or null when it isn't a parseable absolute URL. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * What the right pane is showing.
 *
 * `all` is the default rather than an empty "choose a feed" state: someone who
 * opened the reader wants to read, and a folder rail with nothing beside it
 * makes the page look like it failed to load. It is also what Sprint 1's flat
 * list becomes, so nothing that used to be on `/rss` has gone away.
 */
type Selection =
  | { kind: 'all' }
  | { kind: 'folder'; name: string }
  | { kind: 'feed'; url: string }
  | { kind: 'unfiled' };

/**
 * The query key for the unfiled group, e.g. `/rss?unfiled=1`.
 *
 * Its own key rather than a reserved `?folder=` value: folder names are typed by
 * users and imported from arbitrary OPML files, so any sentinel string is a name
 * somebody's folder could genuinely have, and the collision would silently show
 * them the wrong list.
 */
const UNFILED_PARAM = 'unfiled';

/** One group of feeds in the left rail. `name` is null for the unfiled group. */
interface RailGroup {
  name: string | null;
  feeds: RssFeedSub[];
}

/**
 * `/rss` — the RSS *reading* surface, separate from `/settings/rss` (feed
 * management: add/remove, OPML, proxy, cache).
 *
 * Sprint 2 turned this from a flat list into the Google-Reader split pane: a
 * left rail of subscriptions grouped by OPML folder, and a right pane that
 * updates in place. Selecting anything rewrites the query string rather than
 * navigating, so the pane is linkable and survives a reload while the page
 * itself never unmounts.
 *
 * This is one of *two* RSS experiences and does not replace the other: an RSS
 * item reached from Home still opens the ordinary profile (`/accounts/rss:<url>`)
 * and thread pages, which this sprint does not touch. See
 * sprint/rss-2-split-pane-shell.md.
 */
@Component({
  selector: 'app-rss-page',
  imports: [
    RouterLink,
    AddFeedDialog,
    FriendFeedsDialog,
    StatusCard,
    RssStarterKitsPanel,
    HeadlineRow,
    SeenWhenScrolled,
    TranslocoPipe,
  ],
  templateUrl: './rss-page.html',
  styleUrl: './rss-page.css',
})
export class RssPage {
  private diagnostics = inject(PageDiagnostics);
  private transloco = inject(TranslocoService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private rss = inject(RssProvider);
  private kitInstall = inject(RssStarterKitInstall);
  protected subs = inject(RssSubscriptions);
  protected readState = inject(RssReadState);
  protected prefs = inject(ClientPrefs);
  protected readonly perFeedCap = PER_FEED_ITEM_CAP;

  protected showAddDialog = signal(false);

  /** Which pane content the URL is asking for. */
  private readonly selection = toSignal(
    this.route.queryParamMap.pipe(
      map((params) =>
        readSelection(params.get('feed'), params.get('folder'), params.get(UNFILED_PARAM)),
      ),
    ),
    { initialValue: readSelection(null, null, null) as Selection },
  );

  /**
   * The rail: unfiled feeds first, then one group per folder.
   *
   * Unfiled leads because a list with no folders at all — the common case for
   * anyone who has never imported OPML — should read as a plain list of feeds,
   * not as a group header with everything hidden under it.
   */
  protected readonly groups = computed<RailGroup[]>(() => {
    const feeds = this.subs.feeds();
    const unfiled = feeds.filter((f) => !f.folder);
    return [
      ...(unfiled.length ? [{ name: null, feeds: unfiled }] : []),
      ...this.subs
        .folders()
        .map((name) => ({ name, feeds: feeds.filter((f) => f.folder === name) })),
    ];
  });

  /** Whether the rail has any folder at all — drives the "Unsorted" header. */
  protected readonly hasFolders = computed(() => this.subs.folders().length > 0);

  protected readonly loading = signal(false);
  protected readonly statuses = signal<Status[]>([]);
  /** Feeds in the current selection that would not load, by URL. */
  protected readonly failed = signal<string[]>([]);

  /** The heading above the right pane. */
  protected readonly paneTitle = computed(() => {
    const sel = this.selection();
    switch (sel.kind) {
      case 'all':
        return this.transloco.translate('pages.rss.allItems');
      case 'unfiled':
        return this.transloco.translate('pages.rss.unsorted');
      case 'folder':
        return sel.name;
      case 'feed':
        return this.subs.feeds().find((f) => f.url === sel.url)?.title || sel.url;
    }
  });

  /**
   * The items actually rendered, after the All/Starred filter.
   *
   * Client-side over what the pane already loaded — starring does not change
   * which feeds are fetched, so there is nothing to re-request.
   */
  protected readonly visibleStatuses = computed(() =>
    this.filter() === 'starred'
      ? this.statuses().filter((s) => this.readState.isStarred(s.id))
      : this.statuses(),
  );

  /** How many loaded items in this pane are unread — for the mark-all affordance. */
  protected readonly unreadCount = computed(
    () => this.statuses().filter((s) => !this.readState.isRead(s.id)).length,
  );

  /** The feed URL when a single feed is selected — the pane's "open in profile" link. */
  protected readonly selectedFeedUrl = computed(() => {
    const sel = this.selection();
    return sel.kind === 'feed' ? sel.url : null;
  });

  /** All vs. Starred. Per-visit, not persisted: a filter is a momentary intent. */
  protected readonly filter = signal<'all' | 'starred'>('all');

  /**
   * Whether the pane is showing starter kits instead of the reading list.
   *
   * Starts open for someone with no subscriptions — there is nothing to read, so
   * the kits *are* the content — and is a plain toggle after that, so the offer
   * stays reachable once feeds exist without ever displacing the list it would
   * otherwise sit on top of. Set once at construction rather than computed from
   * the feed count, so installing a kit does not yank the panel away mid-click.
   */
  protected readonly showKits = signal(false);

  /** The friends'-blogs dialog. Mounted only while open: it is a lot of
   * machinery for a button most sessions never press. */
  protected readonly showFriendFeeds = signal(false);

  /** Which item is expanded in headline mode, by `Status.id`. */
  protected readonly expandedId = signal<string | null>(null);

  private loadSeq = 0;

  constructor() {
    this.showKits.set(this.subs.feeds().length === 0);

    // The pane follows the URL *and* the subscription list, so one effect covers
    // first paint, rail clicks, back/forward, a reload on a deep link, and a
    // starter kit finishing — all of which change what belongs in the pane.
    effect(() => {
      const sel = this.selection();
      const urls = this.feedUrlsFor(sel);
      // A kit subscribes feeds one at a time, and each write ticks `feeds()`.
      // Reloading on every one would refetch the whole pane N times over during
      // a single install; the install's own completion is the interesting edge.
      if (this.kitInstall.progress() !== null) {
        return;
      }
      this.load(urls);
    });
  }

  /** Which subscriptions a selection covers. Disabled feeds are excluded. */
  private feedUrlsFor(sel: Selection): string[] {
    const enabled = this.subs.feeds().filter((f) => f.enabled);
    switch (sel.kind) {
      case 'all':
        return enabled.map((f) => f.url);
      case 'unfiled':
        return enabled.filter((f) => !f.folder).map((f) => f.url);
      case 'folder':
        return enabled.filter((f) => f.folder === sel.name).map((f) => f.url);
      case 'feed':
        // By URL, not by `enabled`: clicking a switched-off feed in the rail is
        // an explicit request to read that one thing, and refusing to show it
        // while its own row sits highlighted would just look broken.
        return [sel.url];
    }
  }

  private load(feedUrls: string[]): void {
    const seq = ++this.loadSeq;
    if (!feedUrls.length) {
      this.statuses.set([]);
      this.failed.set([]);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    let received = false;
    this.rss.getFeeds(feedUrls).subscribe({
      next: ({ statuses, failed }) => {
        if (seq !== this.loadSeq) {
          return;
        }
        received = true;
        this.statuses.set(statuses);
        this.failed.set(failed);
        this.loading.set(false);
      },
      error: (err) => {
        if (seq !== this.loadSeq) {
          return;
        }
        this.diagnostics.error('RssPage', 'pane:load-failed', err, { feeds: feedUrls.length });
        this.statuses.set([]);
        this.failed.set(feedUrls);
        this.loading.set(false);
      },
      complete: () => {
        // An Observable may legally complete without calling next. Keep this
        // boundary defensive even though RssProvider also converts empty feed
        // completions into failures: loading indicators must have a terminal
        // path for all three Observable outcomes.
        if (seq !== this.loadSeq || received) {
          return;
        }
        this.diagnostics.warn('RssPage', 'pane:load-empty', { feeds: feedUrls.length });
        this.statuses.set([]);
        this.failed.set(feedUrls);
        this.loading.set(false);
      },
    });
  }

  /**
   * Point the pane at something.
   *
   * A query-param navigation, not a route change: the page component stays
   * mounted (so the rail does not flicker or lose scroll) while the URL still
   * describes what is on screen, which is what makes a pane linkable.
   */
  protected select(sel: Selection): void {
    // A rail click is an explicit request to read. The starter-kit panel is a
    // temporary overlay for discovery, so leaving it latched open here would
    // let the URL and pane heading change while still covering the articles.
    this.showKits.set(false);
    this.diagnostics.info('RssPage', 'user:select', { kind: sel.kind });
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: selectionParams(sel),
      replaceUrl: false,
    });
  }

  protected selectAll(): void {
    this.select({ kind: 'all' });
  }

  protected selectFolder(name: string | null): void {
    this.select(name === null ? { kind: 'unfiled' } : { kind: 'folder', name });
  }

  protected selectFeed(url: string): void {
    this.select({ kind: 'feed', url });
  }

  /** Whether a rail row is the current selection, for highlighting. */
  protected isActive(sel: Selection): boolean {
    const current = this.selection();
    if (current.kind !== sel.kind) {
      return false;
    }
    if (current.kind === 'feed' && sel.kind === 'feed') {
      return current.url === sel.url;
    }
    if (current.kind === 'folder' && sel.kind === 'folder') {
      return current.name === sel.name;
    }
    return true;
  }

  protected isFolderActive(name: string | null): boolean {
    return this.isActive(name === null ? { kind: 'unfiled' } : { kind: 'folder', name });
  }

  protected isFeedActive(url: string): boolean {
    return this.isActive({ kind: 'feed', url });
  }

  protected isAllActive(): boolean {
    return this.isActive({ kind: 'all' });
  }

  /**
   * Expand or collapse an item in headline mode, marking it read on open.
   *
   * Opening always marks read, regardless of the scroll-tracking preference —
   * the preference governs the *implicit* path (things you merely scrolled
   * past), and an item you deliberately opened is read by any definition.
   */
  protected toggleExpanded(status: Status): void {
    const next = this.expandedId() === status.id ? null : status.id;
    this.expandedId.set(next);
    if (next !== null) {
      this.readState.markRead(status.id);
      this.diagnostics.info('RssPage', 'user:open-item', { density: this.prefs.rssDensity() });
    }
  }

  /** Flip one item's read state by hand — the undo for everything automatic. */
  protected toggleRead(status: Status): void {
    if (this.readState.isRead(status.id)) {
      this.readState.markUnread(status.id);
    } else {
      this.readState.markRead(status.id);
    }
  }

  protected setDensity(density: RssDensity): void {
    this.prefs.setRssDensity(density);
    // A collapsed-by-default full view has nothing to expand into; leaving a
    // stale expansion behind would show an item as open in a mode that has no
    // expanded state.
    this.expandedId.set(null);
  }

  protected toggleKits(): void {
    const next = !this.showKits();
    this.showKits.set(next);
    this.diagnostics.info('RssPage', 'user:toggle-kits', { open: next });
  }

  protected openFriendFeeds(): void {
    this.showFriendFeeds.set(true);
    this.diagnostics.info('RssPage', 'user:open-friend-feeds', {});
  }

  protected setFilter(filter: 'all' | 'starred'): void {
    this.filter.set(filter);
  }

  /**
   * Mark every item **currently in this pane** read.
   *
   * Scoped by construction rather than by a scope argument: it passes the ids of
   * the statuses the pane has loaded, which are exactly the ones the heading
   * above the button names. There is no code path here that can widen from one
   * feed to a folder, or from a folder to everything — the sprint doc flags that
   * mistake as the most embarrassing bug this work could ship, and the fix is
   * not to be careful, it is to make the wrong scope unrepresentable.
   *
   * Note it uses `statuses()`, not `visibleStatuses()`: with the Starred filter
   * on, "mark all as read" still means the pane's items, not the four starred
   * ones you can currently see. The button is hidden while filtering to keep
   * that from being a surprise.
   *
   * ## Why this lives in the pane and not on the rail row
   *
   * The sprint doc put it on the left rail, following Google Reader. That needs
   * the items of a feed/folder you have *not* selected, and the pane only ever
   * holds the current selection — so a rail button would have to fetch every
   * folder in the background just to know what it was about to mark, or mark by
   * feed URL and quietly cover items nobody has ever seen listed.
   *
   * Selecting the row first and marking from the pane costs one extra click and
   * buys the guarantee that what gets marked is precisely what the heading above
   * the button says. Given this is the mistake the doc singles out as the worst
   * one available here, that trade is worth making.
   */
  protected markAllRead(): void {
    const ids = this.statuses().map((s) => s.id);
    this.readState.markManyRead(ids);
    this.diagnostics.info('RssPage', 'user:mark-all-read', {
      scope: this.selection().kind,
      items: ids.length,
    });
  }

  /** Scroll-tracking: called by the row observer once an item has been seen. */
  protected onSeen(status: Status): void {
    if (this.prefs.rssScrollMarksRead()) {
      this.readState.markRead(status.id);
    }
  }

  openAddDialog(): void {
    this.diagnostics.info('RssPage', 'user:open-add-dialog', {});
    this.showAddDialog.set(true);
  }

  closeAddDialog(): void {
    this.showAddDialog.set(false);
  }

  rssHost(url: string): string | null {
    return hostOf(url);
  }

  /** The title to show for a failed feed, falling back to its URL. */
  protected feedTitle(url: string): string {
    return this.subs.feeds().find((f) => f.url === url)?.title || url;
  }
}

/** Read the pane selection out of the query string. */
function readSelection(
  feed: string | null,
  folder: string | null,
  unfiled: string | null,
): Selection {
  if (feed) {
    return { kind: 'feed', url: feed };
  }
  if (unfiled) {
    return { kind: 'unfiled' };
  }
  if (folder) {
    return { kind: 'folder', name: folder };
  }
  return { kind: 'all' };
}

/** The query params for a selection — nulls clear the keys it does not use. */
function selectionParams(sel: Selection): Record<string, string | null> {
  switch (sel.kind) {
    case 'all':
      return { feed: null, folder: null, [UNFILED_PARAM]: null };
    case 'unfiled':
      return { feed: null, folder: null, [UNFILED_PARAM]: '1' };
    case 'folder':
      return { feed: null, folder: sel.name, [UNFILED_PARAM]: null };
    case 'feed':
      return { feed: sel.url, folder: null, [UNFILED_PARAM]: null };
  }
}
