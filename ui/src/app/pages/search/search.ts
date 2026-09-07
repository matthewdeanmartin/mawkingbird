import {
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  isDevMode,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, EMPTY, Observable, of, Subscription } from 'rxjs';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Account, Relationship, SearchResults, Status, Tag } from '../../models';
import { StatusCard } from '../../status-card/status-card';
import { AccountSearchHelp } from './account-search-help/account-search-help';
import { AnonymousCapabilities } from '../../providers/anonymous/anonymous-capabilities';
import { AnonymousAccount } from '../../providers/anonymous/anonymous-account';
import { AnonymousFollows } from '../../providers/anonymous/anonymous-follows';
import { AnonymousPublicApi } from '../../providers/anonymous/anonymous-public-api';
import { anonymousAccountRouteRef } from '../../providers/anonymous/anonymous-route-ref';
import { AccountResultCard } from './account-result-card';
import { SearchHelperDialog } from './search-helper-dialog/search-helper-dialog';
import { SearchContext } from './search-helper';
import { SearchSyntaxHelp } from './search-syntax-help/search-syntax-help';
import { OpenRouterSession } from '../../providers/openrouter/openrouter-session';
import { AiAvailability } from '../../ai-availability';
import { qualifiedHandle } from '../../account-handle';
import { accountRoutePath } from '../../account-route';
import { AccountSearchStore } from './account-search-store';
import {
  AccountFacet,
  AccountFacetKind,
  AccountWithMatches,
  accountMatchesFacet,
  accountMatchesNumeric,
  buildAccountFacets,
  condenseStatusesToAuthors,
  filterAccounts,
  filterByFollowState,
  FollowFilter,
  mergeAuthors,
} from './account-refine';
import {
  buildFacets,
  CollapsedStatus,
  // Aliased: the component exposes a `collapseRepeats` *signal* of its own, and
  // the template reads that one.
  collapseRepeats as collapseRepeatRuns,
  collapsedCount,
  excludeAuthors,
  Facet,
  FacetKind,
  filterLoaded,
  groupResults,
  statusMatchesFacet,
} from './search-refine';
import {
  AccountSearchCriteria,
  AccountSearchSource,
  MawkingbirdSearch,
  NumericRange,
  PostContentType,
  PostSearchCriteria,
  ResultGrouping,
  SearchTarget,
  Tristate,
} from './mawkingbird-search';
import {
  isWebEngine,
  serializeWebQuery,
  WEB_ENGINES,
  WebDroppedItem,
  WebEngine,
  webSearchUrl,
} from './web-query-serializer';
import {
  AccountSortKey,
  ACCOUNT_SORTS,
  StatusSortKey,
  STATUS_SORTS,
  sortAccounts,
  sortStatuses,
} from './search-sort';
import { serializeMastodonQuery } from './mastodon-query-serializer';
import { Chip, ExplainPanel, explainPostSearch, postChips } from './search-explain';
import { isBlueskySaved, isMastodonSaved, SavedSearches } from './saved-searches';
import { RecentSearches, RecentSearch } from './recent-searches';
import { kitMatchesFor } from './kit-matches';
import { KnownLanguages } from '../../trend-language-filter';
import { UiLocale } from '../../i18n/locale';
import { BlueskyPostSearch } from '../../providers/bluesky/bluesky-post-search';
import { decodeSearchFromParams, encodeSearchToParams } from './search-url';
import { PageDiagnostics } from '../../page-diagnostics';
import { SearchServer } from '../../search-server';
import { SearchCapability } from '../../search-capability';
import { SearchServerDiscovery } from '../../search-server-discovery/search-server-discovery';
import { BlueskySearchPanel, BlueskySearchTarget } from './bluesky-search-panel';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { Server } from '../../server';
import { isTagsOnly, probeSearchServer, SearchServerStatus } from '../../search-server-probe';
import { normalizeHostUrl } from '../../host-url';
import { Terminology } from '../../terminology';
import { LocalModeration } from '../../local-moderation';
import { TranslatedText } from '../../i18n/translated';

type SearchType = 'accounts' | 'statuses' | 'hashtags';

/**
 * The URL value that means "the Bluesky panel", and the dropdown option id.
 *
 * Deliberately **not** a member of {@link SearchType}. It is a wire value
 * translated once at the URL boundary into `blueskyMode`, so the Mastodon-shaped
 * consumers — the query serializers, saved searches, the explain panel — never
 * grow a fourth case. See the note on `blueskyMode`.
 */
export const BLUESKY_WIRE_TYPE = 'bluesky-posts';

/** One selected facet value, keyed by "kind:value" (see selectedFacets). */
interface FacetSelection {
  kind: FacetKind;
  value: string;
}

/** Mastodon's max results per page. Big pages = a fatter faceting corpus per call. */
const PAGE_SIZE = 40;
/** Default budgets: a plain search pulls 2 pages; opening advanced bumps it to 3. */
const DEFAULT_BUDGET_SIMPLE = 2;
const DEFAULT_BUDGET_ADVANCED = 3;
/** Manual "Load more" can page past the budget, but stops here so it never runs away. */
const LOAD_MORE_HARD_CAP = 30;
/**
 * Below this many visible posts, excluding an author is assumed to have gutted
 * the results rather than cleaned them, and the page offers to fetch more.
 */
const THIN_RESULTS = 10;

/**
 * When a search stops looking normal and starts looking stuck.
 *
 * Five seconds because that is roughly where an unchanging spinner stops
 * reading as "working" and starts reading as "broken". Federated search across a
 * slow instance genuinely does take this long, so the message says the server is
 * slow rather than implying a failure.
 */
const SLOW_SEARCH_MS = 5000;

/**
 * When to give up.
 *
 * Twenty seconds is far longer than any search that is going to succeed, and
 * short enough that a reader has not yet concluded the app is dead. The
 * alternative is what this replaced: no timeout at all, and a "Searching…" that
 * never ended.
 */
const SEARCH_TIMEOUT_MS = 20000;

// i18n pages.search.explain.summary: Explain this search
// i18n pages.search.explain.endpoint: Endpoint
// i18n pages.search.explain.mastodonQuery: Mastodon query
// i18n pages.search.explain.anonymousTransformation: Anonymous transformation
// i18n pages.search.explain.searchedAsHashtags.a: Searched as hashtags
// i18n pages.search.explain.searchedAsHashtags.b: — Mastodon does not provide anonymous full-text post search.
// i18n pages.search.explain.serverCriteria: Server-side criteria
// i18n pages.search.explain.loadedCriteria: Filters applied to loaded results
// i18n pages.search.explain.apiUsage: API usage
// i18n pages.search.explain.maximumCalls: Maximum: {{count}} calls
// i18n pages.search.explain.usedCalls: Used: {{count}} calls
// i18n pages.search.explain.truncated: Truncated: {{count}} hashtag(s) dropped to stay within the API-call budget.
// i18n pages.search.network.mastodon: Mastodon
// i18n pages.search.network.bluesky: Bluesky
// i18n pages.search.network.ariaLabel: Search network
// i18n pages.search.kits.heading: Ready-made sets of people
// i18n pages.search.kits.accounts.one: {{count}} account · follow the whole set
// i18n pages.search.kits.accounts.other: {{count}} accounts · follow the whole set
// i18n pages.search.refine.summary: Search options and filters
// i18n pages.search.refine.activeCount.one: {{count}} filter on
// i18n pages.search.refine.activeCount.other: {{count}} filters on
// i18n pages.search.found.posts.one: Found 1 {{post}}.
// i18n pages.search.found.posts.other: Found {{count}} {{posts}}.
// i18n pages.search.found.accounts.one: Found 1 account.
// i18n pages.search.found.accounts.other: Found {{count}} accounts.
// i18n pages.search.type.accounts: Accounts
// i18n pages.search.type.posts: Posts
// i18n pages.search.type.hashtags: Hashtags
// i18n pages.search.type.web: Search the web ↗
// i18n pages.search.type.ariaLabel: Search for
// i18n pages.search.action.search: Search
// i18n pages.search.action.searchHelperTitle: Describe what you’re looking for and get a query
// i18n pages.search.action.helpMeSearch: Help me search
// i18n pages.search.action.syntaxHelp: Search syntax help
// i18n pages.search.action.syntaxHelpTitle: What you can type in a {{post}} search
// i18n pages.search.action.syntax: Syntax?
// i18n pages.search.action.advanced: Advanced ▾
// i18n pages.search.saved.summary: Saved ({{count}})
// i18n pages.search.saved.empty: No saved searches yet.
// i18n pages.search.saved.anonymous: · anon
// i18n pages.search.saved.deleteLabel: Delete saved search
// i18n pages.search.saved.deleteTitle: Delete
// i18n pages.search.action.save: Save
// i18n pages.search.action.linkCopied: Link copied!
// i18n pages.search.action.share: Share
// i18n pages.search.recent.label: Recent
// i18n pages.search.recent.searchAgain: Search {{query}} again
// i18n pages.search.recent.posts: posts
// i18n pages.search.recent.people: people
// i18n pages.search.recent.tags: tags
// i18n pages.search.recent.forget: Forget
// i18n pages.search.recent.forgetLabel: Forget search {{query}}
// i18n pages.search.recent.clear: Clear
// i18n pages.search.blueskyNeedsLink: Bluesky post search needs a linked account —
// i18n pages.search.linkOneInSettings: link one in Settings
// i18n pages.search.accountSearchWorksWithoutLink: Account search works without one. Hashtags are Mastodon-only: Bluesky has no hashtag index to search, only a hashtag filter inside post search.
// i18n pages.search.hashtagsMastodonOnly: Hashtags are Mastodon-only — Bluesky has no hashtag index, only a hashtag filter inside post search (set it under Advanced).
// i18n pages.search.server.searching: 🔍 Searching: <strong>{{host}}</strong>
// i18n pages.search.server.publicResults: Public results only. Feeds and profiles still come from {{host}}.
// i18n pages.search.server.browsing: The server you are browsing. Point search elsewhere if it has search turned off.
// i18n pages.search.server.own: Your own server.
// i18n pages.search.server.instructions: Some servers turn off search for logged-out visitors. Point search at a server that allows it — feeds, profiles and your account stay on your own server.
// i18n pages.search.server.checking: Checking…
// i18n pages.search.server.use: Use this server
// i18n pages.search.server.useOwn: Use my own server
// i18n pages.search.server.testing: Running a test search…
// i18n pages.search.server.tagsOnly: ⚠ Account search works here ({{accounts}} matched), but a hashtag search comes back with the tag name and no posts — post searches will look empty.
// i18n pages.search.server.noPosts: ⚠ Account search works here ({{accounts}} matched), but this server returned no posts for a common hashtag — post searches will keep coming back empty.
// i18n pages.search.server.works: ✓ Anonymous search works — the test queries matched {{accounts}} accounts and {{posts}} {{postWord}}.
// i18n pages.search.server.noIndex: This server answered but returned nothing for a well-known account. Its search index is empty or restricted — not usable as a search server.
// i18n pages.search.server.authRequired: This server requires a login for search, so it can’t be used anonymously.
// i18n pages.search.server.unreachable: Couldn’t reach that server’s search API.
// i18n pages.search.server.hostLabel: Search server host
// i18n pages.search.savedNamePlaceholder: Name this search
// i18n pages.search.savedNameLabel: Saved search name
// i18n pages.search.action.cancel: Cancel
// i18n pages.search.action.applyAndSearch: Apply &amp; search
// i18n pages.search.budget.maximumApiCalls: Maximum API calls
// i18n pages.search.budget.onePage: 1 page (~40 posts)
// i18n pages.search.budget.twoPages: 2 pages (~80 posts)
// i18n pages.search.budget.threePages: 3 pages (~120 posts)
// i18n pages.search.budget.fivePages: 5 pages (~200 posts)
// i18n pages.search.budget.tenPages: 10 pages (~400 posts)
// i18n pages.search.placeholder.exactPhrase: change detection
// i18n pages.search.placeholder.excludeWords: react vue
// i18n pages.search.anonymousPostSearch: Anonymous post search uses hashtags — Mastodon doesn’t offer anonymous full-text search. Fields below are applied to loaded results.
// i18n pages.search.fullTextSignIn: Sign in
// i18n pages.search.fullTextPostSearch: for full-text post search.
// i18n pages.search.field.exactPhrase: Exact phrase
// i18n pages.search.field.excludeWords: Exclude these words
// i18n pages.search.field.postedBy: Posted by
// i18n pages.search.field.postedAfter: Posted after
// i18n pages.search.field.postedBefore: Posted before
// i18n pages.search.field.language: Language
// i18n pages.search.field.content: Content
// i18n pages.search.field.replies: Replies
// i18n pages.search.field.includeReplies: Include replies
// i18n pages.search.field.repliesOnly: Replies only
// i18n pages.search.field.excludeReplies: Exclude replies
// i18n pages.search.field.sensitive: Sensitive
// i18n pages.search.field.include: Include
// i18n pages.search.field.sensitiveOnly: Sensitive only
// i18n pages.search.field.excludeSensitive: Exclude sensitive
// i18n pages.search.field.searchIn: Search in
// i18n pages.search.field.publicAndLibrary: Public and my library
// i18n pages.search.field.public: Public
// i18n pages.search.field.myLibrary: My library
// i18n pages.search.accountSearchDescription: Mastodon’s account search only matches names &amp; bios. “What they post” runs a post search and condenses the results down to the people who posted — good for finding, say, economists rather than one specific person.
// i18n pages.search.accountField.matchOn: Match on
// i18n pages.search.accountField.followers: Followers
// i18n pages.search.accountField.following: Following
// i18n pages.search.accountField.posts: Posts
// i18n pages.search.accountField.minimum: min
// i18n pages.search.accountField.maximum: max
// i18n pages.search.accountField.minimumFollowers: Minimum followers
// i18n pages.search.accountField.maximumFollowers: Maximum followers
// i18n pages.search.accountField.minimumFollowing: Minimum following
// i18n pages.search.accountField.maximumFollowing: Maximum following
// i18n pages.search.accountField.minimumPosts: Minimum {{posts}}
// i18n pages.search.accountField.maximumPosts: Maximum {{posts}}
// i18n pages.search.accountRangesDescription: Ranges filter the loaded results — e.g. cap followers to skip celebrities, or require a minimum post count to skip dead accounts.
// i18n pages.search.refine.filterPeople: Filter these people
// i18n pages.search.refine.filterLoadedPeople: Filter loaded people
// i18n pages.search.refine.filterResults: Filter these results
// i18n pages.search.refine.filterLoadedResults: Filter loaded results
// i18n pages.search.refine.groupBy: Group by
// i18n pages.search.refine.none: None
// i18n pages.search.refine.author: Author
// i18n pages.search.refine.date: Date
// i18n pages.search.refine.sortPosts: Sort {{posts}}
// i18n pages.search.refine.sort: Sort
// i18n pages.search.refine.sortPeople: Sort people
// i18n pages.search.refine.filterFollowState: Filter by follow state
// i18n pages.search.refine.everyone: Everyone
// i18n pages.search.refine.iFollow: I follow
// i18n pages.search.refine.onlyFollowing: Only accounts you already follow
// i18n pages.search.refine.notYet: Not yet
// i18n pages.search.refine.notFollowing: Only accounts you don’t follow yet
// i18n pages.search.refine.activityMissing: {{count}} of these arrived without a last-post date.
// i18n pages.search.refine.checkActivity: Check activity
// i18n pages.search.refine.oneApiCall: (1 API call)
// i18n pages.search.refine.checkingActivity: Checking activity…
// i18n pages.search.refine.loadedPeople: Refine loaded people
// i18n pages.search.refine.basedOnAccounts: Based on {{count}} loaded accounts
// i18n pages.search.refine.clearFilters: Clear filters
// i18n pages.search.refine.showingAccounts: Showing {{shown}} of {{loaded}} loaded accounts
// i18n pages.search.refine.apiCallsUsed: {{used}} of up to {{budget}} API calls used
// i18n pages.search.refine.loadedPosts: Refine loaded results
// i18n pages.search.refine.basedOnPosts: Based on {{count}} loaded posts
// i18n pages.search.refine.excludeAuthor: Exclude author (this search)
// i18n pages.search.refine.muted: muted
// i18n pages.search.refine.muteEverywhereTitle: Mute this account everywhere, not just in this search
// i18n pages.search.refine.muteEverywhere: Mute everywhere
// i18n pages.search.refine.showExcluded: Show excluded authors again
// i18n pages.search.refine.collapseRepeated: Collapse repeated
// i18n pages.search.refine.collapseRepeatedSentence: Collapse repeated {{posts}}
// i18n pages.search.refine.collapseHint: Folds near-identical {{posts}} from the same author into one row.
// i18n pages.search.refine.clearFiltersPosts: Clear filters
// i18n pages.search.refine.showingPosts: Showing {{shown}} of {{loaded}} loaded posts
// i18n pages.search.refine.hiddenFrom: {{hidden}} hidden from {{excluded}} excluded {{accountWord}}
// i18n pages.search.refine.excluded: excluded
// i18n pages.search.refine.account: account
// i18n pages.search.refine.accounts: accounts
// i18n pages.search.refine.collapsed: {{count}} near-identical {{posts}} collapsed
// i18n pages.search.refine.apiCalls: {{used}} of up to {{budget}} API calls used
// i18n pages.search.refine.onlyLeft: Only {{count}} {{postWord}} left after excluding. The excluded {{accountWord}} made up most of what was loaded — fetching more will find posts from other people.
// i18n pages.search.results.loading: Loading…
// i18n pages.search.results.loadMorePosts: Load more posts
// i18n pages.search.results.people: People
// i18n pages.search.results.noPeople: No people found.
// i18n pages.search.results.directory: Or
// i18n pages.search.results.browseDirectory: browse the server directory
// i18n pages.search.results.insteadOfSearching: instead of searching.
// i18n pages.search.results.searchingPosts: · searching posts…
// i18n pages.search.results.searchingSlow: (this server is being slow)
// i18n pages.search.results.noLoadedPeople: No loaded people match the current filters.
// i18n pages.search.results.searching: Searching…
// i18n pages.search.results.stillWaiting: This server is being slow. Still waiting…
// i18n pages.search.results.timedOut: This search took too long and was stopped. The server may be down or overloaded.
// i18n pages.search.results.tryAgain: Try again
// i18n pages.search.results.noLoadedPosts: No loaded posts match the current filters.
// i18n pages.search.results.hashtags: Hashtags
// i18n pages.search.results.posts: Posts
// i18n pages.search.results.repeatNote.one: +{{count}} near-identical {{postWord}} from this author
// i18n pages.search.results.repeatNote.other: +{{count}} near-identical {{postsWord}} from this author
// i18n pages.search.results.hide: Hide
// i18n pages.search.results.show: Show
// i18n pages.search.results.loadedSummary: Loaded {{count}} {{postsWord}} in {{calls}} API calls. Facet counts and filters apply only to these posts.
// i18n pages.search.results.noResults: No results.
// i18n pages.search.results.nobodyPosted: Nobody has posted <strong>#{{tag}}</strong> yet.
// i18n pages.search.results.noPostsForTag: No posts for <strong>#{{tag}}</strong> came back — and this server can’t search posts, so there may be some we can’t see.
// i18n pages.search.results.followingTag: Following it puts new posts in your home timeline as they appear.
// i18n pages.search.results.viewAndFollow: View and follow #{{tag}}
// i18n pages.search.results.trendingHashtags: Trending hashtags
// i18n pages.search.results.recentUses: {{count}} recent uses
// i18n pages.search.results.chooseSearchServer: Choose a search server
// i18n pages.search.searchSaved: Search saved.
// i18n pages.search.enrichError: Could not load activity dates. Try again.
// i18n pages.search.placeholder.accounts: Search {{network}} accounts
// i18n pages.search.placeholder.hashtags: Search {{network}} hashtags
// i18n pages.search.placeholder.posts: Search {{network}} {{posts}}
// i18n pages.search.accountSource.bioAndPosts: Bio and posts
// i18n pages.search.accountSource.nameAndBioOnly: Name &amp; bio only
// i18n pages.search.accountSource.whatTheyPost: What they post
// i18n pages.search.language.any: Any language
// i18n pages.search.language.english: English
// i18n pages.search.language.spanish: Spanish
// i18n pages.search.language.french: French
// i18n pages.search.language.german: German
// i18n pages.search.language.portuguese: Portuguese
// i18n pages.search.language.japanese: Japanese
// i18n pages.search.language.chinese: Chinese
// i18n pages.search.content.any: Any
// i18n pages.search.content.media: Has media
// i18n pages.search.content.image: Image
// i18n pages.search.content.video: Video
// i18n pages.search.content.audio: Audio
// i18n pages.search.content.poll: Poll
// i18n pages.search.content.link: Link or preview
// i18n pages.search.content.text: Text only
// i18n pages.search.empty.checking: Checking whether search is available on {{host}}…
// i18n pages.search.empty.refusedAnonymous: {{host}} doesn’t allow search without an account. Pick a search server below to search from instead.
// i18n pages.search.empty.refused: {{host}} refused this search. The server may restrict search, or your login may not have search permission.
// i18n pages.search.empty.unreachable: Couldn’t reach {{host}} to check whether search is working. Your connection or the server may be having trouble.
// i18n pages.search.empty.tagsOnly: {{host}} recognises the hashtag but won’t serve the posts behind it. A different search server would fix this.
// i18n pages.search.empty.postsUnavailable: Post search isn't available on {{host}}. It can find accounts, but returns no posts even for a common hashtag — anonymous full-text search is off on almost every server. A different search server would fix this.
// i18n pages.search.empty.notWorking: Search doesn’t appear to be working on {{host}}. A different search server would fix this.

@Component({
  selector: 'app-search',
  imports: [
    FormsModule,
    RouterLink,
    StatusCard,
    AccountSearchHelp,
    AccountResultCard,
    SearchHelperDialog,
    SearchSyntaxHelp,
    SearchServerDiscovery,
    BlueskySearchPanel,
    TranslocoPipe,
  ],
  templateUrl: './search.html',
  // The refine layer's styles are shared with the Bluesky panel, so they live in
  // their own file that both components list — see the header of
  // search-refine.css for why a copy would not do.
  styleUrls: ['./search.css', './search-refine.css'],
})
export class Search implements OnInit, OnDestroy {
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;

  protected capabilities = inject(AnonymousCapabilities);
  private api = inject(Api);
  private accountStore = inject(AccountSearchStore);
  private anonymous = inject(AnonymousAccount);
  private anonymousFollows = inject(AnonymousFollows);
  private anonymousPublic = inject(AnonymousPublicApi);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private diagnostics = inject(PageDiagnostics);
  /** For the "mute everywhere" escalation on an excluded author. */
  private localMod = inject(LocalModeration);
  protected saved = inject(SavedSearches);
  protected recent = inject(RecentSearches);
  protected searchServer = inject(SearchServer);
  /** Which network owns this account, for the landing-panel default. */
  private auth = inject(Auth);
  /** Whether a Bluesky search is running signed in, recorded on save. */
  // Protected, not private: the bar reads it to explain why Bluesky Posts is
  // disabled without a linked account.
  protected session = inject(BlueskySession);
  private activeSearch: Subscription | null = null;

  /** Dev-only structured logging. Silent in production builds. */
  private debug(...args: unknown[]): void {
    if (isDevMode()) {
      console.debug(...args);
    }
  }

  protected query = signal('');

  // --- LLM search helper (sprint openrouter-4) ---
  private openrouter = inject(OpenRouterSession);
  private ai = inject(AiAvailability);
  protected searchHelperOpen = signal(false);

  /**
   * The search-syntax cheat-sheet. Unlike the 🤖 helper this needs no account,
   * no key and no network — the syntax is the same whoever is looking at it.
   */
  protected syntaxHelpOpen = signal(false);

  // --- is search even on here? (anonymous-great sprint 1) ---
  // An empty result set used to render as "No results.", which is a different
  // claim from the truth when the server refuses search or has no post index.
  private searchCapability = inject(SearchCapability);
  private server = inject(Server);

  /**
   * The host whose search capability we are describing.
   *
   * The configured search server wins, because that is where the request went.
   * Otherwise it is wherever `Api` is pointed — the anonymous instance when
   * browsing anonymously, the signed-in server otherwise.
   */
  private capabilityHost(): string {
    return this.searchServer.host() ?? this.server.baseUrl().replace(/^https?:\/\//, '');
  }

  /**
   * The host searches actually go to, always named.
   *
   * Never "this server". An anonymous visitor has no home server to be relative to,
   * and even a signed-in user cannot be expected to remember what they set on the
   * settings page — which was the complaint. Naming it is one word longer and
   * removes a trip to Settings.
   */
  protected searchHostLabel = computed(() => this.searchServer.host() ?? this.browsingHostLabel());

  /** Where everything that is not search comes from. */
  protected browsingHostLabel = computed(() =>
    (this.capabilities.active ? this.anonymous.server() : this.server.baseUrl()).replace(
      /^https?:\/\//,
      '',
    ),
  );

  /**
   * Why the page is empty, when "No results." would be a lie.
   *
   * Null in the honest case (search works, nothing matched) and while nothing has
   * been probed — the message must never appear before we have grounds for it.
   * Recomputes on its own when a probe lands: `peek` reads the service's signal.
   */
  // ------------------------------------------ following a tag with no posts

  /**
   * The query read as a hashtag, if it can be — `#mawkingbird`, `mawkingbird`.
   *
   * Null for anything with whitespace or punctuation, because Mastodon tags are
   * a single alphanumeric run and offering to follow "cat pictures" as a tag
   * would create a follow that never matches anything.
   */
  protected tagCandidate = computed<string | null>(() => {
    const raw = this.query().trim().replace(/^#/, '');
    return /^[\p{L}\p{N}_]+$/u.test(raw) ? raw : null;
  });

  /**
   * Whether to offer following the tag the user just searched for.
   *
   * Following a tag nobody has used yet is legitimate and, for a name you are
   * launching, the entire point — you want to catch the first post. So the
   * offer stands even at zero results. What must not happen is implying the tag
   * is *dead* when the truth is that this server has no post index: that case
   * is `tags-only` / `empty`, and {@link emptyExplanation} already says so
   * above this button.
   */
  protected canFollowSearchedTag = computed(
    () => !!this.tagCandidate() && this.type() !== 'accounts',
  );

  /** Whether the zero-result copy may claim nobody has posted. */
  protected searchSawEverything = computed(() => {
    const ability = this.searchCapability.peek(this.capabilityHost()).statuses;
    return ability === 'works';
  });

  protected emptyExplanation = computed<string | null>(() => {
    const host = this.capabilityHost();
    const ability = this.searchCapability.peek(host);
    // Accounts searches are judged on the accounts canary, posts on the post one.
    const relevant = this.type() === 'accounts' ? ability.accounts : ability.statuses;
    switch (relevant) {
      case 'checking':
        return this.transloco.translate('pages.search.empty.checking', { host });
      case 'refused':
        return this.capabilities.active
          ? this.transloco.translate('pages.search.empty.refusedAnonymous', { host })
          : this.transloco.translate('pages.search.empty.refused', { host });
      case 'unreachable':
        return this.transloco.translate('pages.search.empty.unreachable', { host });
      case 'tags-only':
        // The strongest evidence there is: the server recognised the hashtag,
        // named it back, and handed over no posts. Nothing the user types will
        // change that, so say so instead of implying they should try harder.
        return this.transloco.translate('pages.search.empty.tagsOnly', { host });
      case 'empty':
        // Accounts and posts fail separately, so say which one is missing.
        if (this.type() === 'accounts') {
          return null; // An empty account index is indistinguishable from no match.
        }
        return ability.accounts === 'works'
          ? this.transloco.translate('pages.search.empty.postsUnavailable', { host })
          : this.transloco.translate('pages.search.empty.notWorking', { host });
      default:
        return null;
    }
  });

  /**
   * A search came back with nothing — find out whether that was the truth.
   *
   * Deliberately lazy: zero results is the only outcome where the answer changes
   * what we display, so this is the only place that asks. One extra call, cached
   * per host for the session.
   */
  private async explainEmptyResult(): Promise<void> {
    await this.searchCapability.ensure(this.capabilityHost());
  }

  /**
   * Whether to offer the 🤖 helper at all.
   *
   * Hidden rather than disabled when OpenRouter isn't connected (connections are
   * a power-user surface; power users find the Connections tab). Also hidden for
   * Anonymous: the helper emits DSL operators like `from:` that only work in
   * server-side full-text search, which mastodon.social does not give logged-out
   * visitors — anonymous post search here is a hashtag transform instead. Offering
   * queries the user cannot run would be worse than offering nothing.
   */
  protected canUseSearchHelper = computed(() => {
    if (!this.ai.enabled() || !this.openrouter.connected()) {
      return false;
    }
    // The anonymous exclusion is Mastodon's, not a general rule: it exists
    // because anonymous Mastodon post search is a hashtag transform, so DSL
    // operators cannot run. Bluesky's operators either run or the search needs a
    // session — and when it needs one, Posts is disabled and there is nothing to
    // help with. So on Bluesky the helper is offered whenever a search can run.
    if (this.blueskyMode()) {
      return this.type() === 'accounts' || this.session.linked();
    }
    return !this.capabilities.active;
  });

  /**
   * Take a query from the helper dialog and run it through the normal path.
   *
   * The search type is left alone: the helper was asked for a query *for the
   * mode the user is in*, so switching them to Posts afterwards would discard
   * the very thing they picked the Accounts dropdown to say.
   */
  useSuggestedQuery(query: string): void {
    this.searchHelperOpen.set(false);
    this.query.set(query);
    this.run();
  }

  /**
   * What the helper needs to know about the form: the mode, and what is set.
   *
   * Only fields the user has actually filled in are listed. A dump of every
   * default ("Language: Any language", "Replies: include") would be longer than
   * the request and would read to the model as constraints that were chosen.
   */
  protected searchHelperContext = computed<SearchContext>(() => {
    const target = this.type();
    const filters: string[] = [];
    // Bluesky's criteria live in the panel, and its Advanced form is the only
    // one that applies — the Mastodon fields below are not on screen.
    if (this.blueskyMode()) {
      return {
        target,
        network: 'bluesky',
        filters: this.blueskyPanel()?.describeCriteria() ?? [],
      };
    }
    if (target === 'statuses') {
      const push = (label: string, value: string) => {
        if (value) {
          filters.push(`${label}: ${value}`);
        }
      };
      push('Exact phrase', this.exactPhrase().trim());
      push('Excluding words', this.excludeWords().trim());
      push('From account', this.author().trim());
      push('Posted after', this.after());
      push('Posted before', this.before());
      push('Language', this.language());
      if (this.contentType() !== 'any') {
        push('Content type', this.contentType());
      }
      if (this.replies() !== 'include') {
        push('Replies', this.replies());
      }
      if (this.sensitive() !== 'include') {
        push('Sensitive posts', this.sensitive());
      }
      if (this.scope() !== 'all') {
        push('Scope', this.scope());
      }
    } else if (target === 'accounts' && this.accountSource() !== 'both') {
      const source = this.accountSources.find((option) => option.value === this.accountSource());
      filters.push(`Matching against: ${source?.label ?? this.accountSource()}`);
    }
    return { target, filters, network: 'mastodon' };
  });
  protected results = signal<SearchResults | null>(null);
  protected searching = signal(false);
  protected type = signal<SearchType>('accounts');

  /**
   * True once the reader has picked a type themselves, or arrived with one.
   *
   * Inference must never override a choice. This is the flag that keeps
   * {@link inferTypeFor} to its actual job — guessing when nobody has said —
   * rather than second-guessing the select on every keystroke.
   */
  private typeChosen = false;

  /**
   * The search type a query's *shape* asks for, or null when it does not say.
   *
   * ## Why the old default was wrong
   *
   * The type was hard-coded to `accounts` because it is first in the union, not
   * because it is the right answer. Someone typing a topic — "gardening",
   * "climate" — got a list of *people whose profile text matches*, which is a
   * plausible answer to a question nobody asked, and reads as though the app
   * misunderstood them.
   *
   * ## Why this is inference and not a new default
   *
   * "Default to Posts" is the obvious fix and it is a trap here. Mastodon
   * full-text post search needs both an Elasticsearch index and a token, so on
   * many servers — and anonymously as the *rule* rather than the exception, as
   * `search-capability.ts` documents — a post search returns `[]` for every
   * query, forever, with no error. Defaulting a first-time anonymous visitor
   * into the one search that is usually switched off would be a worse first
   * impression than the wrong-but-populated list they get today.
   *
   * So this only claims the cases the query itself settles:
   *
   * - `@name`, `name@host` — unambiguously a person.
   * - `#tag` — unambiguously a hashtag.
   *
   * Everything else returns null and the existing default stands. A topic
   * search is a *guess* about intent; a leading `@` is a statement of it.
   */
  private inferTypeFor(query: string): SearchType | null {
    const raw = query.trim();
    if (!raw || /\s/.test(raw)) {
      return null;
    }
    if (raw.startsWith('#') && raw.length > 1) {
      return 'hashtags';
    }
    if (raw.startsWith('@') || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) {
      return 'accounts';
    }
    return null;
  }

  /**
   * Progressive feedback for a search that is taking too long.
   *
   * ## Why this exists
   *
   * A search against an unreachable or overloaded server had no ending. The
   * request was subscribed with no timeout, so "Searching…" stayed on screen
   * forever and the only way out was the browser's back button — which lands
   * somewhere else entirely and loses the query. From the reader's side the app
   * simply stopped.
   *
   * Three states, because "slow" and "never" want different answers:
   *
   * - immediately: `Searching…`, which already existed;
   * - after {@link SLOW_SEARCH_MS}: also say the server is being slow, so a long
   *   wait reads as a known condition rather than a hang;
   * - after {@link SEARCH_TIMEOUT_MS}: stop, say so plainly, and offer Retry.
   *
   * The middle state matters more than it looks. Federated servers really are
   * sometimes this slow, and a reader who has been told so will wait; a reader
   * staring at an unchanging spinner assumes it is broken and leaves.
   */
  protected searchSlow = signal(false);
  /** Set when a search was abandoned on the clock. Cleared by the next attempt. */
  protected searchTimedOut = signal(false);
  private slowTimer: ReturnType<typeof setTimeout> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Begin the slow/timeout clock for a search that is starting.
   *
   * `onTimeout` cancels the in-flight request; the caller owns the subscription,
   * so it does the unsubscribing.
   */
  private startSearchClock(onTimeout: () => void): void {
    this.stopSearchClock();
    this.searchSlow.set(false);
    this.searchTimedOut.set(false);
    this.slowTimer = setTimeout(() => this.searchSlow.set(true), SLOW_SEARCH_MS);
    this.timeoutTimer = setTimeout(() => {
      this.diagnostics.warn('Search', 'load:timeout', { afterMs: SEARCH_TIMEOUT_MS });
      this.searching.set(false);
      this.searchSlow.set(false);
      this.searchTimedOut.set(true);
      onTimeout();
    }, SEARCH_TIMEOUT_MS);
  }

  /** Stop the clock. Called on success, on error, and when a search is replaced. */
  private stopSearchClock(): void {
    if (this.slowTimer !== null) {
      clearTimeout(this.slowTimer);
      this.slowTimer = null;
    }
    if (this.timeoutTimer !== null) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    this.searchSlow.set(false);
  }

  /**
   * Whether the Bluesky panel has taken over the page.
   *
   * Deliberately *not* a fourth `SearchType`. `SearchType` is threaded through
   * URL serialization, saved searches, the query serializers and the explain
   * panel, all of which are Mastodon-shaped; widening it would put a "…or
   * bluesky" case in every one of them. A separate flag keeps the Bluesky panel
   * self-contained and leaves the Mastodon machinery untouched.
   */
  protected blueskyMode = signal(false);

  /**
   * A saved Bluesky search waiting for the panel to pick it up.
   *
   * The panel owns its own criteria state, so re-running a saved Bluesky search
   * is a hand-off rather than a method call: this page decides *which* search,
   * the panel decides how to run it. Cleared by the panel once applied.
   */
  protected pendingBlueskySaved = signal<BlueskyPostSearch | null>(null);

  /**
   * Which network the two selects are pointed at.
   *
   * The reader picks a network and a type separately, exactly as they do on the
   * Mastodon side — this is one page with one set of widgets, not two engines
   * with two personalities. `blueskyMode` remains the internal flag (and the URL
   * contract) because widening `SearchType` would put a "…or bluesky" case in
   * every Mastodon-shaped consumer; this is only the widget's view of it.
   */
  protected networkSelection = computed(() => (this.blueskyMode() ? 'bluesky' : 'mastodon'));

  /**
   * Whether the shared Search button is unavailable.
   *
   * Biased towards being clickable: the only reason that always holds is an
   * empty box. Beyond that we consult the in-flight flag of the network being
   * searched — and *only* that one. `searching()` is the Mastodon fetch's flag,
   * so reading it on the Bluesky panel disabled the button for a request that
   * has nothing to do with what is on screen.
   */
  protected searchDisabled = computed(() => {
    if (!this.query().trim()) {
      return true;
    }
    return this.blueskyMode() ? (this.blueskyPanel()?.searching() ?? false) : this.searching();
  });

  /** What the shared box is searching right now, spelled out for the reader. */
  protected queryPlaceholder = computed(() => {
    this.i18n.version();
    const network = this.blueskyMode()
      ? this.transloco.translate('pages.search.network.bluesky')
      : this.transloco.translate('pages.search.network.mastodon');
    switch (this.type()) {
      case 'accounts':
        return this.transloco.translate('pages.search.placeholder.accounts', { network });
      case 'hashtags':
        return this.transloco.translate('pages.search.placeholder.hashtags', { network });
      default:
        return this.transloco.translate('pages.search.placeholder.posts', {
          network,
          posts: this.words().posts,
        });
    }
  });

  /**
   * Bluesky post search needs a linked account; account search does not.
   *
   * Measured: `public.api.bsky.app` answers `searchActors` anonymously, but
   * `searchPosts` refuses unauthenticated callers at both hosts. So Posts is
   * disabled rather than hidden — the reader can see it exists and why it is
   * unavailable, instead of wondering where it went.
   */
  protected blueskyPostsUnavailable = computed(() => this.blueskyMode() && !this.session.linked());

  /**
   * Hashtags is Mastodon-only: Bluesky has no tag *index* to search, only a tag
   * filter on post search. Disabled with the same reasoning as Posts above.
   */
  /**
   * The type select's value, narrowed to what Bluesky can actually serve.
   *
   * `hashtags` is unreachable here — the option is disabled in Bluesky mode and
   * `onNetworkSelect` falls back to Accounts — but the select's type is the
   * page-wide `SearchType`, so the narrowing has to be stated somewhere. Here,
   * once, rather than as a cast at the binding.
   */
  protected blueskyTarget = computed<BlueskySearchTarget>(() =>
    this.type() === 'accounts' ? 'accounts' : 'statuses',
  );

  protected typeUnavailable(type: SearchType): boolean {
    if (!this.blueskyMode()) {
      return false;
    }
    return type === 'hashtags' || (type === 'statuses' && !this.session.linked());
  }

  /**
   * Switch network, keeping the type where it legally can be kept.
   *
   * Moving to Bluesky while on Hashtags — or on Posts without a session — would
   * land on a type that network cannot serve, so the selection falls back to
   * Accounts, which both networks always support.
   */
  onNetworkSelect(value: string): void {
    const bluesky = value === 'bluesky';
    if (bluesky === this.blueskyMode()) {
      return;
    }
    this.webDropped.set([]);
    if (!bluesky) {
      this.blueskyMode.set(false);
      // Coming back the other way, the stale flag would be a *Bluesky* request's
      // — the panel owns that one and clears it itself, but this page's own flag
      // may still be set from before the reader ever left.
      this.searching.set(false);
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { type: this.type(), q: this.query().trim() || null },
        queryParamsHandling: 'merge',
      });
      return;
    }
    this.blueskyMode.set(true);
    // Abandon any Mastodon request still in flight, here rather than only in the
    // URL handler below: the navigation is async, so relying on the round-trip
    // left the shared Search button disabled for the gap between the two — and
    // entirely, if the navigation coalesced into a no-op.
    this.activeSearch?.unsubscribe();
    this.searching.set(false);
    if (this.typeUnavailable(this.type())) {
      this.type.set('accounts');
    }
    // Into the URL, so the panel can be linked to and the back button can
    // restore it. Without this the Bluesky panel is reachable only by using
    // the dropdown — clicking a result and pressing Back landed you on
    // Mastodon Accounts with the query gone.
    //
    // The query rides along rather than being cleared. It used to be dropped
    // (`q: null`) because the panel owned a separate box, so the page's `q` was
    // not the one on screen. Now there is one box: wiping it would delete what
    // the reader just typed for the crime of changing network, when "search
    // this on the other one" is precisely why they reached for the select.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        type: BLUESKY_WIRE_TYPE,
        bskyType: this.type(),
        q: this.query().trim() || null,
      },
      queryParamsHandling: 'merge',
    });
  }

  // --- Web search hand-off ---
  // The four engines sit at the bottom of the type dropdown, but they are *not*
  // search types: picking one opens a tab and leaves the page exactly as it was.
  // Keeping them out of `SearchType` keeps "google" out of the URL, out of saved
  // searches, out of the capability probes, and out of every `type() === …`
  // branch — the dropdown is a widget we are borrowing, not a state machine we
  // are extending. `onTypeSelect` reverts the select to the real type after an
  // engine is chosen, so the control never displays a state the page isn't in.
  protected readonly webEngines = WEB_ENGINES;

  /** The last web search's dropped criteria, shown as a note under the bar. */
  protected webDropped = signal<WebDroppedItem[]>([]);
  /** Engine label for the note, so it reads "Google can't filter by…". */
  protected webEngineLabel = signal('');

  private transloco = inject(TranslocoService);
  /**
   * Gives the `translate()` calls in the computeds here a dependency on the
   * loaded dictionary. Without it, a label built before the fetch lands keeps
   * the raw key forever. See {@link TranslatedText}.
   */
  private i18n = inject(TranslatedText);

  /**
   * `webDropped()`, rendered into the reader's language.
   *
   * Each dropped criterion carries a stable code rather than English prose (see
   * `WebDroppedItem`), so the sentence is built here rather than in the
   * serializer — a joined list of translated phrases, not a joined list of
   * English ones with a key swapped in after the fact.
   */
  protected webDroppedLabels = computed(() =>
    this.webDropped().map((item) => {
      switch (item.code) {
        case 'after':
          return this.transloco.translate<string>('pages.search.webDropped.after', {
            date: item.value,
          });
        case 'before':
          return this.transloco.translate<string>('pages.search.webDropped.before', {
            date: item.value,
          });
        case 'language':
          return this.transloco.translate<string>('pages.search.webDropped.language', {
            language: item.value,
          });
        case 'contentType':
          return this.transloco.translate<string>('pages.search.webDropped.contentType', {
            contentType: item.value,
          });
        default:
          return this.transloco.translate<string>(`pages.search.webDropped.${item.code}`);
      }
    }),
  );

  /**
   * Dropdown change: either a real search type, or an engine hand-off.
   *
   * The element has to be put back by hand. `[ngModel]` is bound to `type()`,
   * which an engine pick deliberately does not change — and with no change to
   * the bound value there is nothing for Angular to write back, so the `<select>`
   * would sit there displaying "Google" while the page is still on Accounts.
   * Restoring `el.value` directly is what makes the option behave as a button.
   */
  onTypeSelect(value: string, el?: HTMLSelectElement): void {
    if (isWebEngine(value)) {
      this.searchTheWeb(value);
      if (el) {
        el.value = this.type();
      }
      return;
    }
    this.webDropped.set([]);
    // On Bluesky the type select drives the panel's target rather than the
    // Mastodon search's type, but it is the *same* signal either way — that is
    // the point of having one widget instead of two.
    // An explicit pick from the dropdown outranks anything the query looks like.
    this.typeChosen = true;
    this.type.set(value as SearchType);
    if (this.blueskyMode()) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { bskyType: value },
        queryParamsHandling: 'merge',
      });
    }
  }

  /**
   * Hand the current query off to a web search engine in a new tab.
   *
   * Scoped to the host the search would have gone to, so results are posts from
   * that instance's own pages. Criteria the web can't express are dropped by the
   * serializer and reported under the bar rather than silently ignored.
   */
  searchTheWeb(engine: WebEngine): void {
    const criteria =
      this.type() === 'statuses' && !this.blueskyMode()
        ? this.postCriteria()
        : // Accounts/hashtags have no post criteria; the raw box is the query.
          // Bluesky's structured filters have no `site:`-style equivalent
          // either, so only the free text is translated — an honest "here is a
          // way to find something", not "your search, minus bits".
          { words: this.query().trim() };
    // Bail on an empty search rather than opening a tab that lists the whole
    // instance. Judged on the *unscoped* query: `site:` alone is non-empty but
    // carries no search terms, so testing the final string would let a blank
    // box through.
    if (!serializeWebQuery(criteria).query.trim()) {
      return;
    }
    // `capabilityHost()` is '' when Api points at the app's own origin, and a
    // bare `site:` would be worse than none — fall back to the actual host.
    // On Bluesky the posts live on bsky.app, which is also the escape hatch for
    // the one thing an unlinked reader genuinely cannot do: `searchPosts`
    // refuses anonymous callers, but the posts themselves are public web pages.
    const host = this.blueskyMode() ? 'bsky.app' : this.capabilityHost() || window.location.host;
    const { query, dropped } = serializeWebQuery(criteria, host);
    this.webDropped.set(dropped);
    this.webEngineLabel.set(WEB_ENGINES.find((e) => e.id === engine)?.label ?? '');
    window.open(webSearchUrl(engine, query), '_blank', 'noopener');
  }

  // --- API-call budget (sprint 3) ---
  // A ceiling on HTTP requests one search may spend. `callsUsed` counts real
  // requests; pagination stops before it would exceed `apiBudget`. Anonymous
  // post search costs N calls per page (one tag timeline each), so the "next
  // page cost" is the tag count there and 1 everywhere else.
  // Budget = how many large (40-post) pages to pull eagerly on Search, so
  // client-side faceting has a real corpus to work with. Raising it after a
  // search tops up with the extra pages; "Load more" keeps going past it.
  protected readonly budgetOptions: {
    value: number;
    label: string;
  }[] = [
    { value: 1, label: 'pages.search.budget.onePage' },
    { value: 2, label: 'pages.search.budget.twoPages' },
    { value: 3, label: 'pages.search.budget.threePages' },
    { value: 5, label: 'pages.search.budget.fivePages' },
    { value: 10, label: 'pages.search.budget.tenPages' },
  ];
  protected apiBudget = signal<number>(DEFAULT_BUDGET_SIMPLE);
  protected callsUsed = signal(0);
  /** How many statuses were requested but capped away by the budget (anon fan-out). */
  protected tagsDropped = signal(0);

  // Pagination cursors for "load more": authenticated search pages by offset;
  // anonymous merges per-tag timelines paged by the oldest seen status id.
  private nextOffset = 0;
  private oldestId = '';
  private executedQuery = '';
  private executedType: SearchType = 'accounts';
  /** Hashtags used for the current anonymous post search (null when not applicable). */
  private firstPageTags: string[] | null = null;

  /** Requests the *next* page would spend: N tags anonymous, else 1. */
  protected nextPageCost = computed(() =>
    this.capabilities.active && this.executedType === 'statuses'
      ? (this.firstPageTags?.length ?? 1)
      : 1,
  );

  /** Auto-fill wants another page while the last one had results and the next
   *  page still fits inside the chosen budget (the eager corpus-building phase).
   *  Only post searches page — accounts/hashtags are a single call. */
  protected autoFillWants = computed(
    () =>
      this.executedType === 'statuses' &&
      !!this.results()?.statuses.length &&
      this.callsUsed() + this.nextPageCost() <= this.apiBudget(),
  );

  /** The manual "Load more" button keeps working past the budget (the user asked
   *  to keep loading), up to a hard safety cap so it can't run away. */
  protected canLoadMore = computed(
    () =>
      this.executedType === 'statuses' &&
      !!this.results()?.statuses.length &&
      this.callsUsed() < LOAD_MORE_HARD_CAP,
  );

  // --- Advanced post-search form (sprint 2) ---
  // Each field binds to ngModel; `postCriteria` assembles them into the rich
  // PostSearchCriteria that drives serialization, chips, and Explain.
  protected advancedOpen = signal(false);
  protected exactPhrase = signal('');
  protected excludeWords = signal('');
  protected author = signal('');
  /** Example account syntax, deliberately kept literal rather than translated. */
  protected readonly authorPlaceholder = '@account@server.example';
  protected before = signal('');
  protected after = signal('');
  protected language = signal('');
  protected contentType = signal<PostContentType>('any');
  protected replies = signal<Tristate>('include');
  protected sensitive = signal<Tristate>('include');
  protected scope = signal<'all' | 'public' | 'library'>('all');

  // --- Advanced account-search form (Phase 3) ---
  // `accountSource` picks where the query is matched: bio (the plain account
  // endpoint), posts (a post search condensed to its authors), or both merged.
  // The six numeric fields gate loaded results by follower/following/post counts
  // (the "real people vs celebrities vs dead accounts" tool) — client-side only.
  protected accountSource = signal<AccountSearchSource>('both');
  protected followersMin = signal('');
  protected followersMax = signal('');
  protected followingMin = signal('');
  protected followingMax = signal('');
  protected statusesMin = signal('');
  protected statusesMax = signal('');

  protected readonly accountSources: { value: AccountSearchSource; label: string }[] = [
    { value: 'both', label: 'pages.search.accountSource.bioAndPosts' },
    { value: 'bio', label: 'pages.search.accountSource.nameAndBioOnly' },
    { value: 'posts', label: 'pages.search.accountSource.whatTheyPost' },
  ];

  /** Parse a numeric-field string into a bound, ignoring blanks/garbage. */
  private numOrUndef(raw: string): number | undefined {
    const n = Number(raw.trim());
    return raw.trim() && Number.isFinite(n) && n >= 0 ? n : undefined;
  }

  private range(minRaw: string, maxRaw: string): NumericRange | undefined {
    const min = this.numOrUndef(minRaw);
    const max = this.numOrUndef(maxRaw);
    return min != null || max != null ? { min, max } : undefined;
  }

  /** The account advanced form assembled into rich criteria. */
  protected accountCriteria = computed<AccountSearchCriteria>(() => ({
    text: this.query().trim(),
    source: this.accountSource(),
    followers: this.range(this.followersMin(), this.followersMax()),
    following: this.range(this.followingMin(), this.followingMax()),
    statuses: this.range(this.statusesMin(), this.statusesMax()),
  }));

  /** True when any account advanced field is set beyond the defaults. */
  protected hasAccountAdvanced = computed(
    () =>
      this.accountSource() !== 'both' ||
      !!this.followersMin() ||
      !!this.followersMax() ||
      !!this.followingMin() ||
      !!this.followingMax() ||
      !!this.statusesMin() ||
      !!this.statusesMax(),
  );

  /** Bundled language options (no API call — spec §6.4). */
  protected readonly languages = [
    { code: '', label: 'pages.search.language.any' },
    { code: 'en', label: 'pages.search.language.english' },
    { code: 'es', label: 'pages.search.language.spanish' },
    { code: 'fr', label: 'pages.search.language.french' },
    { code: 'de', label: 'pages.search.language.german' },
    { code: 'pt', label: 'pages.search.language.portuguese' },
    { code: 'ja', label: 'pages.search.language.japanese' },
    { code: 'zh', label: 'pages.search.language.chinese' },
  ];

  protected readonly contentTypes: { value: PostContentType; label: string }[] = [
    { value: 'any', label: 'pages.search.content.any' },
    { value: 'media', label: 'pages.search.content.media' },
    { value: 'image', label: 'pages.search.content.image' },
    { value: 'video', label: 'pages.search.content.video' },
    { value: 'audio', label: 'pages.search.content.audio' },
    { value: 'poll', label: 'pages.search.content.poll' },
    { value: 'link', label: 'pages.search.content.link' },
    { value: 'text', label: 'pages.search.content.text' },
  ];

  /** The advanced form assembled into the rich criteria object. */
  protected postCriteria = computed<PostSearchCriteria>(() => ({
    words: this.query().trim() || undefined,
    exactPhrase: this.exactPhrase().trim() || undefined,
    excludeWords: this.excludeWords().trim() || undefined,
    author: this.author().trim() || undefined,
    dates:
      this.after() || this.before()
        ? { after: this.after() || undefined, before: this.before() || undefined }
        : undefined,
    language: this.language() || undefined,
    contentType: this.contentType() === 'any' ? undefined : this.contentType(),
    replies: this.replies() === 'include' ? undefined : this.replies(),
    sensitive: this.sensitive() === 'include' ? undefined : this.sensitive(),
    scope: this.scope() === 'all' ? undefined : this.scope(),
  }));

  /** The complete current search assembled from all form state — the shape that
   *  gets saved and encoded into shareable URLs (§15/§16). Presentation/budget
   *  travel with it; transient view state (page, facets) deliberately does not. */
  protected currentSearch = computed<MawkingbirdSearch>(() => {
    const target = this.type() === 'statuses' ? 'posts' : (this.type() as SearchTarget);
    return {
      version: 1,
      target,
      account: target === 'accounts' ? this.accountCriteria() : undefined,
      hashtag: target === 'hashtags' ? { text: this.query().trim() } : undefined,
      post: target === 'posts' ? this.postCriteria() : undefined,
      apiCallBudget: this.apiBudget(),
      presentation: { grouping: this.grouping() },
    };
  });

  // --- Saved searches + sharing (sprint 4) ---
  protected savedMenuOpen = signal(false);
  protected saveDialogOpen = signal(false);
  protected saveName = signal('');
  protected shareCopied = signal(false);
  protected savedNotice = signal('');

  /** Active-filter chips for the last executed post search (§10). */
  protected chips = computed<Chip[]>(() =>
    this.type() === 'statuses' && this.results()
      ? postChips(this.executedCriteria() ?? {}, !this.capabilities.active)
      : [],
  );

  protected explainOpen = signal(false);

  /** Explain-panel content for the last executed post search (§9). */
  protected explain = computed<ExplainPanel | null>(() => {
    if (this.type() !== 'statuses' || !this.results()) {
      return null;
    }
    const anonTags = this.capabilities.active
      ? (this.results()?.hashtags ?? []).map((h) => h.name)
      : null;
    return explainPostSearch(
      {
        version: 1,
        target: 'posts',
        post: this.executedCriteria() ?? {},
        apiCallBudget: this.apiBudget(),
        presentation: { grouping: 'none' },
      },
      !this.capabilities.active,
      anonTags,
      { maximum: this.apiBudget(), used: this.callsUsed(), tagsDropped: this.tagsDropped() },
    );
  });

  /** Snapshot of the criteria that produced the current results (for chips/Explain). */
  private executedCriteria = signal<PostSearchCriteria | null>(null);

  /**
   * Criteria staged by the advanced form for the next fetch. Because
   * `applyAdvanced` rewrites the query box into the serialized string, we can't
   * reconstruct the structured criteria from the URL — so we stash them here and
   * let `fetch` adopt them, falling back to a words-only search for the plain box.
   */
  private pendingCriteria: PostSearchCriteria | null = null;

  // --- Client-side refinement over loaded post results (sprint 1) ---
  // None of this makes an API call: it narrows/reshapes results already in hand.
  protected loadedFilter = signal('');
  protected grouping = signal<ResultGrouping>('none');
  // Sort of the loaded results — a reorder in memory, never a re-fetch. Kept as
  // separate signals per result type so switching tabs doesn't carry an
  // irrelevant sort key across (a post sort makes no sense for accounts).
  protected readonly statusSorts = STATUS_SORTS;
  protected readonly accountSorts = ACCOUNT_SORTS;
  protected statusSort = signal<StatusSortKey>('relevance');
  protected accountSort = signal<AccountSortKey>('relevance');
  // Facets open by default — collapsed, the "Refine loaded results" section is
  // easy to miss entirely.
  protected refineOpen = signal(true);
  /**
   * How many refinements are currently narrowing the results.
   *
   * Exists so a collapsed refinement panel can never hide something that is
   * doing work: on a phone the panel closes once results exist, and a closed
   * panel that is silently filtering is worse than the wall it replaced. The
   * summary carries this count, so "3 filters" is visible without opening it.
   *
   * Counts only what the reader chose. Defaults — no text filter, `both` for
   * account matching, `any` content type, `all` scope — are not refinements and
   * must not inflate the badge, or it reads "2 filters" on an untouched page.
   */
  protected activeRefinementCount = computed(() => {
    let count = this.selectedFacets().length + this.excludedAuthors().size;
    if (this.type() === 'accounts') {
      if (this.accountFilter().trim()) count++;
      if (this.accountSource() !== 'both') count++;
      if (this.followersMin().trim()) count++;
      if (this.followersMax().trim()) count++;
    } else {
      if (this.loadedFilter().trim()) count++;
      if (this.contentType() !== 'any') count++;
      if (this.scope() !== 'all') count++;
    }
    return count;
  });

  protected selectedFacets = signal<FacetSelection[]>([]);

  // --- flood control ---

  /**
   * Authors excluded from this search's results, by `acct`.
   *
   * Deliberately **not** persisted and cleared by {@link resetRefinements} on
   * every new query. An account that floods "rust" is often a perfectly good
   * result for "gardening", and a hidden, remembered blocklist silently
   * distorting future searches is exactly the kind of state someone arms once
   * and then spends a year confused by. Making someone disappear for good is
   * what mute is for, and the row offers it.
   */
  protected excludedAuthors = signal<ReadonlySet<string>>(new Set());

  /** Fold near-identical posts by the same author into one row. */
  protected collapseRepeats = signal(false);

  /** Collapsed rows the user has clicked "show" on, keyed by the kept status id. */
  protected expandedRepeats = signal<ReadonlySet<string>>(new Set());

  /**
   * Statuses after facets, exclusions and the text filter — but *before*
   * repeat-collapsing, which produces rows rather than statuses.
   */
  private refinedStatuses = computed<Status[]>(() => {
    const all = this.results()?.statuses ?? [];
    const facets = this.selectedFacets();
    // Facets of different kinds AND together; values within a kind OR together.
    const byKind = new Map<FacetKind, string[]>();
    for (const f of facets) {
      byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f.value]);
    }
    const faceted = all.filter((s) =>
      [...byKind.entries()].every(([kind, values]) =>
        values.some((v) => statusMatchesFacet(s, kind, v)),
      ),
    );
    // Exclusion before the text filter: both are cheap, but this keeps the
    // "hidden by exclusion" count meaning what it says.
    const kept = excludeAuthors(faceted, this.excludedAuthors());
    // Sort last, so it reorders exactly the posts that survive facet + text
    // filtering (grouping then buckets this sorted list).
    return sortStatuses(filterLoaded(kept, this.loadedFilter()), this.statusSort());
  });

  /**
   * The rows the list renders: one per surviving status, each carrying any
   * near-identical siblings it stands in for.
   *
   * Collapsing runs after sorting so the surviving copy is whichever the sort
   * ranked highest, not an arbitrary one.
   */
  protected statusRows = computed<CollapsedStatus[]>(() =>
    this.collapseRepeats()
      ? collapseRepeatRuns(this.refinedStatuses())
      : this.refinedStatuses().map((status) => ({ status, duplicates: [] })),
  );

  /** Statuses actually on screen — what grouping and the counters work from. */
  protected visibleStatuses = computed<Status[]>(() => this.statusRows().map((row) => row.status));

  /**
   * Hidden near-identical posts, keyed by the id of the row that stands in for
   * them.
   *
   * A lookup rather than threading {@link CollapsedStatus} through
   * {@link groupResults}: grouping buckets statuses, and rewriting it to carry
   * rows would complicate the one thing on this page that is currently simple.
   */
  private duplicatesById = computed(() => {
    const map = new Map<string, Status[]>();
    for (const row of this.statusRows()) {
      if (row.duplicates.length) {
        map.set(row.status.id, row.duplicates);
      }
    }
    return map;
  });

  /** Near-identical posts this row is standing in for. Empty when none. */
  protected duplicatesOf(id: string): Status[] {
    return this.duplicatesById().get(id) ?? [];
  }

  /** How many posts the exclusions removed from the loaded set. */
  protected excludedCount = computed(() => {
    const excluded = this.excludedAuthors();
    if (!excluded.size) {
      return 0;
    }
    return (this.results()?.statuses ?? []).filter((s) => excluded.has(s.account.acct)).length;
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
      excluded: this.isAuthorExcluded(acct),
      total: this.excludedAuthors().size,
    });
  }

  protected clearExcludedAuthors(): void {
    this.excludedAuthors.set(new Set());
  }

  /**
   * Mute an author everywhere, not just in this search — the escalation for
   * "this account is a problem", as opposed to "this account is noise here".
   *
   * Goes through {@link LocalModeration} rather than the server so it works
   * anonymously and against any instance, matching how block/mute already
   * behave elsewhere in the app. The author is also excluded from the current
   * results, because otherwise muting them would leave them on screen until
   * the next search.
   */
  protected muteAuthorEverywhere(acct: string): void {
    const account = (this.results()?.statuses ?? []).find((s) => s.account.acct === acct)?.account;
    if (!account) {
      return;
    }
    this.localMod.mute(account, null);
    this.excludedAuthors.update((set) => new Set(set).add(acct));
    this.diagnostics.info('Search', 'user:mute-from-search', { from: 'flood-control' });
  }

  /** True once an author has been muted app-wide, so the row can say so. */
  protected isAuthorMuted(acct: string): boolean {
    this.localMod.entries();
    const account = (this.results()?.statuses ?? []).find((s) => s.account.acct === acct)?.account;
    return !!account && this.localMod.isMuted(account);
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

  /**
   * Whether to nudge the user to load more.
   *
   * Excluding a flooder from an 80-post corpus can leave a handful of results,
   * because the flooder *was* the corpus. Rather than silently spending API
   * calls to refill (a click shouldn't cost requests the user didn't ask for),
   * the page says what happened and offers the button.
   */
  protected suggestMoreAfterExclusion = computed(
    () =>
      this.excludedCount() > 0 &&
      this.visibleStatuses().length < THIN_RESULTS &&
      this.canLoadMore(),
  );

  /** Facets computed from all loaded statuses (counts reflect the full load). */
  protected facets = computed<Facet[]>(() => buildFacets(this.results()?.statuses ?? []));

  /**
   * The author facet, reused by the exclusion list.
   *
   * Counts come from the *unfiltered* load, so an excluded author keeps showing
   * the number of posts they are contributing — which is what justifies keeping
   * them excluded, and what lets you undo it knowingly.
   */
  protected authorFacet = computed<Facet | null>(
    () => this.facets().find((f) => f.kind === 'author') ?? null,
  );

  /** Loaded statuses reshaped by the current grouping selection. */
  protected groups = computed(() => groupResults(this.visibleStatuses(), this.grouping()));

  /**
   * One line saying the search finished and what it found.
   *
   * ## Why a phone needs this and a desktop does not
   *
   * The page is a two-column grid — refinement controls left, results right —
   * that collapses to one column at 800px with the *form* column first in DOM
   * order. So on a phone, submitting a search changes only the part of the
   * screen the reader is looking at by adding facets; the results themselves are
   * a full screen further down. The reported symptom was "facets alone look like
   * nothing happened", and that is exactly what it looks like.
   *
   * There was already a count — "Loaded 12 posts in 3 API calls" — but it lives
   * inside the refine block in that same left column, it is a note about what
   * the facet counts are computed over, and it is phrased for someone auditing
   * an API budget. It is not an answer to "did my search work".
   *
   * Null while idle or in flight: the searching and timed-out states have their
   * own copy, and two overlapping claims about the same request is worse than
   * one. Rendered into an `aria-live` region so it is also the answer for a
   * reader who cannot see the results appear.
   */
  protected resultAnnouncement = computed<string | null>(() => {
    // Deliberately *not* gated on `searching`. The first page clears that flag
    // and then `maybeAutoFill` pages again to fill the facet corpus, setting it
    // right back — so a "hide while searching" rule would show the count and
    // then blank it, which is the flicker this line exists to prevent. What
    // gates it instead is having something true to say: the results signal for
    // posts, `accountSearchRan` for accounts. The count then only ever grows.
    if (this.searchTimedOut()) {
      return null;
    }
    if (this.type() === 'accounts') {
      if (!this.accountSearchRan()) {
        return null;
      }
      const count = this.loadedAccountCount();
      return this.transloco.translate(
        count === 1 ? 'pages.search.found.accounts.one' : 'pages.search.found.accounts.other',
        { count },
      );
    }
    if (!this.results()) {
      return null;
    }
    const count = this.loadedCount();
    return this.transloco.translate(
      count === 1 ? 'pages.search.found.posts.one' : 'pages.search.found.posts.other',
      { count, posts: this.words().posts, post: this.words().post },
    );
  });

  /**
   * Curated sets matching the query, shown above the account results.
   *
   * Free — both corpora are compiled in — so this runs alongside a normal
   * account search rather than hiding behind a fourth type in the dropdown.
   * Reads the *submitted* query rather than the box, so the block does not
   * flicker in and out while someone is typing.
   *
   * Only on the accounts tab: that is the "who should I follow" search, which
   * is the question a kit answers. On a post search it would be an interruption.
   */
  private readonly kitLanguages = inject(KnownLanguages);
  private readonly kitLocale = inject(UiLocale);
  protected kitMatches = computed(() =>
    this.type() === 'accounts'
      ? kitMatchesFor(this.ranQuery(), 3, this.kitLanguages.codes(), this.kitLocale.active())
      : [],
  );

  /**
   * The query the last search actually ran with.
   *
   * A signal rather than reading `urlQuery`, which is a plain field and would
   * not drive a computed. Set where a search starts, so the kit block reflects
   * what was searched rather than what is currently in the box — otherwise it
   * appears and disappears under the reader as they type.
   */
  private ranQuery = signal('');

  protected loadedCount = computed(() => this.results()?.statuses.length ?? 0);
  protected shownCount = computed(() => this.visibleStatuses().length);

  // Idle-state trends: shown under the box before a hashtag search is run.
  protected trendingTags = signal<Tag[]>([]);
  private trendsRequested = false;
  /** Last q/type reflected in the URL, so run() can detect an identical re-search
   *  (which wouldn't emit a new queryParamMap) and fetch directly. */
  private urlQuery = '';
  private urlType: SearchType = 'accounts';

  private sharedLinkHandled = false;

  ngOnInit(): void {
    this.diagnostics.info('Search', 'page:open', {
      anonymous: this.capabilities.active,
      savedSearches: this.saved.all().length,
    });
    // Restore the query/type from the URL so that returning here (e.g. via the
    // browser back button after visiting a result) re-runs the same search
    // instead of showing an empty page.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      // On first load, a shared link may carry the full structured search
      // (a compact `?s=` blob or advanced flat params). Decode it once into the
      // form and run it, rather than treating it as a bare q/type search.
      if (!this.sharedLinkHandled && this.isSharedLink(params)) {
        this.sharedLinkHandled = true;
        const decoded = decodeSearchFromParams((k) => params.get(k));
        this.applySearch(decoded);
        return;
      }
      this.sharedLinkHandled = true;

      // Deep-link from the Lists tab: ?saved=<id> loads and runs a saved search.
      const savedId = params.get('saved');
      if (savedId) {
        const found = this.saved.all().find((s) => s.id === savedId);
        if (found) {
          // Same routing rule as `runSaved`: the saved network decides the
          // engine, not the panel that happens to be showing.
          if (isBlueskySaved(found)) {
            this.blueskyMode.set(true);
            this.pendingBlueskySaved.set(found.search);
          } else if (isMastodonSaved(found)) {
            this.applySearch(found.search);
          }
          return;
        }
      }

      const q = params.get('q') ?? '';
      const rawType = params.get('type');

      // Bluesky is carried as a *wire value*, not as a fourth `SearchType`.
      // Widening the type would put a "…or bluesky" case in the URL serializer,
      // the query serializers, saved searches and the explain panel, all of
      // which are Mastodon-shaped — see the note on `blueskyMode`. Translating
      // once here keeps that boundary exactly where it already was.
      if (rawType === BLUESKY_WIRE_TYPE) {
        this.blueskyMode.set(true);
        // Leaving Mastodon abandons any Mastodon search that was in flight. Its
        // `searching` flag has to be cleared with it: the flag gates the shared
        // Search button, so a request left hanging here came back as a dead
        // button on the *other* network — surviving a reload, because the URL
        // it reloaded still routed through this early return.
        this.activeSearch?.unsubscribe();
        this.searching.set(false);
        // Which half of Bluesky — posts or accounts — rides alongside as
        // `bskyType`, so a shared link restores the type select too. Absent in
        // links made before the selects were split; posts was the only mode
        // those could mean.
        const bskyType = params.get('bskyType');
        const restored = bskyType === 'accounts' ? 'accounts' : 'statuses';
        this.type.set(this.typeUnavailable(restored) ? 'accounts' : restored);
        this.urlQuery = q;
        this.query.set(q);
        return;
      }

      // No type in the URL: fall back to the account's own network. A
      // Bluesky-primary reader searching Mastodon by default is searching a
      // connector that, after the Sprint 4 opt-in reversal, may not exist at
      // all — so the default has to follow the identity, not the app's history.
      //
      // Only when the URL says nothing. An explicit `?type=` always wins, or a
      // shared Mastodon link would silently open a different engine for
      // Bluesky-primary readers and show them something the sender never saw.
      if (!rawType && !q && this.auth.isBlueskyPrimary) {
        this.blueskyMode.set(true);
        this.activeSearch?.unsubscribe();
        this.searching.set(false);
        // Posts is the interesting default, but it needs a session; without one
        // the select would open on a disabled option.
        this.type.set(this.session.linked() ? 'statuses' : 'accounts');
        return;
      }

      const t = (rawType as SearchType) ?? 'accounts';
      // A `type` in the URL is a decision too — a shared link, a saved search, or
      // the reader's own earlier pick coming back through the history. Inference
      // must not overrule it on the next Search press.
      if (rawType) {
        this.typeChosen = true;
      }
      this.blueskyMode.set(false);
      this.urlQuery = q;
      this.urlType = t;
      this.query.set(q);
      this.type.set(t);
      if (q.trim()) {
        // Returning to an account search (e.g. Back from a profile): restore the
        // in-memory snapshot rather than re-running the whole fan-out.
        if (t === 'accounts' && this.restoreAccountSnapshot(q.trim())) {
          return;
        }
        this.fetch(q.trim(), t);
      } else {
        this.activeSearch?.unsubscribe();
        this.searching.set(false);
        this.results.set(null);
        this.loadTrends();
      }
    });
  }

  /** Save the current account result set so returning here restores it. */
  ngOnDestroy(): void {
    // Both timers hold a closure over this component. Left running, a 20-second
    // timeout fires against a page the reader navigated away from 19 seconds
    // ago and writes state nothing is rendering.
    this.stopSearchClock();
    this.saveAccountSnapshot();
  }

  private saveAccountSnapshot(): void {
    if (this.type() !== 'accounts' || !this.accountItems().length) {
      return;
    }
    this.accountStore.save({
      query: this.executedQuery,
      items: this.accountItems(),
      relationships: this.relationships(),
      expanded: [...this.expandedAccounts()],
      facets: this.selectedAccountFacets(),
      filter: this.accountFilter(),
      sort: this.accountSort(),
      followFilter: this.followFilter(),
      bounds: this.executedAccountBounds(),
      callsUsed: this.callsUsed(),
      // The results column doesn't scroll internally (overflow:hidden) — the page
      // scrolls, so the window offset is what to restore.
      scrollTop: typeof window !== 'undefined' ? window.scrollY : 0,
    });
  }

  /** Restore a snapshot for `q` if one is stored; returns true when it did. */
  private restoreAccountSnapshot(q: string): boolean {
    const snap = this.accountStore.take(q);
    if (!snap) {
      return false;
    }
    this.debug('[search] restoring account snapshot', { q, items: snap.items.length });
    this.activeSearch?.unsubscribe();
    this.searching.set(false);
    this.results.set(null);
    this.executedQuery = snap.query;
    this.executedType = 'accounts';
    this.accountItems.set(snap.items);
    this.relationships.set(snap.relationships);
    this.expandedAccounts.set(new Set(snap.expanded));
    this.selectedAccountFacets.set(snap.facets);
    this.accountFilter.set(snap.filter);
    this.accountSort.set(snap.sort ?? 'relevance');
    this.followFilter.set(snap.followFilter ?? 'all');
    this.executedAccountBounds.set(snap.bounds);
    this.callsUsed.set(snap.callsUsed);
    this.accountSearchRan.set(true);
    // NOTE: scroll-offset restore is intentionally not attempted here. The
    // router's in-memory scroller resets scroll to top on navigation *after* this
    // runs, and racing it with timeouts proved unreliable. The result set itself
    // is fully restored (the thing that was expensive to rebuild); `snap.scrollTop`
    // is retained for a future fix that hooks the router's scroll event.
    return true;
  }

  /** A shared link is one carrying structured search beyond a bare q/type: the
   *  compact blob, or any of the advanced flat params. */
  private isSharedLink(params: { has(key: string): boolean }): boolean {
    return (
      params.has('s') ||
      params.has('after') ||
      params.has('media') ||
      params.has('language') ||
      params.has('scope') ||
      params.has('calls')
    );
  }

  /**
   * Fetch trending tags once, for the idle hashtag state. Failures show nothing.
   *
   * Trending *posts* used to be fetched here too, for the idle post-search
   * state. That state now shows the search-syntax reference instead, so the
   * request went with it rather than being left to cost a round trip for
   * something nothing renders.
   */
  private loadTrends(): void {
    if (this.trendsRequested) {
      return;
    }
    this.trendsRequested = true;
    this.api
      .trendingTags()
      .pipe(catchError(() => EMPTY))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((tags) => this.trendingTags.set(tags));
  }

  /** Sum of a tag's recent-history `uses` for the "N recent uses" line. */
  tagUses(tag: Tag): number {
    return (tag.history ?? []).reduce((sum, h) => sum + Number(h.uses || 0), 0);
  }

  /**
   * Run the same search again after it was abandoned on the clock.
   *
   * Delegates to {@link run} rather than re-issuing the request directly, so a
   * retry goes through exactly the path a fresh search does — `run()` already
   * handles the case this needs, where the query params are identical and the
   * router would otherwise emit nothing.
   */
  protected retrySearch(): void {
    this.searchTimedOut.set(false);
    this.run();
  }

  run(): void {
    const q = this.query().trim();
    if (!q) {
      return;
    }
    // Bluesky runs in the panel, which owns the criteria and parses the box's
    // operators. Same button, same box, different engine underneath — which is
    // the whole point of the shared bar.
    if (this.blueskyMode()) {
      this.diagnostics.info('Search', 'user:run', {
        type: this.type(),
        queryLength: q.length,
        network: 'bluesky',
      });
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { q, type: BLUESKY_WIRE_TYPE, bskyType: this.type() },
        queryParamsHandling: 'merge',
      });
      this.blueskyPanel()?.runQuery();
      return;
    }
    // Let the query's shape pick the type, but only while nobody has chosen one.
    // Applied here rather than as the box changes so the select does not twitch
    // under the reader mid-word; by the time Search is pressed the query is
    // whatever they meant it to be.
    if (!this.typeChosen) {
      const inferred = this.inferTypeFor(q);
      if (inferred && inferred !== this.type()) {
        this.type.set(inferred);
      }
    }
    const type = this.type();
    this.diagnostics.info('Search', 'user:run', {
      type,
      queryLength: q.length,
      budget: this.apiBudget(),
      anonymous: this.capabilities.active,
    });
    // Navigating to identical query params emits nothing, so re-clicking Search
    // (or changing the budget, which isn't in the URL) would be a silent no-op.
    // Detect that case (tracked from the queryParamMap subscription) and fetch
    // directly instead of relying on navigation.
    if (this.urlQuery === q && this.urlType === type) {
      this.fetch(q, type);
      return;
    }
    // Otherwise push the search into the URL; ngOnInit's subscription fetches.
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q, type },
      queryParamsHandling: 'merge',
    });
  }

  /**
   * Execute the advanced post search. The rich `postCriteria` is the source of
   * truth: authenticated searches serialize it into a Mastodon full-text query;
   * anonymous searches can only send the plain words (the hashtag transform in
   * `searchPostsByHashtags` handles the rest), so the advanced criteria degrade
   * to loaded-result filters — which the chips/Explain panel make explicit.
   */
  applyAdvanced(): void {
    this.type.set('statuses');
    const criteria = this.postCriteria();
    this.pendingCriteria = criteria;
    // Authenticated: the serialized query IS the search string (operators and all).
    // Anonymous: only the words survive as a server request; the rest are shown
    // as loaded-result criteria and applied client-side after results arrive.
    const q = this.capabilities.active
      ? (criteria.words ?? '').trim() // anonymous: only words go to the hashtag transform
      : serializeMastodonQuery(criteria); // authenticated: full operator query
    if (!q.trim()) {
      return;
    }
    this.diagnostics.info('Search', 'user:apply-advanced', {
      queryLength: q.length,
      budget: this.apiBudget(),
      anonymous: this.capabilities.active,
    });
    // Fetch directly rather than through the q= URL param: an advanced search's
    // real query string is a serialized DSL, and routing it through the URL would
    // stamp that DSL back into the query box (clobbering the plain words that
    // save/share need to capture). The structured criteria live in
    // `pendingCriteria`; the box keeps the user's plain words.
    this.fetch(q, 'statuses');
  }

  /** Toggle the advanced panel. Opening it raises the default budget to 3 (an
   *  advanced search is usually a faceting session that wants a bigger corpus),
   *  unless the user already picked a larger budget. */
  toggleAdvanced(): void {
    const opening = !this.advancedOpen();
    this.diagnostics.info('Search', 'user:toggle-advanced', { open: opening });
    this.advancedOpen.set(opening);
    if (opening && this.apiBudget() < DEFAULT_BUDGET_ADVANCED) {
      this.apiBudget.set(DEFAULT_BUDGET_ADVANCED);
    }
  }

  clearAdvanced(): void {
    this.exactPhrase.set('');
    this.excludeWords.set('');
    this.author.set('');
    this.before.set('');
    this.after.set('');
    this.language.set('');
    this.contentType.set('any');
    this.replies.set('include');
    this.sensitive.set('include');
    this.scope.set('all');
    // The main box may hold a serialized DSL string from a prior Apply — clear it
    // too, otherwise the query lingers confusingly after the fields are emptied.
    this.query.set('');
  }

  // --- Saved searches + sharing ---

  /** Load a saved/shared search into the form and run it. Populates every field
   *  from the structured object (no DSL parsing — the object is canonical). */
  applySearch(search: MawkingbirdSearch): void {
    this.type.set(search.target === 'posts' ? 'statuses' : search.target);
    this.apiBudget.set(search.apiCallBudget || DEFAULT_BUDGET_SIMPLE);
    this.grouping.set(search.presentation?.grouping ?? 'none');

    const p = search.post ?? {};
    this.exactPhrase.set(p.exactPhrase ?? '');
    this.excludeWords.set(p.excludeWords ?? '');
    this.author.set(p.author ?? '');
    this.after.set(p.dates?.after ?? '');
    this.before.set(p.dates?.before ?? '');
    this.language.set(p.language ?? '');
    this.contentType.set(p.contentType ?? 'any');
    this.replies.set(p.replies ?? 'include');
    this.sensitive.set(p.sensitive ?? 'include');
    this.scope.set(p.scope ?? 'all');

    // Restore account advanced fields (source + numeric bounds).
    const acc = search.account;
    this.accountSource.set(acc?.source ?? 'both');
    this.followersMin.set(acc?.followers?.min != null ? String(acc.followers.min) : '');
    this.followersMax.set(acc?.followers?.max != null ? String(acc.followers.max) : '');
    this.followingMin.set(acc?.following?.min != null ? String(acc.following.min) : '');
    this.followingMax.set(acc?.following?.max != null ? String(acc.following.max) : '');
    this.statusesMin.set(acc?.statuses?.min != null ? String(acc.statuses.min) : '');
    this.statusesMax.set(acc?.statuses?.max != null ? String(acc.statuses.max) : '');

    if (search.target === 'posts') {
      // Run through the advanced path so the serializer/hashtag-transform apply.
      this.query.set(p.words ?? '');
      this.applyAdvanced();
    } else {
      this.query.set((acc?.text ?? search.hashtag?.text ?? '').trim());
      this.run();
    }
  }

  /** Run an account search from the advanced panel. The account form fields are
   *  live signals that `fetchAccounts` reads directly, so this just ensures the
   *  Accounts tab is active and (re-)runs. */
  applyAccountAdvanced(): void {
    this.type.set('accounts');
    if (!this.query().trim()) {
      return;
    }
    this.run();
  }

  clearAccountAdvanced(): void {
    this.accountSource.set('both');
    this.followersMin.set('');
    this.followersMax.set('');
    this.followingMin.set('');
    this.followingMax.set('');
    this.statusesMin.set('');
    this.statusesMax.set('');
  }

  runSaved(id: string): void {
    const found = this.saved.all().find((s) => s.id === id);
    if (!found) {
      return;
    }
    this.savedMenuOpen.set(false);
    // Route by the saved network, not by whichever panel happens to be up.
    // Applying a Bluesky definition to the Mastodon form would run a search the
    // user never saved, against an engine that cannot answer it.
    if (isBlueskySaved(found)) {
      this.diagnostics.info('Search', 'user:run-saved', { id, network: 'bluesky' });
      this.blueskyMode.set(true);
      this.pendingBlueskySaved.set(found.search);
      return;
    }
    if (!isMastodonSaved(found)) {
      return;
    }
    this.diagnostics.info('Search', 'user:run-saved', {
      id,
      network: 'mastodon',
      target: found.search.target,
    });
    this.applySearch(found.search);
  }

  openSaveDialog(): void {
    this.saveName.set('');
    this.saveDialogOpen.set(true);
  }

  /**
   * Re-run a query from the recent list.
   *
   * Sets the box and the tab, then goes through {@link run} like any typed
   * search rather than calling `fetch` directly — so the URL updates, the
   * Bluesky branch still applies, and re-running from history is indistinguish-
   * able from typing it again. `record` then moves it to the front of the list.
   */
  runRecent(entry: RecentSearch): void {
    this.diagnostics.info('Search', 'user:run-recent', { type: entry.type });
    this.query.set(entry.query);
    this.type.set(entry.type);
    this.run();
  }

  /** Forget one recent query, from its ✕. */
  forgetRecent(entry: RecentSearch, event: Event): void {
    // The row is a button; without this the click re-runs what it just removed.
    event.stopPropagation();
    this.recent.remove(entry.query, entry.type);
  }

  // --- search server ---
  // Search can be pointed at a *different* instance than everything else, because
  // plenty of servers disable anonymous search outright. Only the search call moves;
  // feeds, profiles and the logged-in account stay on the primary server.

  /**
   * The host anonymous search calls should hit: the chosen search server if there
   * is one, otherwise the anonymous instance. (Authenticated search goes through
   * Api.search, which the interceptors divert on their own.)
   */
  protected searchHost(): string {
    return this.searchServer.baseUrl() || this.anonymous.server();
  }

  /** Text in the search-server box; seeded from the stored choice. */
  /** Example hostname, deliberately kept literal rather than translated. */
  protected readonly serverHostPlaceholder = 'mastodon.social';
  protected searchServerInput = signal(this.searchServer.host() ?? '');
  protected searchServerStatus = signal<SearchServerStatus>('idle');
  /** Result count from the canary probe, shown as evidence the index is live. */
  protected searchServerHits = signal(0);
  /**
   * Posts the hashtag canary matched, or null when it wasn't reached.
   *
   * Kept separate from the account count because a server can pass one and fail the
   * other, and that is the normal case rather than the odd one. A hand-typed host
   * that only does account search is still adopted (the user asked for it by name),
   * but we say what it does.
   */
  protected searchServerPostHits = signal<number | null>(null);
  /** Whether that probe was the tags-only kind, for the warning's wording. */
  protected searchServerTagsOnly = signal(false);
  protected searchServerOpen = signal(false);
  private searchServerProbeSeq = 0;

  toggleSearchServer(): void {
    this.searchServerOpen.update((open) => !open);
  }

  /**
   * Validate and adopt whatever is typed. Reachability isn't enough — the probe
   * runs a real anonymous search for a well-known account, so a server that 401s
   * or returns an empty index is rejected before it becomes the search server.
   */
  async applySearchServer(): Promise<void> {
    const typed = this.searchServerInput().trim();
    if (!typed) {
      this.clearSearchServer();
      return;
    }
    const base = normalizeHostUrl(typed);
    const seq = ++this.searchServerProbeSeq;
    this.searchServerStatus.set('checking');
    this.searchServerHits.set(0);
    this.searchServerPostHits.set(null);
    this.searchServerTagsOnly.set(false);
    const probe = await probeSearchServer(base);
    if (seq !== this.searchServerProbeSeq) {
      return; // superseded by a newer attempt
    }
    this.searchServerStatus.set(probe.status);
    this.searchServerHits.set(probe.accounts);
    this.searchServerPostHits.set(probe.statuses);
    this.searchServerTagsOnly.set(isTagsOnly(probe));
    this.diagnostics.info('Search', 'user:search-server-probe', {
      host: base,
      status: probe.status,
      statuses: probe.statuses,
      hashtags: probe.hashtags,
    });
    if (probe.status === 'ok') {
      this.adoptSearchServer(base);
    }
  }

  /**
   * Adopt a search server and drop what we thought we knew about search here.
   *
   * The capability cache is keyed by host, and the host just changed — without the
   * reset, a "post search isn't available" message earned by the previous server
   * would sit under the results of the new one.
   */
  private adoptSearchServer(base: string): void {
    this.searchServer.setBaseUrl(base);
    this.searchServerInput.set(this.searchServer.host() ?? '');
    this.searchCapability.reset();
    this.discardResultsFromOldServer();
  }

  /**
   * Throw away results minted by the server we just stopped using.
   *
   * Account and status ids are local to an instance. Keeping the previous server's
   * results on screen after switching means every card links into the *new*
   * server's namespace with the *old* server's ids — which is how you click a
   * result and land on somebody else's profile, or a "no such account" page.
   * There is no way to translate the ids, so the honest move is to drop them.
   */
  private discardResultsFromOldServer(): void {
    this.accountStore.clear();
    this.results.set(null);
    this.accountItems.set([]);
    this.accountSearchRan.set(false);
    this.relationships.set({});
    this.expandedAccounts.set(new Set());
    // Clearing the executed query means a re-run is treated as a fresh search
    // rather than deduped as "same query, same type, nothing to do".
    this.executedQuery = '';
    this.urlQuery = '';
  }

  /** Take the host the discovery component found. */
  useDiscoveredSearchServer(base: string): void {
    this.adoptSearchServer(base);
    this.searchServerStatus.set('ok');
    this.diagnostics.info('Search', 'user:search-server-discovered', { host: base });
    // The reason they went looking was an empty result set. Run it again.
    if (this.executedQuery) {
      this.run();
    }
  }

  clearSearchServer(): void {
    this.searchServerProbeSeq += 1;
    this.searchServer.clear();
    this.searchServerInput.set('');
    this.searchServerStatus.set('idle');
    this.searchServerHits.set(0);
    this.searchServerPostHits.set(null);
    this.searchServerTagsOnly.set(false);
    // Same reasoning as adoptSearchServer: the host changed, so the per-host
    // verdicts no longer describe where search goes and the loaded ids belong to
    // an instance we are no longer talking to.
    this.searchCapability.reset();
    this.discardResultsFromOldServer();
    this.diagnostics.info('Search', 'user:search-server-clear', {});
  }

  /**
   * The Bluesky panel asked to save its current criteria.
   *
   * Stashed rather than saved immediately, because naming happens in the shared
   * dialog — the panel owns the criteria, the page owns the saved-search list.
   */
  openBlueskySaveDialog(criteria: BlueskyPostSearch): void {
    this.pendingBlueskySave.set(criteria);
    this.saveName.set('');
    this.saveDialogOpen.set(true);
  }

  /** Criteria awaiting a name in the save dialog, when saving a Bluesky search. */
  private pendingBlueskySave = signal<BlueskyPostSearch | null>(null);

  /**
   * The Bluesky panel, when it is the one showing.
   *
   * Needed because Save lives in the shared bar but the criteria live in the
   * panel — the button has to ask the panel what it is currently searching for.
   */
  protected blueskyPanel = viewChild(BlueskySearchPanel);

  confirmSave(): void {
    const bluesky = this.pendingBlueskySave();
    if (bluesky) {
      const result = this.saved.save(this.saveName(), bluesky, {
        // Bluesky has no per-user instance to restore before re-running, so
        // there is nothing to record here. See `SavedSearch.instance`.
        instance: '',
        authenticated: this.session.linked(),
        network: 'bluesky',
      });
      this.pendingBlueskySave.set(null);
      this.saveDialogOpen.set(false);
      this.diagnostics.info('Search', 'user:save', { ok: result.ok, network: 'bluesky' });
      this.savedNotice.set(
        result.ok ? this.transloco.translate('pages.search.searchSaved') : result.error,
      );
      setTimeout(() => this.savedNotice.set(''), 3000);
      return;
    }
    const result = this.saved.save(this.saveName(), this.currentSearch(), {
      instance: this.capabilities.active ? this.anonymous.server() : '',
      authenticated: !this.capabilities.active,
      network: 'mastodon',
    });
    this.saveDialogOpen.set(false);
    this.diagnostics.info('Search', 'user:save', {
      ok: result.ok,
      target: this.currentSearch().target,
    });
    this.savedNotice.set(
      result.ok ? this.transloco.translate('pages.search.searchSaved') : result.error,
    );
    setTimeout(() => this.savedNotice.set(''), 3000);
  }

  /** Copy a shareable link to the current search definition. */
  async share(): Promise<void> {
    const params = new URLSearchParams(encodeSearchToParams(this.currentSearch())).toString();
    // Resolve against <base href> so the link is valid under a sub-path like /_ui/.
    const url = new URL(`search?${params}`, document.baseURI).toString();
    try {
      await navigator.clipboard.writeText(url);
      this.diagnostics.info('Search', 'user:share', { copied: true });
      this.shareCopied.set(true);
      setTimeout(() => this.shareCopied.set(false), 2000);
    } catch {
      this.diagnostics.warn('Search', 'user:share', { copied: false, reason: 'clipboard' });
      // Clipboard blocked — surface the URL so the user can copy it manually.
      this.savedNotice.set(url);
    }
  }

  /** True when any advanced field is set (drives the "Clear" button visibility). */
  protected hasAdvanced = computed(
    () =>
      !!this.exactPhrase() ||
      !!this.excludeWords() ||
      !!this.author() ||
      !!this.before() ||
      !!this.after() ||
      !!this.language() ||
      this.contentType() !== 'any' ||
      this.replies() !== 'include' ||
      this.sensitive() !== 'include' ||
      this.scope() !== 'all',
  );

  // --- Refinement controls (all client-side, no API calls) ---

  isFacetSelected(kind: FacetKind, value: string): boolean {
    return this.selectedFacets().some((f) => f.kind === kind && f.value === value);
  }

  toggleFacet(kind: FacetKind, value: string): void {
    this.selectedFacets.update((sel) =>
      sel.some((f) => f.kind === kind && f.value === value)
        ? sel.filter((f) => !(f.kind === kind && f.value === value))
        : [...sel, { kind, value }],
    );
    this.diagnostics.info('Search', 'user:toggle-post-facet', {
      kind,
      value,
      selected: this.isFacetSelected(kind, value),
    });
  }

  clearRefinements(): void {
    this.selectedFacets.set([]);
    this.loadedFilter.set('');
    // Exclusions are a filter like any other — "Clear filters" must undo them
    // too, or the count stays mysteriously low with nothing visibly ticked.
    this.excludedAuthors.set(new Set());
  }

  /** Change the budget. If a search already ran and the budget went up, top up
   *  by fetching the extra pages right away (§ user's "5 after 3 → fetch 2 more"). */
  setBudget(value: string | number): void {
    const next = Number(value);
    this.diagnostics.info('Search', 'user:set-budget', { from: this.apiBudget(), to: next });
    this.apiBudget.set(next);
    if (this.results()?.statuses.length && this.executedType === 'statuses') {
      this.maybeAutoFill(true);
    }
  }

  /** Drop everything derived from the previous result set before a new search. */
  private resetRefinements(): void {
    this.selectedFacets.set([]);
    this.loadedFilter.set('');
    this.grouping.set('none');
    this.statusSort.set('relevance');
    // Exclusions are scoped to one query on purpose — see `excludedAuthors`.
    this.excludedAuthors.set(new Set());
    this.collapseRepeats.set(false);
    this.expandedRepeats.set(new Set());
  }

  private fetch(q: string, type: SearchType): void {
    // What the kit block matches against: the query that ran, not the box.
    this.ranQuery.set(q);
    this.diagnostics.info('Search', 'load:start', {
      type,
      queryLength: q.length,
      budget: this.apiBudget(),
      anonymous: this.capabilities.active,
    });
    this.activeSearch?.unsubscribe();
    this.resetRefinements();
    // Account cards carry per-result state (relationships, expansion) that must
    // not leak across searches.
    this.relationships.set({});
    this.expandedAccounts.set(new Set());
    this.selectedAccountFacets.set([]);
    this.accountFilter.set('');
    this.followFilter.set('all');
    this.enrichError.set(null);
    this.accountSort.set('relevance');
    this.accountItems.set([]);
    this.accountSearchRan.set(false);
    // A new search resets the budget counters and pagination cursors (§7/§20).
    this.callsUsed.set(0);
    this.tagsDropped.set(0);
    this.nextOffset = 0;
    this.oldestId = '';
    this.executedQuery = q;
    this.executedType = type;
    // Recorded here rather than at the input, because this is the one place a
    // search is definitely *run*. Keystrokes are not searches, and restoring an
    // account snapshot on back-navigation returns before this point, so
    // returning to a result set does not shuffle the history you came back to.
    this.recent.record(q, type);

    // Accounts have their own orchestration (bio / posts→authors / both).
    if (type === 'accounts') {
      this.fetchAccounts(q);
      return;
    }
    // Snapshot the criteria that produced this search so chips/Explain describe
    // exactly what was run. Advanced searches stage full criteria in
    // `pendingCriteria`; a plain-box status search is just the words.
    if (type === 'statuses') {
      this.executedCriteria.set(this.pendingCriteria ?? { words: q });
    } else {
      this.executedCriteria.set(null);
    }
    this.pendingCriteria = null;
    this.searching.set(true);

    // Anonymous post search fans out to one call per hashtag. Cap the tag count
    // to the budget so page 1 never exceeds it (§7 "never silently exceed"), and
    // record how many we dropped so Explain can note the truncation.
    if (this.capabilities.active && type === 'statuses') {
      const allTags = this.anonymousPublic.hashtagsForQuery(q);
      const affordable = allTags.slice(0, this.apiBudget());
      this.tagsDropped.set(allTags.length - affordable.length);
      this.firstPageTags = affordable;
    } else {
      this.firstPageTags = null;
    }

    // Only statuses/hashtags reach here (accounts early-return above).
    const cost = this.firstPageTags ? this.firstPageTags.length : 1;
    const request = this.capabilities.active
      ? type === 'statuses'
        ? this.anonymousPublic.searchPostsByHashtags(this.searchHost(), q, {
            maxTags: this.apiBudget(),
          })
        : this.anonymousPublic.search(this.searchHost(), q, type)
      : this.api.search(q, type, type === 'statuses' ? { limit: PAGE_SIZE } : undefined);
    this.startSearchClock(() => this.activeSearch?.unsubscribe());
    this.activeSearch = request.subscribe({
      next: (r) => {
        this.stopSearchClock();
        this.results.set(r);
        this.callsUsed.update((c) => c + cost);
        this.rememberCursors(r);
        this.searching.set(false);
        this.diagnostics.info('Search', 'load:success', {
          type,
          accounts: r.accounts.length,
          statuses: r.statuses.length,
          hashtags: r.hashtags.length,
          callsUsed: this.callsUsed(),
        });
        // Eagerly page up to the budget so client-side faceting has a corpus.
        this.maybeAutoFill(r.statuses.length > 0);
        if (!r.statuses.length && !r.hashtags.length) {
          void this.explainEmptyResult();
        }
      },
      error: (error: unknown) => {
        this.stopSearchClock();
        this.searching.set(false);
        this.diagnostics.error('Search', 'load:error', error, { type });
        // A failed search is the other way to end up with an empty page, and the
        // reason is just as worth naming.
        void this.explainEmptyResult();
      },
    });
  }

  /**
   * Account orchestration (Phase 3). Depending on the chosen source:
   *  - `bio`   → the plain account endpoint (handle/name/bio match), paginated;
   *  - `posts` → a post search condensed to its distinct authors;
   *  - `both`  → both, merged and deduped by account id.
   * The rich numeric bounds are snapshotted so the client-side gates/facets
   * describe exactly what was requested. Relationships batch-load once results
   * are in. Post fan-out reuses the same hashtag transform as post search, so it
   * respects the API-call budget the same way.
   */
  private fetchAccounts(q: string): void {
    const criteria = this.accountCriteria();
    const source = criteria.source ?? 'both';
    this.executedAccountBounds.set(criteria);
    this.executedCriteria.set(null);
    this.pendingCriteria = null;
    this.accountSearchRan.set(false);
    this.searching.set(true);
    // A fresh fetch supersedes any stored snapshot for back-nav restore.
    this.accountStore.clear();

    // A branch that fails must not sink the whole search: real mastodon.social
    // authenticated *status* full-text search can 401/422 depending on server
    // config, and forkJoin would otherwise blank the account hits too. Each
    // branch degrades to an empty page (logged) so the other still shows.
    const EMPTY_RESULTS: SearchResults = { accounts: [], statuses: [], hashtags: [] };
    const resilient = (obs: Observable<SearchResults>, label: string): Observable<SearchResults> =>
      obs.pipe(
        catchError((err) => {
          this.diagnostics.warn('Search', 'load:account-branch-error', {
            branch: label,
            error: err,
          });
          return of(EMPTY_RESULTS);
        }),
      );

    // Handle- or URL-shaped queries get resolve=true so the server webfingers
    // accounts it hasn't federated with yet (how you find someone by address).
    const resolve = /^@?[\w.-]+@[\w.-]+\.\w+$/.test(q) || /^https?:\/\//.test(q);
    const bioReq: Observable<SearchResults> | null =
      source === 'posts'
        ? null
        : resilient(
            this.capabilities.active
              ? this.anonymousPublic.search(this.searchHost(), q, 'accounts', {
                  limit: PAGE_SIZE,
                })
              : this.api.search(
                  q,
                  'accounts',
                  resolve ? { resolve: true, limit: PAGE_SIZE } : { limit: PAGE_SIZE },
                ),
            'bio',
          );

    // Posts→authors: fan out to the same hashtag/post search the post tab uses.
    if (this.capabilities.active && source !== 'bio') {
      const allTags = this.anonymousPublic.hashtagsForQuery(q);
      const affordable = allTags.slice(0, this.apiBudget());
      this.tagsDropped.set(allTags.length - affordable.length);
      this.firstPageTags = affordable;
    } else {
      this.firstPageTags = null;
    }
    const postsReq: Observable<SearchResults> | null =
      source === 'bio'
        ? null
        : resilient(
            this.capabilities.active
              ? this.anonymousPublic.searchPostsByHashtags(this.searchHost(), q, {
                  maxTags: this.apiBudget(),
                })
              : this.api.search(q, 'statuses', { limit: PAGE_SIZE }),
            'posts',
          );

    // Each request costs at least 1; anonymous post fan-out costs one per tag.
    const postCost = this.firstPageTags ? this.firstPageTags.length : 1;

    this.debug('[search] account fetch', {
      q,
      source,
      anonymous: this.capabilities.active,
      bioReq: !!bioReq,
      postsReq: !!postsReq,
      tags: this.firstPageTags,
    });

    // Merge each branch's results into the list AS THEY ARRIVE, rather than
    // waiting for both (forkJoin) — real mastodon.social full-text status search
    // takes several seconds, and holding the instant bio results hostage behind
    // it made the search look broken. Each branch merges independently; the
    // spinner clears once both have settled.
    let pending = (bioReq ? 1 : 0) + (postsReq ? 1 : 0);
    const settle = (): void => {
      if (--pending <= 0) {
        this.stopSearchClock();
        this.searching.set(false);
        this.accountSearchRan.set(true);
        this.diagnostics.info('Search', 'load:accounts-complete', {
          accounts: this.accountItems().length,
          callsUsed: this.callsUsed(),
        });
        if (!this.accountItems().length) {
          void this.explainEmptyResult();
        }
      }
    };
    const mergeIn = (authors: AccountWithMatches[], addedCost: number): void => {
      if (authors.length) {
        this.accountItems.update((cur) => mergeAuthors(cur, authors));
        this.loadRelationships(authors.map((a) => a.account));
      }
      this.callsUsed.update((c) => c + addedCost);
    };

    const subs = new Subscription();
    // Both branches are under one clock: the reader is waiting for a page, not
    // for a branch, and `settle()` only clears the spinner once both land — so
    // one hung branch hangs the whole page without this.
    this.startSearchClock(() => subs.unsubscribe());
    if (bioReq) {
      subs.add(
        bioReq.subscribe((page) => {
          const authors = (page.accounts ?? []).map((account) => ({ account, matchingPosts: [] }));
          this.debug('[search] account bio results', { accounts: authors.length });
          mergeIn(authors, 1);
          settle();
        }),
      );
    }
    if (postsReq) {
      subs.add(
        postsReq.subscribe((page) => {
          const authors = condenseStatusesToAuthors(page.statuses ?? []);
          this.debug('[search] account post-author results', {
            statuses: page.statuses?.length ?? 0,
            authors: authors.length,
          });
          mergeIn(authors, postCost);
          settle();
        }),
      );
    }
    this.activeSearch = subs;
  }

  /**
   * §14 budget-fill: when enabled, keep paging until the budget is spent, the
   * server stops returning new results, or the user cancels. Guarded on the last
   * page having grown so we never loop on an endpoint that keeps returning the
   * same (already de-duped) statuses.
   */
  private maybeAutoFill(pageGrew: boolean): void {
    if (pageGrew && this.autoFillWants()) {
      this.loadMore();
    }
  }

  /** Update pagination cursors from the latest page of statuses. */
  private rememberCursors(r: SearchResults): void {
    this.nextOffset += r.statuses.length;
    // For anonymous, remember each tag's oldest status id so the next page of
    // that timeline starts below it.
    for (const s of r.statuses) {
      // Statuses don't carry their source tag, so track a single global floor:
      // the oldest id we've seen. getTagTimeline(max_id) is per-tag but using the
      // global oldest is a safe monotonic cursor for "older than everything shown".
      if (!this.oldestId || s.id < this.oldestId) {
        this.oldestId = s.id;
      }
    }
  }

  /**
   * Fetch one more page and append it. Used both by the eager budget auto-fill
   * and the manual "Load more" button. `manual` clicks keep working past the
   * budget (the user asked to keep loading) up to a hard safety cap.
   */
  loadMore(manual = false): void {
    if (this.searching()) {
      return;
    }
    if (manual) {
      if (this.callsUsed() >= LOAD_MORE_HARD_CAP) {
        return;
      }
    } else if (!this.autoFillWants()) {
      return;
    }
    if (manual) {
      this.diagnostics.info('Search', 'user:load-more', {
        type: this.executedType,
        callsUsed: this.callsUsed(),
        nextPageCost: this.nextPageCost(),
      });
    }
    this.searching.set(true);
    const cost = this.nextPageCost();
    const q = this.executedQuery;
    const request =
      this.capabilities.active && this.executedType === 'statuses'
        ? this.anonymousPublic.searchPostsByHashtags(this.searchHost(), q, {
            maxTags: this.firstPageTags?.length ?? this.apiBudget(),
            maxIds: Object.fromEntries(
              (this.firstPageTags ?? []).map((t) => [t, this.oldestId]).filter(([, v]) => v),
            ) as Record<string, string>,
          })
        : this.api.search(q, this.executedType, {
            offset: this.nextOffset,
            limit: PAGE_SIZE,
          });
    this.activeSearch = request.subscribe({
      next: (r) => {
        const added = this.appendResults(r);
        this.callsUsed.update((c) => c + cost);
        this.rememberCursors(r);
        this.searching.set(false);
        if (manual) {
          this.diagnostics.info('Search', 'load-more:success', {
            received: r.statuses.length,
            added,
            callsUsed: this.callsUsed(),
          });
        }
        this.maybeAutoFill(added > 0);
      },
      error: (error: unknown) => {
        this.searching.set(false);
        if (manual) {
          this.diagnostics.error('Search', 'load-more:error', error, {
            type: this.executedType,
          });
        }
      },
    });
  }

  /** Merge a newly-fetched page into the current results, de-duping statuses.
   *  Returns how many new statuses were actually added. */
  private appendResults(page: SearchResults): number {
    let added = 0;
    this.results.update((cur) => {
      if (!cur) {
        added = page.statuses.length;
        return page;
      }
      const seen = new Set(cur.statuses.map((s) => s.url || s.id));
      const fresh = page.statuses.filter((s) => !seen.has(s.url || s.id));
      added = fresh.length;
      return { ...cur, statuses: [...cur.statuses, ...fresh] };
    });
    return added;
  }

  // --- Account results (Phase 2) ---
  // The account tab renders info-dense cards. Relationships for the whole loaded
  // set are batch-fetched once (the endpoint takes many ids at a time), and
  // follow/unfollow is owned here so the card stays presentational.
  /** Relationship per account id, populated by `loadRelationships`. */
  protected relationships = signal<Record<string, Relationship>>({});
  /** Account ids with a follow/unfollow request in flight. */
  protected followBusy = signal<Set<string>>(new Set());
  /** Account ids whose card has its "more" section expanded. */
  protected expandedAccounts = signal<Set<string>>(new Set());

  /** The raw loaded account result set (bio hits + condensed post authors,
   *  merged), before any client-side numeric/facet/text refinement. Set by the
   *  account fetch path; the visible list derives from it. */
  protected accountItems = signal<AccountWithMatches[]>([]);
  /** True once an account search has completed (success or error), so the empty
   *  state reads "no people found" instead of reverting to the idle import panel. */
  protected accountSearchRan = signal(false);

  // --- Account-result refinement (Phase 3, all client-side) ---
  /** Selected account facet values, keyed by kind + value. */
  protected selectedAccountFacets = signal<{ kind: AccountFacetKind; value: string }[]>([]);
  /** The "filter these people" substring over loaded account cards. */
  protected accountFilter = signal('');
  /** Show everyone, only accounts I follow, or only those I don't. */
  protected followFilter = signal<FollowFilter>('all');
  /** True while the on-demand "check activity" batch is in flight. */
  protected enrichingActivity = signal(false);
  /** Set when an enrichment attempt failed, so the offer can be retried honestly. */
  protected enrichError = signal<string | null>(null);
  /** Snapshot of the numeric bounds that the current results are gated by. */
  private executedAccountBounds = signal<AccountSearchCriteria>({ text: '' });

  /** Facets computed from all loaded accounts (counts reflect the full load). */
  protected accountFacets = computed<AccountFacet[]>(() =>
    buildAccountFacets(this.accountItems().map((i) => i.account)),
  );

  /** The loaded accounts after numeric gates, facet selection, and text filter. */
  protected visibleAccounts = computed<AccountWithMatches[]>(() => {
    const bounds = this.executedAccountBounds();
    const facets = this.selectedAccountFacets();
    const byKind = new Map<AccountFacetKind, string[]>();
    for (const f of facets) {
      byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f.value]);
    }
    const gated = this.accountItems().filter(
      (item) =>
        accountMatchesNumeric(item.account, {
          followers: bounds.followers,
          following: bounds.following,
          statuses: bounds.statuses,
        }) &&
        [...byKind.entries()].every(([kind, values]) =>
          values.some((v) => accountMatchesFacet(item.account, kind, v)),
        ),
    );
    // Text filter reuses filterAccounts over the accounts, keeping matches attached.
    const kept = new Set(
      filterAccounts(
        gated.map((i) => i.account),
        this.accountFilter(),
      ),
    );
    const filtered = gated.filter((i) => kept.has(i.account));
    // Follow state is the viewer's, not the account's, so it filters from the
    // relationship map rather than through `accountMatchesFacet`.
    const byFollow = filterByFollowState(filtered, this.relationships(), this.followFilter());
    return sortAccounts(byFollow, this.accountSort());
  });

  /**
   * Loaded accounts whose last-post date nobody has supplied. Mastodon's search
   * returns `last_status_at` on every account (verified against
   * mastodon.social, for both the account and the status-author paths), so this
   * is normally empty — it fills with results from providers that build thinner
   * account objects, and with anything merged in from elsewhere.
   */
  protected accountsMissingActivity = computed(() =>
    this.accountItems().filter((i) => i.account.last_status_at === undefined),
  );

  /** Whether to offer the "check activity" action at all. */
  protected canEnrichActivity = computed(
    () =>
      !this.capabilities.active &&
      !this.enrichingActivity() &&
      this.accountsMissingActivity().length > 0,
  );

  protected loadedAccountCount = computed(() => this.accountItems().length);
  protected shownAccountCount = computed(() => this.visibleAccounts().length);

  isAccountFacetSelected(kind: AccountFacetKind, value: string): boolean {
    return this.selectedAccountFacets().some((f) => f.kind === kind && f.value === value);
  }

  toggleAccountFacet(kind: AccountFacetKind, value: string): void {
    this.selectedAccountFacets.update((sel) =>
      sel.some((f) => f.kind === kind && f.value === value)
        ? sel.filter((f) => !(f.kind === kind && f.value === value))
        : [...sel, { kind, value }],
    );
    this.diagnostics.info('Search', 'user:toggle-account-facet', {
      kind,
      value,
      selected: this.isAccountFacetSelected(kind, value),
    });
  }

  clearAccountRefinements(): void {
    this.selectedAccountFacets.set([]);
    this.accountFilter.set('');
    this.followFilter.set('all');
  }

  relationshipFor(id: string): Relationship | null {
    return this.relationships()[id] ?? null;
  }

  isFollowBusy(id: string): boolean {
    return this.followBusy().has(id);
  }

  isAccountExpanded(id: string): boolean {
    return this.expandedAccounts().has(id);
  }

  toggleAccountExpand(id: string): void {
    this.expandedAccounts.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Batch-fetch relationships for every loaded account. Anonymous viewers read
   *  the local follow store; authenticated viewers hit the relationships API
   *  (which accepts many ids per call, so ~100 accounts is one request). */
  private loadRelationships(accounts: Account[]): void {
    if (!accounts.length) {
      return;
    }
    if (this.capabilities.active) {
      // resultServer(), not the browsing server: these ids came from wherever the
      // search ran, and AnonymousFollows uses this to derive the host and the
      // read-ref it will later fetch the feed through.
      const server = this.resultServer();
      const map: Record<string, Relationship> = {};
      for (const a of accounts) {
        map[a.id] = this.anonymousFollows.relationship(a, server);
      }
      this.relationships.update((cur) => ({ ...cur, ...map }));
      return;
    }
    this.api
      .relationships(accounts.map((a) => a.id))
      .pipe(catchError(() => EMPTY))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((rels) => {
        this.relationships.update((cur) => {
          const next = { ...cur };
          for (const r of rels) {
            next[r.id] = r;
          }
          return next;
        });
      });
  }

  /**
   * Fill in `last_status_at` for results that arrived without it, on demand.
   *
   * One batched `GET /api/v1/accounts?id[]=` covers the whole set rather than a
   * call per card, which is what makes this affordable enough to offer as a
   * button. It is a button and not automatic because it is only ever needed for
   * results that came from somewhere other than Mastodon search — paying for a
   * round trip on every search to re-fetch fields we already have would be a
   * cost with nothing to show for it.
   *
   * Ids the server doesn't recognise come back absent rather than erroring, so
   * the merge is keyed on what returned; anything still missing keeps reading
   * "activity unknown", which is the honest answer.
   */
  protected enrichActivity(): void {
    const missing = this.accountsMissingActivity().map((i) => i.account.id);
    if (!missing.length || this.enrichingActivity()) {
      return;
    }
    this.enrichingActivity.set(true);
    this.enrichError.set(null);
    this.diagnostics.info('Search', 'user:enrich-activity', { accounts: missing.length });
    this.api
      .getAccounts(missing)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (accounts) => {
          const byId = new Map(accounts.map((a) => [a.id, a]));
          this.accountItems.update((items) =>
            items.map((item) => {
              const fresh = byId.get(item.account.id);
              // Replace the whole account: the batch entity is strictly richer
              // than the stub it supersedes, and merging field-by-field would
              // just be a longer way of saying the same thing.
              return fresh ? { ...item, account: fresh } : item;
            }),
          );
          this.enrichingActivity.set(false);
          this.callsUsed.update((c) => c + 1);
        },
        error: () => {
          this.enrichingActivity.set(false);
          this.enrichError.set(this.transloco.translate('pages.search.enrichError'));
        },
      });
  }

  private setFollowBusy(id: string, busy: boolean): void {
    this.followBusy.update((set) => {
      const next = new Set(set);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  onFollow(account: Account): void {
    if (this.capabilities.active) {
      const result = this.anonymousFollows.follow(account, this.resultServer());
      if (result.ok) {
        this.relationships.update((cur) => ({ ...cur, [account.id]: result.relationship }));
      }
      return;
    }
    this.setFollowBusy(account.id, true);
    this.api
      .follow(account.id)
      .pipe(catchError(() => EMPTY))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rel) => this.relationships.update((cur) => ({ ...cur, [account.id]: rel })),
        complete: () => this.setFollowBusy(account.id, false),
      });
  }

  onUnfollow(account: Account): void {
    if (this.capabilities.active) {
      const rel = this.anonymousFollows.unfollow(account, this.resultServer());
      this.relationships.update((cur) => ({ ...cur, [account.id]: rel }));
      return;
    }
    this.setFollowBusy(account.id, true);
    this.api
      .unfollow(account.id)
      .pipe(catchError(() => EMPTY))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rel) => this.relationships.update((cur) => ({ ...cur, [account.id]: rel })),
        complete: () => this.setFollowBusy(account.id, false),
      });
  }

  /**
   * Where a result card should link.
   *
   * The server in the ref must be **the server that minted the id**, which is the
   * search server when one is configured — not the browsing server. Getting this
   * wrong is not a cosmetic bug: account ids are local to an instance, so a
   * kolectiva id looked up on mastodon.social silently resolves to a *different
   * account* or 404s. That was the "clicked a result and got the wrong profile"
   * report, and `search-server.ts` had already written down the hazard
   * ("IDs minted by the search server don't resolve there") before the code walked
   * into it anyway.
   */
  accountLink(account: Account): (string | number)[] {
    return this.capabilities.active
      ? [
          '/accounts',
          anonymousAccountRouteRef({
            server: this.resultServer(),
            id: account.id,
            originalUrl: account.url || undefined,
          }),
        ]
      : // Handle in the path: search results are the worst case for a bare id,
        // since the search server is routinely not the browsing server.
        accountRoutePath({ id: account.id, handle: qualifiedHandle(account) ?? undefined });
  }

  /** The instance whose namespace the current results' ids belong to. */
  private resultServer(): string {
    return this.searchServer.baseUrl() || this.anonymous.server();
  }

  onChanged(updated: Status): void {
    this.results.update((r) =>
      r ? { ...r, statuses: r.statuses.map((s) => (s.id === updated.id ? updated : s)) } : r,
    );
  }

  onDeleted(removed: Status): void {
    this.results.update((r) =>
      r ? { ...r, statuses: r.statuses.filter((s) => s.id !== removed.id) } : r,
    );
  }
}
