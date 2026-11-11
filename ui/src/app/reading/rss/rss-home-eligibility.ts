import { ParsedFeed } from './rss-parser';

/**
 * Whether a feed reads like a social timeline — frequent, short posts — rather
 * than a news site, blog, or newsletter.
 *
 * Home blends RSS in specifically for the first kind: a feed that posts
 * several times a day in a sentence or two sits next to a friend's status
 * without clashing. A five-times-a-week 2,000-word article does not — it is
 * a different reading posture, and mixing it into Home is the exact
 * complaint this classifier exists to fix. Everything that doesn't qualify
 * stays fully available on `/rss`; this only gates the Home blend.
 *
 * Auto-detected from the feed's own recent items rather than a per-feed
 * setting: Sprint 1 (rss-1-nav-and-page-skeleton.md) chose detection over a
 * manual toggle specifically to avoid an onboarding step nobody would find.
 *
 * The thresholds below are a first cut, not a tuned model — expect to revisit
 * them once real feeds have been run through this. Both conditions must hold;
 * a feed that posts often but at length (a busy blog) is exactly the case
 * that should NOT qualify.
 */

/** How many recent items to look at when estimating frequency and length. */
const SAMPLE_SIZE = 10;

/**
 * Minimum items-per-day, averaged over the sample, to count as "frequent".
 *
 * Two a day is a low bar for a chatty feed (a status-update account, a link
 * blog) and comfortably excludes anything publishing on a daily-or-slower
 * cadence — which covers ordinary news sites and blogs.
 */
const MIN_ITEMS_PER_DAY = 2;

/**
 * Maximum median item body length (plain-text characters, tags stripped) to
 * count as "short". 280 mirrors the length Home's own short-form posts are
 * built around, so a qualifying RSS item reads like the posts beside it
 * rather than standing out as an essay-length outlier.
 */
const MAX_MEDIAN_BODY_CHARS = 280;

/** Strip tags for a rough plain-text length — classification doesn't need real sanitization. */
function plainTextLength(html: string): number {
  return html.replace(/<[^>]*>/g, '').trim().length;
}

function median(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Decide whether `feed`'s recent items qualify it for the Home blend.
 *
 * Looks only at the newest {@link SAMPLE_SIZE} items with a parseable date —
 * an archive-heavy feed's older entries say nothing about how it publishes
 * *now*, which is the only thing Home eligibility should track.
 */
export function qualifiesForHome(feed: ParsedFeed): boolean {
  const dated = feed.items
    .filter((item) => item.publishedAt !== null)
    .sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!))
    .slice(0, SAMPLE_SIZE);

  if (dated.length < 2) {
    // Not enough recent, dated posts to estimate a cadence at all — treat as
    // not-frequent rather than guessing from a single data point.
    return false;
  }

  const newest = Date.parse(dated[0].publishedAt!);
  const oldest = Date.parse(dated[dated.length - 1].publishedAt!);
  const spanDays = Math.max((newest - oldest) / (24 * 60 * 60 * 1000), 1 / 24);
  const itemsPerDay = dated.length / spanDays;

  const medianBodyChars = median(dated.map((item) => plainTextLength(item.html)));

  return itemsPerDay >= MIN_ITEMS_PER_DAY && medianBodyChars <= MAX_MEDIAN_BODY_CHARS;
}
