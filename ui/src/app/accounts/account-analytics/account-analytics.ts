import { AccountName } from '../account-name';
import { accountProfilePath } from '../account-route';
import { MbButton } from '../../design-system/button/button';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { map, Observable, of } from 'rxjs';
import { adaptPost } from '../../connections/bluesky/bluesky-adapter';
import { BlueskyApi } from '../../connections/bluesky/bluesky-api';
import { Api, AccountStatusesOptions } from '../../platform/api/api';
import { AnonymousPublicApi } from '../anonymous/anonymous-public-api';
import { AnonymousPublicRef } from '../anonymous/anonymous-route-ref';
import { HumanTimePipe } from '../../i18n/human-time.pipe';
import { Account, Status } from '../../platform/api/models';
import { StatusCard } from '../../posts/status-card/status-card';
import {
  ActivityBucket,
  CountedItem,
  Heatmap,
  Liveliness,
  computeLiveliness,
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
import { LANG_NAMES, LangShare, detectLanguageMix, sharePct } from '../../language/language-detect';
import { stripHtml } from '../../feeds/sentiment';
import { Terminology } from '../../i18n/terminology';
import { AudienceScan } from '../audience-scan';
import { REACH_MODEL, SampleReach, reachByPost, sampleReach } from '../reach-model';
import { BoosterLookup } from '../booster-lookup';
import { Auth } from '../../platform/session/auth';
import { NATIVE_ANALYTICS } from '../../platform/session/platform-login';
import type {
  NativeAudienceHistory,
  NativeEngagerRow,
} from '../../platform/session/native-analytics-types';
import {
  activityMix,
  intervalParts,
  percent,
  postingRhythm,
  postingStyle,
} from '../account-signals';
import {
  audienceDiversity,
  comparePeriods,
  followerMonths,
  monthlyCsv,
  monthlyReport,
  percentChange,
} from '../analytics-history';
import { saveBlob } from '../../posts/media-download/media-download';
import { readerRouteId } from '../../reading/read/reader-route-id';
import { MbHelp } from '../../design-system/help/help';
import { EffectiveAudienceDialog } from '../effective-audience-dialog/effective-audience-dialog';

/** How many of the account's most recent posts the component analyzes. */
const SAMPLE_SIZE = 100;
/** Mastodon caps account-statuses pages at 40. */
const PAGE_LIMIT = 40;
/** Guard against endless paging on very sparse accounts. */
const MAX_PAGES = 5;
/** Most archived posts the native data source reads into one analysis. */
const ARCHIVE_LIMIT = 2000;
/** Extra pages a user may request via "get more posts", each = one API call. */
const LOAD_MORE_CHOICES = [1, 3, 5, 10] as const;

// i18n accountAnalytics.crunching: Crunching the last 100 posts…
// i18n accountAnalytics.loadError: Couldn't load posts.
// i18n accountAnalytics.retry: Retry
// i18n accountAnalytics.why.offline: Your server couldn't be reached — check your connection.
// i18n accountAnalytics.why.signedOut: Your server refused the request; your sign-in may have expired.
// i18n accountAnalytics.why.rateLimited: Your server is limiting how fast it answers. Wait a minute, then retry.
// i18n accountAnalytics.why.status: Your server answered with an error (HTTP {{status}}).
// i18n accountAnalytics.empty: Nothing to analyze yet — no posts found.
// i18n accountAnalytics.basedOnSample: Based on the last {{count}} {{posts}} and {{boosts}} boosts.
// i18n accountAnalytics.sampleGoesBack: The sample goes back {{time}}.
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
// i18n accountAnalytics.tiles.reach: Est. reach
// i18n accountAnalytics.tiles.reachPerThread: Est. reach / thread
// i18n accountAnalytics.tiles.potentialAudience: Could have reached
// i18n accountAnalytics.help.about: About {{stat}}
// i18n accountAnalytics.methodology: How these numbers work
// i18n accountAnalytics.help.reach: People who probably saw these {{count}} threads. Modelled from followers, boosts, quotes, likes and replies with the FediWings method, which was fitted to Instagram story views. Never more than “Could have reached”, never fewer than the people who reacted.
// i18n accountAnalytics.help.reachQuick: Quick estimate: each boost counts as one typical booster with {{audience}} followers. No extra API calls.
// i18n accountAnalytics.help.reachFull: Uses the real boosters' follower counts.
// i18n accountAnalytics.help.reachMixed: Real boosters for {{looked}} of {{boosted}} boosted threads; other boosts count {{audience}} followers each.
// i18n accountAnalytics.help.reachPerThread: Est. reach divided by {{count}} threads. A thread is a post plus the author's own replies under it; replies to other people are not counted. The arrow compares the newer half of the sample with the older half.
// i18n accountAnalytics.help.potentialAudience: The author's followers plus the followers of everyone who boosted, added up per thread. The upper limit for Est. reach; people who follow both are counted twice.
// i18n accountAnalytics.help.countTotal: Sum over the {{count}} posts in the sample, as the server reports it now.
// i18n accountAnalytics.help.engagementsPerPost: Favourites, boosts and replies received, divided by the {{count}} posts in the sample.
// i18n accountAnalytics.help.followers: As reported by the account's server today.
// i18n accountAnalytics.help.postsAnalyzed: The account's own posts in this sample; boosts of other people's posts are left out. Every number below describes this sample.
// i18n accountAnalytics.help.repliesGiven: Share of the account's own posts that reply to someone else. Continuing their own thread does not count.
// i18n accountAnalytics.help.postLength: Visible characters, including any content warning; links and formatting markup are not counted.
// i18n accountAnalytics.help.postsPerDay: Posts in the sample divided by the days between its newest and oldest post.
// i18n accountAnalytics.help.liveliness: 0–100 from how recently and how often they posted or boosted. Falls quickly with silence; 40+ is Active, 10–39 Slowing, under 10 Dormant.
// i18n accountAnalytics.help.recentPostsPerDay: Posts in the last 30 days, divided by 30.
// i18n accountAnalytics.topPosts.analytics: Post analytics
// i18n accountAnalytics.topPosts.reach: Thread: est. reach {{net}}, could have reached {{potential}}
// i18n accountAnalytics.archive.catchingUp: From your archive. Checking the server for new posts and fresh counts…
// i18n accountAnalytics.archive.upToDate: From your archive, up to date. Posts from the last 14 days have fresh counts.
// i18n accountAnalytics.archive.partial: From your archive. Some newer posts are not fetched yet.
// i18n accountAnalytics.archive.rateLimited: From your archive. The server asked to slow down, so counts may be a little behind.
// i18n accountAnalytics.archive.failed: From your archive. The server couldn't be reached; counts are as last seen.
// i18n accountAnalytics.archive.continue: Continue
// i18n accountAnalytics.style.heading: Style and signals
// i18n accountAnalytics.style.explain: How this account posts, from the same sample, boosts included.
// i18n accountAnalytics.style.style: Style
// i18n accountAnalytics.style.name.curator: Curator
// i18n accountAnalytics.style.name.conversationalist: Conversationalist
// i18n accountAnalytics.style.name.linkSharer: Link sharer
// i18n accountAnalytics.style.name.threadWriter: Thread writer
// i18n accountAnalytics.style.name.broadcaster: Broadcaster
// i18n accountAnalytics.style.name.balanced: Balanced
// i18n accountAnalytics.style.tooFew: Too few posts to say
// i18n accountAnalytics.style.help: The first that fits: Curator (boosts are half or more), Conversationalist (replies to others are half or more), Link sharer (half their own posts are mostly a link), Thread writer (30% of their own posts continue a thread), Broadcaster (under 10% replies and under 30% boosts), otherwise Balanced. Needs 20 statuses.
// i18n accountAnalytics.style.own: Own vs boosted
// i18n accountAnalytics.style.ownValue: {{pct}}% own
// i18n accountAnalytics.style.ownSub: {{boosts}} of {{total}} are boosts
// i18n accountAnalytics.style.ownHelp: Their own posts (new posts, thread posts and replies) against boosts of other people's posts, out of everything in the sample.
// i18n accountAnalytics.style.newPosts: New posts
// i18n accountAnalytics.style.threadParts: Thread posts
// i18n accountAnalytics.style.repliesToOthers: Replies to others
// i18n accountAnalytics.style.mixHelp: Share of everything in the sample, boosts included. New posts start something; thread posts continue their own thread; replies answer someone else.
// i18n accountAnalytics.style.linkOnly: Link-only posts
// i18n accountAnalytics.style.linkOnlyHelp: Share of their own posts that are mostly a link: a link or preview card with under 40 characters of their own text.
// i18n accountAnalytics.style.rhythm: Posting rhythm
// i18n accountAnalytics.style.rhythmName.human: Human
// i18n accountAnalytics.style.rhythmName.mixed: Partly scheduled
// i18n accountAnalytics.style.rhythmName.botLike: Bot-like
// i18n accountAnalytics.style.rhythmSub: {{pct}}% on a schedule
// i18n accountAnalytics.style.rhythmEvery: every {{interval}}
// i18n accountAnalytics.style.rhythmHelp: Looks for runs of 4 or more posts with the same gap between them (within 2 minutes or 1%), like a bot or scheduler posting every hour or every 24 hours. Under 10% of posts in runs: Human. 10% to under 60%: Partly scheduled. 60% or more: Bot-like. Thread posts and boosts are left out; gaps under 5 minutes are not a schedule. Needs 8 posts.
// i18n accountAnalytics.style.botSetting: Bot setting
// i18n accountAnalytics.style.botOn: On
// i18n accountAnalytics.style.botOff: Off
// i18n accountAnalytics.style.botHelp: The account's own "This is an automated account" setting. The owner turns it on or off.
// i18n accountAnalytics.style.unit.minutes: {{value}} min
// i18n accountAnalytics.style.unit.hours: {{value}} h
// i18n accountAnalytics.style.unit.days: {{value}} d
// i18n accountAnalytics.people.heading: People who react
// i18n accountAnalytics.people.explain: From your notifications in the last 90 days: favourites, boosts, quotes, replies and mentions. Counted, not estimated.
// i18n accountAnalytics.people.people: People
// i18n accountAnalytics.people.peopleHelp: Different accounts that reacted to you in the last 90 days.
// i18n accountAnalytics.people.reactions: Reactions
// i18n accountAnalytics.people.servers: Servers
// i18n accountAnalytics.people.serversHelp: Different servers those people are on.
// i18n accountAnalytics.people.returning: Returning
// i18n accountAnalytics.people.returningHelp: People who reacted in two or more of the last three calendar months.
// i18n accountAnalytics.people.top5: Top 5 share
// i18n accountAnalytics.people.top5Help: Share of all reactions that came from the five most active people. High means a few regulars; low means reactions are spread out.
// i18n accountAnalytics.people.mostActive: Most active
// i18n accountAnalytics.people.reactionCount: {{count}} reactions
// i18n accountAnalytics.people.empty: No reactions in your notifications from the last 90 days yet.
// i18n accountAnalytics.tiles.boosters: Different boosters
// i18n accountAnalytics.tiles.boostersSub: on {{servers}} servers
// i18n accountAnalytics.help.boosters: Different people among the boosters looked up for these threads, and how many servers they are on.
// i18n accountAnalytics.history.heading: Over time
// i18n accountAnalytics.history.explain: From the archive, grouped by when each thread started.
// i18n accountAnalytics.history.periodsHeading: Last {{days}} days vs the {{days}} before
// i18n accountAnalytics.history.periodsHelp: Sums for the threads started in each window, with the same reach model as above. The percentage compares the two windows.
// i18n accountAnalytics.history.previous: before: {{value}}
// i18n accountAnalytics.history.previousUncovered: The archive starts {{date}}, so the earlier window is only partly covered.
// i18n accountAnalytics.history.metric.reach: Est. reach
// i18n accountAnalytics.history.metric.interactions: Interactions
// i18n accountAnalytics.history.metric.likes: Favourites
// i18n accountAnalytics.history.metric.boosts: Boosts
// i18n accountAnalytics.history.monthsHeading: By month
// i18n accountAnalytics.history.monthsAria: Est. reach per month
// i18n accountAnalytics.history.monthBarTitle: {{month}}: est. reach {{reach}}, {{threads}} threads
// i18n accountAnalytics.history.col.month: Month
// i18n accountAnalytics.history.col.threads: Threads
// i18n accountAnalytics.history.col.reach: Est. reach
// i18n accountAnalytics.history.col.perThread: Per thread
// i18n accountAnalytics.history.col.interactions: Interactions
// i18n accountAnalytics.history.col.followers: Followers
// i18n accountAnalytics.history.col.change: Change
// i18n accountAnalytics.history.col.newFollows: New follows
// i18n accountAnalytics.history.coverage.partial: partly in the archive
// i18n accountAnalytics.history.coverage.none: before the archive
// i18n accountAnalytics.history.csv: Download CSV
// i18n accountAnalytics.history.followersHeading: Followers
// i18n accountAnalytics.history.followersHelp: The follower count is recorded once a day while the app reads your account. New follows come from your follow notifications; servers do not report unfollows.
// i18n accountAnalytics.history.followersIncomplete: Older follow notifications are still being collected, so early months may be low.
// i18n accountAnalytics.history.followersEmpty: Follower history starts today. Check back in a few days.
// i18n accountAnalytics.refine.button.one: Refine reach with real boosters ({{count}} API call)
// i18n accountAnalytics.refine.button.other: Refine reach with real boosters ({{count}} API calls)
// i18n accountAnalytics.refine.explain: Looks up who boosted each post and uses their follower counts. One call per boosted post, most-boosted first.
// i18n accountAnalytics.refine.progress: Looking up boosters… {{finished}} of {{total}}
// i18n accountAnalytics.refine.stop: Stop
// i18n accountAnalytics.refine.rateLimited: The server asked us to slow down. Reach uses the boosters found so far; try the rest later.
// i18n accountAnalytics.tiles.liveliness: Liveliness
// i18n accountAnalytics.tiles.recentPostsPerDay: Recent posts / day
// i18n accountAnalytics.audience.heading: Effective friends & followers
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
  imports: [
    AccountName,
    MbButton,
    MbHelp,
    RouterLink,
    StatusCard,
    HumanTimePipe,
    EffectiveAudienceDialog,
    TranslocoPipe,
  ],
  templateUrl: './account-analytics.html',
  styleUrl: './account-analytics.css',
})
export class AccountAnalytics implements OnInit {
  protected readonly accountProfilePath = accountProfilePath;
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;

  private api = inject(Api);
  private anonymousPublic = inject(AnonymousPublicApi);
  private bluesky = inject(BlueskyApi);
  private transloco = inject(TranslocoService);
  private auth = inject(Auth);
  private native = inject(NATIVE_ANALYTICS);

  /** The account to analyze. */
  readonly account = input.required<Account>();
  /** Present when the account is an anonymous public profile (read-only API). */
  readonly publicRef = input<AnonymousPublicRef | null>(null);
  /**
   * A Bluesky account's DID. Posts then come from Bluesky's public author feed
   * (no sign-in), reposts left out. Bluesky's follower list carries no follower
   * counts and the audience scan walks Mastodon lists, so both are skipped.
   */
  readonly blueskyActor = input<string | null>(null);
  protected readonly isBluesky = computed(() => !!this.blueskyActor());

  protected loading = signal(true);
  protected error = signal(false);
  /** Why the first page failed, as an i18n key and params; shown under the error. */
  protected errorReason = signal<{ key: string; params?: Record<string, unknown> } | null>(null);
  /**
   * Everything fetched, newest first, boosts included. Boosts only feed the
   * activity mix, style and liveliness: their counts belong to someone else.
   */
  protected sample = signal<Status[]>([]);
  /** The account's own posts (boosts left out), newest first. */
  protected posts = computed(() => this.sample().filter((p) => !p.reblog));
  /** Boosts of other people's posts in the sample. */
  protected boostCount = computed(() => this.sample().length - this.posts().length);
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
    this.loadFollowers(id);
    const handle = this.archiveHandle();
    if (handle) {
      this.loadFromArchive(handle, id);
      return;
    }
    this.fetchPosts(id, [], undefined, 0);
  }

  // --- Native: the archive is the sample ---

  /** Where the archive's copy of this account stands; null on web. */
  protected archive = signal<{
    state: 'catchingUp' | 'upToDate' | 'partial' | 'rateLimited' | 'failed';
  } | null>(null);

  /**
   * The native handle when this account's posts can come from the archive:
   * native build, signed-in Mastodon, an account on the home server.
   */
  private archiveHandle(): string | null {
    const handle = this.auth.token();
    return this.native &&
      handle?.startsWith('native-mastodon:') &&
      !this.publicRef() &&
      !this.blueskyActor() &&
      /^\d+$/.test(this.account().id)
      ? handle
      : null;
  }

  /**
   * Show the archived history at once, then catch up (new posts plus a
   * recount of the last 14 days) and show it again. Falls back to the web
   * sampler only when the archive has nothing and the server can't be read.
   */
  private loadFromArchive(handle: string, id: string): void {
    const native = this.native!;
    this.hasMore.set(false);
    this.archive.set({ state: 'catchingUp' });
    // Follower history exists only for the signed-in account itself.
    if (this.auth.account()?.id === id) {
      native.history(handle).then(
        (history) => this.audienceHistory.set(history),
        () => undefined,
      );
      native.engagers(handle, 90).then(
        (rows) => this.engagerRows.set(rows),
        () => undefined,
      );
    }
    const show = () =>
      native.posts(handle, id, ARCHIVE_LIMIT).then((posts) => {
        if (posts.length) {
          this.sample.set(posts);
          this.loading.set(false);
        }
        return posts.length;
      });
    void show()
      .catch(() => 0)
      .then(() => native.catchUp(handle, id))
      .then(
        (report) => {
          this.archive.set({
            state: report.rateLimited ? 'rateLimited' : report.complete ? 'upToDate' : 'partial',
          });
          return show();
        },
        () => {
          this.archive.set({ state: 'failed' });
          return show().catch(() => 0);
        },
      )
      .then((count) => {
        if (count) {
          this.loading.set(false);
          // Full reach is the default here: boosters come from the archive.
          if (this.refineCost() > 0) this.refineReach();
        } else if (this.archive()?.state === 'failed') {
          this.archive.set(null);
          this.fetchPosts(id, [], undefined, 0);
        } else {
          this.loading.set(false);
        }
      });
  }

  // --- Native: history over time ---

  /** Follower history; loaded for the signed-in account only. */
  private audienceHistory = signal<NativeAudienceHistory | null>(null);

  /** When the loaded archive begins: the oldest post on hand. */
  protected archiveStart = computed(() =>
    this.archive() ? (this.posts().at(-1)?.created_at ?? null) : null,
  );

  protected periods = computed(() =>
    this.archive() ? comparePeriods(this.reach(), this.archiveStart()) : null,
  );

  /** The comparison as rows for the template: metric key, now, before, change. */
  protected periodRows = computed(() => {
    const p = this.periods();
    if (!p) return [];
    return (['reach', 'interactions', 'likes', 'boosts'] as const).map((key) => ({
      key,
      now: p.current[key],
      before: p.previous[key],
      trend: trendOf(percentChange(p.previous[key], p.current[key])),
    }));
  });

  protected months = computed(() =>
    this.archive() ? monthlyReport(this.reach(), this.archiveStart()) : [],
  );
  protected monthsPeak = computed(() => Math.max(1, ...this.months().map((m) => m.reach)));

  protected followerHistory = computed(() => {
    const history = this.audienceHistory();
    return history ? followerMonths(history.followers, history.followsByMonth) : null;
  });
  protected followerHistoryComplete = computed(
    () => this.audienceHistory()?.notificationHistoryComplete ?? true,
  );

  protected downloadMonthlyCsv(): void {
    const name = this.account().acct.replace(/[^\w.-]+/g, '_');
    saveBlob(
      new Blob([monthlyCsv(this.months())], { type: 'text/csv;charset=utf-8' }),
      `analytics-${name}-monthly.csv`,
    );
  }

  // --- Style and signals (free: computed from the sample) ---

  protected mix = computed(() => activityMix(this.sample()));
  protected style = computed(() => postingStyle(this.mix()));
  protected ownPct = computed(() => {
    const m = this.mix();
    return percent(m.total - m.boosts, m.total);
  });
  protected readonly percent = percent;

  protected rhythm = computed(() => {
    const rhythm = postingRhythm(this.sample());
    if (!rhythm) return null;
    return { ...rhythm, every: rhythm.interval === null ? null : intervalParts(rhythm.interval) };
  });

  /** Distinct known boosters across the sample, once any were looked up. */
  protected boosterSpread = computed(() => {
    const seen = new Map<string, string>();
    for (const part of this.threadParts()) {
      for (const b of this.boosters.boostersOf(part) ?? []) {
        seen.set(b.id, (b.acct.split('@')[1] ?? '').toLowerCase());
      }
    }
    if (!seen.size) return null;
    return { people: seen.size, servers: new Set(seen.values()).size };
  });

  // --- People who react (native, your own account) ---

  private engagerRows = signal<NativeEngagerRow[] | null>(null);
  protected diversity = computed(() => {
    const rows = this.engagerRows();
    return rows ? audienceDiversity(rows) : null;
  });

  /** Run another catch-up after one stopped early. */
  protected continueCatchUp(): void {
    const handle = this.archiveHandle();
    if (handle) this.loadFromArchive(handle, this.account().id);
  }

  /** Start the post sample over after a failed first load. */
  protected retry(): void {
    const id = this.publicRef()?.id ?? this.account().id;
    this.loading.set(true);
    this.error.set(false);
    this.errorReason.set(null);
    this.fetchPosts(id, [], undefined, 0);
    if (!this.followers().length) this.loadFollowers(id);
  }

  private loadFollowers(id: string): void {
    this.getFollowers(id).subscribe({
      next: (accounts) => {
        this.followers.set(accounts);
        this.followersLoaded.set(true);
      },
      error: () => this.followersLoaded.set(true),
    });
  }

  private getFollowers(id: string): Observable<Account[]> {
    if (this.blueskyActor()) return of([]);
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
  private fetchPosts(id: string, acc: Status[], cursor: string | undefined, page: number): void {
    this.fetchPage(id, cursor).subscribe({
      next: ({ posts, next, done }) => {
        const all = [...acc, ...posts];
        // The sample size counts the account's own posts; boosts ride along.
        const own = all.filter((p) => !p.reblog).length;
        if (done || own >= SAMPLE_SIZE || page + 1 >= this.maxPages()) {
          this.sample.set(all);
          this.cursor = next;
          this.hasMore.set(!done);
          this.loading.set(false);
        } else {
          this.fetchPosts(id, all, next, page + 1);
        }
      },
      error: (err: unknown) => {
        this.sample.set(acc);
        this.loading.set(false);
        this.error.set(acc.length === 0);
        this.errorReason.set(failureReason(err));
      },
    });
  }

  /** Bluesky pages are 20 posts, half a Mastodon page, so it may take twice as many. */
  private maxPages(): number {
    return this.blueskyActor() ? MAX_PAGES * 2 : MAX_PAGES;
  }

  /**
   * One page of the account's own posts, newest first, and where the next one
   * starts. Mastodon pages by the server's own id (see {@link pageCursor});
   * Bluesky by the feed's opaque cursor.
   */
  private fetchPage(id: string, cursor: string | undefined): Observable<PostPage> {
    const did = this.blueskyActor();
    if (did) {
      return this.bluesky.getAuthorFeed(did, cursor ?? null, 'posts_with_replies', true).pipe(
        map((timeline) => ({
          // Own posts, plus reposts as boosts (someone else's words, kept for the mix).
          posts: timeline.feed.flatMap((item) => {
            const reason = item.reason as { $type?: string; indexedAt?: string } | undefined;
            if (reason?.$type?.endsWith('reasonRepost')) {
              const inner = adaptPost(item.post);
              return [
                {
                  ...inner,
                  id: `${inner.id}#repost`,
                  reblog: inner,
                  created_at: reason.indexedAt ?? inner.created_at,
                  account: this.account(),
                  in_reply_to_id: null,
                },
              ];
            }
            return !reason && item.post.author.did === did ? [adaptPost(item.post)] : [];
          }),
          next: timeline.cursor,
          done: !timeline.cursor || timeline.feed.length === 0,
        })),
      );
    }
    return this.getStatuses(id, { limit: PAGE_LIMIT, maxId: cursor }).pipe(
      map((batch) => ({
        posts: batch,
        next: batch.length ? pageCursor(batch[batch.length - 1]) : cursor,
        done: batch.length < PAGE_LIMIT,
      })),
    );
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

  private fetchMore(id: string, remaining: number, fetched: number): void {
    if (remaining <= 0) {
      this.loadingMore.set(false);
      return;
    }
    this.fetchPage(id, this.cursor).subscribe({
      next: ({ posts, next, done }) => {
        if (posts.length) {
          this.sample.update((prev) => [...prev, ...posts]);
        }
        this.cursor = next;
        if (done) {
          this.hasMore.set(false);
          this.loadingMore.set(false);
          return;
        }
        this.fetchMore(id, remaining - 1, fetched + 1);
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

  // --- Reach (a model; see reach-model.ts) ---

  /** The typical booster audience Quick reach assumes, for the (?) text. */
  protected readonly typicalBoosterAudience = REACH_MODEL.typicalBoosterAudience;

  /** Real boosters, looked up only when the person asks (see refineReach). */
  protected boosters = inject(BoosterLookup);

  /** Reach for every thread in the sample; Full where boosters are known. */
  protected reach = computed<SampleReach>(() =>
    sampleReach(this.posts(), this.account().followers_count, this.boosters.boostersOf),
  );

  /** The id `/statuses/:id/analytics` takes for a post in this sample. */
  protected readonly routeIdOf = readerRouteId;

  /** Each thread part's whole-thread reach, for the top-posts list. */
  protected threadReachOf = computed(
    () => new Map(this.reach().threads.flatMap((t) => t.thread.parts.map((p) => [p.id, t]))),
  );

  /** The author's own thread posts: the only ones whose boosters matter. */
  private threadParts = computed(() => this.reach().threads.flatMap((t) => t.thread.parts));

  /** API calls the refine button would spend now; 0 hides it. */
  protected refineCost = computed(() =>
    this.isBluesky() ? 0 : this.boosters.cost(this.threadParts()),
  );

  /** A refine is in flight. (In TS: a template's `run()?.ended` reads null, not undefined.) */
  protected refining = computed(() => this.boosters.run()?.ended === null);

  /** Spend {@link refineCost} calls on `reblogged_by` for the most-boosted posts. */
  protected refineReach(): void {
    this.boosters.refine(this.threadParts(), this.publicRef());
  }

  /** Net reach credited to each thread's first post, for the time buckets. */
  private reachOf = computed(() => {
    const byPost = reachByPost(this.reach());
    return (post: Status) => byPost.get(post.id) ?? 0;
  });

  /** Boosted threads, and how many of them used real boosters. */
  protected boostedThreads = computed(() => {
    const boosted = this.reach().threads.filter((t) => t.thread.boosts > 0);
    return { boosted: boosted.length, looked: boosted.filter((t) => t.method !== 'quick').length };
  });

  /**
   * Reach trend: newer-half vs older-half average net reach per thread, as a
   * percent change. Null when there are too few threads to split.
   */
  protected reachTrendPct = computed<number | null>(() => {
    const threads = this.reach().threads;
    if (threads.length < 6) {
      return null;
    }
    const mid = Math.floor(threads.length / 2);
    const avg = (list: typeof threads) => list.reduce((s, t) => s + t.net, 0) / list.length;
    // Newest-first, so the first half is the recent one.
    const olderAvg = avg(threads.slice(mid));
    if (olderAvg <= 0) {
      return null;
    }
    return Math.round(((avg(threads.slice(0, mid)) - olderAvg) / olderAvg) * 100);
  });

  // --- Liveliness (recency-weighted, relative to now) ---

  /** Boosts count as activity: someone who only boosts is still home. */
  protected liveliness = computed<Liveliness>(() => computeLiveliness(this.sample()));

  // --- Time-window activity ("when they post") ---

  protected weekly = computed<ActivityBucket[]>(() => weeklyActivity(this.posts(), this.reachOf()));
  protected monthly = computed<ActivityBucket[]>(() =>
    monthlyActivity(this.posts(), this.reachOf()),
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

  protected partnerLink(id: string): (string | number)[] | null {
    const mention = this.posts()
      .flatMap((p) => p.mentions ?? [])
      .find((m) => m.id === id);
    return mention ? accountProfilePath(mention) : null;
  }

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

/** A percent change as an arrow label and a direction class; null without a base. */
function trendOf(change: number | null): { text: string; direction: string } | null {
  if (change === null) return null;
  if (change > 0) return { text: `▲ +${change}%`, direction: 'trend up' };
  if (change < 0) return { text: `▼ ${change}%`, direction: 'trend down' };
  return { text: '0%', direction: 'trend' };
}

/** Name the failure, so the reader knows whether retrying can help. */
function failureReason(err: unknown): { key: string; params?: Record<string, unknown> } | null {
  if (!(err instanceof HttpErrorResponse)) return null;
  if (err.status === 0) return { key: 'accountAnalytics.why.offline' };
  if (err.status === 401 || err.status === 403) return { key: 'accountAnalytics.why.signedOut' };
  if (err.status === 429) return { key: 'accountAnalytics.why.rateLimited' };
  return { key: 'accountAnalytics.why.status', params: { status: err.status } };
}

/**
 * The id the server pages by. Posts read anonymously carry a namespaced id
 * (`anonymous-mastodon:<host>:<id>`) so they cannot collide with the home
 * server's; the server only knows its own, which rides in `providerRef`.
 * Sending the namespaced one as `max_id` got an empty page back, and the
 * sample stopped at the first 40 posts.
 */
interface PostPage {
  posts: Status[];
  next: string | undefined;
  /** No older posts to fetch. */
  done: boolean;
}

export function pageCursor(status: Status): string {
  const ref = status.providerRef as { statusId?: unknown } | undefined;
  return typeof ref?.statusId === 'string' ? ref.statusId : status.id;
}
