import { describe, expect, it } from 'vitest';
import { Account } from './models';
import {
  DORMANT_AFTER_DAYS,
  LOW_CADENCE_POSTS_PER_DAY,
  MIN_AGE_DAYS_FOR_CADENCE,
  estimateAudience,
  judgeAccount,
  lifetimePostsPerDay,
  mergeTally,
  tallyAudience,
} from './effective-audience';

const NOW = Date.parse('2026-08-09T00:00:00Z');
const DAY = 86_400_000;

/** An unambiguously present account: posted yesterday, posts often. */
function live(over: Partial<Account> = {}): Account {
  return {
    id: '1',
    username: 'alice',
    acct: 'alice@example.social',
    display_name: 'Alice',
    note: '',
    url: 'https://example.social/@alice',
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 300,
    following_count: 200,
    statuses_count: 1_200,
    last_status_at: new Date(NOW - DAY).toISOString(),
    created_at: new Date(NOW - 400 * DAY).toISOString(),
    bot: false,
    locked: false,
    fields: [],
    ...over,
  };
}

describe('judgeAccount', () => {
  it('counts a recently-posting account as active and not a zombie', () => {
    const verdict = judgeAccount(live(), NOW);
    expect(verdict.active).toBe(true);
    expect(verdict.dormant).toBe(false);
    expect(verdict.zombie).toBe(false);
  });

  it('treats silence past the threshold as dormant', () => {
    const quiet = live({
      last_status_at: new Date(NOW - (DORMANT_AFTER_DAYS + 1) * DAY).toISOString(),
    });
    expect(judgeAccount(quiet, NOW).dormant).toBe(true);
    const justInside = live({
      last_status_at: new Date(NOW - (DORMANT_AFTER_DAYS - 1) * DAY).toISOString(),
    });
    expect(judgeAccount(justInside, NOW).dormant).toBe(false);
  });

  it('treats a missing last-post date as dormant', () => {
    expect(judgeAccount(live({ last_status_at: null }), NOW).dormant).toBe(true);
    expect(judgeAccount(live({ last_status_at: undefined }), NOW).dormant).toBe(true);
    expect(judgeAccount(live({ last_status_at: 'last Tuesday' }), NOW).dormant).toBe(true);
  });

  /**
   * The case the whole feature exists for: five years old, 180 posts, which is
   * a drizzle — but they posted two days ago, so they are still *there*. The
   * AND rule is what keeps this out of the zombie bucket.
   */
  it('does not call an active drizzler a zombie', () => {
    const drizzler = live({
      created_at: new Date(NOW - 1825 * DAY).toISOString(),
      statuses_count: 180,
      last_status_at: new Date(NOW - 2 * DAY).toISOString(),
    });
    const verdict = judgeAccount(drizzler, NOW);
    expect(verdict.lowCadence).toBe(true);
    expect(verdict.active).toBe(true);
    expect(verdict.zombie).toBe(false);
  });

  it('calls a quiet drizzler a zombie', () => {
    const zombie = live({
      created_at: new Date(NOW - 1825 * DAY).toISOString(),
      statuses_count: 180,
      last_status_at: new Date(NOW - 90 * DAY).toISOString(),
    });
    const verdict = judgeAccount(zombie, NOW);
    expect(verdict.lowCadence).toBe(true);
    expect(verdict.dormant).toBe(true);
    expect(verdict.zombie).toBe(true);
  });

  /** High lifetime cadence but currently silent: on a break, not dead. */
  it('does not call a prolific but quiet account a zombie', () => {
    const onBreak = live({ last_status_at: new Date(NOW - 200 * DAY).toISOString() });
    const verdict = judgeAccount(onBreak, NOW);
    expect(verdict.dormant).toBe(true);
    expect(verdict.lowCadence).toBe(false);
    expect(verdict.zombie).toBe(false);
  });

  it('never calls an account without a join date low-cadence', () => {
    const noJoin = live({ created_at: undefined, statuses_count: 1 });
    const verdict = judgeAccount(noJoin, NOW);
    expect(verdict.lowCadence).toBe(false);
    expect(verdict.zombie).toBe(false);
  });
});

describe('lifetimePostsPerDay', () => {
  it('divides posts by account age', () => {
    const account = live({
      created_at: new Date(NOW - 100 * DAY).toISOString(),
      statuses_count: 50,
    });
    expect(lifetimePostsPerDay(account, NOW)).toBeCloseTo(0.5, 5);
  });

  it('refuses to average over too short a life', () => {
    const newborn = live({
      created_at: new Date(NOW - (MIN_AGE_DAYS_FOR_CADENCE - 1) * DAY).toISOString(),
      statuses_count: 1,
    });
    expect(lifetimePostsPerDay(newborn, NOW)).toBeNull();
    expect(judgeAccount(newborn, NOW).lowCadence).toBe(false);
  });

  it('is null when the join date is unreadable', () => {
    expect(lifetimePostsPerDay(live({ created_at: 'whenever' }), NOW)).toBeNull();
  });

  it('puts the threshold where the constant says', () => {
    const under = live({
      created_at: new Date(NOW - 1000 * DAY).toISOString(),
      statuses_count: Math.floor(LOW_CADENCE_POSTS_PER_DAY * 1000) - 1,
    });
    const over = live({
      created_at: new Date(NOW - 1000 * DAY).toISOString(),
      statuses_count: Math.ceil(LOW_CADENCE_POSTS_PER_DAY * 1000) + 1,
    });
    expect(judgeAccount(under, NOW).lowCadence).toBe(true);
    expect(judgeAccount(over, NOW).lowCadence).toBe(false);
  });
});

describe('tallyAudience', () => {
  it('counts each bucket independently', () => {
    const zombie = live({
      created_at: new Date(NOW - 1825 * DAY).toISOString(),
      statuses_count: 180,
      last_status_at: new Date(NOW - 90 * DAY).toISOString(),
    });
    const tally = tallyAudience([live(), live(), zombie], NOW);
    expect(tally).toEqual({ scanned: 3, active: 2, dormant: 1, lowCadence: 1, zombies: 1 });
  });

  it('merges partial tallies additively', () => {
    const a = tallyAudience([live()], NOW);
    const b = tallyAudience([live()], NOW);
    expect(mergeTally(a, b).scanned).toBe(2);
    expect(mergeTally(a, b).active).toBe(2);
  });
});

describe('estimateAudience', () => {
  it('reports a full scan exactly, with no extrapolation', () => {
    const tally = { scanned: 100, active: 40, dormant: 60, lowCadence: 30, zombies: 25 };
    const estimate = estimateAudience(tally, 100);
    expect(estimate.complete).toBe(true);
    expect(estimate.coverage).toBe(1);
    expect(estimate.effective).toBe(40);
    expect(estimate.estimatedZombies).toBe(25);
    expect(estimate.zombieRatePct).toBe(25);
  });

  /** The "read 25% and multiply by 4" case, stated as a ratio. */
  it('scales a partial scan up to the stated total', () => {
    const tally = { scanned: 1_000, active: 250, dormant: 750, lowCadence: 400, zombies: 300 };
    const estimate = estimateAudience(tally, 4_000);
    expect(estimate.complete).toBe(false);
    expect(estimate.coverage).toBeCloseTo(0.25, 5);
    expect(estimate.effective).toBe(1_000);
    expect(estimate.estimatedZombies).toBe(1_200);
    expect(estimate.zombieRatePct).toBe(30);
  });

  it('never lets the stated total undercut what was actually read', () => {
    // The server says 10 followers but we paged 50 — trust what we counted.
    const tally = { scanned: 50, active: 20, dormant: 30, lowCadence: 10, zombies: 8 };
    const estimate = estimateAudience(tally, 10);
    expect(estimate.total).toBe(50);
    expect(estimate.complete).toBe(true);
    expect(estimate.effective).toBe(20);
  });

  /**
   * `followers_count` is a cached counter and drifts from the list it describes
   * — suspended and moved accounts leave the list before it catches up. Two
   * extra on 2,912 is the server disagreeing with itself, not a fault, and
   * warning about it produced "read more than there were (2,914 vs 2,914)".
   */
  it('does not cry over-read when the server counter is slightly stale', () => {
    const tally = {
      scanned: 2_914,
      active: 1_257,
      dormant: 1_657,
      lowCadence: 1_127,
      zombies: 999,
    };
    const estimate = estimateAudience(tally, 2_912);
    expect(estimate.overRead).toBe(false);
    // The original figure survives so a warning could name both numbers.
    expect(estimate.statedTotal).toBe(2_912);
    expect(estimate.total).toBe(2_914);
  });

  it('still flags a runaway walk that read a multiple of the list', () => {
    // The 9,040-of-3,109 bug: a cursor that never advanced.
    const tally = {
      scanned: 9_040,
      active: 5_537,
      dormant: 3_503,
      lowCadence: 3_616,
      zombies: 2_825,
    };
    const estimate = estimateAudience(tally, 3_109);
    expect(estimate.overRead).toBe(true);
    expect(estimate.statedTotal).toBe(3_109);
  });

  it('keeps quiet on a tiny account where a couple extra is a big percentage', () => {
    // 4 read vs 3 stated is 33% over, but it is one stale entry.
    const tally = { scanned: 4, active: 2, dormant: 2, lowCadence: 1, zombies: 1 };
    expect(estimateAudience(tally, 3).overRead).toBe(false);
  });

  it('reports zeroes rather than dividing by zero on an empty scan', () => {
    const estimate = estimateAudience(
      { scanned: 0, active: 0, dormant: 0, lowCadence: 0, zombies: 0 },
      500,
    );
    expect(estimate.effective).toBe(0);
    expect(estimate.zombieRatePct).toBe(0);
    expect(estimate.coverage).toBe(0);
  });
});
