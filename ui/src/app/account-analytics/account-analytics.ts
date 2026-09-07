import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Observable } from 'rxjs';
import { Api, AccountStatusesOptions } from '../api';
import { AnonymousPublicApi } from '../providers/anonymous/anonymous-public-api';
import { AnonymousPublicRef } from '../providers/anonymous/anonymous-route-ref';
import { HumanTimePipe } from '../human-time.pipe';
import { Account, Status } from '../models';
import { StatusCard } from '../status-card/status-card';
import {
  ActivityBucket,
  CountedItem,
  Heatmap,
  Liveliness,
  computeLiveliness,
  estimateTotalReach,
  hasMonthlyRange,
  hasWeeklyRange,
  monthlyActivity,
  postHeatmap,
  PostLengthRange,
  postLengthRange,
  repliesGiven,
  replyRatio,
  topConversationPartners,
  topHashtags,
  topLinkDomains,
  weekdayHistogram,
  weeklyActivity,
} from '../account-metrics';
import { LANG_NAMES, LangShare, detectLanguageMix, sharePct } from '../language-detect';
import { stripHtml } from '../sentiment';
import { Terminology } from '../terminology';
import { AudienceScan } from '../audience-scan';
import { EffectiveAudienceDialog } from '../effective-audience-dialog/effective-audience-dialog';

/** How many of the account's most recent posts the component analyzes. */
const SAMPLE_SIZE = 100;
/** Mastodon caps account-statuses pages at 40. */
const PAGE_LIMIT = 40;
/** Guard against endless paging on very sparse accounts. */
const MAX_PAGES = 5;
/** Extra pages a user may request via "get more posts", each = one API call. */
const LOAD_MORE_CHOICES = [1, 3, 5, 10] as const;

// i18n accountAnalytics.crunching: Crunching the last 100 posts…
// i18n accountAnalytics.loadError: Couldn't load posts — try again later.
// i18n accountAnalytics.empty: Nothing to analyze yet — no posts found.
// i18n accountAnalytics.basedOnLast: Based on the last {{count}} {{posts}}, boosts excluded.
// i18n accountAnalytics.sampleGoesBack: The sample goes back {{time}}.
// i18n accountAnalytics.reachEstimated: Reach is estimated, not measured — a cheap peek.
// i18n accountAnalytics.getMorePosts.aria: Get more {{posts}}
// i18n accountAnalytics.fetchingMore: Fetching more…
// i18n accountAnalytics.getMorePostsLabel: Get more posts:
// i18n accountAnalytics.fetchPages.one: Fetch {{count}} more page ({{count}} API call)
// i18n accountAnalytics.fetchPages.other: Fetch {{count}} more pages ({{count}} API calls)
// i18n accountAnalytics.postedToday: Posted today.
// i18n accountAnalytics.lastPosted.one: Last posted {{count}} day ago.
// i18n accountAnalytics.lastPosted.other: Last posted {{count}} days ago.
// i18n accountAnalytics.postsInWindow: {{last30}} {{posts}} in the last 30 days, {{last90}} in the last 90.
// i18n accountAnalytics.xOfY: {{x}} of {{y}}
// i18n accountAnalytics.characters: characters
// i18n accountAnalytics.tiles.postsAnalyzed: Posts analyzed
// i18n accountAnalytics.tiles.favourites: Favourites
// i18n accountAnalytics.tiles.boosts: Boosts
// i18n accountAnalytics.tiles.repliesReceived: Replies received
// i18n accountAnalytics.tiles.engagementsPerPost: Engagements per post
// i18n accountAnalytics.tiles.repliesGiven: Replies given
// i18n accountAnalytics.tiles.shortestPost: Shortest post
// i18n accountAnalytics.tiles.longestPost: Longest post
// i18n accountAnalytics.tiles.postsPerDay: Posts per day
// i18n accountAnalytics.tiles.followers: Followers
// i18n accountAnalytics.tiles.following: Following
// i18n accountAnalytics.tiles.estReachTotal: Est. reach (total)
// i18n accountAnalytics.tiles.estReachPerPost: Est. reach / post
// i18n accountAnalytics.tiles.liveliness: Liveliness
// i18n accountAnalytics.tiles.recentPostsPerDay: Recent posts / day
// i18n accountAnalytics.audience.heading: Effective friends &amp; followers
// i18n accountAnalytics.audience.explain: How much of the audience is still posting. Counts marked ~ are estimated from a partial scan.
// i18n accountAnalytics.audience.friends: Friends
// i18n accountAnalytics.audience.effectiveFriends: Effective friends
// i18n accountAnalytics.audience.zombieFriends: Zombie friends
// i18n accountAnalytics.audience.dormant: Dormant
// i18n accountAnalytics.audience.lowCadence: Low-cadence
// i18n accountAnalytics.audience.drizzlers: drizzlers
// i18n accountAnalytics.audience.followers: Followers
// i18n accountAnalytics.audience.effectiveFollowers: Effective followers
// i18n accountAnalytics.audience.zombieFollowers: Zombie followers
// i18n accountAnalytics.audience.scanAgain: Scan again
// i18n accountAnalytics.audience.explainCta: A follower count includes everyone who ever clicked follow. This walks the list and works out how many are still posting — the only thing on this page that costs more than a few requests, so it asks first.
// i18n accountAnalytics.audience.cta: Get effective friends/followers
// i18n accountAnalytics.pctOf: {{pct}}% of {{total}}
// i18n accountAnalytics.zombieRate: {{pct}}% zombie rate
// i18n accountAnalytics.ofScannedRead: of {{scanned}} read
// i18n accountAnalytics.whenTheyPost.heading: When they post
// i18n accountAnalytics.whenTheyPost.explain: Posting activity over time (posting times, not location). Estimated reach in each bucket.
// i18n accountAnalytics.byWeek: By week
// i18n accountAnalytics.byMonth: By month
// i18n accountAnalytics.byWeekday: By day of week
// i18n accountAnalytics.postsPerWeek.aria: {{posts}} per week
// i18n accountAnalytics.postsPerMonth.aria: {{posts}} per month
// i18n accountAnalytics.postsPerWeekday.aria: {{posts}} per weekday
// i18n accountAnalytics.barTitle: {{label}}: {{count}} {{posts}}, ~{{reach}} reach
// i18n accountAnalytics.weekdayBarTitle: {{label}}: {{count}} {{posts}}
// i18n accountAnalytics.languages.heading: Languages
// i18n accountAnalytics.languages.explain: Inferred from the sample's text and each post's declared language — script, accents and common words, not a full model. A rough read.
// i18n accountAnalytics.langTitle: {{lang}} ~{{pct}}%
// i18n accountAnalytics.topFollower.heading: Top follower
// i18n accountAnalytics.topFollower.explain: The follower with the biggest audience of their own.
// i18n accountAnalytics.followersCount: {{count}} followers
// i18n accountAnalytics.talksToMost.heading: Talks to most
// i18n accountAnalytics.talksToMost.explain: Who they reply to most often in the sample — replies to themselves don't count.
// i18n accountAnalytics.replyCount.one: {{count}} reply
// i18n accountAnalytics.replyCount.other: {{count}} replies
// i18n accountAnalytics.topics.heading: What they post about
// i18n accountAnalytics.hashtagsAndLinks: Hashtags and link destinations across the sample, counted once per {{post}}.
// i18n accountAnalytics.topics.topHashtags: Top hashtags
// i18n accountAnalytics.topics.topLinkDomains: Top link domains
// i18n accountAnalytics.topPosts.heading: Top posts
// i18n accountAnalytics.topPosts.empty: No engagement on recent posts yet.
// i18n accountAnalytics.topPosts.explain: Most engaged posts (favourites + boosts + replies).
// i18n accountAnalytics.calendar.heading: Posting calendar
// i18n accountAnalytics.heatmapCaption: One square per day, darker means more posts. Covers only the {{days}} days the sample spans — {{activeDays}} of them had posts. Fetch more posts above to stretch it further back.
// i18n accountAnalytics.dayTitle.one: {{label}}: {{count}} post
// i18n accountAnalytics.dayTitle.other: {{label}}: {{count}} posts
// i18n accountAnalytics.less: Less
// i18n accountAnalytics.more: More
// i18n accountAnalytics.busiestDay: Busiest day: {{count}} {{posts}}
// i18n accountAnalytics.heatmapSummary: Posting calendar: {{count}} posts across {{days}} days, {{activeDays}} of which had posts. Busiest day: {{peak}}.
/**
 * Rudimentary Twitter-style analytics for any account, deliberately cheap:
 * everything is computed from the account's last ~100 posts (3 API calls) plus
 * one page of followers — no history endpoints, no per-day queries, nothing
 * expensive. Boosts of others are excluded from the sample (their engagement
 * isn't ours). The API calls fire in ngOnInit, so mounting this component is
 * what triggers them — keep it behind a lazily-shown tab to stay non-eager.
 */
@Component({
  selector: 'app-account-analytics',
  imports: [RouterLink, StatusCard, HumanTimePipe, EffectiveAudienceDialog, TranslocoPipe],
  templateUrl: './account-analytics.html',
  styleUrl: './account-analytics.css',
})
export class AccountAnalytics implements OnInit {
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;

  private api = inject(Api);
  private anonymousPublic = inject(AnonymousPublicApi);
  private transloco = inject(TranslocoService);

  /** The account to analyze. */
  readonly account = input.required<Account>();
  /** Present when the account is an anonymous public profile (read-only API). */
  readonly publicRef = input<AnonymousPublicRef | null>(null);

  protected loading = signal(true);
  protected error = signal(false);
  /** The analyzed sample: own posts only, newest first. */
  protected posts = signal<Status[]>([]);
  protected followers = signal<Account[]>([]);
  protected followersLoaded = signal(false);

  /** True while a user-requested "load more" batch is in flight. */
  protected loadingMore = signal(false);
  /** False once the account has no older posts left to page. */
  protected hasMore = signal(true);
  /** maxId cursor for the next page beyond the current sample. */
  private cursor: string | undefined;
  /** How many extra pages the "load more" control offers, each one API call. */
  protected readonly loadMoreChoices = LOAD_MORE_CHOICES;

  ngOnInit(): void {
    const acc = this.account();
    const id = this.publicRef()?.id ?? acc.id;
    this.fetchPosts(id, [], undefined, 0);
    this.getFollowers(id).subscribe({
      next: (accounts) => {
        this.followers.set(accounts);
        this.followersLoaded.set(true);
      },
      error: () => this.followersLoaded.set(true),
    });
  }

  private getFollowers(id: string): Observable<Account[]> {
    const ref = this.publicRef();
    return ref
      ? this.anonymousPublic.getAccountFollowers({ ...ref, id })
      : this.api.accountFollowers(id);
  }

  private getStatuses(id: string, opts: AccountStatusesOptions): Observable<Status[]> {
    const ref = this.publicRef();
    return ref
      ? this.anonymousPublic.getAccountStatuses({ ...ref, id }, opts)
      : this.api.getAccountStatuses(id, opts);
  }

  /**
   * Page own statuses (boosts excluded server-side) until the sample is full.
   * The initial load fetches enough pages to reach {@link SAMPLE_SIZE} (an
   * overage on the last page is fine and always has been). Unlike the initial
   * cap, {@link loadMore} lets the user deliberately spend more API calls to
   * widen the window — no {@link SAMPLE_SIZE} truncation there.
   */
  private fetchPosts(id: string, acc: Status[], maxId: string | undefined, page: number): void {
    this.getStatuses(id, { limit: PAGE_LIMIT, maxId, excludeReblogs: true }).subscribe({
      next: (batch) => {
        const all = [...acc, ...batch];
        const exhausted = batch.length < PAGE_LIMIT;
        if (exhausted || all.length >= SAMPLE_SIZE || page + 1 >= MAX_PAGES) {
          this.posts.set(all);
          this.cursor = all.length ? all[all.length - 1].id : undefined;
          this.hasMore.set(!exhausted);
          this.loading.set(false);
        } else {
          this.fetchPosts(id, all, batch[batch.length - 1].id, page + 1);
        }
      },
      error: () => {
        this.posts.set(acc);
        this.loading.set(false);
        this.error.set(acc.length === 0);
      },
    });
  }

  /**
   * Fetch `pages` more pages of older posts on demand — each page is exactly
   * one API call, so the control asks the user how many to spend. Appends to
   * the existing sample; every metric recomputes automatically off `posts()`.
   */
  loadMore(pages: number): void {
    if (this.loadingMore() || !this.hasMore()) {
      return;
    }
    const id = this.publicRef()?.id ?? this.account().id;
    this.loadingMore.set(true);
    this.fetchMore(id, pages, 0);
  }

  private fetchMore(id: string, remaining: number, done: number): void {
    if (remaining <= 0) {
      this.loadingMore.set(false);
      return;
    }
    this.getStatuses(id, {
      limit: PAGE_LIMIT,
      maxId: this.cursor,
      excludeReblogs: true,
    }).subscribe({
      next: (batch) => {
        if (batch.length) {
          this.posts.update((prev) => [...prev, ...batch]);
          this.cursor = batch[batch.length - 1].id;
        }
        if (batch.length < PAGE_LIMIT) {
          this.hasMore.set(false);
          this.loadingMore.set(false);
          return;
        }
        this.fetchMore(id, remaining - 1, done + 1);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  // --- Effective audience (opt-in; the only expensive thing on this page) ---

  /**
   * Live scan state, read straight off the service.
   *
   * The scan outlives this component deliberately — it is a root service, so
   * closing the dialog or leaving the tab doesn't discard minutes of paging, and
   * the tiles below light up from whatever the last scan produced.
   */
  protected audience = inject(AudienceScan);

  /** Whether the opt-in dialog is open. */
  protected audienceDialogOpen = signal(false);

  /**
   * The effective-audience tiles appear only after a scan has produced numbers.
   *
   * Everything else on this page is free, computed from a sample already in
   * memory. These four are the exception: they cost one request per 80 accounts,
   * so they are never fetched on mount — the button is the consent.
   */
  protected audienceResults = computed(() => {
    const state = this.audience.state();
    if (!state) {
      return null;
    }
    const followers = state.results.followers ?? null;
    const following = state.results.following ?? null;
    return followers || following ? { followers, following } : null;
  });

  protected openAudienceDialog(): void {
    this.audienceDialogOpen.set(true);
  }

  protected closeAudienceDialog(): void {
    this.audienceDialogOpen.set(false);
  }

  // --- KPI tiles ---

  protected totalFavourites = computed(() =>
    this.posts().reduce((sum, s) => sum + s.favourites_count, 0),
  );
  protected totalBoosts = computed(() => this.posts().reduce((sum, s) => sum + s.reblogs_count, 0));
  protected totalReplies = computed(() =>
    this.posts().reduce((sum, s) => sum + s.replies_count, 0),
  );

  /** Average engagements (favs + boosts + replies) per analyzed post. */
  protected avgEngagement = computed(() => {
    const n = this.posts().length;
    if (!n) {
      return 0;
    }
    return (
      Math.round(((this.totalFavourites() + this.totalBoosts() + this.totalReplies()) / n) * 10) /
      10
    );
  });

  /** Posts per day across the sample's time span (newest → oldest). */
  protected postsPerDay = computed(() => {
    const posts = this.posts();
    if (posts.length < 2) {
      return posts.length;
    }
    const newest = new Date(posts[0].created_at).getTime();
    const oldest = new Date(posts[posts.length - 1].created_at).getTime();
    const days = Math.max(1, (newest - oldest) / 86_400_000);
    return Math.round((posts.length / days) * 10) / 10;
  });

  /** When the oldest analyzed post was made — names the sample's period. */
  protected oldestPostDate = computed(() => this.posts().at(-1)?.created_at ?? null);

  // --- Conversation and post length ---

  /**
   * How much of the sample is replies to other people, as a percentage.
   *
   * The tile that answers "is anyone actually home?" — a 0% account that posts
   * daily is usually a feed or a cross-poster rather than a person.
   */
  protected replyRatioPct = computed(() => replyRatio(this.posts()));

  /** The raw count behind the ratio, shown as the tile's subtitle. */
  protected repliesGiven = computed(() => repliesGiven(this.posts()));

  /** Shortest and longest original post, in visible characters. */
  protected lengthRange = computed<PostLengthRange | null>(() => postLengthRange(this.posts()));

  // --- Reach (estimated; see account-metrics.ts REACH_MODEL) ---

  /** Total estimated reach across the sample — followers + boost/fav model. */
  protected totalReach = computed(() =>
    estimateTotalReach(this.posts(), this.account().followers_count),
  );

  /** Estimated reach per post. */
  protected reachPerPost = computed(() => {
    const n = this.posts().length;
    return n ? Math.round(this.totalReach() / n) : 0;
  });

  /**
   * Reach trend: newer-half vs older-half average reach, as a percent change.
   * Null when the sample is too small to split meaningfully.
   */
  protected reachTrendPct = computed<number | null>(() => {
    const posts = this.posts();
    if (posts.length < 6) {
      return null;
    }
    const followers = this.account().followers_count;
    const mid = Math.floor(posts.length / 2);
    const newer = posts.slice(0, mid); // newest-first, so this is the recent half
    const older = posts.slice(mid);
    const avg = (list: Status[]) => estimateTotalReach(list, followers) / list.length;
    const olderAvg = avg(older);
    if (olderAvg <= 0) {
      return null;
    }
    return Math.round(((avg(newer) - olderAvg) / olderAvg) * 100);
  });

  // --- Liveliness (recency-weighted, relative to now) ---

  protected liveliness = computed<Liveliness>(() => computeLiveliness(this.posts()));

  // --- Time-window activity ("when they post") ---

  protected weekly = computed<ActivityBucket[]>(() =>
    weeklyActivity(this.posts(), this.account().followers_count),
  );
  protected monthly = computed<ActivityBucket[]>(() =>
    monthlyActivity(this.posts(), this.account().followers_count),
  );
  protected showWeekly = computed(() => hasWeeklyRange(this.posts()));
  protected showMonthly = computed(() => hasMonthlyRange(this.posts()));
  protected weekdays = computed(() => weekdayHistogram(this.posts()));

  /** Max post count in a weekly bucket, for bar scaling. */
  protected weeklyPeak = computed(() => Math.max(1, ...this.weekly().map((b) => b.posts)));
  /** Max post count in a monthly bucket, for bar scaling. */
  protected monthlyPeak = computed(() => Math.max(1, ...this.monthly().map((b) => b.posts)));
  /** Max post count in a weekday bucket, for bar scaling. */
  protected weekdayPeak = computed(() => Math.max(1, ...this.weekdays().map((b) => b.posts)));

  /** CSS class for the liveliness pill. */
  protected livelinessClass = computed(() => 'live-' + this.liveliness().label.toLowerCase());

  // --- Language mix (cheap script/stop-word detector) ---

  /**
   * Estimated language distribution across the sample. Each post contributes its
   * text plus its Mastodon-declared `language` as an authoritative prior.
   */
  protected languages = computed<LangShare[]>(() =>
    detectLanguageMix(this.posts().map((s) => ({ text: stripHtml(s.content), meta: s.language }))),
  );

  langName(code: LangShare['lang']): string {
    return LANG_NAMES[code];
  }
  langPct = sharePct;

  private engagement(s: Status): number {
    return s.favourites_count + s.reblogs_count + s.replies_count;
  }

  /** Top 3 posts by total engagement (ties break toward newer). */
  protected topPosts = computed(() =>
    [...this.posts()]
      .sort((a, b) => this.engagement(b) - this.engagement(a))
      .slice(0, 3)
      .filter((s) => this.engagement(s) > 0),
  );

  /**
   * Who this account replies to most, from the sample.
   *
   * Sits under "Top follower" because the two answer adjacent questions — who
   * listens to them, and who they actually talk back to.
   */
  protected topPartners = computed<CountedItem[]>(() =>
    topConversationPartners(this.posts(), this.publicRef()?.id ?? this.account().id),
  );

  /** Most-used hashtags in the sample. */
  protected topTags = computed<CountedItem[]>(() => topHashtags(this.posts()));

  /** Most-linked domains in the sample. */
  protected topDomains = computed<CountedItem[]>(() => topLinkDomains(this.posts()));

  /** True when there is anything at all to show in the "what they post about" box. */
  protected hasTopicData = computed(
    () => this.topTags().length > 0 || this.topDomains().length > 0,
  );

  /** The follower with the biggest audience of their own. */
  protected topFollower = computed<Account | null>(() => {
    const list = this.followers();
    if (!list.length) {
      return null;
    }
    return list.reduce((best, a) => (a.followers_count > best.followers_count ? a : best));
  });

  // --- Contribution heatmap ---

  /**
   * The "lawn". Covers only the span the sample covers, so a busy account gets
   * a few dense weeks rather than a mostly-empty year — use "get more posts"
   * above to widen it.
   */
  protected heatmap = computed<Heatmap>(() => postHeatmap(this.posts()));

  /** Levels 0–4, for the legend swatches. */
  protected readonly heatLevels = [0, 1, 2, 3, 4];

  /** The grid is decorative per-cell; this sentence is what screen readers get. */
  protected heatmapSummary = computed(() => {
    const map = this.heatmap();
    return this.transloco.translate<string>('accountAnalytics.heatmapSummary', {
      count: this.posts().length,
      days: map.days,
      activeDays: map.activeDays,
      peak: map.peak,
    });
  });

  /** Compact display for tile values: 12,345 → 12.3K. */
  fmt(n: number): string {
    if (n >= 1_000_000) {
      return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (n >= 10_000) {
      return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return n.toLocaleString();
  }
}
