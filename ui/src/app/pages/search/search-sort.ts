/**
 * Pure client-side sorting over search results we've *already* fetched. Like
 * `search-refine.ts` and `account-refine.ts`, none of this makes an API call —
 * it only ever reorders the statuses/accounts already in memory. A sort of
 * loaded results, not a new search.
 *
 * Sorts are stable: ties preserve the incoming (server-returned) order, so
 * flipping back to "Relevance" and the ties within any other sort both feel
 * predictable. The default option for each result type is 'relevance', which is
 * a no-op that hands back the server's order untouched.
 *
 * Labels are keys rather than English — see `en.json`/settings-anonymous.ts for
 * the pattern — because a sort menu is read by every viewer, not just the ones
 * who typed the query in English.
 */
// i18n pages.search.sort.relevance: Relevance
// i18n pages.search.sort.newest: Newest
// i18n pages.search.sort.oldest: Oldest
// i18n pages.search.sort.favourites: Most favourited
// i18n pages.search.sort.reblogs: Most boosted
// i18n pages.search.sort.replies: Most replies
// i18n pages.search.sort.followers: Most followers
// i18n pages.search.sort.following: Most following
// i18n pages.search.sort.posts: Most posts
// i18n pages.search.sort.name: Name (A–Z)
// i18n pages.search.sort.matches: Most matching posts
// i18n pages.search.sort.active: Recently active

import { Account, Status } from '../../models';
import { AccountWithMatches } from './account-refine';

export type StatusSortKey =
  | 'relevance'
  | 'newest'
  | 'oldest'
  | 'favourites'
  | 'reblogs'
  | 'replies';

export type AccountSortKey =
  | 'relevance'
  | 'followers'
  | 'following'
  | 'posts'
  | 'name'
  | 'matches'
  | 'active';

export interface SortOption<K extends string> {
  value: K;
  label: string;
}

/** Sort choices for the posts result list (order = display order in the bar). */
export const STATUS_SORTS: SortOption<StatusSortKey>[] = [
  { value: 'relevance', label: 'pages.search.sort.relevance' },
  { value: 'newest', label: 'pages.search.sort.newest' },
  { value: 'oldest', label: 'pages.search.sort.oldest' },
  { value: 'favourites', label: 'pages.search.sort.favourites' },
  { value: 'reblogs', label: 'pages.search.sort.reblogs' },
  { value: 'replies', label: 'pages.search.sort.replies' },
];

/** Sort choices for the account result list. */
export const ACCOUNT_SORTS: SortOption<AccountSortKey>[] = [
  { value: 'relevance', label: 'pages.search.sort.relevance' },
  { value: 'followers', label: 'pages.search.sort.followers' },
  { value: 'following', label: 'pages.search.sort.following' },
  { value: 'posts', label: 'pages.search.sort.posts' },
  { value: 'name', label: 'pages.search.sort.name' },
  { value: 'matches', label: 'pages.search.sort.matches' },
  { value: 'active', label: 'pages.search.sort.active' },
];

/** Stable sort by a numeric key extractor, descending (bigger first). */
function byDesc<T>(items: T[], key: (t: T) => number): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => key(b.item) - key(a.item) || a.i - b.i)
    .map((x) => x.item);
}

/**
 * The `created_at` used to order a status. Reblogs float on the booster's
 * timeline, but the interesting date is when the underlying post was made — so
 * date sorts follow through the reblog when present (matching the card's clock).
 */
function statusTime(s: Status): number {
  const src = s.reblog ?? s;
  return new Date(src.created_at).getTime() || 0;
}

/** Reorder loaded statuses by the chosen key. 'relevance' returns them as-is. */
export function sortStatuses(statuses: Status[], key: StatusSortKey): Status[] {
  switch (key) {
    case 'relevance':
      return statuses;
    case 'newest':
      return byDesc(statuses, statusTime);
    case 'oldest':
      return byDesc(statuses, (s) => -statusTime(s));
    case 'favourites':
      return byDesc(statuses, (s) => (s.reblog ?? s).favourites_count);
    case 'reblogs':
      return byDesc(statuses, (s) => (s.reblog ?? s).reblogs_count);
    case 'replies':
      return byDesc(statuses, (s) => (s.reblog ?? s).replies_count);
  }
}

/**
 * Sort weight for "recently active", in three tiers:
 *
 *  - a real `last_status_at` sorts by its timestamp;
 *  - `null` means the server answered "this account has never posted" — a known
 *    fact, so it ranks below every dated account but above the unknowns;
 *  - `undefined` means the field was never supplied (a remote stub the search
 *    returned thin, not yet enriched), which sorts last so an unanswered
 *    account never displaces one we have an answer for.
 */
export function accountActivity(account: Account): number {
  if (account.last_status_at === undefined) {
    return -Infinity;
  }
  if (account.last_status_at === null) {
    return -Number.MAX_VALUE;
  }
  return Date.parse(account.last_status_at) || -Number.MAX_VALUE;
}

/** Reorder loaded accounts by the chosen key. 'relevance' returns them as-is. */
export function sortAccounts(
  items: AccountWithMatches[],
  key: AccountSortKey,
): AccountWithMatches[] {
  switch (key) {
    case 'relevance':
      return items;
    case 'followers':
      return byDesc(items, (i) => i.account.followers_count);
    case 'following':
      return byDesc(items, (i) => i.account.following_count);
    case 'posts':
      return byDesc(items, (i) => i.account.statuses_count);
    case 'matches':
      return byDesc(items, (i) => i.matchingPosts.length);
    case 'active':
      // Unknown sinks below known, rather than sorting as the epoch and
      // claiming an un-enriched account has been silent since 1970. A null
      // `last_status_at` is a real answer ("never posted") and outranks it.
      return byDesc(items, (i) => accountActivity(i.account));
    case 'name': {
      const label = (a: Account) => (a.display_name?.trim() || a.acct || '').toLowerCase();
      return items
        .map((item, i) => ({ item, i }))
        .sort((a, b) => label(a.item.account).localeCompare(label(b.item.account)) || a.i - b.i)
        .map((x) => x.item);
    }
  }
}
