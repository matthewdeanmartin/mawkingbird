import type { Context, Status } from '../platform/api/models';

/**
 * Reach: how many people probably saw a thread. Mastodon publishes no view
 * counts, so this is a model over public signals, in two strengths:
 *
 *  - **Quick reach** costs no API calls. The potential audience is the
 *    author's followers plus each boost times a typical booster's audience.
 *  - **Full reach** uses the real boosters (`/statuses/:id/reblogged_by`) and
 *    sums their follower counts. It costs a call per boosted post, so web asks
 *    first; native serves it from the archive.
 *
 * Both feed the same net curve. Its shape and constants come from the method
 * FediWings documents publicly (https://rstockm.github.io/fediwings/?view=methodik),
 * reimplemented here: fitted to Instagram stories, a boost or quote counts as
 * two shares, the result never exceeds the potential audience and never falls
 * below the people who visibly reacted.
 *
 * Pure functions, no Angular: `ui/scripts/reach-calibration.mjs` imports this
 * file directly (Node type stripping), so keep imports type-only.
 */
export const REACH_MODEL = {
  /** Net share of the potential audience for a thread with no signals. */
  baseRate: 0.0165,
  boostExponent: 0.7314,
  interactionExponent: 0.2214,
  /** A boost or a quote counts as this many shares. */
  shareWeight: 2,
  /**
   * Followers of a typical booster, per boost. Used by Quick reach for every
   * boost, and by Full reach for boosts it could not attribute. Fitted by
   * `make reach-calibration`; see spec/analytics-calibration.md.
   */
  typicalBoosterAudience: 268,
} as const;

/** One public booster, as much of the account as the model needs. */
export interface Booster {
  id: string;
  followers_count: number;
}

/** A thread: one post plus the author's own replies chained under it. */
export interface ReachThread {
  /** The thread's first post in the sample (oldest part). */
  root: Status;
  /** Every part, oldest first. */
  parts: Status[];
  likes: number;
  boosts: number;
  replies: number;
  quotes: number;
}

export type ReachMethod = 'quick' | 'full' | 'mixed';

export interface ThreadReach {
  thread: ReachThread;
  /** Upper bound: everyone the thread could have reached. */
  potential: number;
  /** The estimate: people who probably saw it. */
  net: number;
  /** Boosts matched to a real booster. */
  attributedBoosts: number;
  /**
   * full: boosters were looked up for every boosted part (or nothing was
   * boosted); quick: for none; mixed: for some. Servers hide some boosters, so
   * full can still have unattributed boosts.
   */
  method: ReachMethod;
}

export interface SampleReach {
  threads: ThreadReach[];
  net: number;
  potential: number;
  /** Mean net reach per thread, rounded. */
  perThread: number;
  method: ReachMethod;
}

/** Who boosted a status, if known without spending an API call. */
export type BoosterLookup = (status: Status) => readonly Booster[] | null | undefined;

const nonNegative = (n: number | null | undefined): number => Math.max(0, n ?? 0);

/**
 * Group an author's posts into threads. Boosts and replies to other people
 * are left out: they are not the author's reach. A self-reply joins its parent
 * when the parent is in the sample, and starts its own thread otherwise.
 */
export function groupThreads(posts: readonly Status[]): ReachThread[] {
  const byId = new Map(posts.map((p) => [p.id, p]));
  const isOwn = (p: Status) =>
    p.reblog == null && (p.in_reply_to_id == null || p.in_reply_to_account_id === p.account.id);
  const rootOf = new Map<string, Status>();
  const findRoot = (p: Status): Status => {
    const known = rootOf.get(p.id);
    if (known) return known;
    const parent = p.in_reply_to_id ? byId.get(p.in_reply_to_id) : undefined;
    const root = parent && isOwn(parent) && parent !== p ? findRoot(parent) : p;
    rootOf.set(p.id, root);
    return root;
  };
  const threads = new Map<string, ReachThread>();
  // Oldest first, so parts land in reading order.
  for (const post of [...posts].reverse()) {
    if (!isOwn(post)) continue;
    const root = findRoot(post);
    let thread = threads.get(root.id);
    if (!thread) {
      thread = emptyThread(root);
      threads.set(root.id, thread);
    }
    addPart(thread, post);
  }
  // Newest first, matching the sample.
  return [...threads.values()].reverse();
}

function emptyThread(root: Status): ReachThread {
  return { root, parts: [], likes: 0, boosts: 0, replies: 0, quotes: 0 };
}

function addPart(thread: ReachThread, post: Status): void {
  thread.parts.push(post);
  thread.likes += nonNegative(post.favourites_count);
  thread.boosts += nonNegative(post.reblogs_count);
  thread.replies += nonNegative(post.replies_count);
  thread.quotes += nonNegative(post.quotes_count);
}

/**
 * The thread one post belongs to, from its conversation context: the
 * author's own chain above and below it. A reply to someone else is its own
 * one-post thread, since the conversation around it is not the author's.
 */
export function threadOf(status: Status, context: Context): ReachThread {
  const author = status.account.id;
  const own = [...context.ancestors, status, ...context.descendants]
    .filter((p) => p.account.id === author)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const found = groupThreads(own).find((t) => t.parts.some((p) => p.id === status.id));
  if (found) return found;
  const single = emptyThread(status);
  addPart(single, status);
  return single;
}

/** The net curve: likely viewers out of a potential audience. */
export function netReach(
  potential: number,
  signals: { likes: number; boosts: number; replies: number; quotes: number },
): number {
  const g = nonNegative(potential);
  const m = REACH_MODEL;
  const shares = 1 + m.shareWeight * (nonNegative(signals.boosts) + nonNegative(signals.quotes));
  const interactions = 1 + nonNegative(signals.likes) + nonNegative(signals.replies);
  const estimate = Math.round(
    m.baseRate * g * shares ** m.boostExponent * interactions ** m.interactionExponent,
  );
  // Anyone who reacted saw it; nobody outside the potential audience did.
  const floor =
    nonNegative(signals.likes) + nonNegative(signals.boosts) + nonNegative(signals.quotes);
  return Math.min(g, Math.max(estimate, floor));
}

/**
 * Reach for one thread. Boosters known for any part are de-duplicated across
 * the thread; boosts nobody could be matched to fall back to the typical
 * booster audience.
 */
export function threadReach(
  thread: ReachThread,
  authorFollowers: number,
  boostersFor: BoosterLookup = () => null,
): ThreadReach {
  const distinct = new Map<string, number>();
  let looked = 0;
  let boostedParts = 0;
  for (const part of thread.parts) {
    if (nonNegative(part.reblogs_count) > 0) boostedParts += 1;
    const boosters = boostersFor(part);
    if (!boosters) continue;
    if (nonNegative(part.reblogs_count) > 0) looked += 1;
    for (const b of boosters) distinct.set(b.id, nonNegative(b.followers_count));
  }
  const attributed = Math.min(thread.boosts, distinct.size);
  const unattributed = thread.boosts - attributed;
  let boosterFollowers = 0;
  for (const f of distinct.values()) boosterFollowers += f;
  const potential =
    nonNegative(authorFollowers) +
    boosterFollowers +
    unattributed * REACH_MODEL.typicalBoosterAudience;
  return {
    thread,
    potential,
    net: netReach(potential, thread),
    attributedBoosts: attributed,
    method: looked >= boostedParts ? 'full' : looked === 0 ? 'quick' : 'mixed',
  };
}

/** Reach across a sample of one author's posts. */
export function sampleReach(
  posts: readonly Status[],
  authorFollowers: number,
  boostersFor?: BoosterLookup,
): SampleReach {
  const threads = groupThreads(posts).map((t) => threadReach(t, authorFollowers, boostersFor));
  const net = threads.reduce((s, t) => s + t.net, 0);
  const potential = threads.reduce((s, t) => s + t.potential, 0);
  const boosted = threads.filter((t) => t.thread.boosts > 0);
  const method: ReachMethod = boosted.every((t) => t.method === 'quick')
    ? 'quick'
    : boosted.every((t) => t.method === 'full')
      ? 'full'
      : 'mixed';
  return {
    threads,
    net,
    potential,
    perThread: threads.length ? Math.round(net / threads.length) : 0,
    method,
  };
}

/**
 * Net reach per status id, credited to each thread's first post. Other parts
 * and replies to other people get 0, so time buckets do not double count.
 */
export function reachByPost(reach: SampleReach): Map<string, number> {
  return new Map(reach.threads.map((t) => [t.thread.root.id, t.net]));
}
