import { MastodonNotification, Status } from '../platform/api/models';

/**
 * "When has everyone seen it?" — how fast a post's interactions arrive and
 * when they stop.
 *
 * ## Why notifications
 *
 * Mastodon puts no timestamp on a like or a boost: `/statuses/:id/favourited_by`
 * returns accounts, not events. The only timed record of a like is the
 * `favourite` notification on the *author's* side. So this works for the
 * signed-in account only, and only as far back as its server keeps
 * notifications. The scan says how far it got, and coverage is reported.
 *
 * ## Why cumulative share, by median
 *
 * The question is "when is a post done?", not "how many likes". Each post is
 * reduced to the share of its interactions that had arrived by each checkpoint,
 * and the chart shows the median post. One viral post would dominate a summed
 * rate curve; it moves a median by one place.
 *
 * Every target post is at least {@link MIN_POST_AGE_MS} old, which is also the
 * last checkpoint, so no post is judged at an age it hasn't reached yet.
 */

const MINUTE = 60_000;
const DAY = 86_400_000;

/** The kinds of interaction the curve separates. */
export type DecayKind = 'likes' | 'boosts' | 'replies';
/** The three kinds plus their sum: the four curves. */
export type DecaySeriesKind = DecayKind | 'all';
export const DECAY_SERIES: readonly DecaySeriesKind[] = ['likes', 'boosts', 'replies', 'all'];

/** Checkpoints after posting, in minutes: 15 m → 7 d, roughly doubling. */
export const DECAY_CHECKPOINTS_MIN: readonly number[] = [
  15, 30, 60, 120, 240, 480, 720, 1440, 2880, 4320, 10080,
];

/**
 * Posts younger than this are still collecting and are left out. It equals the
 * last checkpoint, so every post is observed across the whole curve.
 */
export const MIN_POST_AGE_MS = 7 * DAY;

/** How many posts the decay looks at. */
export const DECAY_POST_LIMIT = 40;

/** The notification types to request: likes, boosts, and replies (mentions). */
export const DECAY_NOTIFICATION_TYPES = ['favourite', 'reblog', 'mention'] as const;

/** One post the curve is measured on. */
export interface DecayPost {
  id: string;
  /** Epoch ms. */
  createdAt: number;
  /** likes + boosts + replies as the post's own counters say. */
  counters: number;
}

/** One timed interaction on a target post. */
export interface DecayEvent {
  kind: DecayKind;
  postId: string;
  /** Epoch ms. */
  at: number;
}

/** One curve. */
export interface DecaySeries {
  kind: DecaySeriesKind;
  /** Median share (0–1) at each checkpoint; null when no post had this kind. */
  points: (number | null)[];
  /** Posts with at least one interaction of this kind. */
  posts: number;
  /** Interactions of this kind seen. */
  events: number;
  /** Median time until a post had half of its interactions, ms. */
  t50: number | null;
  /** Median time until a post had 90% of its interactions, ms. */
  t90: number | null;
}

export interface DecayResult {
  series: Record<DecaySeriesKind, DecaySeries>;
  /** Target posts measured. */
  posts: number;
  /** Interactions seen across all kinds. */
  events: number;
  /** What the posts' own counters add up to. */
  counters: number;
  /** events / counters, 0–1 (capped at 1). 1 when the counters are zero. */
  coverage: number;
}

/**
 * The posts to measure: the account's own posts (new posts and its own thread
 * posts, not boosts and not replies to other people), at least
 * {@link MIN_POST_AGE_MS} old, newest {@link DECAY_POST_LIMIT}.
 */
export function decayTargets(
  posts: Status[],
  accountId: string,
  now: number = Date.now(),
  limit: number = DECAY_POST_LIMIT,
): DecayPost[] {
  const out: DecayPost[] = [];
  for (const status of posts) {
    if (status.reblog) {
      continue;
    }
    if (status.in_reply_to_id && status.in_reply_to_account_id !== accountId) {
      continue;
    }
    const createdAt = Date.parse(status.created_at);
    if (Number.isNaN(createdAt) || now - createdAt < MIN_POST_AGE_MS) {
      continue;
    }
    out.push({
      id: status.id,
      createdAt,
      counters:
        (status.favourites_count ?? 0) + (status.reblogs_count ?? 0) + (status.replies_count ?? 0),
    });
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out.slice(0, limit);
}

/**
 * The interaction a notification records on one of `postIds`, or null.
 *
 * A reply arrives as a `mention` whose status answers the target post. Other
 * mentions (being named in someone's post, replies to your replies to others)
 * are not interactions with a target.
 */
export function classifyNotification(
  notification: MastodonNotification,
  postIds: ReadonlySet<string>,
): DecayEvent | null {
  const at = Date.parse(notification.created_at);
  if (Number.isNaN(at)) {
    return null;
  }
  const status = notification.status;
  if (!status) {
    return null;
  }
  if (notification.type === 'favourite' && postIds.has(status.id)) {
    return { kind: 'likes', postId: status.id, at };
  }
  if (notification.type === 'reblog' && postIds.has(status.id)) {
    return { kind: 'boosts', postId: status.id, at };
  }
  if (
    notification.type === 'mention' &&
    status.in_reply_to_id &&
    postIds.has(status.in_reply_to_id)
  ) {
    return { kind: 'replies', postId: status.in_reply_to_id, at };
  }
  return null;
}

/** The middle value; the mean of the two middle values for an even count. */
export function median(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Time (ms) by which a post had `share` of its interactions; `delays` sorted. */
function timeToShare(delays: number[], share: number): number {
  return delays[Math.max(0, Math.ceil(share * delays.length) - 1)];
}

/** Share of sorted `delays` at or under `limit`. */
function shareBy(delays: number[], limit: number): number {
  let n = 0;
  while (n < delays.length && delays[n] <= limit) {
    n++;
  }
  return n / delays.length;
}

function seriesFor(kind: DecaySeriesKind, delaysByPost: number[][]): DecaySeries {
  const withData = delaysByPost.filter((d) => d.length > 0);
  return {
    kind,
    points: DECAY_CHECKPOINTS_MIN.map((minutes) =>
      median(withData.map((d) => shareBy(d, minutes * MINUTE))),
    ),
    posts: withData.length,
    events: withData.reduce((sum, d) => sum + d.length, 0),
    t50: median(withData.map((d) => timeToShare(d, 0.5))),
    t90: median(withData.map((d) => timeToShare(d, 0.9))),
  };
}

/**
 * Build the four curves.
 *
 * An interaction stamped before its post (clock skew between servers) counts
 * as instant rather than being dropped. Events for posts not in `posts` are
 * ignored.
 */
export function computeDecay(posts: DecayPost[], events: DecayEvent[]): DecayResult {
  const byId = new Map(posts.map((p) => [p.id, p]));
  const delays = new Map<string, Record<DecayKind, number[]>>(
    posts.map((p) => [p.id, { likes: [], boosts: [], replies: [] }]),
  );
  let seen = 0;
  for (const event of events) {
    const post = byId.get(event.postId);
    if (!post) {
      continue;
    }
    delays.get(post.id)![event.kind].push(Math.max(0, event.at - post.createdAt));
    seen++;
  }
  const perKind = (kind: DecayKind): number[][] =>
    posts.map((p) => delays.get(p.id)![kind].sort((a, b) => a - b));
  const all = posts.map((p) => {
    const d = delays.get(p.id)!;
    return [...d.likes, ...d.boosts, ...d.replies].sort((a, b) => a - b);
  });
  const counters = posts.reduce((sum, p) => sum + p.counters, 0);
  return {
    series: {
      likes: seriesFor('likes', perKind('likes')),
      boosts: seriesFor('boosts', perKind('boosts')),
      replies: seriesFor('replies', perKind('replies')),
      all: seriesFor('all', all),
    },
    posts: posts.length,
    events: seen,
    counters,
    coverage: counters > 0 ? Math.min(1, seen / counters) : 1,
  };
}

/** A duration split into a value and a unit, for translated display. */
export interface DurationParts {
  value: number;
  unit: 'minutes' | 'hours' | 'days';
}

/** 45 min / 6 h / 2.5 d — whole minutes, hours to one decimal under 10. */
export function durationParts(ms: number): DurationParts {
  const minutes = ms / MINUTE;
  if (minutes < 60) {
    return { value: Math.max(0, Math.round(minutes)), unit: 'minutes' };
  }
  const hours = minutes / 60;
  if (hours < 48) {
    return { value: hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours), unit: 'hours' };
  }
  const days = hours / 24;
  return { value: days < 10 ? Math.round(days * 10) / 10 : Math.round(days), unit: 'days' };
}
