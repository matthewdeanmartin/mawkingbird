import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Collection, FeaturedTag, Tag, UserList } from '../../models';
import { ConfirmDialog } from '../../confirm-dialog/confirm-dialog';
import { AnonymousLists } from '../../providers/anonymous/anonymous-lists';
import { AnonymousTags } from '../../providers/anonymous/anonymous-tags';
import { SavedSearches } from '../search/saved-searches';
import { ClientList, ClientLists } from '../../lists/client-lists';
import { TagBundle, TagBundles } from '../../lists/tag-bundles';
import { FeedCapability } from '../../feed-capability';
import { RelayStatus, TagsPub } from '../../tags-pub';
import { SERVER_FEEDS, ServerFeedDef } from '../../lists/server-feeds';
import { RssCache } from '../../providers/rss/rss-cache';
import { PER_FEED_ITEM_CAP } from '../../providers/rss/rss-provider';
import { RssFeedSub, RssSubscriptions } from '../../providers/rss/rss-subscriptions';
import { TwitterFollows } from '../../providers/twitter/twitter-follows';
import { BlueskyFeedEntry, BlueskyFeeds } from '../../providers/bluesky/bluesky-feeds';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { describeHttpError, PageDiagnostics } from '../../page-diagnostics';
import { Terminology } from '../../terminology';
import { ProfileAccountKey } from '../../providers/account/profile-account-key';
import { ProfileList, ProfileLists } from '../../providers/account/profile-lists';
import { CopyPreview, ProfileListCopy } from '../../providers/account/profile-list-copy';
import { SupporterStatus } from '../../providers/account/supporter-status';
import { writeBlockMessage } from '../../providers/account/write-block';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Which sections the Feeds page shows. `/feeds` shows everything; `/feeds/lists`
 * and `/feeds/tags` are filtered views used by the More menu's Lists / Tags
 * entries. Read from the route's `only` data.
 */
type FeedFilter = 'all' | 'lists' | 'tags';

/**
 * One kind of feed on this page.
 *
 * The page grew from "your lists" into a hub for a dozen unrelated kinds —
 * lists, saved searches, server feeds, hashtags, collections, endorsements, RSS,
 * Twitter — stacked in one scroll. The picker above the page narrows to one kind
 * at a time; `all` keeps the full stack and stays the default.
 *
 * Distinct from {@link FeedFilter}, which is the coarse route-level split behind
 * `/feeds/lists` and `/feeds/tags`. The route still wins: on `/feeds/tags` there
 * is nothing but tags to narrow, so the picker is not offered.
 */
export type FeedSection =
  | 'all'
  | 'lists'
  | 'client-lists'
  | 'searches'
  | 'server'
  | 'tags'
  | 'tag-bundles'
  | 'featured-tags'
  | 'collections'
  | 'endorsements'
  | 'rss'
  | 'twitter'
  | 'bsky-pinned'
  | 'bsky-feeds'
  | 'bsky-lists'
  | 'bsky-popular';

/** Picker options, in the order the sections appear down the page. */
export const FEED_SECTIONS: readonly { id: FeedSection; key: string }[] = [
  { id: 'all', key: 'pages.lists.sections.all' },
  { id: 'lists', key: 'pages.lists.title.lists' },
  { id: 'client-lists', key: 'pages.lists.clientList.heading' },
  { id: 'searches', key: 'pages.lists.savedSearches.heading' },
  { id: 'server', key: 'pages.lists.serverFeeds.heading' },
  { id: 'tags', key: 'pages.lists.tags.heading' },
  { id: 'tag-bundles', key: 'pages.lists.tagBundles.heading' },
  { id: 'featured-tags', key: 'pages.lists.sections.featuredTags' },
  { id: 'collections', key: 'pages.lists.collections.heading' },
  { id: 'endorsements', key: 'pages.lists.endorsements.heading' },
  { id: 'rss', key: 'pages.lists.rss.heading' },
  { id: 'twitter', key: 'pages.lists.twitter.heading' },
  // Pinned is its own section rather than a sort order, because that is what
  // pinning means upstream: promoted to a top-level tab, not merged into a
  // stream. An entry appears here or under its kind, never both.
  { id: 'bsky-pinned', key: 'pages.lists.bsky.pinnedHeading' },
  { id: 'bsky-feeds', key: 'pages.lists.bsky.feedsHeading' },
  { id: 'bsky-lists', key: 'pages.lists.bsky.listsHeading' },
  // Last: it is discovery rather than something the reader owns, and every
  // other section on this page is theirs.
  { id: 'bsky-popular', key: 'pages.lists.bsky.popularHeading' },
];

/** English source strings; see scripts/extract-i18n.mjs. */
// i18n pages.lists.title.lists: Lists
// i18n pages.lists.title.tags: Tags
// i18n pages.lists.title.backToFeeds: ← Feeds
// i18n pages.lists.title.feeds: Feeds
// i18n pages.lists.landing.allFeeds: All feeds
// i18n pages.lists.landing.allFeedsHint: everything on one page
// i18n pages.lists.sections.all: All
// i18n pages.lists.sections.featuredTags: Featured hashtags
// i18n pages.lists.create: Create
// i18n pages.lists.loading: Loading…
// i18n pages.lists.emptyCreateAbove: None yet — create one above.
// i18n pages.lists.serverList.newNamePlaceholder: New list name
// i18n pages.lists.serverList.deleteTitle: Delete list
// i18n pages.lists.serverList.empty: No lists yet — create one above.
// i18n pages.lists.clientList.heading: Client lists
// i18n pages.lists.clientList.hint: Kept in this browser, so anyone can go in one — you don't have to follow them, and it works signed out. Server lists (above) only accept accounts you follow.
// i18n pages.lists.clientList.newNamePlaceholder: New client list name
// i18n pages.lists.clientList.members.one: {{count}} member
// i18n pages.lists.clientList.members.other: {{count}} members
// i18n pages.lists.profileList.heading: Mawkingbird lists
// i18n pages.lists.profileList.hint: Kept on your Mawkingbird account, so they follow you to your other browsers. Client lists (above) stay in this browser. A list lives in one place — nothing is copied between them unless you ask.
// i18n pages.lists.profileList.newNamePlaceholder: New Mawkingbird list name
// i18n pages.lists.profileList.readOnly: These are read-only right now.
// i18n pages.lists.copyOffer.summary.one: This browser has {{lists}} client list ({{accounts}} account). Copy it to your Mawkingbird account?
// i18n pages.lists.copyOffer.summary.other: This browser has {{lists}} client lists ({{accounts}} accounts). Copy them to your Mawkingbird account?
// i18n pages.lists.copyOffer.keepsCopies: Your browser keeps its own copies — nothing is moved or deleted.
// i18n pages.lists.copyOffer.copying: Copying…
// i18n pages.lists.copyOffer.copyToAccount: Copy to my account
// i18n pages.lists.copyOffer.noThanks: No thanks
// i18n pages.lists.copyOffer.showPrompt: Copy this browser's lists?
// i18n pages.lists.savedSearches.heading: Saved searches
// i18n pages.lists.savedSearches.emptyPrefix: None yet — save one from
// i18n pages.lists.savedSearches.emptyLink: search
// i18n pages.lists.savedSearches.badge: · saved search
// i18n pages.lists.savedSearches.anonBadge: · anon
// i18n pages.lists.serverFeeds.heading: Server feeds
// i18n pages.lists.serverFeeds.directoryTitle: Server directory
// i18n pages.lists.serverFeeds.directoryHint: · accounts here who opted into discovery
// i18n pages.lists.tags.heading: Followed hashtags
// i18n pages.lists.tags.peekPlaceholder: Look at a hashtag first…
// i18n pages.lists.tags.peekAriaLabel: Hashtag to preview before following
// i18n pages.lists.tags.viewPosts: View posts
// i18n pages.lists.tags.empty: You don't follow any hashtags yet.
// i18n pages.lists.tags.unfollowTitle: Unfollow
// i18n pages.lists.tags.bulkPrompt: Arriving with a list?
// i18n pages.lists.tags.bulkLink: Import or export hashtags in bulk
// i18n pages.lists.tagsPub.prompt: Missing posts on these tags?
// i18n pages.lists.tagsPub.name: tags.pub
// i18n pages.lists.tagsPub.hint: runs a relay account per hashtag that boosts from across the network — following one fills in what this server never saw.
// i18n pages.lists.tagsPub.checking: Checking…
// i18n pages.lists.tagsPub.check: Check tags.pub
// i18n pages.lists.tagsPub.stop: Stop
// i18n pages.lists.tagsPub.followRelays.one: Follow {{count}} relay
// i18n pages.lists.tagsPub.followRelays.other: Follow {{count}} relays
// i18n pages.lists.tagBundles.heading: Tag bundles
// i18n pages.lists.tagBundles.hint: Several hashtags read as one feed, without folding them into Home. Up to {{maxTags}} tags each.
// i18n pages.lists.tagBundles.newNamePlaceholder: New tag bundle name
// i18n pages.lists.tagBundles.deleteTitle: Delete bundle
// i18n pages.lists.tagBundles.empty: None yet — create one above, then add tags to it.
// i18n pages.lists.tagBundles.noTagsYet: · no tags yet
// i18n pages.lists.featuredTags.heading: Featured on your profile
// i18n pages.lists.featuredTags.empty: No featured hashtags.
// i18n pages.lists.collections.heading: Collections
// i18n pages.lists.collections.newNamePlaceholder: New collection name
// i18n pages.lists.collections.deleteTitle: Delete collection
// i18n pages.lists.collections.unsupported: This server doesn't support collections (Mastodon 4.6+).
// i18n pages.lists.collections.starterTitle: Starter collection
// i18n pages.lists.collections.starterHint: · 24 members · built in
// i18n pages.lists.collections.empty: No collections yet — a public, curated set of accounts you recommend.
// i18n pages.lists.collections.members.one: · {{count}} member
// i18n pages.lists.collections.members.other: · {{count}} members
// i18n pages.lists.collections.featuringMe: Collections featuring me
// i18n pages.lists.endorsements.heading: Endorsed accounts
// i18n pages.lists.endorsements.accountsYouEndorse: Accounts you endorse
// i18n pages.lists.endorsements.membersMergedFeed.one: · {{count}} member · merged feed
// i18n pages.lists.endorsements.membersMergedFeed.other: · {{count}} members · merged feed
// i18n pages.lists.endorsements.empty: None yet — endorse accounts from their profile to build a merged feed.
// i18n pages.lists.rss.heading: RSS feeds
// i18n pages.lists.rss.emptyPrefix: None yet — subscribe to any blog or news feed in
// i18n pages.lists.rss.settingsLink: settings
// i18n pages.lists.rss.manageFeedsPrefix: Add or remove feeds in
// i18n pages.lists.rss.unsubscribeTitle: Unsubscribe
// i18n pages.lists.rss.items.one: · {{count}} item
// i18n pages.lists.rss.items.other: · {{count}} items
// i18n pages.lists.rss.newestPrefix: · newest
// i18n pages.lists.rss.inHomeSuffix: in Home
// i18n pages.lists.rss.viaProxy: · via proxy
// i18n pages.lists.rss.off: · off
// i18n pages.lists.twitter.heading: Twitter accounts
// i18n pages.lists.twitter.off: · off
// i18n pages.lists.twitter.settingsLink: settings
// i18n pages.lists.twitter.manageHint.a: Follow or unfollow accounts in
// i18n pages.lists.twitter.manageHint.b: . Opening one costs a request unless it was loaded in the last few minutes.
// i18n pages.lists.bsky.heading: Bluesky feeds
// i18n pages.lists.bsky.loading: Loading your Bluesky feeds…
// i18n pages.lists.bsky.pinnedHeading: 📌 Pinned on Bluesky
// i18n pages.lists.bsky.feedsHeading: 🦋 Bluesky feeds
// i18n pages.lists.bsky.listsHeading: 🦋 Bluesky lists
// i18n pages.lists.bsky.popularHeading: 🦋 Popular on Bluesky
// i18n pages.lists.bsky.popularHint: Feeds other people built and published. Anyone can read them — no Bluesky account needed.
// i18n pages.lists.bsky.savedHint: Saved on Bluesky. Pin and unpin them in the Bluesky app — Mawkingbird reads this list but never rewrites it.
// i18n pages.lists.bsky.byList: · list by &#64;{{handle}}
// i18n pages.lists.bsky.byFeed: · feed by &#64;{{handle}}
// i18n pages.lists.bsky.byHandle: · by &#64;{{handle}}
// i18n pages.lists.bsky.membersByHandle.one: · {{count}} member · by &#64;{{handle}}
// i18n pages.lists.bsky.membersByHandle.other: · {{count}} members · by &#64;{{handle}}
// i18n pages.lists.confirm.deleteList.title: Delete this list?
// i18n pages.lists.confirm.deleteList.message: "{{name}}" will be permanently deleted. This cannot be undone.
// i18n pages.lists.confirm.deleteList.confirm: Delete list
// i18n pages.lists.confirm.deleteBundle.title: Delete this tag bundle?
// i18n pages.lists.confirm.deleteBundle.message: "{{name}}" will be removed from this browser. This cannot be undone.
// i18n pages.lists.confirm.deleteBundle.confirm: Delete bundle
// i18n pages.lists.confirm.deleteClientList.title: Delete this client list?
// i18n pages.lists.confirm.deleteClientList.message: "{{name}}" will be removed from this browser. This cannot be undone.
// i18n pages.lists.confirm.deleteClientList.confirm: Delete list
// i18n pages.lists.confirm.deleteProfileList.title: Delete this Mawkingbird list?
// i18n pages.lists.confirm.deleteProfileList.message: "{{name}}" will be removed from your Mawkingbird account, on every browser. This cannot be undone.
// i18n pages.lists.confirm.deleteProfileList.confirm: Delete list
// i18n pages.lists.confirm.unsubscribeRss.title: Unsubscribe from this feed?
// i18n pages.lists.confirm.unsubscribeRss.message: "{{name}}" will be removed from your feeds. You can subscribe again at any time.
// i18n pages.lists.confirm.unsubscribeRss.confirm: Unsubscribe
// i18n pages.lists.confirm.deleteCollection.title: Delete this collection?
// i18n pages.lists.confirm.deleteCollection.message: "{{name}}" will be permanently deleted. This cannot be undone.
// i18n pages.lists.confirm.deleteCollection.confirm: Delete collection
@Component({
  selector: 'app-lists',
  imports: [RouterLink, FormsModule, ConfirmDialog, TranslocoPipe],
  templateUrl: './lists.html',
  styleUrl: './lists.css',
})
export class Lists implements OnInit {
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;

  private api = inject(Api);
  protected auth = inject(Auth);
  protected tagsPub = inject(TagsPub);
  private feedCaps = inject(FeedCapability);
  private router = inject(Router);
  private anonymousLists = inject(AnonymousLists);
  private anonymousTags = inject(AnonymousTags);
  protected saved = inject(SavedSearches);
  private rssSubs = inject(RssSubscriptions);
  private twitterFollowStore = inject(TwitterFollows);
  private rssCache = inject(RssCache);
  private diagnostics = inject(PageDiagnostics);
  private route = inject(ActivatedRoute);
  private bskyFeeds = inject(BlueskyFeeds);
  protected bskySession = inject(BlueskySession);

  /** Saved Bluesky feeds and lists, split into the three sections below. */
  private bskyEntries = signal<BlueskyFeedEntry[]>([]);
  /** Popular feeds across Bluesky. Discovery, and available to every account. */
  protected bskyPopular = signal<BlueskyFeedEntry[]>([]);
  protected bskyLoading = signal(false);
  protected bskyError = signal<string | null>(null);
  /** A failed list or collection create/delete, shown by the create box. */
  protected listError = signal('');

  /**
   * Pinned entries, feeds and lists together.
   *
   * A grouping, not a sort order — the same way "endorsed" groups accounts
   * rather than duplicating them. Anything here is excluded from the two
   * kind-specific sections, so nothing appears twice.
   */
  protected bskyPinned = computed(() => this.bskyEntries().filter((e) => e.pinned));
  protected bskyUnpinnedFeeds = computed(() =>
    this.bskyEntries().filter((e) => !e.pinned && e.kind === 'feed'),
  );
  protected bskyUnpinnedLists = computed(() =>
    this.bskyEntries().filter((e) => !e.pinned && e.kind === 'list'),
  );

  /**
   * Route into the timeline page for one saved feed or list.
   *
   * The at-uri is encoded because it contains slashes, which would otherwise
   * split into extra path segments and never match the `:ref` param.
   */
  protected bskyFeedLink(entry: BlueskyFeedEntry): (string | number)[] {
    return ['/feeds/bluesky', `${entry.kind}:${encodeURIComponent(entry.uri)}`];
  }

  /**
   * Popular feeds across Bluesky — discovery, for **everyone**.
   *
   * Deliberately not gated on `bskySession.linked()` the way the saved-feed
   * sections above are. Those describe *your* feeds and need your account;
   * this endpoint is anonymous, so a Mastodon-primary or anonymous reader who
   * has never touched Bluesky can still browse what is worth reading there.
   * Gating it would withhold public content for no reason.
   *
   * A refusal yields an empty list and the section hides itself — `unspecced`
   * endpoints are unstable by name.
   */
  private loadPopularFeeds(): void {
    this.bskyFeeds.loadPopular().subscribe({
      next: (entries) => this.bskyPopular.set(entries),
      error: () => {
        // `loadPopular` already swallows failures; belt and braces so a rail-
        // adjacent discovery widget can never break the page it sits on.
        this.bskyPopular.set([]);
      },
    });
  }

  private loadBlueskyFeeds(): void {
    if (!this.bskySession.linked()) {
      return;
    }
    this.bskyLoading.set(true);
    this.bskyError.set(null);
    this.bskyFeeds.load().subscribe({
      next: (entries) => {
        this.bskyEntries.set(entries);
        this.bskyLoading.set(false);
        this.diagnostics.info('Lists', 'load:bsky-feeds', {
          feeds: entries.filter((e) => e.kind === 'feed').length,
          lists: entries.filter((e) => e.kind === 'list').length,
          pinned: entries.filter((e) => e.pinned).length,
        });
      },
      error: (error: unknown) => {
        this.bskyLoading.set(false);
        this.diagnostics.error('Lists', 'load:bsky-feeds-error', error);
        this.bskyError.set(
          error instanceof Error ? error.message : 'Could not load your Bluesky feeds.',
        );
      },
    });
  }

  /** Section filter from the route (`/feeds/lists`, `/feeds/tags`, else all). */
  protected filter: FeedFilter = (this.route.snapshot.data['only'] as FeedFilter) ?? 'all';
  /** A given section is shown when we're on the "all" view or it owns the filter. */
  protected shows(section: FeedFilter): boolean {
    return this.filter === 'all' || this.filter === section;
  }

  protected readonly sectionOptions = FEED_SECTIONS;

  /**
   * Which single kind of feed to show, `all` for the full stack, or `landing`
   * for the drill-down category list.
   *
   * `landing` is `/feeds`'s actual default now — a vertical list of ~16
   * category rows, each a link to its own filtered view, so reaching any one
   * of them costs one click and zero scrolling past the others. `all` is the
   * previous default, kept reachable via the landing list's "All feeds" row
   * for anyone who wants the single-scroll view back. Read from `?section=`
   * so a specific section is directly linkable (part of "3 clicks to a
   * specific Bluesky feed": Feeds -> Bluesky feeds -> the feed).
   */
  protected section = signal<FeedSection | 'landing'>(
    this.filter === 'all'
      ? ((this.route.snapshot.queryParamMap?.get('section') as FeedSection | null) ?? 'landing')
      : 'all',
  );

  /** The picker is pointless on a route that already shows one kind. */
  protected readonly showSectionPicker = this.filter === 'all';

  /** True when `section` renders this kind — the template's per-section guard. */
  protected showsSection(section: FeedSection): boolean {
    return this.section() === 'all' || this.section() === section;
  }

  protected setSection(value: string): void {
    this.section.set(value as FeedSection | 'landing');
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { section: value === 'landing' ? null : value },
      queryParamsHandling: 'merge',
    });
  }

  /**
   * A rough count for one category row on the landing list, or null while its
   * data hasn't resolved yet — the row still renders immediately (see
   * rss-1-nav-and-page-skeleton.md: "counts fill in over time"), just without
   * a number until then. Reads off signals this page already populates on
   * `ngOnInit` for every section; nothing here triggers a new fetch, so a
   * section whose data isn't loaded until it's opened (there are none of
   * those today) would simply show no count rather than an eager fetch.
   */
  protected sectionCount(section: FeedSection): number | null {
    switch (section) {
      case 'lists':
        return this.loading() ? null : this.lists().length;
      case 'client-lists':
        return this.clientLists.count();
      case 'searches':
        return this.saved.count();
      case 'server':
        return this.serverFeeds().length;
      case 'tags':
        return this.followedTags().length;
      case 'tag-bundles':
        return this.tagBundles.bundles().length;
      case 'featured-tags':
        return this.featuredTags().length;
      case 'collections':
        return this.collectionsLoading() ? null : this.collections().length;
      case 'endorsements':
        return this.myEndorsedCount();
      case 'rss':
        return this.rssFeeds().length;
      case 'twitter':
        return this.twitterFollows().length;
      case 'bsky-pinned':
        return this.bskySession.linked() ? this.bskyPinned().length : null;
      case 'bsky-feeds':
        return this.bskySession.linked() ? this.bskyUnpinnedFeeds().length : null;
      case 'bsky-lists':
        return this.bskySession.linked() ? this.bskyUnpinnedLists().length : null;
      case 'bsky-popular':
        return this.bskyPopular().length;
      default:
        return null;
    }
  }

  // Followed / featured hashtags, surfaced here as feed rows (the old /tags page).
  protected followedTags = signal<Tag[]>([]);
  protected featuredTags = signal<FeaturedTag[]>([]);

  /**
   * Server feeds to show. Auth-gated feeds drop for anonymous sessions; probed
   * feeds (Fediverse/Local) are hidden until confirmed non-empty, because
   * mastodon.social has disabled them while other instances keep them — we
   * don't want people clicking into a dead feed to find out.
   */
  protected serverFeeds = signal<ServerFeedDef[]>([]);

  /** True once the profile directory is confirmed to work here (see probeDirectory). */
  protected hasDirectory = signal(false);

  /**
   * Subscribed RSS feeds, shown as list rows.
   *
   * Every subscription appears, including ones switched off in settings (marked
   * "· off"), because this page is the inventory of what you follow — a feed
   * that vanishes when you disable it is a feed you can no longer find to
   * re-enable. Read straight off the store's signal, so subscribing or
   * unsubscribing anywhere updates this list with no reload.
   */
  protected rssFeeds = this.rssSubs.feeds;
  /** How many items of one feed reach Home, so a big feed can say it is trimmed. */
  protected readonly perFeedCap = PER_FEED_ITEM_CAP;
  /** Locally-followed Twitter accounts. Empty (and the section hidden) unless set up. */
  protected twitterFollows = this.twitterFollowStore.follows;

  protected lists = signal<UserList[]>([]);
  protected loading = signal(true);
  protected newTitle = signal('');

  /**
   * Browser-local lists, available in every session.
   *
   * Read straight off the store's signal rather than copied into local state: creating
   * or deleting one anywhere in the app updates this section with no reload. Distinct
   * from {@link lists} above, which mirrors the server's own lists and can only contain
   * accounts you follow.
   */
  protected clientLists = inject(ClientLists);
  protected newClientListTitle = signal('');
  protected clientListToDelete = signal<ClientList | null>(null);

  createClientList(): void {
    const title = this.newClientListTitle().trim();
    if (!title) {
      return;
    }
    this.clientLists.create(title);
    this.newClientListTitle.set('');
  }

  askDeleteClientList(list: ClientList, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.clientListToDelete.set(list);
  }

  removeClientList(list: ClientList): void {
    this.clientListToDelete.set(null);
    this.clientLists.remove(list.id);
  }

  /**
   * Lists stored on a Mawkingbird Plus account.
   *
   * A second *destination*, not a synced copy of the section above: a list lives
   * in one place. Client lists stay in the browser and work signed out; these
   * follow the account to another machine. Nothing reconciles between them,
   * which is what keeps this free of the duplicate-and-undeletable class of bug.
   *
   * Injected directly rather than through a starter indirection: this page is
   * already lazily routed, so the cost lands only on someone who opened it.
   */
  protected profileLists = inject(ProfileLists);

  /**
   * Why account lists are read-only, in words, or null.
   *
   * Was a hardcoded "Your subscription has lapsed" — printed for an expired
   * sign-in and an unreachable service as readily as for a real lapse. The
   * service now reports which of those happened and this says so.
   */
  protected readonly listWriteBlockMessage = computed(() => {
    const block = this.profileLists.writeBlock();
    return block ? writeBlockMessage(block, 'your account lists') : null;
  });
  protected profileAccountKey = inject(ProfileAccountKey);
  protected listCopy = inject(ProfileListCopy);
  protected supporter = inject(SupporterStatus);
  protected newProfileListTitle = signal('');
  protected profileListToDelete = signal<ProfileList | null>(null);
  protected copyOffer = signal<CopyPreview | null>(null);

  /** Whether to show the Plus section at all. */
  protected showsProfileLists = computed(
    () => this.supporter.isSupporter() && this.profileAccountKey.current() !== null,
  );

  async createProfileList(): Promise<void> {
    const title = this.newProfileListTitle().trim();
    if (!title) {
      return;
    }
    this.newProfileListTitle.set('');
    await this.profileLists.create(title);
  }

  askDeleteProfileList(list: ProfileList, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.profileListToDelete.set(list);
  }

  async removeProfileList(list: ProfileList): Promise<void> {
    this.profileListToDelete.set(null);
    await this.profileLists.remove(list.id);
  }

  /** Copy this browser's client lists to the account. Originals are untouched. */
  async copyClientListsToProfile(): Promise<void> {
    await this.listCopy.copy(this.profileAccountKey.current());
    this.copyOffer.set(null);
  }

  declineCopyOffer(): void {
    this.listCopy.decline(this.profileAccountKey.current());
    this.copyOffer.set(null);
  }

  /** Show the copy offer on demand, even after it was declined once. */
  showCopyOffer(): void {
    this.copyOffer.set(this.listCopy.preview());
  }

  /**
   * Fetch the account's lists, then decide whether to offer the copy.
   *
   * Order matters: `shouldOffer` only fires when the collection is loaded and
   * empty, so asking before the fetch would offer a copy into a collection that
   * might already have lists in it.
   */
  private async loadProfileLists(): Promise<void> {
    if (!this.showsProfileLists()) {
      return;
    }
    await this.profileLists.load();
    const accountKey = this.profileAccountKey.current();
    if (this.listCopy.shouldOffer(accountKey)) {
      this.copyOffer.set(this.listCopy.preview());
    }
  }

  /** Tag bundles — hashtag lists read as one feed. Anonymous-friendly. */
  protected tagBundles = inject(TagBundles);
  protected newBundleTitle = signal('');
  protected bundleToDelete = signal<TagBundle | null>(null);

  createTagBundle(): void {
    const title = this.newBundleTitle().trim();
    if (!title) {
      return;
    }
    this.tagBundles.create(title);
    this.newBundleTitle.set('');
  }

  askDeleteBundle(bundle: TagBundle, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.bundleToDelete.set(bundle);
  }

  removeTagBundle(bundle: TagBundle): void {
    this.bundleToDelete.set(null);
    this.tagBundles.remove(bundle.id);
  }

  // Collections (Mastodon 4.6+). Older servers 404 → collectionsSupported=false.
  protected collections = signal<Collection[]>([]);
  protected inCollections = signal<Collection[]>([]);
  protected collectionsLoading = signal(true);
  protected collectionsSupported = signal(true);
  protected newCollectionName = signal('');

  // Your own endorsed accounts, surfaced as a synthetic list (see endorsed-list page).
  protected myEndorsedCount = signal<number | null>(null);

  // Pending deletions awaiting confirmation.
  protected listToDelete = signal<UserList | null>(null);
  protected collectionToDelete = signal<Collection | null>(null);
  protected rssToRemove = signal<RssFeedSub | null>(null);
  protected showStarterCollection = computed(
    () =>
      !this.collectionsLoading() &&
      !this.collections().length &&
      (this.auth.isAnonymous || (this.auth.account()?.following_count ?? 0) === 0),
  );

  ngOnInit(): void {
    this.diagnostics.info('Lists', 'page:open', {
      mode: this.auth.mode() ?? 'unauthenticated',
      filter: this.filter,
    });
    if (this.shows('lists')) {
      this.probeDirectory();
      this.load();
      this.loadCollections();
      this.resolveServerFeeds();
      this.loadBlueskyFeeds();
      this.loadPopularFeeds();
      void this.loadProfileLists();
    }
    if (this.shows('tags')) {
      this.loadTags();
    }
  }

  /** Followed + featured hashtags (mirrors the retired standalone /tags page). */
  private loadTags(): void {
    if (this.auth.isAnonymous) {
      this.followedTags.set(
        this.anonymousTags.tags().map((name) => ({
          id: name,
          name,
          url: '',
          history: [],
          following: true,
          featuring: false,
        })),
      );
      this.featuredTags.set([]);
      return;
    }
    this.api.followedTags().subscribe({
      next: (tags) => this.followedTags.set(tags),
      error: () => this.followedTags.set([]),
    });
    this.api.featuredTags().subscribe({
      next: (tags) => this.featuredTags.set(tags),
      error: () => this.featuredTags.set([]),
    });
  }

  // -------------------------------------------- look at a hashtag, then follow

  /** What's typed in the "look at a hashtag" box. */
  protected tagQuery = signal('');

  /**
   * The box's contents as a usable tag name, or '' when it isn't one.
   *
   * Mastodon tags are a single alphanumeric run, so a leading `#` is stripped
   * and anything with spaces or punctuation is rejected rather than sent to a
   * tag page that would show nothing.
   */
  protected normalizedTagQuery = computed(() => {
    const raw = this.tagQuery().trim().replace(/^#/, '');
    return /^[\p{L}\p{N}_]+$/u.test(raw) ? raw : '';
  });

  /**
   * Open the tag's own page, which is where its posts and its Follow button
   * both are.
   *
   * Deliberately a *view* action rather than a follow one: following a tag
   * pushes it into Home permanently, and a bare "type a tag to follow" box asks
   * for that commitment before showing a single post.
   */
  protected viewTag(): void {
    const tag = this.normalizedTagQuery();
    if (!tag) {
      return;
    }
    this.tagQuery.set('');
    void this.router.navigate(['/tags', tag]);
  }

  /** The ✕ sits inside a routerLink; unfollow without navigating to the tag. */
  askUnfollowTag(tag: Tag, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.unfollowTag(tag);
  }

  private unfollowTag(tag: Tag): void {
    if (this.auth.isAnonymous) {
      this.anonymousTags.unfollow(tag.name);
      this.followedTags.update((list) => list.filter((t) => t.name !== tag.name));
      return;
    }
    this.api.unfollowTag(tag.name).subscribe(() => {
      this.followedTags.update((list) => list.filter((t) => t.name !== tag.name));
    });
  }

  /**
   * Decide which server-feed rows to show.
   *
   * Every eligible row is shown up front and removed only once the server has
   * actually refused it. That ordering matters: the answers are cached per host
   * for a day, so on the common repeat visit nothing moves at all, and on a
   * first visit a row that turns out to be unavailable disappears rather than
   * the whole list appearing late.
   *
   * This replaced a per-visit probe that treated an *empty* timeline as a
   * missing one — which hid the local timeline on any server having a quiet
   * morning. {@link FeedCapability} distinguishes "answered with nothing" from
   * "refused", and only the second hides the row.
   */
  private resolveServerFeeds(): void {
    const eligible = SERVER_FEEDS.filter((f) => !f.authRequired || !this.auth.isAnonymous);
    this.serverFeeds.set(eligible.filter((f) => this.feedCaps.shows(f.capability)));

    for (const def of eligible) {
      void this.feedCaps.ensure(def.capability).then((ability) => {
        if (ability === 'refused') {
          this.removeServerFeed(def);
          return;
        }
        this.addServerFeed(def);
      });
    }
  }

  /** Drop a row the server has told us it does not serve. */
  private removeServerFeed(def: ServerFeedDef): void {
    this.serverFeeds.update((current) => current.filter((f) => f.feed !== def.feed));
  }

  /**
   * Offer the profile-directory row only if this instance actually serves one.
   *
   * Same reasoning as the probed server feeds: instances can turn the directory
   * off, and a row that leads to an error page is worse than no row. One cheap
   * call (limit=1) answers it. The directory is not a `ServerFeedDef` — it
   * yields accounts rather than posts or links and has its own route — so it
   * gets its own signal instead of being bent into that registry.
   */
  private probeDirectory(): void {
    this.api.directory({ order: 'active', local: true, limit: 1 }).subscribe({
      next: (accounts) => this.hasDirectory.set(accounts.length > 0),
      error: () => this.hasDirectory.set(false),
    });
  }

  /** Insert a probed feed in its catalogue order (keeps rows stable). */
  private addServerFeed(def: ServerFeedDef): void {
    this.serverFeeds.update((current) => {
      if (current.some((f) => f.feed === def.feed)) {
        return current;
      }
      const order = SERVER_FEEDS.map((f) => f.feed);
      return [...current, def].sort((a, b) => order.indexOf(a.feed) - order.indexOf(b.feed));
    });
  }

  /** Count the signed-in user's own endorsements so the "Endorsed accounts"
   *  section shows a row only when there's something to see. Called with a
   *  verified account from {@link loadCollections} (which already resolves the
   *  auth snapshot), so it never issues its own verify_credentials. */
  private loadEndorsed(accountId: string): void {
    this.api.accountEndorsements(accountId).subscribe({
      next: (accounts) => this.myEndorsedCount.set(accounts.length),
      error: () => this.myEndorsedCount.set(null),
    });
  }

  load(): void {
    this.diagnostics.info('Lists', 'load:lists-start', { anonymous: this.auth.isAnonymous });
    this.loading.set(true);
    if (this.auth.isAnonymous) {
      this.lists.set(this.anonymousLists.lists());
      this.loading.set(false);
      this.diagnostics.info('Lists', 'load:lists-success', {
        anonymous: true,
        count: this.lists().length,
      });
      return;
    }
    this.api.lists().subscribe({
      next: (l) => {
        this.lists.set(l);
        this.loading.set(false);
        this.diagnostics.info('Lists', 'load:lists-success', { anonymous: false, count: l.length });
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.diagnostics.error('Lists', 'load:lists-error', error);
      },
    });
  }

  loadCollections(): void {
    if (this.auth.isAnonymous) {
      this.collectionsLoading.set(false);
      return;
    }
    const me = this.auth.account();
    if (!me) {
      // Auth snapshot not verified yet; fetch it, then retry.
      this.api.verifyCredentials().subscribe({
        next: (account) => {
          this.auth.setAccount(account);
          this.loadCollections();
        },
        error: () => this.collectionsLoading.set(false),
      });
      return;
    }
    // The account is now resolved; fetch the user's own endorsements alongside.
    this.loadEndorsed(me.id);
    this.collectionsLoading.set(true);
    this.api.accountCollections(me.id).subscribe({
      next: (c) => {
        this.collections.set(c);
        this.collectionsLoading.set(false);
      },
      error: () => {
        this.collectionsSupported.set(false);
        this.collectionsLoading.set(false);
      },
    });
    this.api.accountInCollections(me.id).subscribe({
      next: (c) => this.inCollections.set(c),
      error: () => this.inCollections.set([]),
    });
  }

  create(): void {
    const title = this.newTitle().trim();
    if (!title) {
      return;
    }
    this.listError.set('');
    this.diagnostics.info('Lists', 'user:create-list', {
      anonymous: this.auth.isAnonymous,
      titleLength: title.length,
    });
    if (this.auth.isAnonymous) {
      this.lists.update((lists) => [...lists, this.anonymousLists.create(title)]);
      this.newTitle.set('');
      return;
    }
    this.api.createList(title).subscribe({
      next: (list) => {
        this.diagnostics.info('Lists', 'create-list:success', { id: list.id });
        this.lists.update((l) => [...l, list]);
        this.newTitle.set('');
      },
      // Keep the typed title on a failure: clearing the box would destroy the
      // user's input and leave no list to show for it.
      error: (error) => {
        this.diagnostics.error('Lists', 'create-list:error', error, { titleLength: title.length });
        this.listError.set(`Couldn't create that list. ${describeHttpError(error)}`);
      },
    });
  }

  /** The ✕ sits inside a routerLink; open the confirm without navigating. */
  askDeleteList(list: UserList, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.diagnostics.info('Lists', 'user:request-delete-list', { id: list.id });
    this.listToDelete.set(list);
  }

  remove(list: UserList): void {
    this.listError.set('');
    this.diagnostics.info('Lists', 'user:confirm-delete-list', {
      id: list.id,
      anonymous: this.auth.isAnonymous,
    });
    this.listToDelete.set(null);
    if (this.auth.isAnonymous) {
      this.anonymousLists.remove(list.id);
      this.lists.update((lists) => lists.filter((item) => item.id !== list.id));
      return;
    }
    this.api.deleteList(list.id).subscribe({
      next: () => {
        this.diagnostics.info('Lists', 'delete-list:success', { id: list.id });
        this.lists.update((l) => l.filter((x) => x.id !== list.id));
      },
      // The row stays on screen, which is correct — the list still exists on the
      // server. Without this the delete looked like it silently did nothing.
      error: (error) => {
        this.diagnostics.error('Lists', 'delete-list:error', error, { id: list.id });
        this.listError.set(
          `Couldn't delete “${list.title}”. ${describeHttpError(error)} It is still here.`,
        );
      },
    });
  }

  createCollection(): void {
    const name = this.newCollectionName().trim();
    if (!name) {
      return;
    }
    this.listError.set('');
    this.diagnostics.info('Lists', 'user:create-collection', { nameLength: name.length });
    this.api.createCollection(name).subscribe({
      next: (wrapped) => {
        this.newCollectionName.set('');
        // The mock's stub returns {collection: null}; only append real payloads.
        if (wrapped?.collection) {
          this.diagnostics.info('Lists', 'create-collection:success', {
            id: wrapped.collection.id,
          });
          this.collections.update((c) => [...c, wrapped.collection]);
        } else {
          this.diagnostics.info('Lists', 'create-collection:no-payload', {});
          this.loadCollections();
        }
      },
      error: (error) => {
        this.diagnostics.error('Lists', 'create-collection:error', error, {
          nameLength: name.length,
        });
        this.listError.set(`Couldn't create that collection. ${describeHttpError(error)}`);
      },
    });
  }

  askDeleteCollection(collection: Collection, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.diagnostics.info('Lists', 'user:request-delete-collection', { id: collection.id });
    this.collectionToDelete.set(collection);
  }

  removeCollection(collection: Collection): void {
    this.listError.set('');
    this.diagnostics.info('Lists', 'user:confirm-delete-collection', { id: collection.id });
    this.collectionToDelete.set(null);
    this.api.deleteCollection(collection.id).subscribe({
      next: () => {
        this.diagnostics.info('Lists', 'delete-collection:success', { id: collection.id });
        this.collections.update((c) => c.filter((x) => x.id !== collection.id));
      },
      error: (error) => {
        this.diagnostics.error('Lists', 'delete-collection:error', error, { id: collection.id });
        this.listError.set(
          `Couldn't delete “${collection.name}”. ${describeHttpError(error)} It is still here.`,
        );
      },
    });
  }

  /** The feed's host, for the row's subtitle. Null when the URL won't parse. */
  rssHost(url: string): string | null {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  askUnsubscribeRss(feed: RssFeedSub, event: Event): void {
    // The row is an <a>; without this the click navigates to the feed profile
    // instead of opening the confirm dialog.
    event.stopPropagation();
    event.preventDefault();
    this.diagnostics.info('Lists', 'user:request-unsubscribe-rss', { url: feed.url });
    this.rssToRemove.set(feed);
  }

  removeRss(feed: RssFeedSub): void {
    this.diagnostics.info('Lists', 'user:confirm-unsubscribe-rss', { url: feed.url });
    this.rssToRemove.set(null);
    // The store owns persistence and its signal drives `rssFeeds`, so the row
    // disappears without any local list surgery.
    this.rssSubs.remove(feed.url);
    // Reclaim the cached copy; an unsubscribed feed should not keep megabytes.
    void this.rssCache.evict(feed.url);
  }

  /** Ask tags.pub about every hashtag currently followed. */
  protected checkTagsPub(): void {
    void this.tagsPub.check(this.followedTags().map((tag) => tag.name));
  }

  protected relayLabel(status: RelayStatus): string {
    switch (status) {
      case 'checking':
        return 'checking…';
      case 'following':
        return 'relay followed ✓';
      case 'not_following':
        return 'relay available';
      case 'missing':
        return 'no relay';
      default:
        return '';
    }
  }
}
