/**
 * The rich, structured search object that is the single source of truth for the
 * search page: form widgets, URL serialization, saved searches, generated
 * Mastodon query, and result filtering all read/write this one shape.
 *
 * Ported from `spec/search/better_search.md` §5. There is deliberately no parser
 * from an arbitrary Mastodon DSL back into this object — the object is canonical
 * and the query string is a derived artifact (see the serializer, sprint 2).
 */

export type SearchTarget = 'accounts' | 'hashtags' | 'posts';

/**
 * How many large result pages a search fetches eagerly (see sprint 3). A page is
 * ~40 posts, so the budget sizes the client-side faceting corpus. Presets are
 * 1/2/3/5/10 but any positive integer is valid; "Load more" can page past it.
 */
export type ApiCallBudget = number;

export type ResultGrouping = 'none' | 'author' | 'date';

export type AccountLocation = 'any' | 'local' | 'remote';

export type PostContentType =
  | 'any'
  | 'media'
  | 'image'
  | 'video'
  | 'audio'
  | 'poll'
  | 'link'
  | 'text';

/** include = default; only = require it; exclude = drop it. */
export type Tristate = 'include' | 'only' | 'exclude';

export interface SearchDateBounds {
  after?: string; // YYYY-MM-DD
  before?: string; // YYYY-MM-DD
}

export interface SearchTextCriteria {
  words?: string;
  exactPhrase?: string;
  excludeWords?: string;
}

export interface PostSearchCriteria extends SearchTextCriteria {
  author?: string;
  dates?: SearchDateBounds;
  language?: string;

  contentType?: PostContentType;

  replies?: Tristate;
  sensitive?: Tristate;

  scope?: 'all' | 'public' | 'library';
}

/**
 * Where an account search looks for its query. Mastodon's account endpoint
 * matches handle/display-name/bio; 'posts' instead runs a post search and
 * condenses the matching statuses down to their distinct authors ("find me
 * people who post about pycharm"). 'both' (the default) runs both and merges the
 * authors, deduped by id.
 */
export type AccountSearchSource = 'bio' | 'posts' | 'both';

/** A closed/open numeric range. Either bound may be undefined (unbounded). */
export interface NumericRange {
  min?: number;
  max?: number;
}

export interface AccountSearchCriteria {
  text: string;
  location?: AccountLocation;
  bot?: Tristate;
  locked?: Tristate;
  domain?: string;

  /** Where to look for the query. Defaults to 'both' when unset. */
  source?: AccountSearchSource;

  // Numeric gates applied to loaded results (client-side): filter in/out
  // celebrities, dead accounts, etc. by follower/following/post counts.
  followers?: NumericRange;
  following?: NumericRange;
  statuses?: NumericRange;
}

export interface HashtagSearchCriteria {
  text: string;
}

export interface SearchPresentation {
  grouping: ResultGrouping;
  /** The §12 loaded-result text filter. Presentation state, never a server criterion. */
  loadedResultFilter?: string;
}

export interface MawkingbirdSearch {
  version: 1;
  target: SearchTarget;

  account?: AccountSearchCriteria;
  hashtag?: HashtagSearchCriteria;
  post?: PostSearchCriteria;

  /** Ceiling on HTTP requests. Inert until sprint 3; default 3 ("Balanced"). */
  apiCallBudget: ApiCallBudget;
  presentation: SearchPresentation;
}

/** A fresh search of the given target with spec defaults. */
export function emptySearch(target: SearchTarget = 'accounts'): MawkingbirdSearch {
  return {
    version: 1,
    target,
    account: target === 'accounts' ? { text: '' } : undefined,
    hashtag: target === 'hashtags' ? { text: '' } : undefined,
    post: target === 'posts' ? {} : undefined,
    apiCallBudget: 3,
    presentation: { grouping: 'none' },
  };
}

/**
 * The primary free-text box maps onto one field depending on the target. This is
 * the bridge between the single search input and the rich object.
 */
export function primaryText(search: MawkingbirdSearch): string {
  switch (search.target) {
    case 'accounts':
      return search.account?.text ?? '';
    case 'hashtags':
      return search.hashtag?.text ?? '';
    case 'posts':
      return search.post?.words ?? '';
  }
}

/** Return a copy of `search` with the primary free-text box set to `text`. */
export function withPrimaryText(search: MawkingbirdSearch, text: string): MawkingbirdSearch {
  switch (search.target) {
    case 'accounts':
      return { ...search, account: { ...(search.account ?? { text: '' }), text } };
    case 'hashtags':
      return { ...search, hashtag: { text } };
    case 'posts':
      return { ...search, post: { ...(search.post ?? {}), words: text } };
  }
}
