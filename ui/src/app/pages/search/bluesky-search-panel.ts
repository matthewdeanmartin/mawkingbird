import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, map, merge, of, toArray } from 'rxjs';
import { Status } from '../../models';
import { StatusCard } from '../../status-card/status-card';
import { PageDiagnostics } from '../../page-diagnostics';
import { BlueskySearch } from '../../providers/bluesky/bluesky-search';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import {
  BlueskyPostSearch,
  describeBlueskyFilters,
  emptyBlueskyPostSearch,
  hasBlueskyFilters,
  parseTags,
} from '../../providers/bluesky/bluesky-post-search';
import {
  filterLoaded,
  buildFacets,
  statusMatchesFacet,
  excludeAuthors,
  collapsedCount,
  groupResults,
  // Aliased: this component exposes a `collapseRepeats` *signal* of its own,
  // the same way the Mastodon panel does.
  collapseRepeats as collapseRepeatRuns,
  CollapsedStatus,
  Facet,
  FacetKind,
} from './search-refine';
import {
  accountMeetsBounds,
  blueskyAccountMatchesFacet,
  blueskyPostMatchesFacet,
  BlueskyAccountBounds,
  BlueskyAccountFacetKind,
  BlueskyEngagementBounds,
  BlueskyPostFacetKind,
  buildBlueskyAccountFacets,
  buildBlueskyPostFacets,
  statusMeetsEngagement,
} from './bluesky-refine';
import { ResultGrouping } from './mawkingbird-search';
import { LocalModeration } from '../../local-moderation';
import { parseBlueskyQuery, serializeBlueskyQuery } from './bluesky-query-serializer';
import {
  sortAccounts,
  sortStatuses,
  ACCOUNT_SORTS,
  AccountSortKey,
  STATUS_SORTS,
  StatusSortKey,
} from './search-sort';
import { AccountResultCard } from './account-result-card';
import { AccountWithMatches } from './account-refine';
import { Account, Relationship } from '../../models';
import {
  BlueskyAccountResult,
  BlueskyAccountSearch,
} from '../../providers/bluesky/bluesky-account-search';
import { BlueskyApi } from '../../providers/bluesky/bluesky-api';
import { BlueskyGraph } from '../../providers/bluesky/bluesky-graph';
import {
  ANONYMOUS_FOLLOW_LIMIT,
  AnonymousFollows,
} from '../../providers/anonymous/anonymous-follows';
import { Auth } from '../../auth';
import { Terminology } from '../../terminology';

// i18n pages.search.bluesky.maximumApiCalls: Maximum API calls
// i18n pages.search.bluesky.budget: {{count}} page (~{{items}})
// i18n pages.search.bluesky.advancedPostsDescription: These are Bluesky's own filters. There is deliberately no media/reply/sensitive filter — <code>searchPosts</code> has no such parameter, and offering one would mean silently ignoring it. Everything here can also be typed straight into the search box.
// i18n pages.search.bluesky.postedBy: Posted by
// i18n pages.search.bluesky.mentioning: Mentioning
// i18n pages.search.bluesky.hashtags: Hashtags
// i18n pages.search.bluesky.handlePlaceholder: handle.bsky.social
// i18n pages.search.bluesky.hashtagPlaceholder: angular typescript
// i18n pages.search.bluesky.domainPlaceholder: github.com
// i18n pages.search.bluesky.urlPlaceholder: https://example.com/post
// i18n pages.search.bluesky.postsWithAllTags: Posts with <em>all</em> of these tags.
// i18n pages.search.bluesky.linksToDomain: Links to domain
// i18n pages.search.bluesky.linksToUrl: Links to URL
// i18n pages.search.bluesky.postedAfter: Posted after
// i18n pages.search.bluesky.postedBefore: Posted before
// i18n pages.search.bluesky.language: Language
// i18n pages.search.bluesky.ranking: Ranking
// i18n pages.search.bluesky.latest: Latest
// i18n pages.search.bluesky.top: Top
// i18n pages.search.bluesky.minimumEngagement: Minimum engagement
// i18n pages.search.bluesky.loadedPostsNoNewSearch: Filters loaded {{postType}} — no new search
// i18n pages.search.bluesky.likes: Likes
// i18n pages.search.bluesky.minimumLikes: Minimum likes
// i18n pages.search.bluesky.reposts: Reposts
// i18n pages.search.bluesky.minimumBoosts: Minimum {{boostType}}
// i18n pages.search.bluesky.replies: Replies
// i18n pages.search.bluesky.minimumReplies: Minimum replies
// i18n pages.search.bluesky.any: any
// i18n pages.search.bluesky.applyAndSearch: Apply &amp; search
// i18n pages.search.bluesky.clear: Clear
// i18n pages.search.bluesky.advancedAccountsDescription: Bluesky's account search takes no parameters beyond the words themselves, so these gates filter the people it already found rather than changing the search.
// i18n pages.search.bluesky.followers: Followers
// i18n pages.search.bluesky.following: Following
// i18n pages.search.bluesky.posts: Posts
// i18n pages.search.bluesky.minimumFollowers: Minimum followers
// i18n pages.search.bluesky.maximumFollowers: Maximum followers
// i18n pages.search.bluesky.minimumFollowing: Minimum following
// i18n pages.search.bluesky.maximumFollowing: Maximum following
// i18n pages.search.bluesky.minimumPosts: Minimum {{postType}}
// i18n pages.search.bluesky.maximumPosts: Maximum {{postType}}
// i18n pages.search.bluesky.min: min
// i18n pages.search.bluesky.max: max
// i18n pages.search.bluesky.sentToBluesky: Sent to Bluesky — changing this needs a new search
// i18n pages.search.bluesky.filterThesePeople: Filter these people
// i18n pages.search.bluesky.filterTheseResults: Filter these results
// i18n pages.search.bluesky.filterLoadedResults: Filter loaded results
// i18n pages.search.bluesky.sort: Sort
// i18n pages.search.bluesky.sortPeople: Sort people
// i18n pages.search.bluesky.sortPosts: Sort {{postType}}
// i18n pages.search.bluesky.groupBy: Group by
// i18n pages.search.bluesky.none: None
// i18n pages.search.bluesky.author: Author
// i18n pages.search.bluesky.date: Date
// i18n pages.search.bluesky.refineLoadedResults: Refine loaded results
// i18n pages.search.bluesky.basedOnLoadedPosts: Based on {{count}} loaded {{postType}}
// i18n pages.search.bluesky.basedOnLoadedAccounts: Based on {{count}} loaded accounts
// i18n pages.search.bluesky.excludeAuthor: Exclude author (this search)
// i18n pages.search.bluesky.muted: muted
// i18n pages.search.bluesky.muteEverywhereTitle: Mute this account everywhere, not just in this search
// i18n pages.search.bluesky.muteEverywhere: Mute everywhere
// i18n pages.search.bluesky.showExcludedAuthors: Show excluded authors again
// i18n pages.search.bluesky.collapseRepeated: Collapse repeated {{postType}}
// i18n pages.search.bluesky.collapseNote: Folds near-identical {{postType}} from the same author into one row.
// i18n pages.search.bluesky.blueskyOnly: Bluesky only
// i18n pages.search.bluesky.lastActive: Last active
// i18n pages.search.bluesky.activityNote: Bluesky profiles don't include a last-post date. Checking costs one API call per account.
// i18n pages.search.bluesky.checkActivity: Check activity for {{count}} {{accountWord}}
// i18n pages.search.bluesky.account: account
// i18n pages.search.bluesky.accounts: accounts
// i18n pages.search.bluesky.checkingActivity: Checking activity…
// i18n pages.search.bluesky.clearFilters: Clear filters
// i18n pages.search.bluesky.showingAccounts: Showing {{visible}} of {{loaded}} loaded accounts
// i18n pages.search.bluesky.showingPosts: Showing {{visible}} of {{loaded}} loaded {{postType}}
// i18n pages.search.bluesky.hiddenExcludedAccounts: {{hidden}} hidden from {{excluded}} excluded {{accountWord}}
// i18n pages.search.bluesky.collapsedRepeats: {{count}} near-identical {{postType}} collapsed
// i18n pages.search.bluesky.aboutMatches: about {{count}} matches on Bluesky
// i18n pages.search.bluesky.apiCallsUsed: {{used}} of up to {{maximum}} API calls used
// i18n pages.search.bluesky.moreActivityCalls: {{count}} more for the activity check
// i18n pages.search.bluesky.searching: Searching Bluesky…
// i18n pages.search.bluesky.searchingTitle: Searching Bluesky
// i18n pages.search.bluesky.accountSearchIntro: Matches handles, display names and bios. Works without a linked account.
// i18n pages.search.bluesky.postSearchIntro: Type words to match, or use Bluesky's operators: <code>from:handle</code>, <code>mentions:handle</code>, <code>#tag</code>, <code>lang:en</code>, <code>domain:github.com</code>, <code>since:2026-01-01</code>, <code>until:2026-07-01</code>. Press <strong>Syntax?</strong> above for the full list, or fill in <strong>Advanced</strong> and the box will show you the query it built.
// i18n pages.search.bluesky.noAccountsMatched: No Bluesky accounts matched that search.
// i18n pages.search.bluesky.noPostsMatched: No Bluesky {{postType}} matched that search.
// i18n pages.search.bluesky.people: People
// i18n pages.search.bluesky.followUnavailable: Searching without a linked account: follow state is not available.
// i18n pages.search.bluesky.anonymousFollowing: Following saves to this browser and feeds your Home timeline — no Bluesky account needed.
// i18n pages.search.bluesky.noLoadedPeople: No loaded people match the current filters.
// i18n pages.search.bluesky.loading: Loading…
// i18n pages.search.bluesky.loadMore: Load more
// i18n pages.search.bluesky.loadedAccounts: Loaded {{count}} accounts in {{calls}} API calls.
// i18n pages.search.bluesky.repeatNote: +{{count}} near-identical {{postType}} from this author
// i18n pages.search.bluesky.hide: Hide
// i18n pages.search.bluesky.show: Show
// i18n pages.search.bluesky.noLoadedPosts: No loaded {{postType}} match the current filters.
// i18n pages.search.bluesky.loadedPosts: Loaded {{count}} {{postType}} in {{calls}} API calls. Facet counts and filters apply only to these {{postType}}.
// i18n pages.search.bluesky.stoppedAfter: Stopped after {{calls}} API calls. Run the search again to load more.
// i18n pages.search.bluesky.followUpdateFailed: Could not update the follow on Bluesky.
// i18n pages.search.bluesky.activityCheckFailed: Could not check activity. Try again.
// i18n pages.search.bluesky.searchFailed: Bluesky search failed.
// i18n pages.search.bluesky.anonymousFollowLimit: Anonymous accounts can follow up to {{limit}} accounts.
// i18n pages.search.bluesky.sortRelevance: Relevance
// i18n pages.search.bluesky.sortNewest: Newest
// i18n pages.search.bluesky.sortOldest: Oldest
// i18n pages.search.sort.mostLiked: Most liked
// i18n pages.search.sort.mostReposted: Most reposted
// i18n pages.search.bluesky.sortMostReplies: Most replies
// i18n pages.search.bluesky.sortMostFollowers: Most followers
// i18n pages.search.bluesky.sortMostFollowing: Most following
// i18n pages.search.bluesky.sortMostPosts: Most posts
// i18n pages.search.bluesky.sortName: Name (A–Z)
// i18n pages.search.bluesky.sortMostMatching: Most matching posts
// i18n pages.search.bluesky.sortRecentlyActive: Recently active

/**
 * Which Bluesky index the panel is querying.
 *
 * Spelled with the Mastodon side's vocabulary (`statuses`, not `posts`) because
 * it is now driven by the *same* type select — one signal on the page feeds both
 * networks, and translating at this boundary is cheaper than teaching the page
 * two words for one idea.
 */
export type BlueskySearchTarget = 'statuses' | 'accounts';

/** Pages pulled eagerly on Search, before the reader asks for more. */
const BLUESKY_DEFAULT_BUDGET = 2;
/**
 * Where "Load more" stops regardless of what the reader clicks.
 *
 * Same purpose as the Mastodon side's cap: the budget is the eager phase, this
 * is the runaway guard. Bluesky pages are 25, so this is ~750 posts.
 */
const BLUESKY_LOAD_MORE_HARD_CAP = 30;

/**
 * How many activity lookups run at once.
 *
 * The scan is one request per account, so without a limit a 25-account scan
 * opens 25 sockets simultaneously and invites rate limiting. Four keeps it
 * quick without looking like a burst.
 */
const ACTIVITY_SCAN_CONCURRENCY = 4;

/**
 * Bluesky search: the criteria form and the results, inside the page's layout.
 *
 * A separate component rather than a branch inside `Search` — the two engines
 * take genuinely different filters (see `bluesky-post-search.ts`), and threading
 * a source flag through a 2,000-line component would put a check in front of
 * every widget. What *is* shared is everything that operates on results once
 * they exist: `StatusCard`, `filterLoaded`, `buildFacets`, `sortStatuses`. Those
 * are pure functions over `Status[]` and do not care where the posts came from.
 *
 * What is emphatically *not* separate any more is the chrome. The query box,
 * the network/type selects, Search, Advanced, Syntax, the AI helper, Save and
 * Share all live on the page and drive this panel through inputs. An earlier
 * version owned its own copies, which is how Bluesky search ended up looking
 * like a different application: a seg control where Mastodon had a select, a
 * filter strip across the top where Mastodon had a sticky left column, and
 * chip-buttons where Mastodon had checkboxes. The panel renders the page's
 * layout classes (`search-form-box`, `search-results-box`, `advanced-panel`,
 * `refine-bar`, `facet`) so the two networks are one interface.
 */
@Component({
  selector: 'app-bluesky-search-panel',
  imports: [FormsModule, StatusCard, AccountResultCard, TranslocoPipe],
  templateUrl: './bluesky-search-panel.html',
  styleUrls: ['./bluesky-search-panel.css', './search-refine.css'],
})
export class BlueskySearchPanel {
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;

  /**
   * A saved Bluesky search to load and run, handed down by the page.
   *
   * The page owns the saved-search *list* (it is shared with Mastodon and lives
   * in the shared bar); this panel owns the criteria form. So re-running one is
   * a hand-off: the page says which, the panel decides how.
   */
  readonly savedToRun = input<BlueskyPostSearch | null>(null);

  /**
   * The shared query box's contents.
   *
   * The box lives on the page, so its text arrives as an input and is parsed
   * into criteria at search time (see `run`). Typed operators — `from:`,
   * `since:`, `#tag` — are read here exactly as bsky.app reads them.
   */
  readonly query = input('');

  /** Posts or accounts, from the page's shared type select. */
  readonly target = input<BlueskySearchTarget>('statuses');

  /** Whether the page's shared Advanced button is toggled on. */
  readonly advancedOpen = input(false);

  /** Fired when the panel wants the page to open its save dialog. */
  readonly saveRequested = output<BlueskyPostSearch>();

  /** Pushes criteria back into the shared query box, after Advanced edits it. */
  readonly queryChange = output<string>();

  constructor() {
    // Apply a handed-down saved search once it arrives. An `effect` rather than
    // a setter so the page can hand one over at any point in its lifecycle —
    // on first load from `?saved=`, or later from the Saved menu.
    effect(() => {
      const saved = this.savedToRun();
      if (!saved) {
        return;
      }
      this.criteria.set(structuredClone(saved));
      // Reflect it into the shared box, so what ran and what is displayed agree.
      this.queryChange.emit(serializeBlueskyQuery(this.criteria()));
      this.runCurrent();
    });

    // Switching posts/accounts on the shared select drops results: they are
    // different result shapes from different endpoints, and leaving the old
    // ones on screen under a new heading is a lie about what was searched.
    effect(() => {
      this.target();
      untracked(() => this.clearResults());
    });
  }

  /** Give refinement a column only when there are loaded results to refine. */
  readonly twoBox = computed(() => this.ran() && !this.empty());

  /** The current criteria, for the page's save dialog. */
  requestSave(): void {
    this.saveRequested.emit(structuredClone(this.criteria()));
  }

  /**
   * The active filters as prose, for the AI helper's context block.
   *
   * The same lines the chips show, so what the model is told matches what the
   * reader can see set on screen.
   */
  describeCriteria(): string[] {
    return describeBlueskyFilters(this.criteria());
  }

  private search = inject(BlueskySearch);
  private accountSearch = inject(BlueskyAccountSearch);
  /** Direct API access, used only by the activity scan. */
  private api = inject(BlueskyApi);
  private graph = inject(BlueskyGraph);
  private diagnostics = inject(PageDiagnostics);
  private localMod = inject(LocalModeration);
  protected session = inject(BlueskySession);
  private auth = inject(Auth);
  private anonymousFollows = inject(AnonymousFollows);
  private transloco = inject(TranslocoService);

  /** Account results, hydrated with counts. */
  protected accounts = signal<BlueskyAccountResult[]>([]);
  protected accountSort = signal<AccountSortKey>('relevance');
  protected readonly accountSorts = ACCOUNT_SORTS.map((sort) => ({
    ...sort,
    label: this.accountSortLabel(sort.value),
  }));
  private accountCursor = signal<string | null>(null);
  /** DIDs with a follow/unfollow in flight. */
  protected followBusy = signal<Set<string>>(new Set());

  /** Selected account facet values, keyed by kind + value. */
  protected selectedAccountFacets = signal<{ kind: BlueskyAccountFacetKind; value: string }[]>([]);
  /** Follower/following/post gates from the Advanced panel. */
  protected accountBounds = signal<BlueskyAccountBounds>({});

  /** Account results after facets, numeric gates, the loaded-text filter and sort. */
  protected visibleAccounts = computed(() => {
    const needle = this.loadedFilter().trim().toLowerCase();
    const byKind = new Map<BlueskyAccountFacetKind, string[]>();
    for (const f of this.selectedAccountFacets()) {
      byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f.value]);
    }
    const bounds = this.accountBounds();
    const gated = this.accounts().filter(
      (r) =>
        accountMeetsBounds(r.account, bounds) &&
        [...byKind.entries()].every(([kind, values]) =>
          values.some((v) => blueskyAccountMatchesFacet(r.account, kind, v)),
        ),
    );
    const matching = needle
      ? gated.filter((r) =>
          `${r.account.display_name} ${r.account.acct} ${r.account.note}`
            .toLowerCase()
            .includes(needle),
        )
      : gated;
    const sorted = sortAccounts(
      matching.map((r) => this.asItem(r)),
      this.accountSort(),
    );
    // Re-attach relationships by id after sorting, which only sees the account.
    const byId = new Map(this.accounts().map((r) => [r.account.id, r]));
    return sorted.map((item) => byId.get(item.account.id)!).filter(Boolean);
  });

  protected asItem(result: BlueskyAccountResult): AccountWithMatches {
    // `searchActors` matches on profile text, so there are never matching
    // posts to show — this is the bio-only shape the card already handles.
    return { account: result.account, matchingPosts: [] };
  }

  protected profileLink(account: Account): (string | number)[] {
    return ['/accounts', account.id];
  }

  protected isFollowBusy(account: Account): boolean {
    return this.followBusy().has(account.id);
  }

  /**
   * Follow or unfollow from a result card.
   *
   * Only reachable signed in: an anonymous search has no `viewer` block, so no
   * relationship is known and the card shows no follow button.
   */
  protected toggleFollow(account: Account, following: boolean): void {
    // Anonymous: the follow is browser-local and instant — there is no account
    // on Bluesky to write it to, and `AnonymousBlueskyProvider` reads this same
    // store to build the home feed. This is the "follow people client-side"
    // half of the anonymous experience.
    if (!this.session.linked() && this.auth.isAnonymousIdentity) {
      if (following) {
        this.anonymousFollows.unfollow(account, '');
      } else {
        const result = this.anonymousFollows.follow(account, '');
        if (!result.ok) {
          this.error.set(
            this.transloco.translate<string>('pages.search.bluesky.anonymousFollowLimit', {
              limit: ANONYMOUS_FOLLOW_LIMIT,
            }),
          );
        }
      }
      // Re-read: the cards render from `accounts()`, and nothing else changed.
      this.accounts.update((list) => [...list]);
      return;
    }
    const did = account.id.replace(/^bsky:/, '');
    this.followBusy.update((busy) => new Set(busy).add(account.id));
    const call = following ? this.graph.unfollow(did) : this.graph.follow(did);
    call.subscribe({
      next: (updated) => {
        this.accounts.update((list) =>
          list.map((r) =>
            r.account.id === account.id
              ? { ...r, relationship: { ...r.relationship, ...updated } }
              : r,
          ),
        );
        this.clearFollowBusy(account.id);
      },
      error: (error: unknown) => {
        this.clearFollowBusy(account.id);
        this.diagnostics.error('Search', 'bsky:follow-failed', error, { did });
        this.error.set(
          error instanceof Error
            ? error.message
            : this.transloco.translate<string>('pages.search.bluesky.followUpdateFailed'),
        );
      },
    });
  }

  private clearFollowBusy(id: string): void {
    this.followBusy.update((busy) => {
      const next = new Set(busy);
      next.delete(id);
      return next;
    });
  }

  /**
   * Whether following is unavailable for this result set.
   *
   * **Not** simply "no linked account". An anonymous visitor follows *locally* —
   * the follow lives in `AnonymousFollows` and drives the anonymous Bluesky feed
   * provider — so for them the button works and follow state is known exactly.
   * The genuinely unusable case is a signed-out or Mastodon-primary reader with
   * no Bluesky link: no local store to write to and no session to write with.
   */
  protected followUnavailable = computed(
    () => !this.session.linked() && !this.auth.isAnonymousIdentity,
  );

  protected relationshipFor(result: BlueskyAccountResult): Relationship | null {
    // Anonymous: the server sends no `viewer`, but the browser-local store knows
    // the answer for certain, so read it from there rather than reporting
    // unknown.
    if (!this.session.linked() && this.auth.isAnonymousIdentity) {
      const following = this.anonymousFollows.isFollowing(result.account, '');
      return {
        id: result.account.id,
        following,
        followed_by: false,
        requested: false,
        blocking: false,
        muting: false,
      } as Relationship;
    }
    return result.relationship;
  }

  protected criteria = signal<BlueskyPostSearch>(emptyBlueskyPostSearch());
  /** Tag input is free text; parsed into the AND-matched list on search. */
  protected tagInput = signal('');

  protected statuses = signal<Status[]>([]);
  /** Readable by the page, which owns the shared Search button. */
  readonly searching = signal(false);
  protected loadingMore = signal(false);
  protected error = signal<string | null>(null);
  protected ran = signal(false);
  protected hitsTotal = signal<number | null>(null);
  /** Signals, not fields: `exhausted` is a computed and must see them change. */
  private cursor = signal<string | null>(null);

  // --- API-call budget ---
  // The same bargain the Mastodon side strikes: pull several pages eagerly on
  // Search so client-side faceting has a real corpus to work with, then let
  // "Load more" keep going past the budget up to a hard cap. Bluesky costs
  // exactly one request per page for both targets — there is no anonymous
  // fan-out to account for — so `callsUsed` is simply the page count.
  protected readonly budgetOptions: { value: number; label: string }[] = [
    { value: 1, label: 'pages.search.bluesky.budget' },
    { value: 2, label: 'pages.search.bluesky.budget' },
    { value: 3, label: 'pages.search.bluesky.budget' },
    { value: 5, label: 'pages.search.bluesky.budget' },
    { value: 10, label: 'pages.search.bluesky.budget' },
  ];
  protected apiBudget = signal(BLUESKY_DEFAULT_BUDGET);
  protected callsUsed = signal(0);

  protected setBudget(value: number | string): void {
    const next = Number(value) || BLUESKY_DEFAULT_BUDGET;
    this.diagnostics.info('Search', 'user:set-budget', {
      network: 'bluesky',
      from: this.apiBudget(),
      to: next,
    });
    this.apiBudget.set(next);
    // Raising it after a search tops up with the extra pages, rather than
    // making the reader re-run the search to spend the budget they just chose.
    if (this.ran() && !this.searching() && !this.loadingMore() && this.autoFillWants()) {
      this.loadMore();
    }
  }

  // --- Activity scan -------------------------------------------------------
  //
  // Mastodon's account search returns `last_status_at` on every result, so the
  // "Last active" facet is free there. Bluesky's `profileViewDetailed` has no
  // such field, and the only way to learn it is one `getAuthorFeed` per account.
  //
  // That is genuinely expensive — 25 accounts is 25 requests — so it is a
  // button rather than something every search pays for silently. The pattern
  // (offer it, spend on click, merge what came back, leave the rest honestly
  // unknown) is the one `enrichActivity()` already establishes on the Mastodon
  // page; only the transport differs.

  /** How many accounts one scan will look at, however many are loaded. */
  private readonly ACTIVITY_SCAN_CAP = 25;

  protected scanningActivity = signal(false);
  protected scanError = signal<string | null>(null);
  /**
   * Requests the activity scan has spent.
   *
   * Counted separately from `callsUsed` rather than added to it: that counter is
   * reported against `apiBudget`, which is a *paging* budget in pages of 25.
   * Folding a 25-request scan into it produced the nonsense "27 of up to 2 API
   * calls used". These are two different kinds of spending and the status line
   * now says so.
   */
  protected scanCallsUsed = signal(0);

  /** True once the activity ladder has real data behind it. */
  protected hasActivityFacet = computed(() =>
    this.accountFacets().some((f) => f.kind === 'activity'),
  );

  /** Loaded accounts whose last-post date nobody has supplied yet. */
  protected accountsMissingActivity = computed(() =>
    this.accounts().filter((r) => !r.account.last_status_at),
  );

  /** Whether to offer the scan at all. */
  protected canScanActivity = computed(
    () =>
      this.target() === 'accounts' &&
      !this.scanningActivity() &&
      this.accountsMissingActivity().length > 0,
  );

  /** How many accounts the next scan would cover — the button says so up front. */
  protected activityScanSize = computed(() =>
    Math.min(this.accountsMissingActivity().length, this.ACTIVITY_SCAN_CAP),
  );

  /**
   * Fetch each unscanned account's most recent post date.
   *
   * One request per account, capped, run with bounded concurrency so a 25-account
   * scan doesn't open 25 sockets at once. A failure for one account is not a
   * failure of the scan: that account simply stays in the "Not checked" bin,
   * which is exactly what the bin is for.
   */
  protected scanActivity(): void {
    const targets = this.accountsMissingActivity().slice(0, this.ACTIVITY_SCAN_CAP);
    if (!targets.length || this.scanningActivity()) {
      return;
    }
    this.scanningActivity.set(true);
    this.scanError.set(null);
    this.diagnostics.info('Search', 'user:scan-activity', {
      network: 'bluesky',
      accounts: targets.length,
    });

    // The did is what `getAuthorFeed` wants; our ids are `bsky:<did>`.
    const lookups = targets.map((r) =>
      this.api.getAuthorFeed(r.account.id.replace(/^bsky:/, ''), null, 'posts_no_replies').pipe(
        map((timeline) => {
          const newest = timeline.feed[0]?.post;
          const when = newest?.record.createdAt || newest?.indexedAt || null;
          return { id: r.account.id, lastStatusAt: when };
        }),
        catchError(() => of({ id: r.account.id, lastStatusAt: null })),
      ),
    );

    merge(...lookups, ACTIVITY_SCAN_CONCURRENCY)
      .pipe(toArray())
      .subscribe({
        next: (results) => {
          const byId = new Map(results.map((r) => [r.id, r.lastStatusAt]));
          this.accounts.update((list) =>
            list.map((r) => {
              const when = byId.get(r.account.id);
              // `undefined` = not in this scan; `null` = scanned, nothing found
              // (a real answer, but not one that dates the account).
              return when ? { ...r, account: { ...r.account, last_status_at: when } } : r;
            }),
          );
          this.scanCallsUsed.update((c) => c + results.length);
          this.scanningActivity.set(false);
        },
        error: () => {
          this.scanningActivity.set(false);
          this.scanError.set(
            this.transloco.translate<string>('pages.search.bluesky.activityCheckFailed'),
          );
        },
      });
  }

  /**
   * Whether to keep paging automatically.
   *
   * Guarded on the last page having grown as well as on the budget: a cursor
   * that keeps returning already-seen posts would otherwise loop until the cap.
   */
  private autoFillWants(): boolean {
    const more = this.target() === 'accounts' ? !!this.accountCursor() : !!this.cursor();
    return more && this.callsUsed() < this.apiBudget();
  }

  // Client-side refinement over what is already loaded. Identical in behaviour
  // to the Mastodon side because it is literally the same functions.
  protected loadedFilter = signal('');
  /** Facets start open, matching the Mastodon panel's `refineOpen`. */
  protected refineOpen = signal(true);
  protected statusSort = signal<StatusSortKey>('relevance');
  /** None / author / date, the same three the Mastodon panel offers. */
  protected grouping = signal<ResultGrouping>('none');
  /** Authors excluded from *this* search only — the flood-control escape hatch. */
  protected excludedAuthors = signal<ReadonlySet<string>>(new Set());
  protected collapseRepeats = signal(false);
  /** Rows whose folded-away repeats the reader has expanded. */
  private expandedRepeats = signal<ReadonlySet<string>>(new Set());
  protected selectedFacets = signal<{ kind: FacetKind; value: string }[]>([]);
  /** Selected Bluesky-only post facets (engagement, alt text, quotes, links). */
  protected selectedPostFacets = signal<{ kind: BlueskyPostFacetKind; value: string }[]>([]);
  /** Minimum-engagement gates from the Advanced panel. */
  protected engagementBounds = signal<BlueskyEngagementBounds>({});

  /**
   * The post sorts, relabelled for Bluesky.
   *
   * These are the *same* keys the Mastodon panel uses — `favourites_count` and
   * `reblogs_count` are what the adapter fills from likes and reposts, so the
   * sorting already worked. Only the words were Mastodon's. Renaming the keys
   * would fork `search-sort.ts` for nothing.
   */
  protected readonly statusSorts = STATUS_SORTS.map((sort) => {
    return { ...sort, label: this.statusSortLabel(sort.value) };
  });

  private statusSortLabel(value: StatusSortKey): string {
    const labels: Record<StatusSortKey, string> = {
      relevance: 'pages.search.bluesky.sortRelevance',
      newest: 'pages.search.bluesky.sortNewest',
      oldest: 'pages.search.bluesky.sortOldest',
      favourites: 'pages.search.sort.mostLiked',
      reblogs: 'pages.search.sort.mostReposted',
      replies: 'pages.search.bluesky.sortMostReplies',
    };
    return labels[value];
  }

  private accountSortLabel(value: AccountSortKey): string {
    const labels: Record<AccountSortKey, string> = {
      relevance: 'pages.search.bluesky.sortRelevance',
      followers: 'pages.search.bluesky.sortMostFollowers',
      following: 'pages.search.bluesky.sortMostFollowing',
      posts: 'pages.search.bluesky.sortMostPosts',
      name: 'pages.search.bluesky.sortName',
      matches: 'pages.search.bluesky.sortMostMatching',
      active: 'pages.search.bluesky.sortRecentlyActive',
    };
    return labels[value];
  }

  protected exhausted = computed(() =>
    this.target() === 'accounts'
      ? this.ran() && !this.accountCursor()
      : this.ran() && !this.cursor(),
  );

  /** True when the last search produced nothing at all. */
  protected empty = computed(() =>
    this.target() === 'accounts' ? !this.accounts().length : !this.statuses().length,
  );

  protected facets = computed(() => buildFacets(this.statuses()));

  /**
   * Facets Bluesky can offer and Mastodon's search cannot, rendered as their own
   * group below the shared ones so it stays obvious which is which.
   */
  protected postFacets = computed(() => buildBlueskyPostFacets(this.statuses()));

  /** Account facets over the loaded results — all client-side, see the module. */
  protected accountFacets = computed(() =>
    buildBlueskyAccountFacets(this.accounts().map((r) => r.account)),
  );

  /** The author facet, pulled out to drive flood control. */
  protected authorFacet = computed<Facet | null>(
    () => this.facets().find((f) => f.kind === 'author') ?? null,
  );

  protected activeFilters = computed(() => describeBlueskyFilters(this.criteria()));
  protected hasFilters = computed(() => hasBlueskyFilters(this.criteria()));

  /**
   * The loaded posts after facets, author exclusions, the text filter and sort.
   *
   * Deliberately the same order of operations as the Mastodon side's
   * `refinedStatuses`, using the same pure functions — these are the behaviours
   * a reader learns once and expects on both networks.
   */
  protected refinedStatuses = computed(() => {
    const all = this.statuses();
    // Values of the *same* kind OR together (two languages = either), while
    // different kinds AND (a language and an author = both).
    const byKind = new Map<FacetKind, string[]>();
    for (const f of this.selectedFacets()) {
      byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f.value]);
    }
    // The Bluesky-only facets follow exactly the same OR-within / AND-across
    // rule, in their own map because their kinds are a different union.
    const byPostKind = new Map<BlueskyPostFacetKind, string[]>();
    for (const f of this.selectedPostFacets()) {
      byPostKind.set(f.kind, [...(byPostKind.get(f.kind) ?? []), f.value]);
    }
    const bounds = this.engagementBounds();
    const faceted = all.filter(
      (s) =>
        [...byKind.entries()].every(([kind, values]) =>
          values.some((v) => statusMatchesFacet(s, kind, v)),
        ) &&
        [...byPostKind.entries()].every(([kind, values]) =>
          values.some((v) => blueskyPostMatchesFacet(s, kind, v)),
        ) &&
        statusMeetsEngagement(s, bounds),
    );
    // Exclusion before the text filter, so "hidden by exclusion" counts what it
    // says it counts.
    const kept = excludeAuthors(faceted, this.excludedAuthors());
    return sortStatuses(filterLoaded(kept, this.loadedFilter()), this.statusSort());
  });

  /** One row per surviving post, carrying any near-identical siblings. */
  protected statusRows = computed<CollapsedStatus[]>(() =>
    this.collapseRepeats()
      ? collapseRepeatRuns(this.refinedStatuses())
      : this.refinedStatuses().map((status) => ({ status, duplicates: [] })),
  );

  /** The posts actually on screen — what grouping and the counters work from. */
  protected visible = computed<Status[]>(() => this.statusRows().map((row) => row.status));

  /** Loaded posts reshaped by the current grouping selection. */
  protected groups = computed(() => groupResults(this.visible(), this.grouping()));

  private duplicatesById = computed(() => {
    const map = new Map<string, Status[]>();
    for (const row of this.statusRows()) {
      if (row.duplicates.length) {
        map.set(row.status.id, row.duplicates);
      }
    }
    return map;
  });

  /** Near-identical posts this row stands in for. Empty when none. */
  protected duplicatesOf(id: string): Status[] {
    return this.duplicatesById().get(id) ?? [];
  }

  protected isRepeatExpanded(id: string): boolean {
    return this.expandedRepeats().has(id);
  }

  protected toggleRepeat(id: string): void {
    this.expandedRepeats.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  /** How many posts the exclusions removed from the loaded set. */
  protected excludedCount = computed(() => {
    const excluded = this.excludedAuthors();
    if (!excluded.size) {
      return 0;
    }
    return this.statuses().filter((s) => excluded.has(s.account.acct)).length;
  });

  /** How many near-identical posts the collapse toggle folded away. */
  protected repeatsHidden = computed(() =>
    this.collapseRepeats() ? collapsedCount(this.statusRows()) : 0,
  );

  protected isAuthorExcluded(acct: string): boolean {
    return this.excludedAuthors().has(acct);
  }

  /** Exclude or restore one author for this search. */
  protected toggleExcludedAuthor(acct: string): void {
    this.excludedAuthors.update((set) => {
      const next = new Set(set);
      if (next.has(acct)) {
        next.delete(acct);
      } else {
        next.add(acct);
      }
      return next;
    });
    this.diagnostics.info('Search', 'user:toggle-author-exclusion', {
      network: 'bluesky',
      total: this.excludedAuthors().size,
    });
  }

  protected clearExcludedAuthors(): void {
    this.excludedAuthors.set(new Set());
  }

  /**
   * Mute an author everywhere, not just in this search.
   *
   * The same escalation the Mastodon panel offers, through the same
   * `LocalModeration` store — it is client-side, so it works against Bluesky
   * accounts exactly as it does against Mastodon ones.
   */
  protected muteAuthorEverywhere(acct: string): void {
    const account = this.statuses().find((s) => s.account.acct === acct)?.account;
    if (!account) {
      return;
    }
    this.localMod.mute(account, null);
    this.excludedAuthors.update((set) => new Set(set).add(acct));
    this.diagnostics.info('Search', 'user:mute-from-search', {
      from: 'flood-control',
      network: 'bluesky',
    });
  }

  /** True once an author has been muted app-wide, so the row can say so. */
  protected isAuthorMuted(acct: string): boolean {
    this.localMod.entries();
    const account = this.statuses().find((s) => s.account.acct === acct)?.account;
    return !!account && this.localMod.isMuted(account);
  }

  /** Patch a field of the criteria object without replacing the rest. */
  protected set<K extends keyof BlueskyPostSearch>(key: K, value: BlueskyPostSearch[K]): void {
    this.criteria.update((current) => ({ ...current, [key]: value }));
  }

  /**
   * Toggle one facet value.
   *
   * Additive within a kind, matching the Mastodon panel: picking a second
   * language widens to "either", it does not replace the first.
   */
  protected toggleFacet(kind: FacetKind, value: string): void {
    this.selectedFacets.update((current) => {
      const hit = current.find((f) => f.kind === kind && f.value === value);
      return hit ? current.filter((f) => f !== hit) : [...current, { kind, value }];
    });
  }

  protected isFacetSelected(kind: FacetKind, value: string): boolean {
    return this.selectedFacets().some((f) => f.kind === kind && f.value === value);
  }

  /** The Bluesky-only post facets, same OR-within-kind behaviour as above. */
  protected togglePostFacet(kind: BlueskyPostFacetKind, value: string): void {
    this.selectedPostFacets.update((current) => {
      const hit = current.find((f) => f.kind === kind && f.value === value);
      return hit ? current.filter((f) => f !== hit) : [...current, { kind, value }];
    });
  }

  protected isPostFacetSelected(kind: BlueskyPostFacetKind, value: string): boolean {
    return this.selectedPostFacets().some((f) => f.kind === kind && f.value === value);
  }

  protected toggleAccountFacet(kind: BlueskyAccountFacetKind, value: string): void {
    this.selectedAccountFacets.update((current) => {
      const hit = current.find((f) => f.kind === kind && f.value === value);
      return hit ? current.filter((f) => f !== hit) : [...current, { kind, value }];
    });
  }

  protected isAccountFacetSelected(kind: BlueskyAccountFacetKind, value: string): boolean {
    return this.selectedAccountFacets().some((f) => f.kind === kind && f.value === value);
  }

  /** Read a min-engagement input, treating blank/zero/negative as "unset". */
  protected setEngagementBound(key: keyof BlueskyEngagementBounds, raw: string): void {
    const parsed = Number.parseInt(raw, 10);
    this.engagementBounds.update((bounds) => {
      const next = { ...bounds };
      if (!Number.isFinite(parsed) || parsed <= 0) {
        delete next[key];
      } else {
        next[key] = parsed;
      }
      return next;
    });
  }

  /** Read one end of an account numeric gate; blank clears that end. */
  protected setAccountBound(
    key: keyof BlueskyAccountBounds,
    end: 'min' | 'max',
    raw: string,
  ): void {
    const parsed = Number.parseInt(raw, 10);
    this.accountBounds.update((bounds) => {
      const range = { ...(bounds[key] ?? {}) };
      if (!Number.isFinite(parsed) || parsed < 0) {
        delete range[end];
      } else {
        range[end] = parsed;
      }
      const next = { ...bounds };
      // An empty range is no gate at all — drop it so `hasRefinements` is honest.
      if (range.min == null && range.max == null) {
        delete next[key];
      } else {
        next[key] = range;
      }
      return next;
    });
  }

  protected accountBound(key: keyof BlueskyAccountBounds, end: 'min' | 'max'): number | null {
    return this.accountBounds()[key]?.[end] ?? null;
  }

  /** True when anything is narrowing the loaded results, for the Clear button. */
  protected hasRefinements = computed(
    () =>
      this.selectedFacets().length > 0 ||
      this.selectedPostFacets().length > 0 ||
      this.selectedAccountFacets().length > 0 ||
      Object.keys(this.engagementBounds()).length > 0 ||
      Object.keys(this.accountBounds()).length > 0 ||
      this.excludedAuthors().size > 0 ||
      !!this.loadedFilter().trim(),
  );

  protected clearRefinements(): void {
    this.selectedFacets.set([]);
    this.selectedPostFacets.set([]);
    this.selectedAccountFacets.set([]);
    this.engagementBounds.set({});
    this.accountBounds.set({});
    this.loadedFilter.set('');
    this.excludedAuthors.set(new Set());
  }

  /** Drop results and paging state, keeping the query the reader typed. */
  private clearResults(): void {
    this.statuses.set([]);
    this.accounts.set([]);
    this.clearRefinements();
    this.collapseRepeats.set(false);
    this.expandedRepeats.set(new Set());
    this.grouping.set('none');
    this.callsUsed.set(0);
    this.cursor.set(null);
    this.accountCursor.set(null);
    this.ran.set(false);
    this.error.set(null);
    this.hitsTotal.set(null);
    // A new search loads new accounts, so nothing has been scanned yet.
    this.scanningActivity.set(false);
    this.scanError.set(null);
    this.scanCallsUsed.set(0);
  }

  reset(): void {
    this.criteria.set(emptyBlueskyPostSearch());
    this.tagInput.set('');
    this.queryChange.emit('');
    this.clearResults();
  }

  /**
   * Run what the shared query box currently says.
   *
   * Called by the page's Search button. The box is authoritative: its text is
   * parsed into criteria, so `from:pfrazee since:2026-01-01` typed by hand and
   * the same values entered in Advanced produce identical searches — and the AI
   * helper, which emits this syntax, lands in the form for free.
   */
  runQuery(): void {
    const typed = this.query().trim();
    if (!typed) {
      return;
    }
    const parsed = parseBlueskyQuery(typed);
    // Ranking is not part of the typed syntax, so it survives a re-parse.
    parsed.sort = this.criteria().sort;
    this.criteria.set(parsed);
    this.tagInput.set((parsed.tags ?? []).join(' '));
    this.runCurrent();
  }

  /**
   * Run the structured criteria as they stand.
   *
   * The Advanced form's "Apply & search" path, and the one saved searches take.
   * Reflects back into the box first so the reader can see — and edit, and copy
   * — what their form choices actually mean in Bluesky's syntax.
   */
  applyAdvanced(): void {
    // Tags are only read at apply time, so typing in the box does not silently
    // change what the "active filters" line claims about the last search.
    this.set('tags', parseTags(this.tagInput()));
    this.queryChange.emit(serializeBlueskyQuery(this.criteria()));
    this.runCurrent();
  }

  private runCurrent(): void {
    if (!this.criteria().text.trim() && !hasBlueskyFilters(this.criteria())) {
      return;
    }
    if (this.searching()) {
      return;
    }
    this.clearResults();
    this.searching.set(true);
    this.fetch();
  }

  loadMore(): void {
    const cursor = this.target() === 'accounts' ? this.accountCursor() : this.cursor();
    if (!cursor || this.loadingMore() || this.searching()) {
      return;
    }
    // The manual button keeps working past the budget — the reader asked for
    // more — but never past the runaway cap.
    if (this.callsUsed() >= BLUESKY_LOAD_MORE_HARD_CAP) {
      return;
    }
    this.loadingMore.set(true);
    this.fetch();
  }

  /** True while there is another page to fetch and room to fetch it. */
  protected canLoadMore = computed(
    () => !this.exhausted() && this.callsUsed() < BLUESKY_LOAD_MORE_HARD_CAP,
  );

  private fetch(): void {
    if (this.target() === 'accounts') {
      this.fetchAccounts();
      return;
    }
    this.fetchPosts();
  }

  private fetchPosts(): void {
    this.search.search(this.criteria(), this.cursor()).subscribe({
      next: (page) => {
        this.callsUsed.update((c) => c + 1);
        this.cursor.set(page.cursor);
        // Dedupe: a shifting index can repeat a post across pages.
        const seen = new Set(this.statuses().map((s) => s.id));
        const fresh = page.statuses.filter((s) => !seen.has(s.id));
        this.statuses.update((list) => [...list, ...fresh]);
        this.hitsTotal.set(page.hitsTotal ?? null);
        this.settle();
        this.diagnostics.info('Search', 'load:bsky-posts', {
          results: page.statuses.length,
          more: !!page.cursor,
          callsUsed: this.callsUsed(),
        });
        // Guarded on the page having actually grown, so a cursor that keeps
        // handing back posts we already have ends the loop instead of spending
        // the whole budget on duplicates.
        this.maybeAutoFill(fresh.length > 0);
      },
      error: (error: unknown) => this.fail(error, 'load:bsky-posts-error'),
    });
  }

  /** Keep paging while the budget allows and the last page brought something. */
  private maybeAutoFill(pageGrew: boolean): void {
    if (pageGrew && this.autoFillWants()) {
      this.loadMore();
    }
  }

  private fetchAccounts(): void {
    this.accountSearch.search(this.criteria().text.trim(), this.accountCursor()).subscribe({
      next: (page) => {
        this.callsUsed.update((c) => c + 1);
        this.accountCursor.set(page.cursor);
        const seen = new Set(this.accounts().map((r) => r.account.id));
        const fresh = page.results.filter((r) => !seen.has(r.account.id));
        this.accounts.update((list) => [...list, ...fresh]);
        this.settle();
        this.diagnostics.info('Search', 'load:bsky-accounts', {
          results: page.results.length,
          more: !!page.cursor,
          callsUsed: this.callsUsed(),
        });
        this.maybeAutoFill(fresh.length > 0);
      },
      error: (error: unknown) => this.fail(error, 'load:bsky-accounts-error'),
    });
  }

  private settle(): void {
    this.searching.set(false);
    this.loadingMore.set(false);
    this.ran.set(true);
  }

  private fail(error: unknown, event: string): void {
    this.settle();
    this.cursor.set(null);
    this.accountCursor.set(null);
    this.diagnostics.error('Search', event, error);
    this.error.set(
      error instanceof Error
        ? error.message
        : this.transloco.translate<string>('pages.search.bluesky.searchFailed'),
    );
  }
}
