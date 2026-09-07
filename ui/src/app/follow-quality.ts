import { Account } from './models';

/**
 * Is this account worth an anonymous follow slot?
 *
 * An anonymous follow is not a one-time write, it is a recurring cost.
 * `AnonymousMastodonProvider.createFollowFeed()` assembles the home feed with **one
 * API call per followed account**, so following somebody who last posted eleven
 * months ago spends a request on every single feed refresh, forever, to return
 * nothing. That is why `ANONYMOUS_FOLLOW_LIMIT` is 50 rather than 5000, and it is
 * why bulk-follow features filter instead of taking the first N.
 *
 * Scoring is **free**. `/api/v1/accounts/:id/following` returns full `Account`
 * objects, and both signals below are already on them — no per-candidate request.
 *
 * Written as a list of named signals rather than one predicate because more are
 * expected: adding a signal should be one entry here, not surgery at the call site.
 * The primary signal is post frequency, per Matthew (2026-07-29).
 */

/**
 * Silent for longer than this and the account is treated as dormant.
 *
 * Four months is deliberately lenient — plenty of good accounts post seasonally,
 * and this is a "will the feed have anything in it" test, not a liveliness contest.
 */
export const DORMANT_AFTER_DAYS = 120;

/**
 * Below this many posts there is not enough history to build a feed from.
 *
 * Independent of dormancy on purpose: a brand-new account that posted twice
 * yesterday is active and still not worth a slot.
 */
export const MIN_POSTS = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface QualitySignal {
  id: string;
  /**
   * Why this account should be skipped, or null when it passes.
   *
   * A sentence fragment that reads after the handle — "@alice hasn't posted in
   * 8 months" — so the dialog can list reasons without restating them.
   */
  reject(account: Account, now: number): string | null;
}

/** Rough, human month count. Precision is not the point; "8 months" is. */
function describeAge(days: number): string {
  if (days >= 730) {
    return 'over 2 years';
  }
  if (days >= 365) {
    return 'over a year';
  }
  const months = Math.round(days / 30);
  return months <= 1 ? 'about a month' : `${months} months`;
}

/**
 * The shipped signals, evaluated in order. First rejection wins and is reported.
 *
 * Deliberately **not** signals:
 *  - follower count — popularity is not quality, and escaping the celebrity-only
 *    default is half the point of cloning somebody's follows in the first place.
 *  - `bot` — a good bot is a fine follow.
 *  - `locked` — irrelevant here; an anonymous follow never sends a follow request.
 */
export const QUALITY_SIGNALS: readonly QualitySignal[] = [
  {
    id: 'dormant',
    reject: (account, now) => {
      const last = account.last_status_at;
      if (!last) {
        // No last-post date at all: either never posted or the server won't say.
        // Both are bad bets for a slot that costs a call per refresh.
        return 'has never posted';
      }
      const parsed = Date.parse(last);
      if (Number.isNaN(parsed)) {
        return 'has no readable last-post date';
      }
      const days = (now - parsed) / DAY_MS;
      return days > DORMANT_AFTER_DAYS ? `hasn't posted in ${describeAge(days)}` : null;
    },
  },
  {
    id: 'too-quiet',
    reject: (account) => {
      const posts = account.statuses_count;
      if (typeof posts !== 'number' || !Number.isFinite(posts)) {
        return null; // Missing count is not evidence of anything.
      }
      return posts < MIN_POSTS ? `has only ${posts} post${posts === 1 ? '' : 's'}` : null;
    },
  },
];

/** User-adjustable thresholds behind the two shipped signals. */
export interface QualityThresholds {
  /** Silent longer than this many days is dormant. 0 disables the check. */
  dormantAfterDays: number;
  /** Fewer posts than this is too quiet. 0 disables the check. */
  minPosts: number;
}

/** What {@link QUALITY_SIGNALS} enforces, as data the UI can start from. */
export const DEFAULT_THRESHOLDS: QualityThresholds = {
  dormantAfterDays: DORMANT_AFTER_DAYS,
  minPosts: MIN_POSTS,
};

/**
 * Build the signal list for a given pair of thresholds.
 *
 * The shipped constants are the *defaults*, not the law: "Copy account" skipped
 * so much of some follow lists that the result looked broken, and the honest fix
 * is to let the person doing the copying decide where the bar sits. A threshold
 * of 0 removes that check entirely, which is how "adopt everyone" is expressed.
 *
 * Wording is kept identical to {@link QUALITY_SIGNALS} so the skipped list reads
 * the same whatever the bar is set to.
 */
export function thresholdSignals(thresholds: QualityThresholds): readonly QualitySignal[] {
  const signals: QualitySignal[] = [];
  if (thresholds.dormantAfterDays > 0) {
    signals.push({
      id: 'dormant',
      reject: (account, now) => {
        const last = account.last_status_at;
        if (!last) {
          return 'has never posted';
        }
        const parsed = Date.parse(last);
        if (Number.isNaN(parsed)) {
          return 'has no readable last-post date';
        }
        const days = (now - parsed) / DAY_MS;
        return days > thresholds.dormantAfterDays ? `hasn't posted in ${describeAge(days)}` : null;
      },
    });
  }
  if (thresholds.minPosts > 0) {
    signals.push({
      id: 'too-quiet',
      reject: (account) => {
        const posts = account.statuses_count;
        if (typeof posts !== 'number' || !Number.isFinite(posts)) {
          return null;
        }
        return posts < thresholds.minPosts
          ? `has only ${posts} post${posts === 1 ? '' : 's'}`
          : null;
      },
    });
  }
  return signals;
}

/**
 * The first reason to skip this account, or null when it is worth following.
 *
 * `now` is injected rather than read from `Date.now()` so the boundaries are
 * testable — a signal you cannot pin to a date is a signal you cannot trust.
 */
export function rejectionReason(
  account: Account,
  now: number = Date.now(),
  signals: readonly QualitySignal[] = QUALITY_SIGNALS,
): string | null {
  for (const signal of signals) {
    const reason = signal.reject(account, now);
    if (reason) {
      return reason;
    }
  }
  return null;
}

/** Convenience inverse of {@link rejectionReason}. */
export function isWorthFollowing(
  account: Account,
  now: number = Date.now(),
  signals: readonly QualitySignal[] = QUALITY_SIGNALS,
): boolean {
  return rejectionReason(account, now, signals) === null;
}
