import { Account } from './models';

/**
 * "How many of these followers are actually *there*?"
 *
 * A follower count is the number of accounts that once clicked follow, which is
 * not the same as the number of people who would see your next post. This module
 * turns a list of accounts into the four numbers that distinguish those, and it
 * does it **for free**: `/accounts/:id/followers` and `/following` return full
 * `Account` entities, and every signal below reads a field that is already on
 * them. The cost of the feature is paging the list, not scoring it — see
 * {@link ./audience-scan}.
 *
 * ## The two ways an account is not really there
 *
 * These are deliberately kept apart, because conflating them produces a number
 * nobody can act on:
 *
 *  - **Dormant** — silent for {@link DORMANT_AFTER_DAYS}. Gone, recently.
 *  - **Low-cadence** — posts, but at a drizzle: fewer than
 *    {@link LOW_CADENCE_POSTS_PER_DAY} posts per day *averaged over the account's
 *    whole life*. The account that has been tweeting 0.1 times a day for five
 *    years. Technically alive, functionally furniture.
 *
 * A **zombie** requires *both*: low lifetime cadence AND currently quiet. That
 * conjunction is the conservative reading, chosen deliberately (Matthew,
 * 2026-08-09) — someone who drizzles but posted yesterday is present, and
 * someone whose cadence is high but who has been quiet four months is on a
 * break, not dead. Only the account that is both is confidently a zombie.
 *
 * ## Why not reuse `follow-quality.ts`
 *
 * That module answers a different question — "is this account worth spending an
 * anonymous follow slot on?" — and its thresholds are tuned for that: 120 days
 * of leniency, and a hard floor on total posts. Here the question is "would this
 * account plausibly see my post this month?", which wants a 30-day window and a
 * *rate* rather than a total. Sharing constants would make both wrong.
 */

const DAY_MS = 86_400_000;

/**
 * Silent for longer than this and the account counts as dormant.
 *
 * 30 days, matching the trailing window the rest of the analytics page already
 * thinks in (`computeLiveliness`'s `postsLast30Days`) — so "effective followers"
 * and "posts in the last 30 days" are answering over the same period rather than
 * quietly using different months.
 */
export const DORMANT_AFTER_DAYS = 30;

/**
 * Below this many posts per day, averaged over the account's entire life, the
 * account is a drizzler.
 *
 * 0.1/day is roughly "three posts a month, forever". The number comes straight
 * from the case that motivated the metric: an account five years old with a few
 * hundred posts, which reads as established and behaves as absent.
 */
export const LOW_CADENCE_POSTS_PER_DAY = 0.1;

/**
 * Accounts younger than this are never called low-cadence.
 *
 * A lifetime rate is meaningless over a few days: someone who joined yesterday
 * and posted once is at 1.0/day, and someone who joined yesterday and hasn't
 * posted yet is at 0.0 — neither is evidence. Two weeks is where the average
 * starts to mean something.
 */
export const MIN_AGE_DAYS_FOR_CADENCE = 14;

/**
 * How far past the server's stated total a scan may read before it is treated
 * as a fault rather than a stale counter.
 *
 * 10% is far above the handful of entries a cached `followers_count` typically
 * lags by, and far below the 2-3× a non-advancing cursor produces.
 */
export const OVER_READ_TOLERANCE = 0.1;

/**
 * Absolute slack below which an over-read is never reported, so a small account
 * doesn't trip the proportional test on one or two stale entries.
 */
export const OVER_READ_FLOOR = 10;

/** What one account was judged to be. */
export interface AudienceVerdict {
  /** Posted within {@link DORMANT_AFTER_DAYS}. */
  active: boolean;
  /** Silent for longer than {@link DORMANT_AFTER_DAYS}. The inverse of `active`. */
  dormant: boolean;
  /** Lifetime posting rate below {@link LOW_CADENCE_POSTS_PER_DAY}. */
  lowCadence: boolean;
  /** Both dormant and low-cadence — the conservative "not really there". */
  zombie: boolean;
  /**
   * Lifetime posts per day, or null when it can't be computed (no join date, or
   * an account too young for the average to mean anything).
   */
  postsPerDay: number | null;
}

/**
 * Days since this account last posted, or null if the server won't say.
 *
 * `last_status_at` arrives as either a full ISO timestamp or a bare date
 * ("2026-08-07") depending on the server and the endpoint; `Date.parse` handles
 * both. A missing value is null rather than Infinity — "we don't know" and
 * "silent forever" are different claims, and only the caller knows which way to
 * lean.
 */
export function daysSinceLastPost(account: Account, now: number): number | null {
  const last = account.last_status_at;
  if (!last) {
    return null;
  }
  const parsed = Date.parse(last);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.max(0, (now - parsed) / DAY_MS);
}

/**
 * Lifetime posting rate, in posts per day since the account joined.
 *
 * Null when there is no usable join date, or when the account is younger than
 * {@link MIN_AGE_DAYS_FOR_CADENCE} — see that constant for why an average over
 * three days is not an average.
 */
export function lifetimePostsPerDay(account: Account, now: number): number | null {
  const joined = account.created_at;
  if (!joined) {
    return null;
  }
  const parsed = Date.parse(joined);
  if (Number.isNaN(parsed)) {
    return null;
  }
  const ageDays = (now - parsed) / DAY_MS;
  if (ageDays < MIN_AGE_DAYS_FOR_CADENCE) {
    return null;
  }
  const posts = account.statuses_count;
  if (typeof posts !== 'number' || !Number.isFinite(posts)) {
    return null;
  }
  return posts / ageDays;
}

/**
 * Judge one account.
 *
 * An account with no `last_status_at` at all is treated as **dormant**: every
 * server that implements the field omits it precisely when there is no last
 * post, so the missing value is itself the signal. An account with no join date
 * is simply never low-cadence — unknown tenure is not evidence of drizzle, and
 * guessing would make the zombie count depend on which server the follower
 * happens to live on.
 */
export function judgeAccount(account: Account, now: number = Date.now()): AudienceVerdict {
  const silentDays = daysSinceLastPost(account, now);
  const dormant = silentDays === null || silentDays > DORMANT_AFTER_DAYS;
  const postsPerDay = lifetimePostsPerDay(account, now);
  const lowCadence = postsPerDay !== null && postsPerDay < LOW_CADENCE_POSTS_PER_DAY;
  return {
    active: !dormant,
    dormant,
    lowCadence,
    zombie: dormant && lowCadence,
    postsPerDay,
  };
}

/** The four headline numbers, over whatever slice of the audience was read. */
export interface AudienceTally {
  /** Accounts actually inspected. */
  scanned: number;
  /** Posted within {@link DORMANT_AFTER_DAYS}. */
  active: number;
  /** Silent longer than {@link DORMANT_AFTER_DAYS}. */
  dormant: number;
  /** Drizzlers, whether or not they are also dormant. */
  lowCadence: number;
  /** Dormant *and* low-cadence. */
  zombies: number;
}

/** Tally a batch of accounts. Pure; safe to call incrementally and merge. */
export function tallyAudience(accounts: Account[], now: number = Date.now()): AudienceTally {
  const tally: AudienceTally = { scanned: 0, active: 0, dormant: 0, lowCadence: 0, zombies: 0 };
  for (const account of accounts) {
    const verdict = judgeAccount(account, now);
    tally.scanned += 1;
    if (verdict.active) {
      tally.active += 1;
    }
    if (verdict.dormant) {
      tally.dormant += 1;
    }
    if (verdict.lowCadence) {
      tally.lowCadence += 1;
    }
    if (verdict.zombie) {
      tally.zombies += 1;
    }
  }
  return tally;
}

/** Add a batch's tally into a running one, so a scan never re-scores accounts. */
export function mergeTally(a: AudienceTally, b: AudienceTally): AudienceTally {
  return {
    scanned: a.scanned + b.scanned,
    active: a.active + b.active,
    dormant: a.dormant + b.dormant,
    lowCadence: a.lowCadence + b.lowCadence,
    zombies: a.zombies + b.zombies,
  };
}

/**
 * A tally scaled up to the account's full audience.
 *
 * Every field is an estimate unless {@link complete} is true, and the UI is
 * expected to say so — the whole point of allowing an early stop is that a
 * partial scan still answers the question, but only if the answer admits it is
 * extrapolated.
 */
export interface AudienceEstimate extends AudienceTally {
  /** The audience size the server reports — what we are extrapolating *to*. */
  total: number;
  /** `scanned / total`, 0–1. 1 when the whole list was read. */
  coverage: number;
  /** True when the scan read the entire list, so nothing is extrapolated. */
  complete: boolean;
  /**
   * What the server originally claimed, before {@link total} was raised to fit
   * what was actually read.
   *
   * Kept so the two numbers can be *named* in a warning. Reporting `total`
   * against itself produced "read more than there were (2,914 vs 2,914)", which
   * is nonsense on its face.
   */
  statedTotal: number;

  /**
   * We read materially more accounts than the server said existed.
   *
   * A small disagreement is ordinary and is the *server* contradicting itself:
   * `followers_count` / `following_count` are cached counters that drift from
   * the list they describe — suspended, deleted and moved accounts leave the
   * list before the counter catches up. A handful either way means nothing and
   * must not be reported as a fault.
   *
   * What this exists to catch is the pathological case: a cursor that is not
   * advancing, which shows up as reading some *multiple* of the real list
   * ("9,040 of 3,109"). Hence the proportional test rather than
   * `scanned > total`.
   */
  overRead: boolean;
  /** Estimated accounts that would see a post: active, scaled to `total`. */
  effective: number;
  /** Estimated zombies across the whole audience. */
  estimatedZombies: number;
  /** Zombies as a percentage of the audience, 0–100. */
  zombieRatePct: number;
  /** Active accounts as a percentage of the audience, 0–100. */
  effectiveRatePct: number;
}

/**
 * Scale a tally up to the full audience.
 *
 * The rates measured on the sample are applied to `total` — the "read 25% and
 * multiply by 4" move, done as a ratio so it works for any coverage rather than
 * only round fractions. When the scan is complete the counts are used directly
 * instead of being round-tripped through a ratio, so a full scan of 500 reports
 * exactly 500 and never 499 to a rounding error.
 *
 * `total` is the server's own `followers_count` / `following_count` rather than
 * the number of accounts we managed to page. Those disagree in practice —
 * suspended and moved accounts are counted in one and absent from the other —
 * and the server's figure is the one the user sees on the profile, so it is the
 * one an "effective vs stated" comparison has to be against. A `total` smaller
 * than what we actually read (or zero) is treated as unreliable and the scanned
 * count wins.
 */
export function estimateAudience(tally: AudienceTally, total: number): AudienceEstimate {
  const effectiveTotal = Math.max(total, tally.scanned);
  const complete = tally.scanned >= effectiveTotal || tally.scanned === 0;
  const coverage = effectiveTotal > 0 ? Math.min(1, tally.scanned / effectiveTotal) : 0;

  const scale = (n: number): number => {
    if (tally.scanned === 0) {
      return 0;
    }
    if (complete) {
      return n;
    }
    return Math.round((n / tally.scanned) * effectiveTotal);
  };

  const pct = (n: number): number =>
    tally.scanned === 0 ? 0 : Math.round((n / tally.scanned) * 100);

  return {
    ...tally,
    total: effectiveTotal,
    statedTotal: total,
    coverage,
    complete,
    // Proportional, not absolute: 2 extra on 2,912 is a stale counter, 6,000
    // extra on 3,109 is a broken cursor. The floor keeps tiny accounts quiet,
    // where a couple of stale entries is a large percentage.
    overRead:
      total > 0 &&
      tally.scanned > total + OVER_READ_FLOOR &&
      tally.scanned > total * (1 + OVER_READ_TOLERANCE),
    effective: scale(tally.active),
    estimatedZombies: scale(tally.zombies),
    zombieRatePct: pct(tally.zombies),
    effectiveRatePct: pct(tally.active),
  };
}
