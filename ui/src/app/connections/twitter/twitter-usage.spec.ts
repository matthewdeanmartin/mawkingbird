import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HARD_LIMIT, DEFAULT_SOFT_LIMIT, localDay, TwitterUsage } from './twitter-usage';

describe('TwitterUsage', () => {
  let usage: TwitterUsage;

  beforeEach(() => {
    localStorage.clear();
    usage = new TwitterUsage();
  });

  it('starts at zero', () => {
    expect(usage.today()).toBe(0);
    expect(usage.total()).toBe(0);
    expect(usage.remainingToday()).toBe(DEFAULT_HARD_LIMIT);
  });

  it('counts requests against both today and the running total', () => {
    usage.record();
    usage.record(3);
    expect(usage.today()).toBe(4);
    expect(usage.total()).toBe(4);
  });

  it('persists across instances', () => {
    usage.record(5);
    expect(new TwitterUsage().today()).toBe(5);
  });

  describe('the daily boundary', () => {
    afterEach(() => vi.useRealTimers());

    it('rolls over at local midnight, keeping the lifetime total', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 31, 23, 59));
      const store = new TwitterUsage();
      store.record(10);
      expect(store.today()).toBe(10);

      vi.setSystemTime(new Date(2026, 7, 1, 0, 1));
      // The regression this guards: `today` is a computed, which memoizes
      // against its signal dependencies — and the wall clock is not one. A
      // browser left open overnight kept serving yesterday's count, and kept
      // enforcing yesterday's exhausted limit into the new day, so the
      // connector refused to work until an unrelated write happened to occur.
      vi.advanceTimersByTime(61_000);
      expect(store.today()).toBe(0);
      expect(store.total()).toBe(10);
    });

    it('does not enforce yesterday exhausted limit into today', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 31, 23, 59));
      const store = new TwitterUsage();
      store.setLimits(1, 2);
      store.record(2);
      expect(store.check(1)).toBe('hard-limit');

      // Midnight passes with no timer tick — a suspended laptop, or a tab that
      // was throttled in the background. `check` re-reads the date itself, so
      // the new day's budget is available immediately.
      vi.setSystemTime(new Date(2026, 7, 1, 0, 1));
      expect(store.check(1)).toBeNull();
      expect(store.today()).toBe(0);
    });

    it('uses the local day, not UTC', () => {
      // A limit resetting at 00:00 UTC would reset mid-afternoon for some
      // readers, which makes a daily budget impossible to reason about.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 31, 12, 0));
      expect(localDay()).toBe('2026-07-31');
    });
  });

  describe('limits', () => {
    it('warns at the soft limit without blocking', () => {
      usage.record(DEFAULT_SOFT_LIMIT);
      expect(usage.overSoftLimit()).toBe(true);
      expect(usage.atHardLimit()).toBe(false);
      // Advisory only: the request still goes.
      expect(usage.check(1)).toBeNull();
    });

    it('refuses at the hard limit', () => {
      usage.record(DEFAULT_HARD_LIMIT);
      expect(usage.atHardLimit()).toBe(true);
      expect(usage.check(1)).toBe('hard-limit');
      expect(usage.remainingToday()).toBe(0);
    });

    it('refuses a whole fan-out that would not fit', () => {
      // A batch that stops halfway has spent money for a partial answer nobody
      // can interpret, so the check is for the whole cost up front.
      usage.record(DEFAULT_HARD_LIMIT - 3);
      expect(usage.check(3)).toBeNull();
      expect(usage.check(4)).toBe('hard-limit');
    });

    it('lets the limits be raised', () => {
      usage.setLimits(10, 20);
      expect(usage.softLimit()).toBe(10);
      expect(usage.hardLimit()).toBe(20);
      usage.record(20);
      expect(usage.check(1)).toBe('hard-limit');
    });

    it('clamps a soft limit above the hard one rather than storing nonsense', () => {
      usage.setLimits(500, 100);
      expect(usage.softLimit()).toBe(100);
      expect(usage.hardLimit()).toBe(100);
    });

    it('refuses a zero or negative limit', () => {
      usage.setLimits(0, 0);
      expect(usage.hardLimit()).toBeGreaterThan(0);
    });

    it('keeps limits when the counters are reset', () => {
      usage.setLimits(10, 20);
      usage.record(5);
      usage.reset();
      expect(usage.today()).toBe(0);
      expect(usage.total()).toBe(0);
      expect(usage.hardLimit()).toBe(20);
    });
  });

  describe('storage robustness', () => {
    it('survives a corrupt blob', () => {
      localStorage.setItem('mockingbird_twitter_usage', 'not json');
      expect(new TwitterUsage().today()).toBe(0);
    });

    it('ignores a blob missing its counters', () => {
      localStorage.setItem('mockingbird_twitter_usage', JSON.stringify({ nope: true }));
      expect(new TwitterUsage().today()).toBe(0);
    });
  });

  it('records no information about what was requested', () => {
    // Which accounts someone reads is already disclosed to the proxy and the
    // data service; writing it to a third place would widen that for nothing.
    usage.record(3);
    expect(localStorage.getItem('mockingbird_twitter_usage')).not.toMatch(/http|@|user/i);
  });
});
