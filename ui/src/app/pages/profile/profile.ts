import { Component, computed, DestroyRef, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Location, NgOptimizedImage } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, map, of, Subscription, switchMap, tap } from 'rxjs';
import { Api } from '../../api';
import { accountRoutePath, parseAccountRoute } from '../../account-route';
import { qualifiedHandle } from '../../account-handle';
import { Server } from '../../server';
import { SearchServer } from '../../search-server';
import { Terminology } from '../../terminology';
import { Auth } from '../../auth';
import { LocalModeration } from '../../local-moderation';
import { TrustedAccounts } from '../../trusted-accounts';
import { Account, Collection, Relationship, Status } from '../../models';
import { homeServerLink } from '../../home-server-link';
import {
  emptyProfileSearch,
  filterStatuses,
  isEmptyCriteria,
  mergeResults,
  ProfileSearchCriteria,
  serverQuery,
} from './profile-search';
import { StatusCard } from '../../status-card/status-card';
import { ReportDialog } from '../../report-dialog/report-dialog';
import { ListDialog } from '../../list-dialog/list-dialog';
import { VerifiedBadge } from '../../verified-badge/verified-badge';
import { HumanCountPipe } from '../../human-count.pipe';
import { PeopleBrowser } from '../../people-browser/people-browser';
import { AccountAnalytics } from '../../account-analytics/account-analytics';
import { RssProvider } from '../../providers/rss/rss-provider';
import { RssSubscriptions } from '../../providers/rss/rss-subscriptions';
import { TwitterApi } from '../../providers/twitter/twitter-api';
import { TwitterFeed } from '../../providers/twitter/twitter-feed';
import { TwitterFollow, TwitterFollows } from '../../providers/twitter/twitter-follows';
import { BlueskyApi } from '../../providers/bluesky/bluesky-api';
import { BlueskyGraph } from '../../providers/bluesky/bluesky-graph';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import {
  adaptFeedItem,
  adaptProfile,
  adaptRelationship,
} from '../../providers/bluesky/bluesky-adapter';
import { BskyAuthorFeedFilter } from '../../providers/bluesky/bluesky-types';
import { AnonymousAccount } from '../../providers/anonymous/anonymous-account';
import { AnonymousCapabilities } from '../../providers/anonymous/anonymous-capabilities';
import { AnonymousFollows } from '../../providers/anonymous/anonymous-follows';
import { AnonymousPublicApi } from '../../providers/anonymous/anonymous-public-api';
import {
  AnonymousPublicRef,
  parseAnonymousAccountRouteRef,
} from '../../providers/anonymous/anonymous-route-ref';
import { AnonymousProviderRef } from '../../providers/anonymous/anonymous-mastodon-provider';
import { AccountStatusesOptions } from '../../api';
import { Observable } from 'rxjs';
import { ElizaService } from '../../eliza/eliza.service';
import { isElizaId } from '../../eliza/eliza-identity';
import { AiAvailability } from '../../ai-availability';
import { OpenRouterModelChoice } from '../../providers/openrouter/openrouter-model-choice';
import { OpenRouterSession } from '../../providers/openrouter/openrouter-session';
import { isOpenRouterId, openRouterAccount } from '../../providers/openrouter/openrouter-identity';
import { CopyAccountDialog } from './copy-account-dialog/copy-account-dialog';
import { ProfileMediaGrid } from './media/profile-media-grid';
import { ProfilePhotoView } from './media/profile-photo-view';
import { buildMediaItems, ProfileMediaItem } from './media/profile-media-item';
import { PageDiagnostics } from '../../page-diagnostics';
import { RenderedHtmlLinks } from '../../rendered-html-links';
import { MataroaSettings } from '../../providers/mataroa/mataroa-settings';
import { HugoSettings } from '../../providers/hugo/hugo-settings';
import { BloggerSession } from '../../providers/blogger/blogger-session';

/** Profile body tabs: the account's posts, who they follow, who follows them. */
type ProfileTab = 'posts' | 'media' | 'following' | 'followers' | 'collections' | 'analytics';

// i18n pages.profile.loading.lookingUp: Looking them up on {{server}}…
// i18n pages.profile.loading.loading: Loading…
// i18n pages.profile.actions.back: ← Back
// i18n pages.profile.actions.backWord: Back
// i18n pages.profile.actions.visitSite: ↗ Visit site
// i18n pages.profile.actions.openOnTwitter: ↗ Open on Twitter
// i18n pages.profile.actions.openOnBluesky: ↗ Open on Bluesky
// i18n pages.profile.actions.openOnBskyApp: Open on bsky.app
// i18n pages.profile.actions.openOn: Open on {{host}}
// i18n pages.profile.actions.message: 💬 Message
// i18n pages.profile.actions.settings: Settings
// i18n pages.profile.actions.editLocalProfile: Edit local profile
// i18n pages.profile.actions.copyAccount: Copy account…
// i18n pages.profile.actions.show: Show
// i18n pages.profile.actions.hide: Hide
// i18n pages.profile.actions.removeFollower: Remove follower
// i18n pages.profile.actions.reportAccount: Report account
// i18n pages.profile.actions.reportSubmitted: Report submitted. A moderator will review it; reports cannot be undone.
// i18n pages.profile.actions.moreAccountActions: More account actions
// i18n pages.profile.actions.cancel: Cancel
// i18n pages.profile.actions.homeFeed: Home feed
// i18n pages.profile.rss.subscribed: 📡 Subscribed
// i18n pages.profile.rss.subscribe: 📡 Subscribe
// i18n pages.profile.twitter.stopShowing: Stop showing this account on your Feeds page
// i18n pages.profile.twitter.showOnFeeds: Show this account on your Feeds page. Not a follow on Twitter — nobody is notified.
// i18n pages.profile.twitter.followingLocally: 𝕏 Following locally
// i18n pages.profile.twitter.followLocally: 𝕏 Follow locally
// i18n pages.profile.twitter.savedPosts: Saved posts from an earlier visit.
// i18n pages.profile.twitter.refreshing: Refreshing…
// i18n pages.profile.twitter.refresh: Refresh (1 request)
// i18n pages.profile.bluesky.following: 🦋 Following
// i18n pages.profile.bluesky.follow: 🦋 Follow
// i18n pages.profile.moderation.stopTrusting: Stop trusting account
// i18n pages.profile.moderation.trust: Trust this account
// i18n pages.profile.moderation.cwsOpen: CWs open and show sensitive media.
// i18n pages.profile.moderation.showCws: Show their CWs and sensitive media.
// i18n pages.profile.moderation.unmute: Unmute account
// i18n pages.profile.moderation.muteFor: Mute for…
// i18n pages.profile.moderation.unblock: Unblock account
// i18n pages.profile.moderation.block: Block account
// i18n pages.profile.lists.local: Local lists
// i18n pages.profile.lists.lists: Lists
// i18n pages.profile.relationship.thisAccountFollowsYou: This account follows you
// i18n pages.profile.relationship.followsYou: Follows you
// i18n pages.profile.relationship.mutualUnfollowTitle: You follow each other. Click to unfollow.
// i18n pages.profile.relationship.unfollowTitle: Click to unfollow.
// i18n pages.profile.relationship.mutuals: Mutuals
// i18n pages.profile.relationship.following: Following
// i18n pages.profile.relationship.requested: Requested
// i18n pages.profile.relationship.follow: Follow
// i18n pages.profile.fields.linkOwnershipVerified: Link ownership verified
// i18n pages.profile.stats.items: items
// i18n pages.profile.stats.following: following
// i18n pages.profile.stats.followers: followers
// i18n pages.profile.stats.collections: Collections ({{count}})
// i18n pages.profile.featured.title: ⭐ Featured by {{name}}
// i18n pages.profile.featured.followAll: Follow all ({{count}})
// i18n pages.profile.featured.hint: A hand-picked collection of accounts this profile vouches for.
// i18n pages.profile.featured.viewFeed: View as feed →
// i18n pages.profile.navigation.profileSections: Profile sections
// i18n pages.profile.navigation.media: Media
// i18n pages.profile.navigation.collections: Collections
// i18n pages.profile.navigation.analytics: Analytics
// i18n pages.profile.navigation.timelineFilters: Timeline filters
// i18n pages.profile.collections.title: Collections by {{name}}
// i18n pages.profile.collections.member.one: {{count}} member
// i18n pages.profile.collections.member.other: {{count}} members
// i18n pages.profile.posts.pinned: Pinned
// i18n pages.profile.posts.loginPrompt: Login or create an account to post content, reply and more
// i18n pages.profile.posts.replies: Replies
// i18n pages.profile.posts.loading: Loading posts…
// i18n pages.profile.posts.noMatchesFilters: No posts match these filters.
// i18n pages.profile.posts.noOlder: No older posts.
// i18n pages.profile.posts.loadMore: Load more
// i18n pages.profile.search.search: Search
// i18n pages.profile.search.searching: Searching…
// i18n pages.profile.search.clear: clear
// i18n pages.profile.search.after: After
// i18n pages.profile.search.before: Before
// i18n pages.profile.search.hasMedia: Has media
// i18n pages.profile.search.hasLink: Has link
// i18n pages.profile.search.noReplies: No replies
// i18n pages.profile.search.loadingMore: Loading more of their history to search…
// i18n pages.profile.search.placeholder: Search @{{acct}}’s posts…
// i18n pages.profile.search.ariaLabel: Search this account's posts
// i18n pages.profile.search.noMatches: No posts matched.
// i18n pages.profile.search.serverIndex: and this server’s index
// i18n pages.profile.search.resultSummary.oneOne: {{results}} post · searched {{scanned}} loaded post{{server}}
// i18n pages.profile.search.resultSummary.oneOther: {{results}} post · searched {{scanned}} loaded posts{{server}}
// i18n pages.profile.search.resultSummary.otherOne: {{results}} posts · searched {{scanned}} loaded post{{server}}
// i18n pages.profile.search.resultSummary.otherOther: {{results}} posts · searched {{scanned}} loaded posts{{server}}
// i18n pages.profile.confirm.blockTitle: Block @{{acct}}?
// i18n pages.profile.confirm.blockExplain: They will no longer be able to follow or interact with you. You can undo this later from this same menu.
// i18n pages.profile.confirm.block: Confirm block
// i18n pages.profile.confirm.unfollowTitle: Unfollow @{{acct}}?
// i18n pages.profile.confirm.unfollowExplain: Their posts will no longer appear in your home timeline.
// i18n pages.profile.confirm.unfollow: Confirm unfollow
// i18n pages.profile.confirm.removeFollowerTitle: Remove @{{acct}} as a follower?
// i18n pages.profile.confirm.removeFollowerExplain: They will stop following you, but they will not be blocked.
// i18n pages.profile.errors.notFederated: They may simply not have federated here yet. Searching can pull them in.
// i18n pages.profile.errors.searchFor: Search for @{{handle}}
// i18n pages.profile.errors.idOnlyLink: This link carries only an account id, and ids belong to the server that issued them — there is no name in it to look up. Links made from here on include the handle, so they survive switching servers.
// i18n pages.profile.errors.accountNotFound: Account not found.
// i18n pages.profile.errors.followUpdateFailed: Could not update the follow on Bluesky.
// i18n pages.profile.errors.mediaLoadFailed: Could not load pictures for this account.
// i18n pages.profile.errors.serverDoesNotKnow: {{server}} doesn’t know @{{handle}}.
// i18n pages.profile.errors.profileLoadFailed: Could not load this profile.
// i18n pages.profile.errors.thisServer: This server
// i18n pages.profile.twitter.postsLoadFailed: Could not load posts for @{{handle}}.
// i18n pages.profile.twitter.refreshFailed: Could not refresh @{{handle}}.
// i18n pages.profile.bluesky.linkRequired: Link a Bluesky account in Settings → Connections to view this profile.
// i18n pages.profile.bluesky.profileLoadFailed: Could not load this Bluesky profile.
// i18n pages.profile.bluesky.postsLoadFailed: Could not load posts for this account.
// i18n pages.profile.search.noResultsDetail: Nothing matched. Mastodon only indexes some posts, so try fewer words or load more history.
// i18n pages.profile.mute.oneHour: 1 hour
// i18n pages.profile.mute.oneDay: 1 day
// i18n pages.profile.mute.sevenDays: 7 days
// i18n pages.profile.mute.forever: forever

@Component({
  selector: 'app-profile',
  imports: [
    TranslocoPipe,
    FormsModule,
    RouterLink,
    StatusCard,
    ReportDialog,
    ListDialog,
    VerifiedBadge,
    HumanCountPipe,
    PeopleBrowser,
    AccountAnalytics,
    NgOptimizedImage,
    CopyAccountDialog,
    RenderedHtmlLinks,
    ProfileMediaGrid,
    ProfilePhotoView,
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile implements OnInit, OnDestroy {
  private transloco = inject(TranslocoService);
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private diagnostics = inject(PageDiagnostics);
  protected words = inject(Terminology).words;
  protected auth = inject(Auth);
  private localMod = inject(LocalModeration);
  private trusted = inject(TrustedAccounts);
  protected capabilities = inject(AnonymousCapabilities);
  private anonymous = inject(AnonymousAccount);
  private anonymousPublic = inject(AnonymousPublicApi);
  protected anonymousFollows = inject(AnonymousFollows);
  protected eliza = inject(ElizaService);
  private ai = inject(AiAvailability);
  private openRouter = inject(OpenRouterSession);
  private modelChoice = inject(OpenRouterModelChoice);
  private location = inject(Location);
  private router = inject(Router);
  private server = inject(Server);
  private searchServer = inject(SearchServer);
  private rss = inject(RssProvider);
  private mataroa = inject(MataroaSettings);
  private blogger = inject(BloggerSession);
  private hugo = inject(HugoSettings);
  private twitterFollows = inject(TwitterFollows);
  private twitterFeed = inject(TwitterFeed);
  private twitterApi = inject(TwitterApi);
  private rssSubs = inject(RssSubscriptions);
  private bskyApi = inject(BlueskyApi);
  private bskyGraph = inject(BlueskyGraph);
  protected bskySession = inject(BlueskySession);
  private destroyRef = inject(DestroyRef);
  private routeLoadSub = new Subscription();
  private statusLoadSub = new Subscription();
  private publicProfileRef: AnonymousPublicRef | null = null;

  /** True when this "profile" is a synthetic RSS feed (id `rss:<feedUrl>`). */
  protected isRss = signal(false);
  /** True when this profile is a Twitter account (id `twitter:@<handle>`). */
  protected isTwitter = signal(false);
  /** The handle behind a Twitter profile, for the follow toggle. */
  private twitterHandle = signal<string | null>(null);
  /** Why this Twitter profile's posts could not be loaded, if they could not. */
  protected twitterError = signal<string | null>(null);
  /**
   * Whether the posts on screen came off disk rather than the network.
   *
   * Shown rather than silently refetched: a refetch costs a billable request,
   * and nobody asked for one by navigating here. The reader gets the saved
   * posts immediately plus a Refresh button, and decides for themselves.
   */
  protected twitterStale = signal(false);
  /** Whether the viewer follows this Twitter account locally. */
  protected twitterFollowed = computed(() => {
    const handle = this.twitterHandle();
    return !!handle && this.twitterFollows.has(handle);
  });
  /** True when this profile is a Bluesky account (id `bsky:<did>`). */
  protected isBluesky = signal(false);
  /** The DID behind a Bluesky profile, for the follow toggle and paging. */
  private bskyDid = signal<string | null>(null);
  /** Why this Bluesky profile's posts (or its follow toggle) failed, if they did. */
  protected bskyError = signal<string | null>(null);
  /** True while a follow/unfollow round-trip is in flight. */
  protected bskyFollowBusy = signal(false);
  /** Paging cursor for `getAuthorFeed`; null once exhausted or before the first page. */
  private bskyCursor: string | null = null;

  /**
   * Bluesky's server-side author-feed filter, derived from the page's own
   * boosts/replies toggles.
   *
   * Mastodon takes these as two independent query params; Bluesky takes one
   * enum, and it has no "replies but no reposts" member. Where they disagree the
   * *replies* toggle wins — it's the one a reader is most likely to have set
   * deliberately — and the reposts toggle is then applied client-side by
   * `visibleStatuses`, which already drops boosts when `showBoosts` is off.
   */
  private bskyFilter(): BskyAuthorFeedFilter {
    return this.showReplies() ? 'posts_with_replies' : 'posts_and_author_threads';
  }

  /**
   * Follow/unfollow on Bluesky.
   *
   * A real network write, unlike the Twitter and RSS buttons next to it — the
   * viewer holds a Bluesky session, so this is an actual follow that the other
   * account will see. The relationship is merged rather than replaced because
   * the response cannot report `followed_by`, which the header shows.
   */
  toggleBlueskyFollow(): void {
    const did = this.bskyDid();
    if (!did || this.bskyFollowBusy()) {
      return;
    }
    this.bskyFollowBusy.set(true);
    this.bskyError.set(null);
    const following = this.relationship()?.following ?? false;
    const call = following ? this.bskyGraph.unfollow(did) : this.bskyGraph.follow(did);
    call.subscribe({
      next: (updated) => {
        this.relationship.update((current) => ({ ...current, ...updated }));
        // Keep the header's follower count honest without a refetch.
        this.account.update((a) =>
          a
            ? {
                ...a,
                followers_count: Math.max(0, a.followers_count + (following ? -1 : 1)),
              }
            : a,
        );
        this.bskyFollowBusy.set(false);
        this.diagnostics.info('Profile', 'bsky:follow-toggled', { did, following: !following });
      },
      error: (error: unknown) => {
        this.bskyFollowBusy.set(false);
        this.diagnostics.error('Profile', 'bsky:follow-failed', error, { did });
        this.bskyError.set(
          error instanceof Error
            ? error.message
            : this.transloco.translate<string>('pages.profile.errors.followUpdateFailed'),
        );
      },
    });
  }

  /** The feed URL behind an RSS profile, for the subscribe toggle. */
  private rssFeedUrl = signal<string | null>(null);
  /** Whether the viewer is currently subscribed to this feed. */
  protected rssSubscribed = computed(() => {
    const url = this.rssFeedUrl();
    return !!url && this.rssSubs.has(url) && this.rssSubs.enabledFeeds().some((f) => f.url === url);
  });

  toggleRssSubscription(): void {
    const url = this.rssFeedUrl();
    const account = this.account();
    if (!url) {
      return;
    }
    if (this.rssSubs.has(url)) {
      this.rssSubs.remove(url);
    } else {
      this.followError.set(this.rssSubs.add(url, account?.display_name || url));
    }
  }

  protected account = signal<Account | null>(null);

  /** Where to open this profile on its own server, or null if there is nowhere. */
  protected homeServerLink = computed(() => homeServerLink(this.account()));

  protected statuses = signal<Status[]>([]);
  /** Mataroa RSS items optionally folded into the signed-in user's own profile. */
  private blogStatuses = signal<Status[]>([]);
  protected relationship = signal<Relationship | null>(null);
  protected loading = signal(true);
  /**
   * Why the Mastodon profile could not be loaded, when it could not be.
   *
   * The load used to have no error handler at all, so a 404 left the spinner
   * turning forever — the reported symptom of opening an account URL against a
   * server that never issued that id. Account ids are per-server (the same
   * person is 109655875667638018 on mastodon.social and 109656717715863645 on
   * fosstodon), so this is the ordinary outcome of a stale link, not an edge
   * case.
   */
  protected loadError = signal<string | null>(null);
  /** The handle from `?handle=`, if the link carried one for recovery. */
  protected routeHandle = signal<string | null>(null);
  /** True while re-resolving that handle against the current server. */
  protected recovering = signal(false);
  /** Set when recovery ran and the current server has never heard of them. */
  protected recoveryFailed = signal(false);
  protected statusesLoading = signal(false);

  // --- Account search (the "Search account" item in the ••• menu) ---
  /** Open state of the search panel above the timeline. */
  protected searchOpen = signal(false);
  protected searchCriteria = signal<ProfileSearchCriteria>(emptyProfileSearch());
  /** Results of the last run, or null when no search has been run. */
  protected searchResults = signal<Status[] | null>(null);
  protected searching = signal(false);
  /** How many already-fetched posts the client half looked at, for the count line. */
  protected searchScanned = signal(0);
  /** True when the server's own index answered as well as the local scan. */
  protected searchUsedServer = signal(false);
  protected searchError = signal<string | null>(null);
  protected loadingMore = signal(false);
  /** Fetching more history specifically to widen the local search. */
  protected searchLoadingMore = signal(false);
  /** An older page came back empty: the account's history is fully loaded. */
  protected exhausted = signal(false);

  // Timeline filter toggles. Defaults mirror Mastodon's profile view:
  // boosts shown, replies hidden, pinned strip on top.
  protected showBoosts = signal(true);
  protected showReplies = signal(false);
  protected showPinned = signal(true);
  protected pinnedStatuses = signal<Status[]>([]);
  /** Which body tab is showing: the posts feed, or a people browser. */
  protected tab = signal<ProfileTab>('posts');

  setTab(tab: ProfileTab): void {
    this.tab.set(tab);
    // The media tab is linkable, so it lives in the URL. Everything else stays
    // page-local state: those tabs were never shareable and making them so now
    // would rewrite history entries readers did not ask for.
    this.syncMediaUrl(tab === 'media' ? { tab: 'media' } : { tab: null, photo: null });
    if (tab === 'media' && !this.mediaStatuses().length && !this.mediaLoading()) {
      this.loadMedia();
    }
  }

  // --- media tab ---

  /** Posts backing the photo wall — media-only, fetched separately from `statuses`. */
  private mediaStatuses = signal<Status[]>([]);
  protected mediaLoading = signal(false);
  protected mediaLoadingMore = signal(false);
  protected mediaExhausted = signal(false);
  protected mediaError = signal<string | null>(null);
  /** The `?photo=` key of the open picture, or null when the wall is showing. */
  protected openPhoto = signal<string | null>(null);
  private mediaSeq = 0;
  private mediaSub = new Subscription();
  /**
   * A deep link asked for the wall before the account id existed.
   *
   * `?tab=media` is read during `load`, which is also where the id is still
   * being fetched. The flag defers the media request to {@link maybeLoadPendingMedia},
   * called once an id is actually available.
   */
  private pendingMediaLoad = false;

  /** Run a deferred deep-link media load, now that there is an id to load for. */
  private maybeLoadPendingMedia(id: string): void {
    if (!this.pendingMediaLoad) {
      return;
    }
    this.pendingMediaLoad = false;
    this.loadMedia(id);
  }

  /**
   * The flattened wall: one entry per image, in timeline order.
   *
   * Two sources, because only Mastodon has a media-only endpoint. Mastodon fills
   * {@link mediaStatuses} from its own `only_media` request; the scraped
   * providers have no such filter, so their wall is derived from whatever the
   * posts tab has already loaded — read live rather than copied, so pictures
   * appear as those posts arrive instead of only if the reader happened to open
   * the tab late.
   */
  protected mediaItems = computed<ProfileMediaItem[]>(() =>
    buildMediaItems(this.supportsOnlyMedia() ? this.mediaStatuses() : this.statuses()),
  );

  /**
   * Whether this profile can have a media tab at all.
   *
   * Every provider here can carry pictures one way or another — Mastodon and
   * Bluesky through attachments, RSS and Twitter through scraped bodies — so the
   * tab shows for all of them and says "No pictures yet" when there are none.
   * Only the synthetic correspondents (Eliza, OpenRouter) are excluded: they are
   * conversation partners with no media at all, and a permanently empty tab on
   * their profile would be a dead end by construction.
   */
  protected canShowMedia = computed(() => !this.isEliza() && !this.isOpenRouter());

  /**
   * How many media posts to pull per page.
   *
   * 40 images is roughly a screenful and a half of a 3-column wall. Media posts
   * usually carry one image each, so this lands near the target without the
   * fetch-until-full loop the posts tab needs.
   */
  private static readonly MEDIA_PAGE = 40;

  /**
   * Fill the photo wall.
   *
   * Mastodon does the work server-side with `only_media`, so one request
   * returns 40 posts that definitely have pictures. The other providers have no
   * such filter and no separate media endpoint, so they reuse the posts this
   * page already loaded and scrape them — which is why their wall is bounded by
   * the timeline rather than by its own paging.
   */
  private loadMedia(accountId?: string): void {
    // The caller may hold an id the account signal does not have yet — a deep
    // link starts loading the wall while the profile itself is still in flight.
    const id = accountId ?? this.publicProfileRef?.id ?? this.account()?.id;
    if (!id) {
      return;
    }
    this.mediaError.set(null);

    if (!this.supportsOnlyMedia()) {
      // Scraped providers need no fetch of their own: `mediaItems` reads the
      // posts tab's statuses directly. "More" there means loading more posts,
      // which is the posts tab's own button.
      this.mediaExhausted.set(true);
      this.mediaLoading.set(false);
      return;
    }

    const seq = ++this.mediaSeq;
    this.mediaSub.unsubscribe();
    this.mediaSub = new Subscription();
    this.mediaLoading.set(true);
    this.mediaExhausted.set(false);
    this.mediaSub.add(
      this.getAccountStatuses(id, {
        onlyMedia: true,
        excludeReblogs: true,
        limit: Profile.MEDIA_PAGE,
      }).subscribe({
        next: (batch) => {
          if (seq !== this.mediaSeq) {
            return;
          }
          this.mediaStatuses.set(batch);
          this.mediaExhausted.set(batch.length < Profile.MEDIA_PAGE);
          this.mediaLoading.set(false);
        },
        error: (error: unknown) => {
          if (seq !== this.mediaSeq) {
            return;
          }
          this.diagnostics.error('Profile', 'media:load-failed', error, { id });
          this.mediaLoading.set(false);
          this.mediaExhausted.set(true);
          this.mediaError.set(
            this.transloco.translate<string>('pages.profile.errors.mediaLoadFailed'),
          );
        },
      }),
    );
  }

  /** Only Mastodon-shaped sources answer `only_media`. */
  private supportsOnlyMedia(): boolean {
    return !this.isRss() && !this.isTwitter() && !this.isBluesky();
  }

  /**
   * One more page of pictures, and only on request.
   *
   * Reached from the wall's "More" button and from arrowing off the end of the
   * viewer. Never scroll-triggered: the reader decides each time whether to keep
   * going further back.
   */
  protected loadMoreMedia(): void {
    const id = this.publicProfileRef?.id ?? this.account()?.id;
    const last = this.mediaStatuses().at(-1);
    if (
      !id ||
      !last ||
      this.mediaLoadingMore() ||
      this.mediaExhausted() ||
      !this.supportsOnlyMedia()
    ) {
      return;
    }
    const seq = this.mediaSeq;
    this.mediaLoadingMore.set(true);
    this.mediaSub.add(
      this.getAccountStatuses(id, {
        onlyMedia: true,
        excludeReblogs: true,
        limit: Profile.MEDIA_PAGE,
        maxId: this.nativeStatusId(last),
      }).subscribe({
        next: (batch) => {
          this.mediaLoadingMore.set(false);
          if (seq !== this.mediaSeq) {
            return;
          }
          if (!batch.length) {
            this.mediaExhausted.set(true);
            return;
          }
          const seen = new Set(this.mediaStatuses().map((s) => s.id));
          this.mediaStatuses.update((list) => [...list, ...batch.filter((s) => !seen.has(s.id))]);
          this.mediaExhausted.set(batch.length < Profile.MEDIA_PAGE);
        },
        error: () => this.mediaLoadingMore.set(false),
      }),
    );
  }

  /**
   * A picture's post was deleted from the viewer, so it leaves the wall too.
   *
   * Also dropped from the posts tab: the same status is on both, and leaving it
   * on one would look like the delete half-failed.
   */
  protected onMediaDeleted(removed: Status): void {
    this.mediaStatuses.update((list) => list.filter((s) => s.id !== removed.id));
    this.onDeleted(removed);
  }

  protected openPhotoItem(item: ProfileMediaItem): void {
    this.openPhoto.set(item.key);
    this.syncMediaUrl({ tab: 'media', photo: item.key });
  }

  protected closePhoto(): void {
    this.openPhoto.set(null);
    this.syncMediaUrl({ tab: 'media', photo: null });
  }

  /**
   * Move the viewer to another picture.
   *
   * `replaceUrl` so arrowing through a wall of forty photos leaves one history
   * entry rather than forty — Back should return to the grid, not replay every
   * picture the reader glanced at.
   */
  protected navigatePhoto(item: ProfileMediaItem): void {
    this.openPhoto.set(item.key);
    this.syncMediaUrl({ tab: 'media', photo: item.key }, true);
  }

  /**
   * Push the media tab's state into the query string.
   *
   * A query param rather than a child route: the profile stays mounted, so
   * closing the viewer costs nothing and the wall is still behind it. Back
   * closes the photo because opening one pushed a history entry.
   */
  private syncMediaUrl(
    params: { tab?: string | null; photo?: string | null },
    replaceUrl = false,
  ): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }

  /** The anonymous public-profile ref, for children that need read-only API access. */
  protected get publicRef(): AnonymousPublicRef | null {
    return this.publicProfileRef;
  }

  protected peopleServer(): string | null {
    return this.auth.isAnonymous
      ? (this.publicProfileRef?.server ?? this.anonymous.server())
      : null;
  }
  /** Invalidates in-flight status fetches when filters change or the route moves. */
  private loadSeq = 0;

  /** The main list, minus anything already shown in the pinned strip. */
  protected visibleStatuses = computed(() => {
    const combined = [...this.statuses(), ...this.blogStatuses()].sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    );
    if (!this.showPinned()) {
      return combined;
    }
    const pinnedIds = new Set(this.pinnedStatuses().map((s) => s.id));
    return combined.filter((s) => !pinnedIds.has(s.id));
  });

  protected showReport = signal(false);
  protected showLists = signal(false);
  protected reportDone = signal(false);
  protected showBlockConfirm = signal(false);
  protected showUnfollowConfirm = signal(false);
  protected showRemoveFollowerConfirm = signal(false);
  protected followError = signal<string | null>(null);

  protected isSelf = computed(() => this.account()?.id === this.auth.account()?.id);
  /**
   * Whether the follow runs both ways.
   *
   * Exists so one fact drives both the button's label and whether the
   * "Follows you" badge appears. They used to be decided independently, which
   * is how a mutual ended up with a "Mutuals" badge sitting next to a
   * "Following" button — two controls saying the same thing, and the state
   * everyone actually wants to spot was the one rendered twice.
   */
  protected isMutual = computed(() => {
    const relationship = this.relationship();
    return !!relationship?.following && !!relationship.followed_by;
  });
  /** True when this profile is Eliza's — unlocks her local "Message" button. */
  protected isEliza = computed(() => isElizaId(this.account()?.id));
  protected isOpenRouter = computed(() => isOpenRouterId(this.account()?.id));

  // --- copy account: follows + collections (anon-office sprint 1) ---

  protected showCopyAccount = signal(false);

  /**
   * Whether to offer "Copy account".
   *
   * **Anonymous only, and that is the safety property — not an unfinished edge.**
   * An anonymous follow is a row in `localStorage`, so adopting twenty accounts
   * sends zero write requests to anybody's server. The same button for a signed-in
   * user would fire twenty `POST /accounts/:id/follow` calls back to back, which is
   * indistinguishable from a follow-bot and is how people get suspended. This
   * feature is safe *because* it is anonymous-only; do not later add a rate limiter
   * and turn it on for authenticated users.
   *
   * Requires *something* to copy. `following_count` is the only signal available
   * without spending a request — the profile payload says nothing about
   * collections — so an account with collections but no follows is not offered the
   * entry. That is the conservative direction: the alternative is a menu item that
   * opens a dialog with nothing in it. Not an RSS pseudo-profile either, which has
   * no follow graph at all.
   */
  protected canCopyAccount = computed(
    () =>
      this.capabilities.active &&
      !this.isRss() &&
      !this.isSelf() &&
      (this.account()?.following_count ?? 0) > 0,
  );

  protected openCopyAccount(): void {
    this.showCopyAccount.set(true);
  }

  /**
   * The public reference the dialog reads `/following` through.
   *
   * A signal, unlike the existing `publicRef` getter, because the template binds it
   * as an input and a plain getter would not notify on change. Anonymous profiles
   * reached cross-instance carry a `{ server, id }` ref, and reading their follows
   * has to go to that server rather than ours.
   */
  protected cloneRef = signal<AnonymousPublicRef | null>(null);

  /**
   * The dialog reports how many it followed; the page just closes it.
   *
   * Nothing on this profile needs refreshing: cloning @alice's friends does not
   * change your relationship to @alice, and `AnonymousFollows.follow` has already
   * invalidated the home-feed cache, which is the state that actually moved.
   */
  protected onCloned(): void {
    this.showCopyAccount.set(false);
  }

  /** Discoverable Mastodon 4.6 Collections curated by this profile. */
  protected collections = signal<Collection[]>([]);

  /** Accounts this profile features ("collections") — shown prominently up top. */
  protected featured = signal<Account[]>([]);
  /** Ids among featured() the viewer already follows (or has requested). */
  protected featuredFollowing = signal<Set<string>>(new Set());
  protected featuredBusy = signal(false);

  protected featuredToFollow = computed(() =>
    this.featured().filter(
      (f) => !this.featuredFollowing().has(f.id) && f.id !== this.auth.account()?.id,
    ),
  );

  /** Return to the previous page (e.g. back to search results). */
  goBack(): void {
    this.location.back();
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('id');
      if (!id) {
        return;
      }
      // Both segments may carry either part, and readers reorder them by hand,
      // so parse rather than assume positions. The legacy `?handle=` is still
      // honoured for links minted before the path form existed.
      const ref = parseAccountRoute([id, params.get('handle') ?? '']);
      const handle =
        ref?.handle ?? this.route.snapshot?.queryParamMap?.get('handle')?.replace(/^@/, '') ?? null;
      this.routeHandle.set(handle);

      // A qualified handle outranks the id. An id from another server does not
      // reliably 404 — short ids frequently hit a real but *different* account,
      // which renders as a normal profile with the wrong person on it. Silently
      // wrong is worse than slow, so when both are present the handle decides
      // and the id is only a hint that it agreed.
      //
      // Only for plain numeric ids: `bsky:`, `rss:`, `twitter:@`, `eliza:self`
      // and the base64 anonymous refs are each owned by their own loader inside
      // `load`, and none of them is a Mastodon account a lookup could resolve.
      if (handle && (ref || !this.hasSyntheticPrefix(id))) {
        this.loadByHandle(handle, ref?.id ?? null);
        return;
      }
      this.load(id);
    });

    // The media tab and the open picture live in the URL, so the browser's Back
    // button drives them: Back from a photo closes it, Back from the wall
    // returns to the posts tab. Reading the params here rather than only in the
    // click handlers is also what makes a pasted link open the right picture.
    this.route.queryParamMap?.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const wantsMedia = params.get('tab') === 'media';
      if (wantsMedia && this.canShowMedia()) {
        if (this.tab() !== 'media') {
          this.tab.set('media');
        }
        if (!this.mediaStatuses().length && !this.mediaLoading()) {
          this.loadMedia();
        }
      } else if (this.tab() === 'media') {
        this.tab.set('posts');
      }
      this.openPhoto.set(wantsMedia ? params.get('photo') : null);
    });
  }

  /**
   * Load a profile whose route carried a handle.
   *
   * Tries the id first when there is one — that is the fast path, one call, no
   * lookup — but *verifies* the account it gets back is actually the person the
   * handle names. On any mismatch, or no id at all, it resolves by handle
   * instead. This is what stops a stale link quietly showing a stranger.
   */
  private loadByHandle(handle: string, id: string | null): void {
    if (!id) {
      this.resolveHandle(handle);
      return;
    }
    // No second fetch to verify with: `load` already reads the account, and it
    // checks `expectedHandle` against what comes back. A 404 is handled there
    // too, recovering through the same handle.
    this.expectedHandle = handle;
    this.load(id);
  }

  /**
   * The handle the route promised, checked against whatever the id resolves to.
   * Cleared once `load` has consumed it.
   */
  private expectedHandle: string | null = null;

  /** Ids belonging to a provider-specific loader rather than to Mastodon. */
  private hasSyntheticPrefix(id: string): boolean {
    return (
      id.startsWith('rss:') ||
      id.startsWith('bsky:') ||
      id.startsWith('twitter:@') ||
      id.startsWith('anonymous-account.') ||
      isElizaId(id) ||
      isOpenRouterId(id) ||
      id === 'anonymous'
    );
  }

  /** Resolve a handle to this server's id for that account, then load it. */
  private resolveHandle(handle: string): void {
    this.loading.set(true);
    this.recovering.set(true);
    this.routeLoadSub.add(
      this.api.lookupAccount(handle).subscribe({
        next: (account) => {
          this.recovering.set(false);
          void this.router.navigate(accountRoutePath({ id: account.id, handle }), {
            replaceUrl: true,
          });
        },
        error: (error: unknown) => {
          this.diagnostics.error('Profile', 'recover:failed', error, { handle });
          this.recovering.set(false);
          this.recoveryFailed.set(true);
          this.loading.set(false);
          this.loadError.set(
            this.transloco.translate<string>('pages.profile.errors.serverDoesNotKnow', {
              server: this.currentServerLabel(),
              handle,
            }),
          );
        },
      }),
    );
  }

  ngOnDestroy(): void {
    this.routeLoadSub.unsubscribe();
    this.statusLoadSub.unsubscribe();
    this.mediaSub.unsubscribe();
  }

  load(id: string): void {
    this.routeLoadSub.unsubscribe();
    this.routeLoadSub = new Subscription();
    this.statusLoadSub.unsubscribe();
    this.loading.set(true);
    this.loadError.set(null);
    this.recovering.set(false);
    this.recoveryFailed.set(false);
    this.blogStatuses.set([]);
    this.relationship.set(null);
    this.reportDone.set(false);
    this.followError.set(null);
    this.isRss.set(false);
    this.publicProfileRef = null;
    this.cloneRef.set(null);
    this.showCopyAccount.set(false);
    this.collections.set([]);
    this.rssFeedUrl.set(null);
    this.isTwitter.set(false);
    this.twitterHandle.set(null);
    this.twitterError.set(null);
    this.isBluesky.set(false);
    this.bskyDid.set(null);
    this.bskyError.set(null);
    this.bskyFollowBusy.set(false);
    this.bskyCursor = null;
    // A new profile means a new wall; without this the previous account's
    // pictures would still be on screen while the new one loads.
    this.mediaSub.unsubscribe();
    this.mediaSub = new Subscription();
    this.mediaSeq++;
    this.mediaStatuses.set([]);
    this.mediaLoading.set(false);
    this.mediaLoadingMore.set(false);
    this.mediaExhausted.set(false);
    this.mediaError.set(null);
    this.openPhoto.set(null);
    // Honour a deep link to the wall. `load` resets the tab on every profile
    // change, so reading the snapshot here is what stops it stomping on a
    // pasted `?tab=media&photo=…` URL before the query-param subscription runs.
    const deepLinkedToMedia = this.route.snapshot?.queryParamMap?.get('tab') === 'media';
    this.tab.set(deepLinkedToMedia ? 'media' : 'posts');
    // Deep links must also *fetch* the wall. The query-param subscription fires
    // before the account is resolved, so it has no id to load with and bails;
    // by the time it could work it sees `tab() === 'media'` already set and
    // assumes somebody else did the work. Loading here is what closes that gap.
    if (deepLinkedToMedia) {
      this.pendingMediaLoad = true;
    }
    if (id.startsWith('rss:')) {
      this.loadRss(id);
      return;
    }
    if (id.startsWith('bsky:')) {
      this.loadBluesky(id.slice('bsky:'.length));
      return;
    }
    if (id.startsWith('twitter:@')) {
      this.loadTwitter(id);
      return;
    }
    if (isElizaId(id)) {
      this.loadEliza();
      return;
    }
    if (isOpenRouterId(id)) {
      this.loadOpenRouter();
      return;
    }
    if (this.auth.isAnonymous && id === 'anonymous') {
      this.account.set(this.anonymous.account());
      this.statuses.set([]);
      this.pinnedStatuses.set([]);
      this.featured.set([]);
      this.loading.set(false);
      this.statusesLoading.set(false);
      this.exhausted.set(true);
      this.tab.set(
        this.route.snapshot.queryParamMap.get('tab') === 'following' ? 'following' : 'posts',
      );
      return;
    }
    const publicRef = parseAnonymousAccountRouteRef(id);
    if (publicRef) {
      this.loadPublicProfile(publicRef);
      return;
    }
    this.loadLocalAccount(id);
  }

  /** The ordinary path: an account id our own server knows. */
  private loadLocalAccount(id: string): void {
    this.routeLoadSub.add(
      this.api.getAccount(id).subscribe({
        next: (a) => {
          // The id resolved — but to whom? A short id from another server often
          // hits a real but *different* account here, which would render as a
          // perfectly normal profile of the wrong person. When the route named
          // a handle, it decides.
          const expected = this.expectedHandle;
          this.expectedHandle = null;
          if (expected && qualifiedHandle(a)?.toLowerCase() !== expected.toLowerCase()) {
            this.diagnostics.warn('Profile', 'route:id-handle-mismatch', {
              id,
              expected,
              got: a.acct,
            });
            this.resolveHandle(expected);
            return;
          }
          this.account.set(a);
          if (this.auth.isAnonymous) {
            this.relationship.set(this.anonymousFollows.relationship(a, this.anonymous.server()));
          }
          this.loading.set(false);
        },
        error: (error: unknown) => {
          // Without this handler the spinner ran forever. A 404 here almost
          // always means "this id belongs to another server", so try the
          // handle before giving up — that is the whole point of carrying it.
          this.diagnostics.error('Profile', 'load:account-failed', error, { id });
          const status = (error as { status?: number })?.status;
          if (status === 404 && this.routeHandle()) {
            this.resolveHandle(this.routeHandle()!);
            return;
          }
          this.loading.set(false);
          this.loadError.set(
            status === 404
              ? 'This profile is not on the server you are browsing.'
              : this.transloco.translate<string>('pages.profile.errors.profileLoadFailed'),
          );
        },
      }),
    );
    this.loadStatuses(id);
    this.loadPinned(id);
    this.loadCollections(id);
    this.maybeLoadPendingMedia(id);
    if (this.capabilities.canManageRelationships) {
      this.routeLoadSub.add(
        this.api.relationships([id]).subscribe((rels) => this.relationship.set(rels[0] ?? null)),
      );
    }
    this.loadFeatured(id);
  }

  /** Host of the server being browsed, for messages that name it. */
  protected currentServerLabel(): string {
    const base = this.auth.isAnonymous ? this.anonymous.server() : this.server.baseUrl();
    return (
      base.replace(/^https?:\/\//, '') ||
      this.transloco.translate<string>('pages.profile.errors.thisServer')
    );
  }

  /**
   * A profile that lives on another server: through the home server when we
   * have one, directly otherwise.
   *
   * The same fix as `ThreadLoader.loadPublicPost`, applied to accounts, and for
   * the same reason. An `anonymous-account.*` id says "read this from
   * graz.social", and doing that literally means an unauthenticated request —
   * `externalFetch()` strips the bearer token, correctly, since it belongs to a
   * different host. The remote server therefore has no idea who is asking and
   * serves only what is public: **followers-only and unlisted posts silently do
   * not exist** on the profile, and instances requiring signed fetches refuse
   * outright.
   *
   * For a signed-out reader that is the whole story. For a signed-in one it is
   * a downgrade they never asked for, and these ids reach a signed-in session
   * easily — minted while browsing anonymously, or by a search server, then kept
   * in history or a bookmark. Signing in does not rewrite them.
   *
   * `GET /api/v2/search?q=<url>&resolve=true&type=accounts` asks our *own*
   * server to webfinger the account under our identity and hand back a local
   * copy. Once it has, this is an ordinary profile: `publicProfileRef` stays
   * null, so statuses, pinned posts, collections, relationships and featured
   * tags all take the authenticated path without being told about it
   * individually.
   *
   * The public read stays as the fallback, because resolution legitimately
   * fails — a server may not federate with that instance, or may be slow, or the
   * account may be public and simply unknown to it. Falling back beats an
   * error, and the reader keeps whatever the remote will give.
   *
   * The route is left alone. `/profile/anonymous-account.<blob>` still names an
   * account on a server we hold no account on, which is the durable truth about
   * it; only where the data came from changes.
   */
  private loadPublicProfile(ref: AnonymousPublicRef): void {
    // Nothing to resolve *with*: no Mastodon token means no home server that
    // could webfinger on our behalf. Bluesky-primary and Anonymous land here.
    // A separately configured search server is also not ours to ask — it is a
    // host we read anonymously by design.
    if (this.auth.lacksMastodonToken || this.searchServer.active() || !ref.originalUrl) {
      this.loadAnonymousPublicProfile(ref);
      return;
    }

    this.routeLoadSub.add(
      this.api.search(ref.originalUrl, 'accounts', { resolve: true, limit: 1 }).subscribe({
        next: (results) => {
          const resolved = results.accounts[0];
          if (!resolved) {
            // Our server does not know it. The remote may still show it.
            this.loadAnonymousPublicProfile(ref);
            return;
          }
          // The resolved account is already the object `getAccount` would
          // return, so setting it here saves a request. The handle-mismatch
          // guard in `loadLocalAccount` does not apply: we resolved *by URL*,
          // not by an ambiguous short id.
          this.account.set(resolved);
          this.loading.set(false);
          this.diagnostics.info('Profile', 'public:resolved', {
            url: ref.originalUrl,
            id: resolved.id,
          });
          this.loadStatuses(resolved.id);
          this.loadPinned(resolved.id);
          this.loadCollections(resolved.id);
          this.maybeLoadPendingMedia(resolved.id);
          if (this.capabilities.canManageRelationships) {
            this.routeLoadSub.add(
              this.api
                .relationships([resolved.id])
                .subscribe((rels) => this.relationship.set(rels[0] ?? null)),
            );
          }
          this.loadFeatured(resolved.id);
        },
        error: () => this.loadAnonymousPublicProfile(ref),
      }),
    );
  }

  private loadAnonymousPublicProfile(ref: AnonymousPublicRef): void {
    this.publicProfileRef = ref;
    this.cloneRef.set(ref);
    this.featured.set([]);
    this.routeLoadSub.add(
      this.anonymousPublic.getAccount(ref).subscribe({
        next: (account) => {
          this.account.set(account);
          this.relationship.set(this.anonymousFollows.relationship(account, ref.server));
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      }),
    );
    this.loadStatuses(ref.id);
    this.loadPinned(ref.id);
    this.loadCollections(ref.id);
    this.maybeLoadPendingMedia(ref.id);
  }

  /**
   * An RSS feed as a synthetic profile: the feed's account plus its items as the
   * timeline. No relationships, pinned, or featured — those are Mastodon-only.
   * Feeds have no pagination, so the whole feed loads at once (exhausted).
   */
  /**
   * A Twitter account as a profile: their posts, read through the configured data
   * service.
   *
   * Reuses this page rather than adding a screen of its own, exactly like the
   * RSS branch above — the whole architecture rests on foreign content becoming
   * ordinary `Status` objects, so a Twitter profile should need no special rendering.
   *
   * Two differences from every other profile here, both from the same cause
   * (there is no signed-in X user):
   *
   * - No relationships, pinned posts or featured tags. Those need an account.
   * - Loading costs money, so it is capped at one page and marked exhausted.
   *   Infinite scroll on a billed API is a way to spend a balance by accident.
   *
   * The profile itself is not fetched: the follow record already holds the
   * display name and avatar, and the posts carry the author. That saves one
   * billable request per visit for an account you already follow. Only an
   * *unfollowed* handle needs the lookup.
   */
  private loadTwitter(id: string): void {
    this.isTwitter.set(true);
    const handle = id.slice('twitter:@'.length);
    this.twitterHandle.set(handle);
    this.statuses.set([]);
    this.pinnedStatuses.set([]);
    this.featured.set([]);
    this.statusesLoading.set(true);
    // One page only; see the note above.
    this.exhausted.set(true);
    const seq = ++this.loadSeq;

    const follow = this.twitterFollows.find(handle);
    const known: Observable<TwitterFollow> = follow
      ? of(follow)
      : this.twitterApi.getProfile(handle).pipe(
          map(
            (account): TwitterFollow => ({
              username: account.username,
              displayName: account.display_name,
              avatar: account.avatar,
              addedAt: Date.now(),
              enabled: true,
            }),
          ),
          tap((resolved: TwitterFollow) => {
            if (seq === this.loadSeq) {
              this.account.set(twitterPlaceholderAccount(resolved));
            }
          }),
        );

    this.statusLoadSub = known
      .pipe(switchMap((resolved) => this.twitterFeed.timeline(resolved)))
      .subscribe({
        next: (statuses) => {
          if (seq !== this.loadSeq) {
            return;
          }
          // The author object off a real post beats anything synthesized: it
          // carries the live follower counts and bio.
          const authored = statuses.find(
            (status) => status.account.username.toLowerCase() === handle.toLowerCase(),
          );
          this.account.set(
            authored?.account ??
              this.account() ??
              twitterPlaceholderAccount(follow ?? fallbackFollow(handle)),
          );
          this.statuses.set(statuses);
          this.twitterStale.set(this.twitterFeed.isStale(handle));
          this.loading.set(false);
          this.statusesLoading.set(false);
          this.diagnostics.info('Profile', 'twitter:loaded', {
            handle,
            posts: statuses.length,
            stale: this.twitterStale(),
          });
        },
        error: (error: unknown) => {
          if (seq !== this.loadSeq) {
            return;
          }
          this.diagnostics.error('Profile', 'twitter:load-failed', error, { handle });
          // Show the account with its posts missing, and say why — rather than
          // letting the page fall through to "Account not found", which is a
          // different and wrong claim. A rate limit, an expired key or a dead
          // proxy all mean "we could not fetch the posts"; none of them mean the
          // account does not exist, and sending someone to check the handle they
          // typed is the least useful thing the page could do.
          this.account.set(
            this.account() ?? twitterPlaceholderAccount(follow ?? fallbackFollow(handle)),
          );
          this.twitterError.set(
            error instanceof Error
              ? error.message
              : this.transloco.translate<string>('pages.profile.twitter.postsLoadFailed', {
                  handle,
                }),
          );
          this.loading.set(false);
          this.statusesLoading.set(false);
        },
      });
  }

  /**
   * Fetch this Twitter account's posts again, at the cost of one request.
   *
   * The only path that spends money on this page. Deliberately a button rather
   * than anything automatic — see {@link twitterStale}.
   */
  protected refreshTwitter(): void {
    const handle = this.twitterHandle();
    if (!handle || this.statusesLoading()) {
      return;
    }
    this.twitterError.set(null);
    this.statusesLoading.set(true);
    const follow = this.twitterFollows.find(handle) ?? fallbackFollow(handle);
    const seq = ++this.loadSeq;
    this.statusLoadSub?.unsubscribe();
    this.statusLoadSub = this.twitterFeed.timeline(follow, true).subscribe({
      next: (statuses) => {
        if (seq !== this.loadSeq) {
          return;
        }
        this.statuses.set(statuses);
        this.twitterStale.set(false);
        this.statusesLoading.set(false);
      },
      error: (error: unknown) => {
        if (seq !== this.loadSeq) {
          return;
        }
        // The saved posts stay on screen. A failed refresh should cost the
        // reader the update, not the copy they were already reading.
        this.twitterError.set(
          error instanceof Error
            ? error.message
            : this.transloco.translate<string>('pages.profile.twitter.refreshFailed', { handle }),
        );
        this.statusesLoading.set(false);
      },
    });
  }

  /** Follow or unfollow this Twitter account locally. Costs nothing either way. */
  protected toggleTwitterFollow(): void {
    const handle = this.twitterHandle();
    const account = this.account();
    if (!handle) {
      return;
    }
    if (this.twitterFollows.has(handle)) {
      this.twitterFollows.remove(handle);
      return;
    }
    this.twitterFollows.add({
      username: handle,
      displayName: account?.display_name ?? handle,
      avatar: account?.avatar,
    });
  }

  /**
   * A Bluesky account: the detailed profile plus its author feed.
   *
   * Two calls, deliberately. `getProfile` is the only thing that carries the bio,
   * banner, counts *and* `viewer.following` — the last of which is what the follow
   * button needs and what nothing else can supply on a cold load. The author feed
   * is a separate cursor-paged endpoint, so unlike the Twitter branch above this
   * one supports "load more" properly.
   *
   * The actor is addressed by the DID from the route rather than the handle:
   * handles are rentable and can change, DIDs cannot, so a bookmarked profile URL
   * keeps working after a rename.
   */
  private loadBluesky(did: string): void {
    this.isBluesky.set(true);
    this.bskyDid.set(did);
    this.statuses.set([]);
    this.pinnedStatuses.set([]);
    this.featured.set([]);
    this.statusesLoading.set(true);
    this.exhausted.set(false);
    const seq = ++this.loadSeq;

    if (!this.bskySession.linked()) {
      // Every app.bsky read here is authenticated; without a session there is
      // nothing to show and no useful error from the network.
      this.loading.set(false);
      this.statusesLoading.set(false);
      this.exhausted.set(true);
      this.bskyError.set(this.transloco.translate<string>('pages.profile.bluesky.linkRequired'));
      return;
    }

    this.routeLoadSub.add(
      this.bskyApi.getProfile(did).subscribe({
        next: (profile) => {
          if (seq !== this.loadSeq) {
            return;
          }
          this.account.set(adaptProfile(profile));
          this.relationship.set(adaptRelationship(profile));
          // Cache the follow record's uri so an unfollow costs one call, not two.
          this.bskyGraph.remember(profile.did, profile.viewer?.following);
          this.loading.set(false);
          this.diagnostics.info('Profile', 'bsky:loaded', { did, handle: profile.handle });
        },
        error: (error: unknown) => {
          if (seq !== this.loadSeq) {
            return;
          }
          this.diagnostics.error('Profile', 'bsky:load-failed', error, { did });
          this.loading.set(false);
          this.bskyError.set(
            error instanceof Error
              ? error.message
              : this.transloco.translate<string>('pages.profile.bluesky.profileLoadFailed'),
          );
        },
      }),
    );

    this.loadBlueskyPosts(seq);
  }

  /** One page of the author feed; also serves "load more" via {@link bskyCursor}. */
  private loadBlueskyPosts(seq: number): void {
    const did = this.bskyDid();
    if (!did) {
      return;
    }
    this.statusLoadSub = this.bskyApi
      .getAuthorFeed(did, this.bskyCursor, this.bskyFilter())
      .subscribe({
        next: (page) => {
          if (seq !== this.loadSeq) {
            return;
          }
          this.bskyCursor = page.cursor ?? null;
          const statuses = page.feed.map(adaptFeedItem);
          this.statuses.update((current) => [...current, ...statuses]);
          // No cursor, or a page that added nothing: the history is complete.
          this.exhausted.set(!this.bskyCursor || statuses.length === 0);
          this.statusesLoading.set(false);
          this.loadingMore.set(false);
        },
        error: (error: unknown) => {
          if (seq !== this.loadSeq) {
            return;
          }
          this.diagnostics.error('Profile', 'bsky:posts-failed', error, { did });
          this.statusesLoading.set(false);
          this.loadingMore.set(false);
          this.exhausted.set(true);
          this.bskyError.set(
            error instanceof Error
              ? error.message
              : this.transloco.translate<string>('pages.profile.bluesky.postsLoadFailed'),
          );
        },
      });
  }

  private loadRss(id: string): void {
    this.isRss.set(true);
    const feedUrl = id.slice('rss:'.length);
    this.rssFeedUrl.set(feedUrl);
    this.statuses.set([]);
    this.pinnedStatuses.set([]);
    this.featured.set([]);
    this.statusesLoading.set(true);
    this.exhausted.set(true);
    const seq = ++this.loadSeq;
    this.statusLoadSub = this.rss.getFeed(feedUrl).subscribe({
      next: ({ account, statuses }) => {
        if (seq !== this.loadSeq) {
          return;
        }
        this.account.set(account);
        this.statuses.set(statuses);
        this.loading.set(false);
        this.statusesLoading.set(false);
        // One line per profile open. An empty feed that parsed is worth saying
        // out loud: it looks identical to a failure on screen.
        this.diagnostics.info('Profile', 'rss:loaded', {
          feed: feedUrl,
          items: statuses.length,
        });
      },
      error: (error: unknown) => {
        if (seq !== this.loadSeq) {
          return;
        }
        this.diagnostics.error('Profile', 'rss:load-failed', error, { feed: feedUrl });
        // No account to show; the template falls back to "Account not found".
        this.loading.set(false);
        this.statusesLoading.set(false);
      },
    });
  }

  /**
   * Eliza's synthetic profile: her account and pre-written timeline, served
   * entirely from {@link ElizaService} with no network call. Works identically
   * whether the viewer is anonymous or signed in — she's a browser-local friend.
   * Her follow relationship is the local one (never the real follow API).
   */
  private loadEliza(): void {
    this.eliza.refresh();
    this.account.set(this.eliza.account());
    const timeline = this.eliza.timeline();
    this.pinnedStatuses.set(this.showPinned() ? timeline.filter((s) => s.pinned) : []);
    this.statuses.set(timeline);
    this.featured.set([]);
    this.relationship.set(this.eliza.relationship());
    this.loading.set(false);
    this.statusesLoading.set(false);
    this.exhausted.set(true);
    this.tab.set('posts');
  }

  /**
   * OpenRouter's synthetic profile — the model you have configured, as a
   * correspondent.
   *
   * Deliberately empty of posts, and that is not a gap to fill later: a
   * language model has nothing to say until asked, so a feed of model-authored
   * posts would be words put in its mouth. The profile is the door to a
   * conversation, and the template's empty state says so.
   *
   * Left as "account not found" when AI is off or no key is connected. There is
   * genuinely nothing to show, and a profile for a service you cannot reach
   * would only raise a question the page cannot answer.
   */
  private loadOpenRouter(): void {
    if (!this.ai.enabled() || !this.openRouter.connected()) {
      this.loading.set(false);
      this.statusesLoading.set(false);
      return;
    }
    this.account.set(openRouterAccount(this.modelChoice.modelId()));
    this.statuses.set([]);
    this.pinnedStatuses.set([]);
    this.featured.set([]);
    this.relationship.set(null);
    this.loading.set(false);
    this.statusesLoading.set(false);
    this.exhausted.set(true);
    this.tab.set('posts');
  }

  toggleBoosts(): void {
    this.showBoosts.update((v) => !v);
    this.reloadStatuses();
  }

  toggleReplies(): void {
    this.showReplies.update((v) => !v);
    this.reloadStatuses();
  }

  togglePinned(): void {
    this.showPinned.update((v) => !v);
  }

  private reloadStatuses(): void {
    // Bluesky re-queries rather than re-filters: the replies toggle is a
    // different server-side filter, so the feed restarts from the newest post.
    if (this.isBluesky()) {
      this.bskyCursor = null;
      this.statuses.set([]);
      this.statusesLoading.set(true);
      this.loadBlueskyPosts(++this.loadSeq);
      return;
    }
    const id = this.publicProfileRef?.id ?? this.account()?.id;
    if (id) {
      this.loadStatuses(id);
    }
  }

  /** How many statuses a filtered profile view should end up with. */
  private static readonly TARGET_COUNT = 20;
  /** Safety cap on the fetch-until-full loop (filtered pages can come back short). */
  private static readonly MAX_PAGES = 8;

  /**
   * Load the account's statuses under the current filter toggles. Mastodon
   * applies exclude_* filtering per page, so filtered pages can return fewer
   * than `limit` items — keep paging older until TARGET_COUNT accumulate,
   * the account runs out, or MAX_PAGES is hit.
   */
  private loadStatuses(id: string): void {
    this.statusLoadSub.unsubscribe();
    this.statusLoadSub = new Subscription();
    const seq = ++this.loadSeq;
    this.loadBlogStatuses(id, seq);
    this.statuses.set([]);
    this.statusesLoading.set(true);
    this.exhausted.set(false);
    const opts = {
      excludeReblogs: !this.showBoosts(),
      excludeReplies: !this.showReplies(),
      limit: Profile.TARGET_COUNT,
    };
    const fetchPage = (maxId: string | undefined, acc: Status[], page: number): void => {
      this.statusLoadSub.add(
        this.getAccountStatuses(id, { ...opts, maxId }).subscribe({
          next: (batch) => {
            if (seq !== this.loadSeq) {
              return; // A newer load superseded this one.
            }
            const all = [...acc, ...batch];
            if (batch.length > 0 && all.length < Profile.TARGET_COUNT && page < Profile.MAX_PAGES) {
              fetchPage(this.nativeStatusId(batch[batch.length - 1]), all, page + 1);
              return;
            }
            this.statuses.set(all);
            this.statusesLoading.set(false);
          },
          error: () => {
            if (seq === this.loadSeq) {
              this.statuses.set(acc);
              this.statusesLoading.set(false);
            }
          },
        }),
      );
    };
    fetchPage(undefined, [], 1);
  }

  /**
   * Load the user's own blog RSS feeds onto their own profile.
   *
   * Both connectors can be on at once, so this merges every opted-in feed
   * rather than assuming a single blog. Each is fetched independently: one blog
   * being unreachable must not blank the other, which is why the failures are
   * caught per feed and the results accumulated instead of forkJoin'd.
   *
   * Whether a feed needs the CORS proxy is a fact about that blog, so it is
   * carried per feed rather than assumed. Mataroa's needs it, and so does
   * Blogger's — the Blogger *API* is CORS-open, but its RSS feed is not, and
   * usually redirects to FeedBurner besides. A Hugo site on GitHub Pages does
   * not: Pages sends `access-control-allow-origin: *`, so proxying it would
   * route the user's own public writing through a third party for no reason.
   */
  private loadBlogStatuses(id: string, seq: number): void {
    const account = this.auth.account();
    if (!account || id !== account.id) {
      this.blogStatuses.set([]);
      return;
    }

    const feeds: { source: string; url: string; useProxy: boolean }[] = [];
    const mataroaFeed = this.mataroa.feedUrl();
    if (mataroaFeed && this.mataroa.includeInProfile()) {
      feeds.push({ source: 'mataroa', url: mataroaFeed, useProxy: true });
    }
    const bloggerFeed = this.blogger.feedUrl();
    if (bloggerFeed && this.blogger.includeInProfile()) {
      feeds.push({ source: 'blogger', url: bloggerFeed, useProxy: true });
    }
    const hugoFeed = this.hugo.feedUrl();
    if (hugoFeed && this.hugo.includeInProfile()) {
      feeds.push({ source: 'hugo', url: hugoFeed, useProxy: false });
    }
    if (!feeds.length) {
      this.blogStatuses.set([]);
      return;
    }

    this.blogStatuses.set([]);
    for (const feed of feeds) {
      this.statusLoadSub.add(
        this.rss.getFeed(feed.url, feed.useProxy).subscribe({
          next: ({ statuses }) => {
            if (seq !== this.loadSeq) {
              return;
            }
            // This is the user's profile feed, so blog entries retain RSS behavior
            // while presenting the same identity as the Mastodon posts beside them.
            const owned = statuses.map((status) => ({ ...status, account }));
            this.blogStatuses.update((existing) => [...existing, ...owned]);
          },
          error: (error: unknown) => {
            if (seq === this.loadSeq) {
              // Leave whatever other feeds delivered; only this one failed.
              this.diagnostics.warn('Profile', `${feed.source}-rss:load-failed`, {
                feed: feed.url,
                reason: error instanceof Error ? error.message : String(error),
              });
            }
          },
        }),
      );
    }
  }

  /** Fetch one older page below the current list ("Load more" at the bottom). */
  /**
   * How many of the account's posts the local half tries to have on hand.
   *
   * The profile loads 20 for the timeline, which is far too thin to search. A
   * search deepens that to this, which is ~5 extra requests once per profile —
   * paid when someone actually searches, not on every profile view.
   */
  private static readonly SEARCH_SAMPLE = 100;

  protected toggleSearch(): void {
    const open = !this.searchOpen();
    this.searchOpen.set(open);
    if (!open) {
      this.clearSearch();
    }
  }

  protected clearSearch(): void {
    this.searchCriteria.set(emptyProfileSearch());
    this.searchResults.set(null);
    this.searchError.set(null);
    this.searchScanned.set(0);
    this.searchUsedServer.set(false);
  }

  protected patchSearch(changes: Partial<ProfileSearchCriteria>): void {
    this.searchCriteria.update((c) => ({ ...c, ...changes }));
  }

  /**
   * Search this account's posts: the server's index and the local sample.
   *
   * Neither half is sufficient alone. Mastodon's full-text search covers the
   * account's whole history but indexes only what its own instance chose to
   * index — famously little, and for a *remote* account often nothing at all.
   * The local scan sees every post it was given but only as far back as the
   * profile has paged. Running both and merging is what makes the feature work
   * on a stranger's profile as well as your own.
   */
  protected async runSearch(): Promise<void> {
    const criteria = this.searchCriteria();
    if (this.searching() || isEmptyCriteria(criteria)) {
      return;
    }
    this.searching.set(true);
    this.searchError.set(null);
    this.searchUsedServer.set(false);
    try {
      await this.deepenSample();
      const local = filterStatuses(this.statuses(), criteria);
      this.searchScanned.set(this.statuses().length);

      const fromServer = await this.searchOnServer(criteria);
      this.searchResults.set(mergeResults(fromServer, local));
      if (!fromServer.length && !local.length) {
        this.searchError.set(
          this.transloco.translate<string>('pages.profile.search.noResultsDetail'),
        );
      }
    } finally {
      this.searching.set(false);
    }
  }

  /**
   * Ask the account's own server, using the `from:` operator.
   *
   * Anonymous browsing has no full-text search to ask — mastodon.social does
   * not give logged-out visitors one — so that path skips straight to the local
   * scan rather than issuing a request that cannot work.
   */
  private async searchOnServer(criteria: ProfileSearchCriteria): Promise<Status[]> {
    const account = this.account();
    const handle = account ? qualifiedHandle(account) : null;
    if (!handle || this.auth.isAnonymous || this.isBluesky() || this.isRss() || this.isTwitter()) {
      return [];
    }
    const q = serverQuery(handle, criteria);
    if (!q) {
      return [];
    }
    try {
      const results = await firstValueFrom(this.api.search(q, 'statuses', { limit: 40 }));
      this.searchUsedServer.set(true);
      // A server that ignores `from:` returns other people's posts for the
      // words alone, which would be a silent wrong answer — so the author is
      // re-checked here rather than trusted.
      return (results.statuses ?? []).filter((s) => s.account?.id === account?.id);
    } catch {
      // No index, or the server refused: the local half still stands.
      return [];
    }
  }

  /** Page in more history, once, so the local scan has something to search. */
  private async deepenSample(): Promise<void> {
    const id = this.publicProfileRef?.id ?? this.account()?.id;
    if (!id || this.isBluesky() || this.exhausted()) {
      return;
    }
    this.searchLoadingMore.set(true);
    const seq = this.loadSeq;
    try {
      while (this.statuses().length < Profile.SEARCH_SAMPLE) {
        const last = this.statuses().at(-1);
        if (!last) {
          break;
        }
        const batch = await firstValueFrom(
          this.getAccountStatuses(id, {
            excludeReblogs: !this.showBoosts(),
            excludeReplies: !this.showReplies(),
            limit: Profile.TARGET_COUNT,
            maxId: this.nativeStatusId(last),
          }),
        );
        if (seq !== this.loadSeq) {
          return; // The route moved or filters changed mid-search.
        }
        if (!batch.length) {
          this.exhausted.set(true);
          break;
        }
        const seen = new Set(this.statuses().map((s) => s.id));
        const added = batch.filter((s) => !seen.has(s.id));
        if (!added.length) {
          break; // Paging stopped advancing; stop rather than spin.
        }
        this.statuses.update((list) => [...list, ...added]);
      }
    } catch {
      // Whatever was already loaded is still searchable.
    } finally {
      this.searchLoadingMore.set(false);
    }
  }

  loadMore(): void {
    if (this.isBluesky()) {
      if (this.loadingMore() || this.exhausted() || !this.bskyCursor) {
        return;
      }
      this.loadingMore.set(true);
      this.loadBlueskyPosts(this.loadSeq);
      return;
    }
    const id = this.publicProfileRef?.id ?? this.account()?.id;
    const last = this.statuses().at(-1);
    if (!id || !last || this.loadingMore() || this.exhausted()) {
      return;
    }
    const seq = this.loadSeq;
    this.loadingMore.set(true);
    this.getAccountStatuses(id, {
      excludeReblogs: !this.showBoosts(),
      excludeReplies: !this.showReplies(),
      limit: Profile.TARGET_COUNT,
      maxId: this.nativeStatusId(last),
    }).subscribe({
      next: (batch) => {
        this.loadingMore.set(false);
        if (seq !== this.loadSeq) {
          return; // Filters changed or the route moved mid-flight.
        }
        if (!batch.length) {
          this.exhausted.set(true);
          return;
        }
        const seen = new Set(this.statuses().map((s) => s.id));
        this.statuses.update((list) => [...list, ...batch.filter((s) => !seen.has(s.id))]);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  private loadPinned(id: string): void {
    this.pinnedStatuses.set([]);
    this.routeLoadSub.add(
      this.getAccountStatuses(id, { pinned: true }).subscribe({
        next: (pinned) => this.pinnedStatuses.set(pinned),
        error: () => {
          // No pinned strip, the rest of the profile still works.
        },
      }),
    );
  }

  private getAccountStatuses(id: string, opts: AccountStatusesOptions): Observable<Status[]> {
    return this.publicProfileRef
      ? this.anonymousPublic.getAccountStatuses({ ...this.publicProfileRef, id }, opts)
      : this.api.getAccountStatuses(id, opts);
  }

  private nativeStatusId(status: Status): string {
    const ref = status.providerRef as Partial<AnonymousProviderRef> | undefined;
    return status.provider === 'anonymous-mastodon' && typeof ref?.statusId === 'string'
      ? ref.statusId
      : status.id;
  }

  private loadFeatured(id: string): void {
    this.featured.set([]);
    this.featuredFollowing.set(new Set());
    this.routeLoadSub.add(
      this.api.accountEndorsements(id).subscribe({
        next: (accounts) => {
          this.featured.set(accounts);
          if (!accounts.length) {
            return;
          }
          if (this.auth.isAnonymous) {
            this.featuredFollowing.set(
              new Set(
                accounts
                  .filter((account) =>
                    this.anonymousFollows.isFollowing(account, this.anonymous.server()),
                  )
                  .map((account) => account.id),
              ),
            );
            return;
          }
          if (!this.capabilities.canManageRelationships) {
            return;
          }
          this.routeLoadSub.add(
            this.api.relationships(accounts.map((a) => a.id)).subscribe({
              next: (rels) =>
                this.featuredFollowing.set(
                  new Set(rels.filter((r) => r.following || r.requested).map((r) => r.id)),
                ),
              error: () => {
                // Follow buttons just show for everyone; following again is harmless.
              },
            }),
          );
        },
        error: () => {
          // Older servers (pre-4.4) 404 here; the section simply doesn't render.
        },
      }),
    );
  }

  /** Load actual Mastodon Collections, distinct from legacy profile endorsements. */
  private loadCollections(id: string): void {
    this.collections.set([]);
    const request = this.publicProfileRef
      ? this.anonymousPublic.getAccountCollections({ ...this.publicProfileRef, id })
      : this.api.accountCollections(id);
    this.routeLoadSub.add(
      request.subscribe({
        next: (collections) => this.collections.set(collections),
        error: () => {
          // Collections were added in Mastodon 4.6; older and non-Mastodon servers may not support them.
        },
      }),
    );
  }

  followFeatured(target: Account): void {
    if (this.auth.isAnonymous) {
      const result = this.anonymousFollows.follow(
        target,
        this.publicProfileRef?.server ?? this.anonymous.server(),
      );
      if (result.ok) {
        this.featuredFollowing.update((set) => new Set(set).add(target.id));
        this.followError.set(null);
      } else {
        this.followError.set(result.error);
      }
      return;
    }
    this.api.follow(target.id).subscribe((rel) => {
      if (rel.following || rel.requested) {
        this.featuredFollowing.update((s) => new Set(s).add(target.id));
      }
    });
  }

  /** Follow every featured account the viewer doesn't already follow, one at a time. */
  async followAllFeatured(): Promise<void> {
    if (this.featuredBusy()) {
      return;
    }
    this.featuredBusy.set(true);
    try {
      for (const target of this.featuredToFollow()) {
        if (this.auth.isAnonymous) {
          const result = this.anonymousFollows.follow(target, this.anonymous.server());
          if (!result.ok) {
            this.followError.set(result.error);
            break;
          }
          this.featuredFollowing.update((set) => new Set(set).add(target.id));
          continue;
        }
        try {
          const rel = await firstValueFrom(this.api.follow(target.id));
          if (rel.following || rel.requested) {
            this.featuredFollowing.update((s) => new Set(s).add(target.id));
          }
        } catch {
          // Keep going; one failed follow shouldn't abort the batch.
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    } finally {
      this.featuredBusy.set(false);
    }
  }

  toggleFollow(): void {
    const acc = this.account();
    const rel = this.relationship();
    if (!acc) {
      return;
    }
    this.followError.set(null);
    if (isElizaId(acc.id)) {
      if (rel?.following) {
        this.eliza.unfollow();
      } else {
        this.eliza.follow();
      }
      this.relationship.set(this.eliza.relationship());
      return;
    }
    if (this.auth.isAnonymous) {
      if (rel?.following) {
        this.relationship.set(
          this.anonymousFollows.unfollow(
            acc,
            this.publicProfileRef?.server ?? this.anonymous.server(),
          ),
        );
        return;
      }
      const result = this.anonymousFollows.follow(
        acc,
        this.publicProfileRef?.server ?? this.anonymous.server(),
      );
      this.relationship.set(result.relationship);
      if (!result.ok) {
        this.followError.set(result.error);
      }
      return;
    }
    const call = rel?.following ? this.api.unfollow(acc.id) : this.api.follow(acc.id);
    call.subscribe((updated) => this.relationship.set(updated));
  }

  requestUnfollow(): void {
    this.showUnfollowConfirm.set(true);
  }

  confirmUnfollow(): void {
    this.showUnfollowConfirm.set(false);
    this.toggleFollow();
  }

  requestRemoveFollower(): void {
    this.showRemoveFollowerConfirm.set(true);
  }

  confirmRemoveFollower(): void {
    const acc = this.account();
    if (!acc || !this.capabilities.canManageRelationships) {
      return;
    }
    this.showRemoveFollowerConfirm.set(false);
    this.api.removeFollower(acc.id).subscribe((updated) => this.relationship.set(updated));
  }

  toggleAccountBoosts(): void {
    const acc = this.account();
    const rel = this.relationship();
    if (!acc || !rel?.following || !this.capabilities.canManageRelationships) {
      return;
    }
    const show = rel.showing_reblogs === false;
    this.api
      .follow(acc.id, { reblogs: show })
      .subscribe((updated) => this.relationship.set(updated));
  }

  /** Mute duration presets (seconds; null = until unmuted). */
  protected readonly muteDurations: { label: string; seconds: number | null }[] = [
    { label: 'pages.profile.mute.oneHour', seconds: 3600 },
    { label: 'pages.profile.mute.oneDay', seconds: 86400 },
    { label: 'pages.profile.mute.sevenDays', seconds: 604800 },
    { label: 'pages.profile.mute.forever', seconds: null },
  ];

  /**
   * Whether relationship actions go through the local client-side store instead
   * of the server API: always for Anonymous (no write scope, read-only public
   * API), and for any viewer the server can't manage relationships for.
   */
  protected get useLocalModeration(): boolean {
    // A linked Bluesky session can write real blocks and mutes on its own
    // network, so those do not fall back to the browser-local store.
    if (this.useBlueskyModeration) {
      return false;
    }
    return this.auth.isAnonymous || !this.capabilities.canManageRelationships;
  }

  /** Local block/mute state, re-read through the moderation signal. */
  protected localBlocked = computed(() => {
    this.localMod.entries();
    const acc = this.account();
    return !!acc && this.localMod.isBlocked(acc);
  });
  protected localMuted = computed(() => {
    this.localMod.entries();
    const acc = this.account();
    return !!acc && this.localMod.isMuted(acc);
  });

  /**
   * Whether this account is trusted — the flipside of block and mute.
   *
   * Lives beside them in the ••• menu because it is the same kind of decision
   * ("how should this person's posts reach me?"), just in the opposite
   * direction, and works the same way for anonymous browsing.
   */
  protected isTrusted = computed(() => {
    this.trusted.entries();
    const acc = this.account();
    return !!acc && this.trusted.isTrusted(acc);
  });

  /**
   * Flip trust for this account.
   *
   * No toast: the menu item and the note under it both re-read {@link isTrusted}
   * and flip immediately, and the posts behind the menu visibly un-blur. A
   * transient message would be saying what the page already shows.
   */
  protected toggleTrust(): void {
    const acc = this.account();
    if (acc) {
      this.trusted.toggle(acc);
    }
  }

  /**
   * Server-side moderation on Bluesky, where the account lives.
   *
   * Checked before `useLocalModeration` because a linked Bluesky session *can*
   * write these — a real block that the other account sees — while the local
   * store only hides things in this browser. Without a session it falls through
   * to local moderation, which still works and is the honest option.
   */
  private get useBlueskyModeration(): boolean {
    return this.isBluesky() && this.bskySession.linked();
  }

  /** Merge a one-dimension relationship patch onto what the page already holds. */
  private patchRelationship(patch: Relationship): void {
    this.relationship.update((current) => ({ ...current, ...patch }));
  }

  mute(seconds: number | null): void {
    const acc = this.account();
    if (!acc) {
      return;
    }
    if (this.useBlueskyModeration) {
      // Bluesky mutes have no duration; a timed mute stays local so the "for 5
      // minutes" choice keeps meaning what it says.
      if (seconds !== null) {
        this.localMod.mute(acc, seconds);
        return;
      }
      this.bskyGraph
        .mute(this.bskyDid() ?? '')
        .subscribe({ next: (rel) => this.patchRelationship(rel) });
      return;
    }
    if (this.useLocalModeration) {
      this.localMod.mute(acc, seconds);
      return;
    }
    this.api
      .muteAccount(acc.id, seconds ?? undefined)
      .subscribe((updated) => this.relationship.set(updated));
  }

  unmute(): void {
    const acc = this.account();
    if (!acc) {
      return;
    }
    if (this.useBlueskyModeration) {
      // Clear both: a local timed mute and a server mute can coexist.
      this.localMod.clear(acc);
      this.bskyGraph
        .unmute(this.bskyDid() ?? '')
        .subscribe({ next: (rel) => this.patchRelationship(rel) });
      return;
    }
    if (this.useLocalModeration) {
      this.localMod.clear(acc);
      return;
    }
    this.api.unmuteAccount(acc.id).subscribe((updated) => this.relationship.set(updated));
  }

  toggleBlock(): void {
    const acc = this.account();
    const rel = this.relationship();
    if (!acc) {
      return;
    }
    if (this.useBlueskyModeration) {
      const did = this.bskyDid() ?? '';
      const call = rel?.blocking ? this.bskyGraph.unblock(did) : this.bskyGraph.block(did);
      call.subscribe({
        next: (updated) => this.patchRelationship(updated),
        error: (error: unknown) =>
          this.bskyError.set(
            error instanceof Error ? error.message : 'Could not update the block on Bluesky.',
          ),
      });
      return;
    }
    if (this.useLocalModeration) {
      if (this.localMod.isBlocked(acc)) {
        this.localMod.clear(acc);
      } else {
        this.localMod.block(acc);
      }
      return;
    }
    const call = rel?.blocking ? this.api.unblockAccount(acc.id) : this.api.block(acc.id);
    call.subscribe((updated) => this.relationship.set(updated));
  }

  requestBlock(): void {
    const alreadyBlocked = this.useLocalModeration
      ? this.localBlocked()
      : this.relationship()?.blocking;
    if (alreadyBlocked) {
      this.toggleBlock();
      return;
    }
    this.showBlockConfirm.set(true);
  }

  confirmBlock(): void {
    this.showBlockConfirm.set(false);
    this.toggleBlock();
  }

  onChanged(updated: Status): void {
    this.statuses.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
    this.pinnedStatuses.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
  }

  onDeleted(removed: Status): void {
    this.statuses.update((list) => list.filter((s) => s.id !== removed.id));
    this.pinnedStatuses.update((list) => list.filter((s) => s.id !== removed.id));
  }

  onReported(): void {
    this.showReport.set(false);
    this.reportDone.set(true);
  }
}

/**
 * A minimal `Account` for a Twitter profile we know the handle of but have not yet
 * seen a post from.
 *
 * Used only as a placeholder while the timeline loads, and replaced by the real
 * author object as soon as one post arrives — that one carries live follower
 * counts and the bio, which this cannot. It exists so the page has a name and
 * avatar to render immediately instead of flashing "Account not found".
 */
function twitterPlaceholderAccount(follow: {
  username: string;
  displayName: string;
  avatar?: string;
}): Account {
  return {
    id: `twitter:@${follow.username}`,
    username: follow.username,
    acct: `${follow.username}@x.com`,
    display_name: follow.displayName || follow.username,
    note: '',
    url: `https://x.com/${follow.username}`,
    avatar: follow.avatar ?? '',
    avatar_static: follow.avatar ?? '',
    header: '',
    header_static: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: [],
  };
}

/** The bare minimum needed to fetch a handle nobody follows yet. */
function fallbackFollow(handle: string) {
  return { username: handle, displayName: handle, addedAt: Date.now(), enabled: true };
}
