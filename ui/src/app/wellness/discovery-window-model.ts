/**
 * Discovery windows (Wellness): Explore, trends, Good Stuff and public
 * timelines are closed until you open them for a while. Pure part.
 *
 * Opening is one tap on a length. Nothing asks "are you sure"; the point is
 * that discovery is a choice with an edge, not that it is hard to reach.
 *
 * "No limit" lasts until the day resets (04:00 local), the same boundary as
 * the grayscale clock. A tap that switched the protection off for good would
 * be the Settings toggle wearing a different hat; this way it comes back
 * tomorrow on its own.
 */

export type WindowLength = 10 | 20 | 45 | 'day';

export const WINDOW_LENGTHS: readonly WindowLength[] = [10, 20, 45, 'day'];

/** The local hour the wellness day turns over (shared with the usage clock). */
export const DAY_RESET_HOUR = 4;

/** Epoch ms of the next 04:00 local after `now`. */
export function nextDayReset(now: number): number {
  const date = new Date(now);
  const reset = new Date(date);
  reset.setHours(DAY_RESET_HOUR, 0, 0, 0);
  if (reset.getTime() <= now) reset.setDate(reset.getDate() + 1);
  return reset.getTime();
}

/** When a window opened now with this length closes. */
export function windowEnd(length: WindowLength, now: number): number {
  return length === 'day' ? nextDayReset(now) : now + length * 60_000;
}

/** Whole minutes left, rounded up so "0 minutes left" never shows while open. */
export function minutesLeft(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 60_000));
}

/**
 * Paths that are discovery. Matched on the path without query or fragment:
 *
 * - `/explore` and below: trending posts, tags, links, people.
 * - `/algo` exactly: Good Stuff. Catch-up and Relationships are the people you
 *   follow, not discovery.
 * - `/for-you`: Bluesky's Discover, the same idea as Good Stuff.
 * - `/public`: local and federated timelines.
 * - `/feeds/servers/<server>/<feed>`: another server's public timeline. The
 *   server list above it is a directory, not a feed.
 */
export function isDiscoveryPath(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
  return (
    path === '/explore' ||
    path.startsWith('/explore/') ||
    path === '/algo' ||
    path === '/for-you' ||
    path === '/public' ||
    /^\/feeds\/servers\/[^/]+\/[^/]+$/.test(path)
  );
}

/** Stored `until` made safe: anything that isn't a finite number is "closed". */
export function normalizeUntil(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
