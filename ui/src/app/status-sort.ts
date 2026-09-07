import { Status } from './models';

/**
 * Newest-first ordering for timeline statuses, shared by every surface that
 * merges pages into one accumulated feed.
 *
 * ## Why this is not `Date.parse(b) - Date.parse(a)`
 *
 * That expression yields `NaN` for a status whose `created_at` cannot be read,
 * and a comparator returning `NaN` has undefined ordering. The older workaround
 * — mapping an unreadable date to 0 — was worse in a specific and long-lived
 * way: epoch is older than every real post, so such a status sorted to the end
 * of the feed and *stayed* there. Nothing could sort below it, so every later
 * page merged above it and the reader saw one post welded to the bottom of
 * Home for the whole session.
 *
 * `providers/twitter/twitterapi-io/normalizers.ts` stamps `new Date(0)` on any
 * tweet whose timestamp fails to normalise, which is where they came from.
 *
 * ## What this does instead
 *
 * An unknown date compares equal to everything, so `Array.prototype.sort` —
 * stable per spec — leaves the status where it arrived, adjacent to the posts
 * it was fetched with, rather than migrating it to either extreme. Undated
 * posts are still shown: hiding a post because its provider sent a date we
 * could not parse is a worse failure than showing it slightly out of order.
 */
export function byNewestFirst(a: Status, b: Status): number {
  const left = statusTime(a);
  const right = statusTime(b);
  if (left === null || right === null) {
    return 0;
  }
  return right - left;
}

/** Oldest-first, with the same unknown-date handling as {@link byNewestFirst}. */
export function byOldestFirst(a: Status, b: Status): number {
  return -byNewestFirst(a, b);
}

/** Parsed `created_at` in ms, or `null` when the provider sent an unreadable date. */
export function statusTime(status: Status): number | null {
  const ms = Date.parse(status.created_at);
  return Number.isNaN(ms) ? null : ms;
}
