import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { map, Observable, Subscription } from 'rxjs';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Drafts, draftHasContent, emptyDraftSnapshot } from '../../drafts';
import { ClientPrefs, FEED_MAX_COOLDOWN_MS, HomeWindow } from '../../client-prefs';
import { Status } from '../../models';
import { byNewestFirst } from '../../status-sort';
import { CalmVerdicts } from '../../calm-verdicts';
import { BookmarkPresence } from '../../bookmark-presence';
import { FeedLanguageFilter } from '../../trend-language-filter';
import { CommandBar, FeedView } from '../../command-bar/command-bar';
import { FeedAnalytics } from '../../feed-analytics/feed-analytics';
import { FeedMembers } from '../../feed-members/feed-members';
import { FeedLanguagePicker } from '../../feed-language-picker/feed-language-picker';
import { FeedSource } from '../../feed-sample';
import { Compose } from '../../compose/compose';
import { StatusCard } from '../../status-card/status-card';
import { StatusVisibility } from '../../status-visibility';
import { Announcements } from '../../announcements/announcements';
import { Streaming } from '../../streaming';
import { HomeTimelineFeed } from '../../home-timeline-feed';
import { HomeDiagnostics } from '../../home-diagnostics';
import { FormsModule } from '@angular/forms';
import { FeedAggregator } from '../../providers/feed-aggregator';
import { ProviderRegistry } from '../../providers/provider-registry';
import { Server } from '../../server';
import {
  AnonymousFeedCorpus,
  canonicalStatusKey,
} from '../../providers/anonymous/anonymous-feed-corpus';
import { AnonymousBookmarks } from '../../providers/anonymous/anonymous-bookmarks';
import { AnonymousMastodonProvider } from '../../providers/anonymous/anonymous-mastodon-provider';
import { TwitterProvider } from '../../providers/twitter/twitter-provider';
import { AnonymousHomeFeedCache } from '../../providers/anonymous/anonymous-home-feed-cache';
import { AnonymousFollows } from '../../providers/anonymous/anonymous-follows';
import { AnonymousTags } from '../../providers/anonymous/anonymous-tags';
import { ElizaService } from '../../eliza/eliza.service';
import { isElizaId } from '../../eliza/eliza-identity';
import { LocalPostStore } from '../../eliza/local-post-store';
import { LocalCompose } from '../../eliza/local-compose';
import { PasteFeedSubscriptions } from '../../providers/paste/paste-feed-subscriptions';
import { PinnedServerFeeds } from '../../pinned-server-feeds/pinned-server-feeds';
import { JustMyServer } from '../../just-my-server';
import { Terminology } from '../../terminology';
import { FeatureFlags } from '../../feature-flags';
import { ProfileMediaGrid } from '../profile/media/profile-media-grid';
import { ProfilePhotoView } from '../profile/media/profile-photo-view';
import { buildMediaItems, ProfileMediaItem } from '../profile/media/profile-media-item';
import { PreviewCardComponent } from '../../preview-card/preview-card';
import { ReaderToolbar } from '../../reader-toolbar/reader-toolbar';

/** Below this many follows, nudge toward /find-friends (few follows = empty-feeling feed). */
const FOLLOW_NUDGE_THRESHOLD = 5;
const NUDGE_DISMISSED_KEY = 'mockingbird_follow_nudge_dismissed';
/** How many saved bookmarks one press of "Review bookmarks" appends. */
const BOOKMARK_PAGE_SIZE = 20;

/**
 * How many link cards the Articles view pages toward.
 *
 * Ten fills the view on a normal screen without turning a glance at Articles
 * into a long run of timeline requests. It is a target, not a guarantee: a feed
 * whose posts rarely carry links stops at the feed maximum instead.
 */
const ARTICLE_TARGET = 10;

// i18n pages.home.nudge.title: Your timeline gets better with every follow.
// i18n pages.home.nudge.follow.one: You follow {{count}} account — import a follow list or browse directories to fill your feed.
// i18n pages.home.nudge.follow.other: You follow {{count}} accounts — import a follow list or browse directories to fill your feed.
// i18n pages.home.nudge.cta: Find people
// i18n pages.home.nudge.dismiss: Dismiss
// i18n pages.home.anonPost.ariaLabel: Login or create an account to {{post}} content, reply and more
// i18n pages.home.anonPost.pinned: Pinned
// i18n pages.home.write.button: Write
// i18n pages.home.write.quickPost: Quick post
// i18n pages.home.filters.ariaLabel: Timeline filters
// i18n pages.home.filters.retweets: Retweets
// i18n pages.home.filters.replies: Replies
// i18n pages.home.filters.windowAriaLabel: How far back to load
// i18n pages.home.filters.window.today: Today
// i18n pages.home.filters.window.week: This week
// i18n pages.home.filters.window.all: Everything
// i18n pages.home.filters.calm.title: Calm mode: hide {{posts}} that read as inflammatory — heated wording, quote-dunks, and ratioed {{posts}} (all detected on-device)
// i18n pages.home.filters.calm.label: Calm
// i18n pages.home.articles.ariaLabel: Articles from the loaded feed
// i18n pages.home.articles.empty: No article links in the posts currently loaded.
// i18n pages.home.loading.preparingServer: Preparing Just My Server…
// i18n pages.home.loading.generic: Loading…
// i18n pages.home.empty.lead: Your timeline is empty — you're not following anyone yet.
// i18n pages.home.empty.cta: Find people to follow
// i18n pages.home.allHidden.loaded.one: {{count}} post loaded, and your filters are hiding it.
// i18n pages.home.allHidden.loaded.other: {{count}} posts loaded, and your filters are hiding them all.
// i18n pages.home.allHidden.turnCalmOff: Turn Calm off to see {{count}}.
// i18n pages.home.allHidden.showHidden: Show {{count}} hidden by Boosts/Replies.
// i18n pages.home.allHidden.languagePicker: The language picker at the top of the feed is what is holding them back.
// i18n pages.home.noneVisible.findFriends: Find friends to follow →
// i18n pages.home.feedCap.savedRule: —— some posts you saved for later ——
// i18n pages.home.feedCap.fromBookmarks: From your bookmarks
// i18n pages.home.feedCap.endRule: —— that’s the end of your feed for now ——
// i18n pages.home.feedCap.message: You’ve had enough for now, bub. Take it easy.
// i18n pages.home.feedCap.resetsIn: Resets in ~{{minutes}} min, or on reload.
// i18n pages.home.reviewBookmarks.loading: Loading…
// i18n pages.home.reviewBookmarks.button: Review bookmarks
// i18n pages.home.loadMore.loading: Loading more…
// i18n pages.home.loadMore.button: Load more
// i18n pages.home.windowEnd.everythingFrom: That’s everything from {{window}}. There are older posts.
// i18n pages.home.windowEnd.loadOlder: Load older posts
// i18n pages.home.feedEnd.matchingFilters: That’s everything matching your filters.
// i18n pages.home.feedEnd.showHiddenByFilters: Show {{count}} more already loaded (hidden by Boosts/Replies).
// i18n pages.home.feedEnd.calmLettingThrough: That’s everything Calm mode is letting through.
// i18n pages.home.feedEnd.showHiddenByCalm: Show {{count}} more already loaded (hidden by Calm).
// i18n pages.home.feedEnd.chosenLanguages: That’s everything in your chosen languages.
// i18n pages.home.feedEnd.moreInAnotherLanguage.one: {{count}} more already loaded is in another language — the language picker is at the top of the feed.
// i18n pages.home.feedEnd.moreInAnotherLanguage.other: {{count}} more already loaded are in another language — the language picker is at the top of the feed.
// i18n pages.home.feedEnd.allCaughtUp: You’re all caught up. Were you expecting more?
// i18n pages.home.feedEnd.checkDoctor: Check the Feed Doctor.
// i18n pages.home.warnings.anonymousErrors.link: Review followed sources or retry the public API
// i18n pages.home.twitterUnloaded.summary.one: {{count}} followed Twitter account has nothing saved yet, so it is not in this feed.
// i18n pages.home.twitterUnloaded.summary.other: {{count}} followed Twitter accounts have nothing saved yet, so they are not in this feed.
// i18n pages.home.twitterUnloaded.loadLink.one: Load it on the Twitter connector ({{count}} request)
// i18n pages.home.twitterUnloaded.loadLink.other: Load them on the Twitter connector ({{count}} requests)
// i18n pages.home.warnings.twitterPaused.message: Paused for a few minutes so it stops retrying. Saved tweets are still shown.
// i18n pages.home.warnings.twitterPaused.retry: Try again now
// i18n pages.home.window.lastDay: the last day
// i18n pages.home.window.lastWeek: the last week
// i18n pages.home.feedSource.query: your home timeline
@Component({
  selector: 'app-home',
  imports: [
    FormsModule,
    CommandBar,
    Compose,
    StatusCard,
    Announcements,
    RouterLink,
    LocalCompose,
    FeedAnalytics,
    FeedMembers,
    FeedLanguagePicker,
    ProfileMediaGrid,
    ProfilePhotoView,
    PreviewCardComponent,
    ReaderToolbar,
    PinnedServerFeeds,
    TranslocoPipe,
  ],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit, OnDestroy {
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;

  private transloco = inject(TranslocoService);
  private api = inject(Api);
  protected auth = inject(Auth);
  protected prefs = inject(ClientPrefs);
  private feedLangFilter = inject(FeedLanguageFilter);
  private calm = inject(CalmVerdicts);
  private bookmarkPresence = inject(BookmarkPresence);
  private visibility = inject(StatusVisibility);
  private streaming = inject(Streaming);
  private homeTimelineFeed = inject(HomeTimelineFeed);
  private diagnostics = inject(HomeDiagnostics);
  private aggregator = inject(FeedAggregator);
  protected justMyServer = inject(JustMyServer);

  /**
   * Whether the window actually hid something, so the offer to widen it only
   * appears when there is more to see. A permanent "older posts are hidden"
   * note would be furniture; this is an answer to a question the reader is
   * about to ask when the feed ends sooner than expected.
   */
  protected readonly olderAvailable = computed(
    () =>
      (this.justMyServer.effectiveEnabled()
        ? this.justMyServer.droppedByWindow()
        : this.aggregator.droppedByWindow()) > 0 && this.prefs.homeWindow() !== 'all',
  );

  /** Change how far back Home reaches. Reloads, because the window bounds
   *  what is *fetched* rather than only what is shown. */
  protected setHomeWindow(window: HomeWindow): void {
    if (window === this.prefs.homeWindow()) {
      return;
    }
    this.prefs.setHomeWindow(window);
    this.load(true);
  }

  /** One step wider, from the note under the filter bar. */
  protected widenWindow(): void {
    this.setHomeWindow(this.prefs.homeWindow() === 'today' ? 'week' : 'all');
  }

  /** The current window in words, for the end-of-feed note that names it. */
  protected windowLabel = computed(() =>
    this.transloco.translate<string>(
      this.prefs.homeWindow() === 'today'
        ? 'pages.home.window.lastDay'
        : 'pages.home.window.lastWeek',
    ),
  );
  private registry = inject(ProviderRegistry);
  private server = inject(Server);
  private anonymousCorpus = inject(AnonymousFeedCorpus);
  private anonymousBookmarks = inject(AnonymousBookmarks);
  protected anonymousProvider = inject(AnonymousMastodonProvider);
  protected twitterProvider = inject(TwitterProvider);
  private anonymousHomeCache = inject(AnonymousHomeFeedCache);
  protected anonymousFollows = inject(AnonymousFollows);
  private anonymousTags = inject(AnonymousTags);
  protected eliza = inject(ElizaService);
  protected localPosts = inject(LocalPostStore);
  private route = inject(ActivatedRoute);
  private drafts = inject(Drafts).forCurrentAccount();
  private router = inject(Router);
  private flags = inject(FeatureFlags);
  private pasteFeeds = inject(PasteFeedSubscriptions);

  /** A draft opened from /drafts (?draft=<id>), handed to the composer. */
  protected openedDraft = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => {
        const id = params.get('draft');
        return id ? this.drafts.get(id) : undefined;
      }),
    ),
    { initialValue: undefined },
  );

  /**
   * Whether this page was opened to finish a specific draft.
   *
   * Under thoughtful posting, Home normally shows a Write button instead of a
   * composer — but "Edit for post" routes *here* to do the publishing, and a
   * cycle whose final step is hidden is not a cycle. Arriving with a draft or a
   * pending handoff therefore un-gates the composer: the deliberation already
   * happened, in the gap between saving it and coming back.
   *
   * Latched at construction rather than computed live, because the composer
   * drains the handoff as it seeds — a live read would swap the composer back
   * out from under the user mid-edit.
   */
  protected readonly fromDraft = signal(this.drafts.hasHandoff());

  /**
   * Whether the mini composer is showing right now.
   *
   * Seeded from {@link ClientPrefs.autoShowMiniComposer} and *not* written back
   * to it: clicking "Quick post" opens the box for this visit only. The friction
   * being added is one click per visit, which is small enough to never block a
   * thought and large enough that the box is no longer the thing you land on.
   */
  protected readonly miniComposerOpen = signal(this.prefs.autoShowMiniComposer());

  /**
   * Whether Home offers the mini composer at all.
   *
   * Thoughtful posting wins outright: its whole claim is that nothing publishes
   * straight from a text box, and a button that opens one contradicts that even
   * when the box itself is gated. Under it Home offers only Write.
   */
  protected readonly offersMiniComposer = computed(() => !this.prefs.thoughtfulPosting());

  /**
   * Whether to offer writing at the top of Home at all.
   *
   * Not for an anonymous reader. "Quick post" names an action with no
   * destination — there is no account and nowhere for a post to go — and the
   * target actually waiting behind the composer for them is a pastebin
   * (`compose.ts`, `isAnonymous && featureFlags.enabled('pastebin')`), which is
   * a surprising answer to a button that looked like "post to my followers".
   *
   * Writing while anonymous is real and stays: it means notes to yourself and
   * drafts, and it belongs on the Write screen where the framing can say so.
   * What it does not belong at is the top of a feed, wearing the words used for
   * publishing. The sign-in invitation on the cards below is the honest offer
   * here; a second composer would just be the same over-promise again.
   */
  protected readonly offersWriting = computed(() => !this.auth.isAnonymous);

  /** The full writing workspace is behind a flag; without it, Write goes to /drafts. */
  protected readonly hasWritePage = computed(() => this.flags.enabled('write'));

  protected statuses = signal<Status[]>([]);
  protected loading = signal(true);
  protected live = signal(false);
  /** Home timeline presentation filters, matching the profile-feed controls. */
  protected showBoosts = signal(true);
  protected showReplies = signal(false);
  /** True while auto-loading pages to reach the configured minimum feed size. */
  protected autoLoading = signal(false);

  /**
   * When the feed hit the user's maximum, the wall-clock time it happened.
   * A plain signal (not persisted) so it naturally clears on page reload;
   * the 60-minute cooldown lifts it sooner. Null means "cap not hit".
   */
  private maxHitAt = signal<number | null>(null);
  /**
   * Bookmarks the reader has pulled in, a page at a time, from the button at the
   * end of the feed.
   *
   * This replaces the old "bookmark tail", which appended 40 bookmarks
   * automatically when the feed cap hit. The boss never saw it fire:
   *
   * > "I have never seen the bookmark tail. However it is currently implemented,
   * > it is ineffective."
   *
   * It required the cap *and* the cooldown *and* a non-empty bookmark list to
   * coincide, so it was invisible in normal use and a surprise when it was not.
   * Now it is a button: pressed on purpose, paged like the feed, and never
   * appearing on its own.
   */
  protected bookmarkReview = signal<Status[]>([]);
  /**
   * The review minus bookmarks whose card would render nothing. Each one carries
   * a "🔖 From your bookmarks" label of its own, so a self-suppressing card would
   * strand the label over empty space — see {@link StatusVisibility}.
   */
  protected visibleBookmarkReview = computed(() =>
    this.bookmarkReview().filter((s) => !this.visibility.rendersNothing(s)),
  );
  /** True while a bookmark page is in flight, so the button can say so. */
  protected loadingBookmarks = signal(false);
  /** No more bookmarks to append: the last page came back short. */
  protected bookmarksExhausted = signal(false);
  /** Ticks so `capActive` re-evaluates the cooldown without a user action. */
  private now = signal(Date.now());
  private clock: ReturnType<typeof setInterval> | null = null;

  /** The loaded feed minus providers hidden via the command-bar chips, with
   *  Eliza's timeline folded in when she's followed and the viewer's own local
   *  practice posts (plus Eliza's replies) always folded in. All synthetic posts
   *  bypass the provider chips — they're explicit, local, and opt-in. */
  protected visible = computed(() => {
    const serverOnly = this.justMyServer.effectiveEnabled();
    const feed = serverOnly
      ? this.statuses()
      : this.statuses().filter((s) => this.prefs.isProviderVisible(s.provider ?? 'mastodon'));
    if (serverOnly) return this.applyTimelineFilters(feed);
    const injected: Status[] = [...this.localPosts.posts()];
    if (this.eliza.following()) {
      injected.push(...this.eliza.timeline(this.now()));
    }
    if (!injected.length) return this.applyTimelineFilters(feed);
    // Drop any real feed item colliding with an injected synthetic id.
    const injectedIds = new Set(injected.map((s) => s.id));
    const base = feed.filter((s) => !injectedIds.has(s.id) && !isElizaId(s.id));
    return this.applyTimelineFilters([...injected, ...base].sort(byNewestFirst));
  });

  /** Which view the command bar's Members/Analytics toggles have selected. */
  protected view = signal<FeedView>('feed');

  /** The loaded feed rendered with the same media extraction as profile Media. */
  protected mediaItems = computed(() =>
    buildMediaItems(this.visible().map((status) => status.reblog ?? status)),
  );

  /** Link previews from the loaded feed — Home's counterpart to Algo's link view. */
  protected articles = computed(() =>
    this.visible().flatMap((status) => {
      const original = status.reblog ?? status;
      return original.card?.url ? [{ status: original, card: original.card }] : [];
    }),
  );

  /** Media viewer state is visit-local; Home views are toggles, not routes. */
  protected openPhoto = signal<string | null>(null);

  protected setView(view: FeedView): void {
    this.view.set(view);
    if (view !== 'media') {
      this.openPhoto.set(null);
    }
    if (view === 'articles') {
      this.fillArticles();
    }
  }

  protected openPhotoItem(item: ProfileMediaItem): void {
    this.openPhoto.set(item.key);
  }

  protected navigatePhoto(item: ProfileMediaItem): void {
    this.openPhoto.set(item.key);
  }

  /**
   * Home as a feed source. It is the most synthetic feed in the client — a
   * server timeline merged with foreign providers, local practice posts and
   * Eliza, filtered by the command-bar chips, then re-sorted. No `max_id`
   * reproduces that, so Members and Analytics work off exactly what's on
   * screen: {@link visible}. "Load more" widens them for free.
   */
  protected feedSource = computed<FeedSource>(() => ({
    type: 'home',
    query: this.transloco.translate<string>('pages.home.feedSource.query'),
    posts: this.visible(),
  }));

  protected toggleBoosts(): void {
    this.showBoosts.update((show) => !show);
  }

  protected toggleReplies(): void {
    this.showReplies.update((show) => !show);
  }

  /**
   * How many fetched posts the Boosts/Replies chips are holding back right now.
   * Only these two: Calm and the language filter are deliberate content choices
   * with their own homes, and offering to undo them from the end of the feed
   * would be a different (and pushier) offer than "you have unread posts".
   */
  protected hiddenByFilters = computed(() => {
    if (this.showBoosts() && this.showReplies()) {
      return 0;
    }
    // Counted against the two chips alone, and only for posts the *other*
    // filters would have shown: offering to reveal N posts that Calm or the
    // language filter would still hide would be a promise the click can't keep.
    return this.statuses().filter((status) => {
      const hiddenByChip =
        (!this.showBoosts() && status.reblog !== null) ||
        (!this.showReplies() && status.in_reply_to_id !== null);
      if (!hiddenByChip) {
        return false;
      }
      return (
        !(this.prefs.algoCalm() && this.calm.hidden(status)) &&
        this.feedLangFilter.shouldShow(status)
      );
    }).length;
  });

  /**
   * How many fetched posts Calm mode is holding back right now.
   *
   * Counted for the same reason {@link hiddenByFilters} is counted, and it was
   * the conspicuous omission: Calm can empty a feed silently, and the reader is
   * left concluding their follows went quiet. The boss hit exactly this — "maybe
   * too much got filtered out by calm (that happened to me today)".
   *
   * Measured against posts the *other* filters would have shown, so the number
   * is what turning Calm off would actually reveal rather than a headline the
   * click cannot deliver on.
   */
  protected hiddenByCalm = computed(() => {
    if (!this.prefs.algoCalm()) {
      return 0;
    }
    return this.statuses().filter((status) => {
      if (!this.calm.hidden(status)) {
        return false;
      }
      return (
        (this.showBoosts() || status.reblog === null) &&
        (this.showReplies() || status.in_reply_to_id === null) &&
        this.feedLangFilter.shouldShow(status)
      );
    }).length;
  });

  /**
   * How many fetched posts the language filter is holding back right now.
   *
   * The other silent shortener. A reader who set a language filter months ago
   * and follows people who post in a second language sees a feed that ends
   * early for no stated reason.
   */
  protected hiddenByLanguage = computed(() => {
    return this.statuses().filter((status) => {
      if (this.feedLangFilter.shouldShow(status)) {
        return false;
      }
      return (
        (this.showBoosts() || status.reblog === null) &&
        (this.showReplies() || status.in_reply_to_id === null) &&
        !(this.prefs.algoCalm() && this.calm.hidden(status))
      );
    }).length;
  });

  /**
   * Posts were fetched, and every one of them is filtered out of view.
   *
   * Distinct from an empty feed, and the distinction is the whole point: an
   * empty feed means nobody posted, this means the reader cannot see what did.
   * Rendering "you're not following anyone" over this state blamed follows for
   * a filter's work.
   */
  protected allHiddenByFilters = computed(
    () => this.statuses().length > 0 && this.visible().length === 0,
  );

  /** Stop hiding calm-filtered posts, from the end-of-feed note. */
  protected showCalmHidden(): void {
    this.prefs.setAlgoCalm(false);
  }

  /** Turn both chips back on from the end-of-feed prompt, in one click. */
  protected showEverything(): void {
    this.showBoosts.set(true);
    this.showReplies.set(true);
  }

  protected imagesHidden(): boolean {
    return !this.prefs.showImages() || this.prefs.feedReader();
  }

  /** Reveal images in one click even when Reader mode is what hid them. */
  protected toggleImages(): void {
    if (this.imagesHidden()) {
      this.prefs.setShowImages(true);
      if (this.prefs.feedReader()) this.prefs.setFeedReader(false);
      return;
    }
    this.prefs.setShowImages(false);
  }

  /**
   * The chip/Calm/language filters, applied to a feed.
   *
   * Calm goes through {@link CalmVerdicts} rather than calling `isCalmHidden`
   * directly: its predicate reads engagement counts, so liking a post used to
   * be able to move it in or out of the feed — and everything below it with it.
   */
  private applyTimelineFilters(statuses: Status[]): Status[] {
    return statuses.filter(
      (status) =>
        (this.showBoosts() || status.reblog === null) &&
        (this.showReplies() || status.in_reply_to_id === null) &&
        !(this.prefs.algoCalm() && this.calm.hidden(status)) &&
        this.feedLangFilter.shouldShow(status),
    );
  }

  /**
   * True while the max-feed cap is in force (hit, and within the cooldown).
   *
   * The reading break is a health guard rather than a technical limit, so it is
   * overridable — but only from Settings, never from a button at the end of the
   * feed. Relabelling "Load more" as "you should take a break, load more?" is
   * not friction; walking to Settings is. See `ClientPrefs.ignoreFeedCooldown`.
   */
  protected capActive = computed(() => {
    if (this.prefs.ignoreFeedCooldown()) {
      return false;
    }
    const hit = this.maxHitAt();
    return hit !== null && this.now() - hit < FEED_MAX_COOLDOWN_MS;
  });

  /** Roughly how many minutes remain on the cap, for the message. */
  protected capMinutesLeft = computed(() => {
    const hit = this.maxHitAt();
    if (hit === null) {
      return 0;
    }
    return Math.max(1, Math.ceil((FEED_MAX_COOLDOWN_MS - (this.now() - hit)) / 60000));
  });

  /** Show "Load more" only when there's more AND we're not capped/auto-loading. */
  protected canLoadMore = computed(
    () => this.feedHasMore() && !this.capActive() && !this.autoLoading(),
  );

  /** A persisted on-state waits for list discovery instead of flashing the normal feed. */
  protected waitingForServerList = computed(
    () => this.auth.isAuthenticated && this.justMyServer.enabled() && !this.justMyServer.ready(),
  );

  private nudgeDismissed = signal(localStorage.getItem(NUDGE_DISMISSED_KEY) === 'true');

  protected followingCount = computed(() => this.auth.account()?.following_count ?? 0);

  /**
   * Also excludes Bluesky-primary, not just Anonymous: the count behind this
   * nudge is `account().following_count`, a *Mastodon* figure. The Bluesky
   * identity adapter zeroes its counts on purpose (it does not invent numbers it
   * has not fetched), so a Bluesky-primary account following hundreds of people
   * would be told it follows nobody — and pointed at a Mastodon follow importer
   * it cannot use.
   */
  protected showFollowNudge = computed(
    () =>
      !this.nudgeDismissed() &&
      !this.auth.isAnonymous &&
      !this.auth.isBlueskyPrimary &&
      this.auth.account() !== null &&
      this.followingCount() < FOLLOW_NUDGE_THRESHOLD,
  );

  dismissNudge(): void {
    localStorage.setItem(NUDGE_DISMISSED_KEY, 'true');
    this.nudgeDismissed.set(true);
  }

  private liveSub: Subscription | null = null;
  private pageSub: Subscription | null = null;
  private bookmarkSub: Subscription | null = null;
  private anonymousCacheGeneration = 0;
  private initialized = false;
  private lastHomeSource: 'normal' | 'waiting' | 'server' = 'normal';
  /** The follow/tag set the currently rendered feed was built from. */
  private lastAnonymousSourceKey: string | null = null;

  /** Follow Blue → "Auto-refresh timeline" for as long as this page is open. */
  private readonly liveEffect = effect(() => this.syncLive());
  /** Changing the rail switch swaps Home's source immediately in either direction. */
  private readonly serverModeEffect = effect(() => {
    const source = this.homeSourceState();
    if (!this.initialized) {
      this.lastHomeSource = source;
      return;
    }
    if (source !== this.lastHomeSource) {
      this.lastHomeSource = source;
      this.load();
    }
  });

  /**
   * Reload when an anonymous visitor's follows or tags change underneath us.
   *
   * The case this exists for is the end of the first-run preview. Three accounts
   * are followed so a stranger sees a working timeline instead of a login wall;
   * answering the modal calls `PreviewSeed.clear()`, which unfollows them. That
   * correctly empties storage — but nothing told the rendered feed, so the
   * preview posts stayed on screen and then vanished later at some unrelated
   * navigation. From the visitor's side that is posts disappearing at random,
   * long after the moment that explained them.
   *
   * Reacting to the source set rather than to a preview-specific signal keeps
   * this honest for every other cause too: unfollowing from a profile, removing
   * a tag, or clearing a paste feed all change what Home should be showing.
   *
   * `anonymousSourceKey()` reads signals, so this effect re-runs on its own
   * whenever any of them change.
   */
  private readonly anonymousSourceEffect = effect(() => {
    if (!this.auth.isAnonymous) {
      return;
    }
    const key = this.anonymousSourceKey();
    if (!this.initialized) {
      this.lastAnonymousSourceKey = key;
      return;
    }
    if (key !== this.lastAnonymousSourceKey) {
      this.lastAnonymousSourceKey = key;
      this.load();
    }
  });

  ngOnInit(): void {
    this.diagnostics.info('page:open', {
      mode: this.auth.mode() ?? 'unauthenticated',
      server: this.server.baseUrl() || 'same-origin',
    });
    this.lastHomeSource = this.homeSourceState();
    // Recorded before `initialized`, so the effect below has a baseline to
    // compare against and does not treat the first render as a change.
    this.lastAnonymousSourceKey = this.anonymousSourceKey();
    this.initialized = true;
    this.load();
    // Re-tick every 30s so the cap message / cooldown updates on its own.
    this.clock = setInterval(() => this.now.set(Date.now()), 30000);
  }

  ngOnDestroy(): void {
    this.liveSub?.unsubscribe();
    this.pageSub?.unsubscribe();
    this.bookmarkSub?.unsubscribe();
    if (this.clock) {
      clearInterval(this.clock);
    }
  }

  /**
   * Open or close the stream to match Blue → "Auto-refresh timeline".
   *
   * Driven by the preference rather than a toolbar button: the control moved to
   * Blue, is off by default, and has to be opted into. Anonymous sessions hold no
   * token and have no stream to open, so they stay off whatever the pref says.
   */
  private syncLive(): void {
    // Bluesky-primary excluded too: this opens a *Mastodon* streaming
    // connection, which such an account has no token to authenticate.
    const wanted =
      this.prefs.autoRefreshTimeline() &&
      !this.auth.isAnonymous &&
      !this.auth.isBlueskyPrimary &&
      !this.justMyServer.enabled();
    if (wanted === this.live()) {
      return;
    }
    if (!wanted) {
      this.diagnostics.info('user:live-off', { stored: this.statuses().length });
      this.liveSub?.unsubscribe();
      this.liveSub = null;
      this.live.set(false);
      return;
    }
    this.diagnostics.info('user:live-on', { stored: this.statuses().length });
    this.live.set(true);
    // Going live starts from a fresh snapshot: refetch, then stream deltas on top.
    this.load();
    this.liveSub = this.streaming.open({ stream: 'user' }).subscribe(({ event, payload }) => {
      if (event === 'update') {
        this.mergeStatuses([payload as Status], 'newer');
      } else if (event === 'delete') {
        const id = payload as string;
        this.statuses.update((list) => list.filter((s) => s.id !== id));
      }
    });
  }

  /**
   * Close the Twitter circuit breaker and reload.
   *
   * The breaker exists so the app stops hammering a dead CORS proxy on its own.
   * A person pressing this has information the app does not — they reconnected,
   * or switched proxy — so their asking outranks the cooldown.
   */
  retryTwitter(): void {
    this.diagnostics.info('user:twitter-retry', {
      pausedUntil: this.twitterProvider.pausedUntil(),
    });
    this.twitterProvider.resume();
    this.load(true);
  }

  load(forceRefresh = false): void {
    this.pageSub?.unsubscribe();
    this.autoLoading.set(false);
    this.loading.set(true);
    // A real reload is the one moment Calm should re-judge: a post whose ratio
    // genuinely moved gets recategorised here, and nowhere else. Language
    // detection is cached for the same reason and cleared at the same moment —
    // an edited post is new text under an old id.
    this.calm.reset();
    this.feedLangFilter.reset();
    this.maxHitAt.set(null);
    this.bookmarkReview.set([]);
    this.bookmarksExhausted.set(false);
    this.loadingBookmarks.set(false);
    if (this.waitingForServerList()) {
      this.statuses.set([]);
      return;
    }
    if (this.justMyServer.effectiveEnabled()) {
      this.justMyServer.resetFeed();
    } else {
      this.aggregator.reset();
    }
    this.anonymousCacheGeneration = this.anonymousHomeCache.generation();
    const anonymousSourceKey = this.anonymousSourceKey();
    this.diagnostics.info('load:request', {
      forceRefresh,
      mode: this.auth.mode() ?? 'unauthenticated',
      currentStored: this.statuses().length,
      cache: this.anonymousHomeCache.loadReport,
    });
    if (
      this.auth.isAnonymous &&
      !this.justMyServer.effectiveEnabled() &&
      !forceRefresh &&
      this.anonymousHomeCache.matchesSources(anonymousSourceKey)
    ) {
      const cached = this.anonymousHomeCache.statuses();
      this.diagnostics.info('load:anonymous-cache-hit', {
        stored: cached.length,
        cache: this.anonymousHomeCache.loadReport,
        providerCounts: this.providerCounts(cached),
      });
      this.statuses.set(cached);
      this.publishMastodon(cached);
      this.loading.set(false);
      this.diagnostics.info('load:anonymous-cache-ready', {
        stored: cached.length,
        visible: this.visible().length,
      });
      return;
    }
    this.diagnostics.info('load:start', {
      mode: this.auth.mode() ?? 'unauthenticated',
      server: this.server.baseUrl() || 'same-origin',
      tokenPresent: this.auth.token() !== null,
      mastodonVisible: this.prefs.isProviderVisible('mastodon'),
      hiddenProviders: this.prefs.hiddenProviders(),
      linkedProviders: this.registry.linked().map((provider) => provider.id),
      feedMin: this.prefs.feedMin(),
      feedMax: this.prefs.feedMax(),
    });
    if (this.auth.isAnonymous) {
      if (this.justMyServer.effectiveEnabled()) {
        this.loadAnonymousServerList();
        return;
      }
      this.loadAnonymousStreaming();
      return;
    }
    this.pageSub = this.nextFeedPage().subscribe({
      next: (s) => {
        this.statuses.set(s);
        const details = {
          received: s.length,
          stored: this.statuses().length,
          visible: this.visible().length,
          providerCounts: this.providerCounts(this.statuses()),
          hasMore: this.feedHasMore(),
        };
        if (this.visible().length) {
          this.diagnostics.info('load:first-page-success', details);
        } else {
          this.diagnostics.warn('load:first-page-empty', details);
        }
        this.publishMastodon(s);
        this.loading.set(false);
        // Auto-load further pages until the feed reaches the configured minimum.
        this.fillToMinimum();
      },
      error: (error: unknown) => {
        this.diagnostics.error('load:first-page-error', error, {
          mode: this.auth.mode() ?? 'unauthenticated',
          server: this.server.baseUrl() || 'same-origin',
        });
        this.loading.set(false);
      },
    });
  }

  /** Anonymous server mode is an explicit local list, so it pages without tag/provider mixing. */
  private loadAnonymousServerList(): void {
    this.pageSub = this.justMyServer.nextPage().subscribe({
      next: (statuses) => {
        this.statuses.set(statuses);
        this.publishMastodon(statuses);
        this.loading.set(false);
        this.fillToMinimum();
      },
      error: (error: unknown) => {
        this.diagnostics.error('load:server-list-error', error);
        this.loading.set(false);
      },
    });
  }

  /**
   * Anonymous home spans many slow RSS/API sources. Rather than block on all of
   * them, paint posts as each source lands: every streamed snapshot is shown in
   * arrival order (loading clears on the first one so the page feels alive), and
   * a single newest-first sort runs once the stream completes.
   */
  private loadAnonymousStreaming(): void {
    // The aggregator resets only providers that are currently linked. Removing
    // the final follow or hashtag makes this provider unlinked, so reset it
    // explicitly or its old cursors keep paging posts from the removed source.
    this.anonymousProvider.reset();
    let sawFirst = false;
    this.pageSub = this.anonymousProvider.fetchPageStreaming().subscribe({
      next: (snapshot) => {
        // Snapshots are already deduped and grow monotonically; show as-is
        // (arrival order) mid-stream — the final sort happens on completion.
        this.statuses.set(snapshot);
        this.publishMastodon(snapshot);
        if (!sawFirst) {
          sawFirst = true;
          this.loading.set(false);
        }
        this.diagnostics.info('load:anonymous-stream-snapshot', {
          stored: snapshot.length,
          visible: this.visible().length,
          providerCounts: this.providerCounts(snapshot),
        });
      },
      error: (error: unknown) => {
        this.diagnostics.error('load:first-page-error', error, {
          mode: this.auth.mode() ?? 'unauthenticated',
          server: this.server.baseUrl() || 'same-origin',
        });
        this.loading.set(false);
      },
      complete: () => {
        // Everything's in: sort newest-first once, cache, and top up to the min.
        this.statuses.update((list) => this.dedupeAnonymous(list));
        this.publishMastodon(this.statuses());
        this.cacheAnonymousHome();
        this.loading.set(false);
        this.diagnostics.info('load:anonymous-stream-complete', {
          stored: this.statuses().length,
          visible: this.visible().length,
        });
        this.fillToMinimum();
      },
    });
  }

  /**
   * Keep fetching pages until the feed holds at least `feedMin` items, the
   * timeline is exhausted, or the maximum is hit. Runs one page at a time.
   *
   * Deliberately counts `statuses()` — what was *fetched* — and not `visible()`.
   * Chasing the visible count reads as the more helpful rule, but it makes the
   * filters drive network traffic: with replies hidden, a reply-heavy timeline
   * would burn page after page trying to reach a number it may never reach,
   * auto-loading far past what the reader asked for. Hiding replies is a
   * display choice, not an instruction to go fetch more.
   *
   * A short visible page is handled where it belongs — in the UI, by keeping
   * "Load more" available (see {@link canLoadMore}) so the reader decides.
   */
  private fillToMinimum(): void {
    if (
      this.statuses().length >= this.prefs.feedMin() ||
      this.statuses().length >= this.prefs.feedMax() ||
      !this.feedHasMore()
    ) {
      this.diagnostics.info('autoload:stop', {
        stored: this.statuses().length,
        visible: this.visible().length,
        feedMin: this.prefs.feedMin(),
        feedMax: this.prefs.feedMax(),
        hasMore: this.feedHasMore(),
      });
      this.autoLoading.set(false);
      return;
    }
    this.autoLoading.set(true);
    this.pageSub = this.nextFeedPage().subscribe({
      next: (more) => {
        this.mergeStatuses(more);
        this.diagnostics.info('autoload:page-success', {
          received: more.length,
          stored: this.statuses().length,
          visible: this.visible().length,
        });
        this.publishMastodon(more);
        this.cacheAnonymousHome();
        this.fillToMinimum();
      },
      error: (error: unknown) => {
        this.diagnostics.error('autoload:page-error', error);
        this.autoLoading.set(false);
      },
    });
  }

  /**
   * Keep paging until the Articles view has {@link ARTICLE_TARGET} link cards.
   *
   * The Articles view is a projection: it shows the `card` of every loaded post
   * that has one, and most posts do not. `fillToMinimum` counts *posts*, so a
   * feed that satisfied it perfectly could still leave this view with three
   * entries — which is what made Articles look broken. This counts what the view
   * actually renders instead.
   *
   * Every other stop condition is deliberately shared with `fillToMinimum`:
   * the feed maximum, the cap cooldown, and running out of upstream posts all
   * end the fill. A feed with few link posts therefore stops at `feedMax`
   * rather than paging forever chasing a target it cannot reach, and the
   * "Load more" button below the list lets the reader push past it by hand.
   */
  private fillArticles(): void {
    if (
      this.view() !== 'articles' ||
      this.articles().length >= ARTICLE_TARGET ||
      this.statuses().length >= this.prefs.feedMax() ||
      this.capActive() ||
      !this.feedHasMore()
    ) {
      this.diagnostics.info('articles:autoload-stop', {
        view: this.view(),
        articles: this.articles().length,
        target: ARTICLE_TARGET,
        stored: this.statuses().length,
        feedMax: this.prefs.feedMax(),
        hasMore: this.feedHasMore(),
      });
      this.autoLoading.set(false);
      return;
    }
    this.autoLoading.set(true);
    this.pageSub = this.nextFeedPage().subscribe({
      next: (more) => {
        this.mergeStatuses(more);
        this.diagnostics.info('articles:autoload-page', {
          received: more.length,
          articles: this.articles().length,
        });
        this.publishMastodon(more);
        this.cacheAnonymousHome();
        this.fillArticles();
      },
      error: (error: unknown) => {
        this.diagnostics.error('articles:autoload-error', error);
        this.autoLoading.set(false);
      },
    });
  }

  loadMore(): void {
    // Heading for the end of the feed: decide the bookmark button now, so it is
    // ready rather than appearing late.
    this.askAboutBookmarks();
    this.diagnostics.info('user:load-more', {
      stored: this.statuses().length,
      canLoadMore: this.canLoadMore(),
      capActive: this.capActive(),
    });
    // Enforce the maximum: once the feed is this big, stop and start the
    // cooldown. Paging may overshoot slightly (a partial last page) — fine.
    if (this.statuses().length >= this.prefs.feedMax()) {
      this.maxHitAt.set(Date.now());
      return;
    }
    if (!this.canLoadMore()) {
      return;
    }
    this.autoLoading.set(true);
    this.pageSub = this.nextFeedPage().subscribe({
      next: (more) => {
        this.mergeStatuses(more);
        this.diagnostics.info('load-more:page-success', {
          received: more.length,
          stored: this.statuses().length,
          visible: this.visible().length,
        });
        this.publishMastodon(more);
        this.cacheAnonymousHome();
        this.autoLoading.set(false);
      },
      error: (error: unknown) => {
        this.diagnostics.error('load-more:page-error', error);
        this.autoLoading.set(false);
      },
    });
  }

  /**
   * Apply one identity, ordering, and size policy to every accumulated-feed
   * insertion: older pages, live updates, and locally created posts.
   *
   * `feedMax` used to be consulted only as "should I fetch another page?", which
   * a single oversized page walks straight past: one RSS feed returned 15,291
   * items at once, and Home stored 15,411 posts against a configured maximum of
   * 500, then tried to render them all. Paging had already stopped, correctly and
   * uselessly, *after* accepting them.
   *
   * A setting called "maximum feed size" should be a property of the feed, not a
   * hint to the loader, so the trim happens here where the feed is assembled.
   * Posts are sorted newest-first before the cut, so what survives is the newest
   * — and the tail that gets dropped is what the reader was least likely to reach.
   */
  private mergeStatuses(more: Status[], placement: 'newer' | 'older' = 'older'): void {
    this.statuses.update((statuses) => {
      // Stable sorting makes placement meaningful for statuses with equal or
      // unreadable timestamps: live/local arrivals go before the held feed,
      // while an older page stays after it. All three insertion paths still
      // share the exact same identity, ordering, and size rules below.
      const candidates = placement === 'newer' ? [...more, ...statuses] : [...statuses, ...more];
      const merged = this.auth.isAnonymous
        ? this.dedupeAnonymous(candidates)
        : this.dedupeExact(candidates).sort(byNewestFirst);
      const max = this.prefs.feedMax();
      if (merged.length <= max) {
        return merged;
      }
      this.diagnostics.warn('feed:trimmed-to-max', {
        held: merged.length,
        feedMax: max,
        dropped: merged.length - max,
      });
      return merged.slice(0, max);
    });
  }

  /** Remove the inclusive boundary item some timeline sources repeat on page N+1. */
  private dedupeExact(statuses: Status[]): Status[] {
    const seen = new Set<string>();
    return statuses.filter((status) => {
      const key = `${status.provider ?? 'mastodon'}:${status.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private feedHasMore(): boolean {
    return this.justMyServer.effectiveEnabled()
      ? this.justMyServer.hasMore()
      : this.aggregator.hasMore();
  }

  private homeSourceState(): 'normal' | 'waiting' | 'server' {
    if (!this.justMyServer.enabled()) return 'normal';
    return this.justMyServer.ready() ? 'server' : 'waiting';
  }

  private nextFeedPage(): Observable<Status[]> {
    return this.justMyServer.effectiveEnabled()
      ? this.justMyServer.nextPage()
      : this.aggregator.nextPage();
  }

  /** Collapse duplicate public posts acquired through different Anonymous read routes. */
  private dedupeAnonymous(statuses: Status[]): Status[] {
    const newestFirst = statuses.sort(byNewestFirst);
    const seen = new Set<string>();
    return newestFirst.filter((status) => {
      const key = canonicalStatusKey(status);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private providerCounts(statuses: Status[]): Record<string, number> {
    return statuses.reduce<Record<string, number>>((counts, status) => {
      const provider = status.provider ?? 'mastodon';
      counts[provider] = (counts[provider] ?? 0) + 1;
      return counts;
    }, {});
  }

  /**
   * Whether to offer the "Review bookmarks" button.
   *
   * Three conditions, all of them about not showing a button that would do
   * nothing: the reader has bookmarks ({@link BookmarkPresence} answers this
   * with at most one request a day), there are more to fetch, and Home is not
   * in server-only mode — where bookmarks from other servers would contradict
   * the one thing that mode promises.
   */
  protected canReviewBookmarks = computed(
    () =>
      this.bookmarkPresence.has() === true &&
      !this.bookmarksExhausted() &&
      !this.justMyServer.effectiveEnabled(),
  );

  /**
   * Ask whether there are bookmarks, at the moment the answer is first needed.
   *
   * Deliberately **not** on feed load. The button lives at the end of the feed
   * and most sessions never reach it, so probing on load would spend a request
   * per session answering a question most readers never ask — the opposite of
   * the constraint this feature was given:
   *
   * > "we don't want to do dozens of bookmark calls a day to constantly reaffirm
   * > that there is at least 1."
   *
   * Called from {@link loadMore}: pressing "Load more" is the first evidence
   * that this reader is heading for the end of the feed. The answer lands well
   * before they get there, and a session that never presses it costs nothing.
   * Repeat calls are free — {@link BookmarkPresence} caches a yes forever and a
   * no for a day.
   */
  private askAboutBookmarks(): void {
    if (this.justMyServer.effectiveEnabled()) {
      return;
    }
    this.bookmarkPresence.check();
  }

  /**
   * Append the next page of saved bookmarks.
   *
   * Paged by the id of the last one held, matching how `/bookmarks` is walked on
   * its own page: `/api/v1/bookmarks` returns statuses, and a short page is what
   * ends the walk. Alternating this with "Load more" is the point — the two
   * buttons sit side by side and each one re-renders both, so the reader can
   * take a page of feed, a page of bookmarks, and another page of feed.
   */
  protected reviewBookmarks(): void {
    if (this.loadingBookmarks() || this.bookmarksExhausted()) {
      return;
    }
    const held = this.bookmarkReview();
    if (this.auth.isAnonymous) {
      // Local rows: no request, and the slice itself is the paging.
      const all = this.anonymousBookmarks.bookmarks();
      const next = all.slice(held.length, held.length + BOOKMARK_PAGE_SIZE);
      this.bookmarkReview.update((list) => [...list, ...next]);
      this.bookmarksExhausted.set(held.length + next.length >= all.length);
      return;
    }
    this.loadingBookmarks.set(true);
    this.bookmarkSub = this.api.bookmarks(held.at(-1)?.id, BOOKMARK_PAGE_SIZE).subscribe({
      next: (marks) => {
        this.loadingBookmarks.set(false);
        // Dedupe against what is already held: a repeated boundary item would
        // otherwise render twice under its own "from your bookmarks" label.
        const seen = new Set(held.map((s) => s.id));
        const fresh = marks.filter((s) => !seen.has(s.id));
        this.bookmarkReview.update((list) => [...list, ...fresh]);
        // Short page, or a page that added nothing new, is the end.
        this.bookmarksExhausted.set(marks.length < BOOKMARK_PAGE_SIZE || !fresh.length);
      },
      error: (error: unknown) => {
        this.loadingBookmarks.set(false);
        this.diagnostics.error('bookmarks:page-error', error);
        // Stop offering a button that just failed rather than inviting a retry
        // loop; a reload re-arms it.
        this.bookmarksExhausted.set(true);
      },
    });
  }

  onBookmarkChanged(original: Status, updated: Status): void {
    this.bookmarkReview.update((list) => list.map((s) => (s === original ? updated : s)));
  }

  onBookmarkDeleted(removed: Status): void {
    this.bookmarkReview.update((list) => list.filter((s) => s.id !== removed.id));
  }

  /** Timeline-derived widgets (who-to-follow) only understand Mastodon posts. */
  private publishMastodon(statuses: Status[]): void {
    if (this.auth.isAnonymous) {
      this.anonymousCorpus.ingest(statuses);
    }
    this.homeTimelineFeed.publish(
      statuses.filter((status) => !status.provider || status.provider === 'anonymous-mastodon'),
    );
  }

  private cacheAnonymousHome(): void {
    if (this.auth.isAnonymous) {
      this.anonymousHomeCache.store(
        this.statuses(),
        this.anonymousSourceKey(),
        this.anonymousCacheGeneration,
      );
    }
  }

  /**
   * True when an anonymous visitor has chosen nothing at all.
   *
   * Drives hiding the filter bar. Every control in it — retweets, replies, calm
   * mode, images, the date window, the language picker — narrows a feed, and
   * narrowing nothing is nothing. On a first run that bar is a row of six
   * controls above an empty column, none of which can do anything, and the one
   * thing the visitor actually needs is a single link to go find someone.
   *
   * Deliberately anonymous-only. A signed-in account with a quiet timeline still
   * has real follows, and its filters still mean something the moment a post
   * arrives; hiding them there would be hiding working controls over a temporary
   * emptiness.
   *
   * Checks the same three sources as {@link anonymousSourceKey}, plus Eliza —
   * she is browser-local and so never appears in that key, but following her
   * fills the timeline with her posts, and an empty state above a feed full of
   * posts would be plainly wrong.
   */
  protected readonly nothingFollowed = computed(
    () =>
      this.auth.isAnonymous &&
      this.anonymousFollows.follows().length === 0 &&
      this.anonymousTags.tags().length === 0 &&
      this.pasteFeeds.enabledFeeds().length === 0 &&
      !this.eliza.following(),
  );

  private anonymousSourceKey(): string {
    const pasteFeeds = this.pasteFeeds
      .enabledFeeds()
      .map((feed) => feed.providerId)
      .sort();
    return JSON.stringify({
      follows: this.anonymousFollows
        .follows()
        .map((follow) => follow.key)
        .sort(),
      tags: [...this.anonymousTags.tags()].sort(),
      ...(pasteFeeds.length ? { pasteFeeds } : {}),
    });
  }

  /**
   * Open the mini composer for this visit. Deliberately does not persist —
   * see {@link miniComposerOpen}.
   */
  protected openMiniComposer(): void {
    this.miniComposerOpen.set(true);
  }

  /**
   * Leave for the writing workspace, on a draft that is ready to type into.
   *
   * Reuses the newest empty draft rather than always starting a new one, so
   * clicking Write twice does not leave a blank row behind on /drafts. "Empty"
   * is {@link draftHasContent}'s definition — the same one the composer uses to
   * decide a draft is worth saving — so a draft holding only a content warning
   * still counts as yours and is left alone.
   */
  protected writingError = signal(false);

  protected startWriting(): void {
    this.writingError.set(false);
    if (!this.hasWritePage()) {
      void this.router.navigate(['/drafts'], { queryParams: { write: 1 } });
      return;
    }
    const resumable = this.drafts.drafts().find((d) => !draftHasContent(d));
    const saved = resumable
      ? null
      : this.drafts.save(emptyDraftSnapshot(this.prefs.defaultVisibility()));
    if (saved && !saved.durable) {
      this.writingError.set(true);
      return;
    }
    const id = resumable?.id ?? saved!.id;
    void this.router.navigate(['/write'], { queryParams: { draft: id } });
  }

  onPosted(status: Status): void {
    this.mergeStatuses([status], 'newer');
    // Publishing ends the visit's reason for the box being open: it collapses
    // back to the buttons, so the next post is another deliberate choice.
    if (!this.prefs.autoShowMiniComposer()) {
      this.miniComposerOpen.set(false);
    }
  }

  /** A local practice post was made: it (and Eliza's reply) live in the store,
   *  which `visible()` reads reactively — nothing to splice into the real feed. */
  onLocalPosted(): void {
    // No-op beyond letting the signal-driven feed recompute; kept as a seam for
    // future behaviour (e.g. scroll-to-post).
  }

  onChanged(original: Status, updated: Status): void {
    this.statuses.update((list) => list.map((s) => (s === original ? updated : s)));
  }

  onDeleted(removed: Status): void {
    this.statuses.update((list) => list.filter((s) => s.id !== removed.id));
  }
}
