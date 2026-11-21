import type { Status } from '../platform/api/models';
import { stripHtml } from '../feeds/sentiment';

/**
 * What kind of account this is, from posts already loaded: how much is their
 * own writing, how they talk, and whether their posting runs on a clock.
 * Pure functions; no requests.
 */

// ---------------------------------------------------------------------------
// Activity mix: own posts vs passed along
// ---------------------------------------------------------------------------

export interface ActivityMix {
  /** Every status in the sample, boosts included. */
  total: number;
  /** New posts that start something: not replies, not boosts. */
  posts: number;
  /** Continuations of their own thread. */
  threadParts: number;
  /** Replies to someone else. */
  replies: number;
  /** Boosts of other people's posts. */
  boosts: number;
  /** Own posts (posts + thread parts) that are mostly a link with little text. */
  linkOnly: number;
}

const isSelfReply = (p: Status) =>
  p.in_reply_to_id != null && p.in_reply_to_account_id === p.account.id;

/** A post that is mostly a link: a preview card or URL, and under 40 characters of its own. */
export function isLinkOnly(post: Status): boolean {
  const text = stripHtml(post.content);
  const hasLink = !!post.card?.url || /https?:\/\//i.test(text);
  if (!hasLink) return false;
  const own = text
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[#@][\p{L}\p{N}_@.]+/gu, '')
    .trim();
  return own.length < 40;
}

export function activityMix(sample: readonly Status[]): ActivityMix {
  const mix: ActivityMix = {
    total: sample.length,
    posts: 0,
    threadParts: 0,
    replies: 0,
    boosts: 0,
    linkOnly: 0,
  };
  for (const p of sample) {
    if (p.reblog) {
      mix.boosts += 1;
      continue;
    }
    if (p.in_reply_to_id == null) mix.posts += 1;
    else if (isSelfReply(p)) mix.threadParts += 1;
    else mix.replies += 1;
    if (p.in_reply_to_id == null || isSelfReply(p)) {
      if (isLinkOnly(p)) mix.linkOnly += 1;
    }
  }
  return mix;
}

/** Share as a whole percentage; 0 with nothing to divide. */
export const percent = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

// ---------------------------------------------------------------------------
// Style
// ---------------------------------------------------------------------------

export type PostingStyle =
  'curator' | 'conversationalist' | 'linkSharer' | 'threadWriter' | 'broadcaster' | 'balanced';

/** Fewer statuses than this and no style is claimed. */
export const MIN_STATUSES_FOR_STYLE = 20;

/**
 * One word for how the account uses Mastodon, decided from the mix in this
 * order (the first rule that fits wins):
 *
 * - curator: boosts are half or more of everything
 * - conversationalist: replies to others are half or more
 * - link sharer: half or more of their own posts are mostly a link
 * - thread writer: 30% or more of their own posts continue a thread
 * - broadcaster: under 10% replies to others and under 30% boosts
 * - balanced: none of the above
 */
export function postingStyle(mix: ActivityMix): PostingStyle | null {
  if (mix.total < MIN_STATUSES_FOR_STYLE) return null;
  const own = mix.posts + mix.threadParts;
  if (mix.boosts / mix.total >= 0.5) return 'curator';
  if (mix.replies / mix.total >= 0.5) return 'conversationalist';
  if (own > 0 && mix.linkOnly / own >= 0.5) return 'linkSharer';
  if (own > 0 && mix.threadParts / own >= 0.3) return 'threadWriter';
  if (mix.replies / mix.total < 0.1 && mix.boosts / mix.total < 0.3) return 'broadcaster';
  return 'balanced';
}

// ---------------------------------------------------------------------------
// Posting rhythm: does it run on a clock?
// ---------------------------------------------------------------------------

export type RhythmVerdict = 'human' | 'mixed' | 'botLike';

export interface PostingRhythm {
  verdict: RhythmVerdict;
  /** Posts timed by the clock: inside a run of 4+ evenly spaced posts. */
  regular: number;
  /** Posts looked at (new posts and replies; thread continuations excluded). */
  considered: number;
  /** Share of considered posts that are regular, 0–100. */
  regularPct: number;
  /** The spacing of the longest regular run, in seconds; null without one. */
  interval: number | null;
}

/** Fewer posts than this and the rhythm is not judged. */
export const MIN_POSTS_FOR_RHYTHM = 8;
/** At least this many posts in a row, evenly spaced, to count as a schedule. */
export const RUN_LENGTH = 4;
/** Regular share at or above which the account is called bot-like. */
export const BOT_LIKE_PCT = 60;
/** A smaller regular share is too easy to find by chance in human posting. */
export const PARTLY_SCHEDULED_PCT = 10;
/** Gaps shorter than this are bursts of activity, not a schedule. */
const MIN_GAP_S = 5 * 60;

/** Two gaps are "the same" within two minutes or 1%, whichever is larger. */
function sameGap(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(120, 0.01 * Math.max(a, b));
}

/**
 * Look for posts that arrive at fixed intervals, like a scheduler or a bot:
 * runs of {@link RUN_LENGTH} or more posts with the same gap between each
 * (every hour, every 24 hours). Thread continuations and boosts are left out,
 * since a person writing a thread or boosting in one sitting produces even
 * gaps too.
 *
 * - Under {@link PARTLY_SCHEDULED_PCT}% of the posts in runs: human.
 * - {@link BOT_LIKE_PCT}% or more of the posts in runs: bot-like.
 * - In between: mixed (a scheduler plus live posting).
 */
export function postingRhythm(sample: readonly Status[]): PostingRhythm | null {
  const seen = new Set<string>();
  const times = sample
    .filter((p) => !p.reblog && !isSelfReply(p))
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .map((p) => new Date(p.created_at).getTime() / 1000)
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (times.length < MIN_POSTS_FOR_RHYTHM) return null;

  const gaps = times.slice(1).map((t, i) => t - times[i]);
  const regularPosts = new Set<number>();
  let longest: { length: number; gap: number } | null = null;
  let start = 0;
  while (start < gaps.length) {
    let end = start;
    if (gaps[start] >= MIN_GAP_S) {
      // Compare with the run's first gap too, so slow drift does not chain.
      while (
        end + 1 < gaps.length &&
        sameGap(gaps[end + 1], gaps[end]) &&
        sameGap(gaps[end + 1], gaps[start])
      ) {
        end += 1;
      }
      const postsInRun = end - start + 2;
      if (postsInRun >= RUN_LENGTH) {
        for (let i = start; i <= end + 1; i++) regularPosts.add(i);
        if (!longest || postsInRun > longest.length) {
          longest = { length: postsInRun, gap: gaps[start] };
        }
      }
    }
    start = end + 1;
  }

  const regularPct = percent(regularPosts.size, times.length);
  const regularShare = (regularPosts.size * 100) / times.length;
  const verdict: RhythmVerdict =
    regularShare < PARTLY_SCHEDULED_PCT
      ? 'human'
      : regularShare >= BOT_LIKE_PCT
        ? 'botLike'
        : 'mixed';
  return {
    verdict,
    regular: regularPosts.size,
    considered: times.length,
    regularPct,
    interval: longest?.gap ?? null,
  };
}

/** A posting interval in words' parts: `{ value, unit }` with unit minutes/hours/days. */
export function intervalParts(seconds: number): {
  value: number;
  unit: 'minutes' | 'hours' | 'days';
} {
  if (seconds >= 86_400 * 0.98) return { value: Math.round(seconds / 86_400), unit: 'days' };
  if (seconds >= 3_600 * 0.98) return { value: Math.round(seconds / 3_600), unit: 'hours' };
  return { value: Math.max(1, Math.round(seconds / 60)), unit: 'minutes' };
}
