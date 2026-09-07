import { Status } from './models';
import { stripHtml } from './sentiment';

/**
 * Cheap, client-side account metrics derived entirely from a sample of an
 * account's recent posts (plus the account's own follower count). No history
 * endpoints, no per-day queries — the sample the analytics page already holds
 * in memory *is* the time series. Every function here is a pure transform over
 * that sample, so adding a metric costs zero API calls.
 *
 * Two things worth stating up front, because the numbers look more authoritative
 * than they are:
 *
 *  - **Reach is a folk model, not a measurement.** Mastodon exposes no
 *    impression counts, so we infer reach from followers, boosts and favourites
 *    using the deliberately-guessed constants in {@link REACH_MODEL}. It is a
 *    "cheap peek", in the same spirit as the rage lexicon in `sentiment.ts`.
 *  - **Liveliness is always relative to *now*.** An account that posted 1000
 *    times in 2023 and nothing since is *dormant*, not lively — so cadence is
 *    measured over a trailing window ending today, never across the sample's
 *    own span (which would make any dead account look busy).
 */

// ---------------------------------------------------------------------------
// Reach
// ---------------------------------------------------------------------------

/**
 * The guessed constants behind the reach estimate. These are folklore, not
 * data — tune them here, in one place, and treat every number they produce as
 * an estimate.
 */
export const REACH_MODEL = {
  /**
   * Assumed audience gained per boost. Each boost re-exposes the post to a
   * *different* account's followers, so this is genuinely new reach. ~250 is
   * the well-worn "the average account has a few hundred followers" guess.
   */
  avgBoosterAudience: 250,
  /**
   * How many of your *own* followers a single favourite implies actually saw
   * the post. A like doesn't broadcast, but it correlates with visibility
   * (faved posts float up; likers had to see it to like it). Folded into a
   * fraction-of-followers-saw multiplier that can never exceed 1.0 — likes
   * alone can't reach beyond your follower count.
   */
  followersSeenPerFavourite: 1.5,
  /**
   * The floor for "how much of your own audience saw a post" even with zero
   * favourites — not everyone sees everything, but some baseline fraction of
   * followers is assumed reached organically.
   */
  organicReachFraction: 0.1,
} as const;

/**
 * Estimated number of people who saw a single post.
 *
 *   reach = ownAudienceReached + boosts × avgBoosterAudience
 *
 * where `ownAudienceReached` is a fraction of the follower count that grows
 * with favourites (capped at the full follower count). Boosts add fresh
 * audience on top. `followers` is passed in because a post's own
 * `account.followers_count` is the same for every post in the sample.
 */
export function estimatePostReach(post: Status, followers: number): number {
  const target = post.reblog ?? post;
  const seenFraction = Math.min(
    1,
    REACH_MODEL.organicReachFraction +
      (target.favourites_count * REACH_MODEL.followersSeenPerFavourite) / Math.max(1, followers),
  );
  const ownAudience = followers * seenFraction;
  const boostAudience = target.reblogs_count * REACH_MODEL.avgBoosterAudience;
  return Math.round(ownAudience + boostAudience);
}

/** Total estimated reach across a sample of posts. */
export function estimateTotalReach(posts: Status[], followers: number): number {
  return posts.reduce((sum, p) => sum + estimatePostReach(p, followers), 0);
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Days between two ISO timestamps (absolute). */
function daysBetween(aIso: string, bIso: string): number {
  return Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) / DAY_MS;
}

/**
 * The span, in days, covered by the sample (oldest → newest post). Zero for an
 * empty or single-post sample. Assumes `posts` is newest-first, as the API
 * returns it.
 */
export function sampleSpanDays(posts: Status[]): number {
  if (posts.length < 2) {
    return 0;
  }
  return daysBetween(posts[0].created_at, posts[posts.length - 1].created_at);
}

// ---------------------------------------------------------------------------
// Conversation and post length
// ---------------------------------------------------------------------------

/**
 * A post the account actually wrote, as opposed to one it passed along.
 *
 * Boosts carry someone else's text and someone else's length, so counting them
 * would measure the people this account reads rather than this account.
 */
function isOriginal(post: Status): boolean {
  return post.reblog == null;
}

/**
 * How much of this account's own posting is replies to other people.
 *
 * The question this answers is "is anyone home?". An account that posts daily
 * and has *never* replied to anyone is usually a feed, a cross-poster, or a bot
 * — worth knowing before you follow it, and invisible in every other number on
 * the page, since an unattended account can have perfectly healthy post counts.
 *
 * A percentage of the sample rather than of the account's whole history: the
 * history would cost an unbounded number of API calls to page through, and the
 * ratio is the part that generalises anyway. Boosts are excluded from both
 * sides — passing along someone else's post is neither replying nor declining
 * to reply.
 *
 * Returns null for a sample with no original posts, where the ratio would be
 * 0/0 and "0%" would be a claim the data does not support.
 */
export function replyRatio(posts: Status[]): number | null {
  const original = posts.filter(isOriginal);
  if (original.length === 0) {
    return null;
  }
  const replies = original.filter((post) => post.in_reply_to_id != null).length;
  return Math.round((replies / original.length) * 100);
}

/** Replies this account made in the sample — the count behind {@link replyRatio}. */
export function repliesGiven(posts: Status[]): number {
  return posts.filter((post) => isOriginal(post) && post.in_reply_to_id != null).length;
}

/**
 * Visible characters in a post: tags stripped, entities decoded, CW included.
 *
 * Mastodon serves `content` as HTML, so the raw string counts markup nobody
 * reads — `<p>` and every `<a href>` of a link — and a post's length would
 * scale with how many links it has. What we want is the reading burden, so this
 * measures what lands on screen, via the same {@link stripHtml} the sentiment
 * scorer uses. The spoiler text counts because a reader has to read it before
 * deciding about the rest.
 */
export function postTextLength(post: Status): number {
  return stripHtml(post.content).length + stripHtml(post.spoiler_text ?? '').length;
}

export interface PostLengthRange {
  shortest: number;
  longest: number;
}

/**
 * Shortest and longest original post in the sample, in visible characters.
 *
 * Together these say how much reading this account asks of you: an account
 * whose longest post is 2,800 characters is a different proposition from one
 * that never breaks 200, and the pair shows the range rather than flattening it
 * to an average that neither end resembles.
 *
 * Empty posts (image-only, say) are skipped — a zero would otherwise pin
 * "shortest" at 0 for anyone who posts pictures, which says nothing about their
 * writing. Null when nothing in the sample has text.
 */
export function postLengthRange(posts: Status[]): PostLengthRange | null {
  const lengths = posts
    .filter(isOriginal)
    .map(postTextLength)
    .filter((n) => n > 0);
  if (lengths.length === 0) {
    return null;
  }
  return { shortest: Math.min(...lengths), longest: Math.max(...lengths) };
}

// ---------------------------------------------------------------------------
// Liveliness
// ---------------------------------------------------------------------------

/** Cadence half-life: posting within ~2 weeks reads as hot, silence cools fast. */
const LIVELINESS_TAU_DAYS = 14;

export type LivelinessLabel = 'Active' | 'Slowing' | 'Dormant';

export interface Liveliness {
  /** Days since the most recent post (0 if it was today; Infinity if none). */
  daysSinceLastPost: number;
  /** Posts made in the trailing 30 days ending *now*. */
  postsLast30Days: number;
  /** Posts made in the trailing 90 days ending *now*. */
  postsLast90Days: number;
  /** Recent cadence: posts per day over the trailing 30 days. */
  recentPostsPerDay: number;
  /** 0–100 liveliness score, recency-weighted and anchored to today. */
  score: number;
  /** Traffic-light bucket derived from {@link score}. */
  label: LivelinessLabel;
}

/**
 * Recency-weighted liveliness, always measured relative to `now`.
 *
 * The score multiplies a recency-decay term (how long since the last post) by a
 * recent-cadence term (how much posting happened in the last month). Both go to
 * ~0 for an account that has been silent, which is the whole point: history
 * before the trailing window never props the number up.
 */
export function computeLiveliness(posts: Status[], now: Date = new Date()): Liveliness {
  const nowMs = now.getTime();
  if (!posts.length) {
    return {
      daysSinceLastPost: Infinity,
      postsLast30Days: 0,
      postsLast90Days: 0,
      recentPostsPerDay: 0,
      score: 0,
      label: 'Dormant',
    };
  }

  const times = posts.map((p) => new Date(p.created_at).getTime());
  const lastMs = Math.max(...times);
  const daysSinceLastPost = Math.max(0, (nowMs - lastMs) / DAY_MS);
  const postsLast30Days = times.filter((t) => nowMs - t <= 30 * DAY_MS).length;
  const postsLast90Days = times.filter((t) => nowMs - t <= 90 * DAY_MS).length;
  const recentPostsPerDay = Math.round((postsLast30Days / 30) * 10) / 10;

  // Recency decay: 1.0 if posted today, ~0.37 at one tau, → 0 as silence grows.
  const recency = Math.exp(-daysSinceLastPost / LIVELINESS_TAU_DAYS);
  // Cadence, saturating: ~1 post/day in the last month is already "very active".
  const cadence = Math.min(1, postsLast30Days / 30);
  // Recency dominates (a dead account can't be lively however busy it once was),
  // but a live account that posts a lot should still outscore one that posts rarely.
  const score = Math.round(100 * recency * (0.5 + 0.5 * cadence));

  let label: LivelinessLabel;
  if (score >= 40) {
    label = 'Active';
  } else if (score >= 10) {
    label = 'Slowing';
  } else {
    label = 'Dormant';
  }

  return {
    daysSinceLastPost: Math.round(daysSinceLastPost),
    postsLast30Days,
    postsLast90Days,
    recentPostsPerDay,
    score,
    label,
  };
}

// ---------------------------------------------------------------------------
// Time-bucketed activity (for sparklines / "when they post")
// ---------------------------------------------------------------------------

/** One time bucket of activity: a label plus the posts and reach that fell in it. */
export interface ActivityBucket {
  /** Human label for the bucket ("Wk of Mar 3", "Mar 2025"). */
  label: string;
  /** Start of the bucket (ISO), oldest edge. */
  startIso: string;
  posts: number;
  reach: number;
}

/** Minimum sample span before weekly buckets are meaningful enough to show. */
export const MIN_WEEKS_FOR_WEEKLY = 10;
/** Minimum sample span before monthly buckets are meaningful enough to show. */
export const MIN_MONTHS_FOR_MONTHLY = 6;

/** Whether the sample spans enough time for a weekly breakdown to be worth showing. */
export function hasWeeklyRange(posts: Status[]): boolean {
  return sampleSpanDays(posts) >= MIN_WEEKS_FOR_WEEKLY * 7;
}

/** Whether the sample spans enough time for a monthly breakdown to be worth showing. */
export function hasMonthlyRange(posts: Status[]): boolean {
  return sampleSpanDays(posts) >= MIN_MONTHS_FOR_MONTHLY * 30;
}

const WEEK_LABEL_OPTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
const MONTH_LABEL_OPTS: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' };

/**
 * Bucket posts into consecutive weeks (oldest → newest), each carrying its post
 * count and estimated reach. Empty weeks in the middle are included so a
 * sparkline shows real gaps. Returns [] if the span is too short to be useful.
 */
export function weeklyActivity(posts: Status[], followers: number): ActivityBucket[] {
  if (!hasWeeklyRange(posts)) {
    return [];
  }
  const oldest = new Date(posts[posts.length - 1].created_at).getTime();
  const newest = new Date(posts[0].created_at).getTime();
  const buckets: ActivityBucket[] = [];
  for (let start = oldest; start <= newest; start += WEEK_MS) {
    buckets.push({
      label: 'Wk of ' + new Date(start).toLocaleDateString([], WEEK_LABEL_OPTS),
      startIso: new Date(start).toISOString(),
      posts: 0,
      reach: 0,
    });
  }
  for (const p of posts) {
    const idx = Math.floor((new Date(p.created_at).getTime() - oldest) / WEEK_MS);
    const bucket = buckets[Math.min(idx, buckets.length - 1)];
    bucket.posts += 1;
    bucket.reach += estimatePostReach(p, followers);
  }
  return buckets;
}

/**
 * Bucket posts by calendar month (oldest → newest). Returns [] if the span is
 * too short to be useful.
 */
export function monthlyActivity(posts: Status[], followers: number): ActivityBucket[] {
  if (!hasMonthlyRange(posts)) {
    return [];
  }
  const byKey = new Map<string, ActivityBucket>();
  // Walk oldest → newest so insertion order is chronological.
  for (const p of [...posts].reverse()) {
    const d = new Date(p.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = {
        label: d.toLocaleDateString([], MONTH_LABEL_OPTS),
        startIso: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(),
        posts: 0,
        reach: 0,
      };
      byKey.set(key, bucket);
    }
    bucket.posts += 1;
    bucket.reach += estimatePostReach(p, followers);
  }
  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// "When they post" — weekday / hour distribution (no timezone inference)
// ---------------------------------------------------------------------------

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Post counts per local weekday (index 0 = Sunday), for a bar chart. */
export function weekdayHistogram(posts: Status[]): { label: string; posts: number }[] {
  const counts = new Array(7).fill(0);
  for (const p of posts) {
    counts[new Date(p.created_at).getDay()] += 1;
  }
  return WEEKDAY_LABELS.map((label, i) => ({ label, posts: counts[i] }));
}

/** Post counts per local hour (0–23), for a bar chart. */
export function hourHistogram(posts: Status[]): { hour: number; posts: number }[] {
  const counts = new Array(24).fill(0);
  for (const p of posts) {
    counts[new Date(p.created_at).getHours()] += 1;
  }
  return counts.map((posts, hour) => ({ hour, posts }));
}

// ---------------------------------------------------------------------------
// Who they talk to, and what about
// ---------------------------------------------------------------------------

/** How many entries the "top N" lists below return. */
export const TOP_N = 5;

/** One counted thing (a partner, a tag, a domain) with its rank. */
export interface CountedItem {
  /** The value itself: an account id, a tag name, a domain. */
  key: string;
  /** What to show — the handle, `#tag`, the bare domain. */
  label: string;
  count: number;
}

/** Sort by count (desc), breaking ties alphabetically so the order is stable. */
function topBy(
  counts: Map<string, { label: string; count: number }>,
  limit: number,
): CountedItem[] {
  return [...counts.entries()]
    .map(([key, { label, count }]) => ({ key, label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/**
 * The accounts this one replies to most, across the sample.
 *
 * Free: `in_reply_to_account_id` rides along on every status, so "who do they
 * actually talk to" costs nothing beyond the posts already fetched — no parent
 * lookups. The handle comes from the post's own `mentions`, since a reply
 * mentions the account it answers; when it isn't there the id is shown rather
 * than dropping the row, because a frequent partner we can't name is still a
 * fact worth reporting.
 *
 * Self-replies are excluded: a thread is someone talking to themselves, and
 * counting it would put every long-form poster at the top of their own list.
 */
export function topConversationPartners(
  posts: Status[],
  selfId: string,
  limit = TOP_N,
): CountedItem[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const post of posts) {
    if (post.reblog) {
      continue;
    }
    const target = post.in_reply_to_account_id;
    if (!target || target === selfId) {
      continue;
    }
    const mentioned = post.mentions?.find((m) => m.id === target);
    const label = mentioned ? `@${mentioned.acct}` : target;
    const seen = counts.get(target);
    // Keep the best label we've seen: an earlier post may have lacked mentions.
    counts.set(target, {
      label: seen && seen.label.startsWith('@') ? seen.label : label,
      count: (seen?.count ?? 0) + 1,
    });
  }
  return topBy(counts, limit);
}

/**
 * The hashtags this account uses most.
 *
 * Counts each tag once per post — a post that says #rust three times is one
 * post about Rust, not three — and lowercases for grouping, since Mastodon
 * treats `#Rust` and `#rust` as the same tag while preserving each post's
 * casing. The first-seen casing is what gets displayed.
 */
export function topHashtags(posts: Status[], limit = TOP_N): CountedItem[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const post of posts) {
    if (post.reblog) {
      continue;
    }
    const seenHere = new Set<string>();
    for (const tag of post.tags ?? []) {
      const key = tag.name.toLowerCase();
      if (seenHere.has(key)) {
        continue;
      }
      seenHere.add(key);
      const seen = counts.get(key);
      counts.set(key, { label: seen?.label ?? `#${tag.name}`, count: (seen?.count ?? 0) + 1 });
    }
  }
  return topBy(counts, limit);
}

/**
 * Hosts stripped of a leading `www.`, so `www.bbc.co.uk` and `bbc.co.uk` are one
 * domain rather than two rows that mean the same thing.
 */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * The domains this account links to most.
 *
 * Read from the post's preview `card`, which is the link Mastodon itself
 * resolved — more reliable than scraping anchors out of the HTML content, and
 * already on the object. One domain per post for the same reason as tags.
 *
 * A post linking only to the account's own server is still counted: self-linking
 * is exactly the pattern this metric exists to make visible.
 */
export function topLinkDomains(posts: Status[], limit = TOP_N): CountedItem[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const post of posts) {
    if (post.reblog) {
      continue;
    }
    const url = post.card?.url;
    if (!url) {
      continue;
    }
    const host = hostOf(url);
    if (!host) {
      continue;
    }
    const seen = counts.get(host);
    counts.set(host, { label: host, count: (seen?.count ?? 0) + 1 });
  }
  return topBy(counts, limit);
}

// ---------------------------------------------------------------------------
// Contribution heatmap ("the lawn")
// ---------------------------------------------------------------------------

/** One day cell in the heatmap. */
export interface HeatmapDay {
  /** Local midnight of the day, ISO — also the cell's track key. */
  dayIso: string;
  /** Localised date, for the tooltip. */
  label: string;
  posts: number;
  /** 0 (none) to 4 (busiest), for CSS shading. */
  level: number;
}

/** A calendar heatmap: weeks as columns, Sunday-first days as rows. */
export interface Heatmap {
  /** Columns, oldest week first; each holds exactly 7 days (Sun → Sat). */
  weeks: HeatmapDay[][];
  /** Month labels positioned by the column their month starts in. */
  months: { label: string; weekIndex: number }[];
  /** Busiest single day in the range, for the legend. */
  peak: number;
  /** How many days the grid spans, padding included. */
  days: number;
  /** Days in the range with at least one post. */
  activeDays: number;
}

const HEATMAP_LEVELS = 4;
const DAY_TOOLTIP_OPTS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
};
const HEATMAP_MONTH_OPTS: Intl.DateTimeFormatOptions = { month: 'short' };

function localMidnight(value: string | number | Date): Date {
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * A GitHub-style contribution grid over **exactly the span the sample covers** —
 * from the Sunday on or before the oldest post to the Saturday on or after the
 * newest. Deliberately not a fixed 52-week year: the sample is ~100 posts, so
 * for a busy account that is a few weeks and drawing an empty year would imply
 * silence we never observed. Widening the window is the caller's job (the
 * "get more posts" control), and the grid grows with it.
 *
 * Shading is relative to the sample's own busiest day, so the lawn always uses
 * its full range of greens regardless of how prolific the account is.
 */
export function postHeatmap(posts: Status[]): Heatmap {
  if (!posts.length) {
    return { weeks: [], months: [], peak: 0, days: 0, activeDays: 0 };
  }

  const counts = new Map<number, number>();
  let oldest = Infinity;
  let newest = -Infinity;
  for (const p of posts) {
    const day = localMidnight(p.created_at).getTime();
    counts.set(day, (counts.get(day) ?? 0) + 1);
    oldest = Math.min(oldest, day);
    newest = Math.max(newest, day);
  }

  // Pad out to whole weeks so every column is a full Sunday→Saturday strip.
  const start = new Date(oldest);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(newest);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const peak = Math.max(...counts.values());
  const weeks: HeatmapDay[][] = [];
  const months: { label: string; weekIndex: number }[] = [];
  let week: HeatmapDay[] = [];
  let days = 0;
  let lastMonth = -1;

  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const day = new Date(cursor);
    const posts = counts.get(day.getTime()) ?? 0;
    week.push({
      dayIso: day.toISOString(),
      label: day.toLocaleDateString([], DAY_TOOLTIP_OPTS),
      posts,
      // Ceil so any activity at all is visible, never washed out to level 0.
      level: posts ? Math.max(1, Math.ceil((posts / peak) * HEATMAP_LEVELS)) : 0,
    });
    days += 1;
    if (day.getDay() === 0 && day.getMonth() !== lastMonth) {
      lastMonth = day.getMonth();
      months.push({
        label: day.toLocaleDateString([], HEATMAP_MONTH_OPTS),
        weekIndex: weeks.length,
      });
    }
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) {
    weeks.push(week);
  }

  return { weeks, months, peak, days, activeDays: counts.size };
}
