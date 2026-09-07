import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MawkingbirdMetrics,
  ServiceStat,
  billingTier,
  mawkingbirdService,
} from './mawkingbird-metrics';

describe('mawkingbirdService', () => {
  it('names each service from its hostname', () => {
    expect(mawkingbirdService('https://auth.mawkingbird.com/mint')).toBe('auth');
    expect(mawkingbirdService('https://account.mawkingbird.com/auth/signout')).toBe('account');
    expect(mawkingbirdService('https://profile.mawkingbird.com/manifest')).toBe('profile');
    expect(mawkingbirdService('https://cors.mawkingbird.com/feeds?url=x')).toBe('proxy');
  });

  it('folds the test deployments in with production', () => {
    // Same service and the same allowance; which environment answered is a
    // deployment detail, not something a usage figure should split by.
    expect(mawkingbirdService('https://auth-test.mawkingbird.com/mint')).toBe('auth');
    expect(mawkingbirdService('https://profile-test.mawkingbird.com/settings')).toBe('profile');
  });

  it('returns null for anything that is not a Mawkingbird host', () => {
    expect(mawkingbirdService('https://mastodon.social/api/v1/timelines/home')).toBeNull();
    expect(mawkingbirdService('https://example.test/feed.xml')).toBeNull();
    expect(mawkingbirdService('not a url at all')).toBeNull();
  });

  it('is not fooled by a hostname that merely mentions the domain', () => {
    // The proxied URL carries its target in the query string, so a substring
    // test would match a feed whose own address named the proxy.
    expect(mawkingbirdService('https://evil.test/?x=cors.mawkingbird.com')).toBeNull();
    expect(mawkingbirdService('https://mawkingbird.com.evil.test/x')).toBeNull();
  });

  it('recognises an unknown subdomain as a Mawkingbird service anyway', () => {
    expect(mawkingbirdService('https://something-new.mawkingbird.com/x')).toBe('other');
  });
});

describe('billingTier', () => {
  it('counts anonymous and free alike, since neither is billed', () => {
    expect(billingTier(null)).toBe('free');
    expect(billingTier('free')).toBe('free');
  });

  it('counts every paid plan as paid', () => {
    expect(billingTier('plus')).toBe('paid');
    expect(billingTier('business')).toBe('paid');
  });
});

describe('MawkingbirdMetrics', () => {
  let metrics: MawkingbirdMetrics;

  function row(service: string, tier: string): ServiceStat | undefined {
    return metrics.rows().find((r) => r.service === service && r.tier === tier);
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [MawkingbirdMetrics] });
    metrics = TestBed.inject(MawkingbirdMetrics);
  });

  afterEach(() => localStorage.clear());

  it('aggregates repeated calls to one service and tier into a single row', () => {
    metrics.record('profile', 'paid', 100, true);
    metrics.record('profile', 'paid', 200, true);

    const r = row('profile', 'paid');
    expect(r?.calls).toBe(2);
    expect(MawkingbirdMetrics.mean(r!)).toBe(150);
  });

  it('keeps paid and free calls to one service in separate rows', () => {
    // The whole point of the section: a call is attributed to whatever paid
    // for it, so upgrading must not relabel what came before.
    metrics.record('profile', 'free', 50, true);
    metrics.record('profile', 'paid', 50, true);

    expect(metrics.rows().length).toBe(2);
    expect(row('profile', 'free')?.calls).toBe(1);
    expect(row('profile', 'paid')?.calls).toBe(1);
  });

  it('splits the totals by what paid for the calls', () => {
    metrics.record('proxy', 'free', 10, true);
    metrics.record('proxy', 'free', 10, true);
    metrics.record('profile', 'paid', 20, true);
    metrics.record('auth', 'free', 30, false);

    const t = metrics.totals();
    expect(t.calls).toBe(4);
    expect(t.free).toBe(3);
    expect(t.paid).toBe(1);
    expect(t.errors).toBe(1);
  });

  it('counts errors per row without losing the call', () => {
    metrics.record('auth', 'free', 10, false);
    const r = row('auth', 'free');
    expect(r?.calls).toBe(1);
    expect(r?.errors).toBe(1);
  });

  it('rolls calls into a daily bucket, split by tier', () => {
    metrics.record('proxy', 'free', 10, true);
    metrics.record('proxy', 'paid', 10, true);
    metrics.record('proxy', 'paid', 10, false);

    const days = metrics.daily();
    expect(days.length).toBe(1);
    expect(days[0].free).toBe(1);
    expect(days[0].paid).toBe(2);
    expect(days[0].errors).toBe(1);
  });

  it('persists and reloads counters across a page load', () => {
    vi.useFakeTimers();
    try {
      metrics.record('profile', 'paid', 120, true);
      metrics.record('proxy', 'free', 40, false);
      // Writes are debounced, so nothing is stored until the timer fires.
      vi.advanceTimersByTime(2_000);
    } finally {
      vi.useRealTimers();
    }

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [MawkingbirdMetrics] });
    const reloaded = TestBed.inject(MawkingbirdMetrics);

    expect(reloaded.totals().paid).toBe(1);
    expect(reloaded.totals().free).toBe(1);
    expect(reloaded.totals().errors).toBe(1);
    expect(reloaded.daily().length).toBe(1);
  });

  it('reset empties the counters and the stored blob', () => {
    metrics.record('profile', 'paid', 10, true);
    metrics.reset();

    expect(metrics.rows()).toEqual([]);
    expect(metrics.totals().calls).toBe(0);
    const stored = JSON.parse(localStorage.getItem('mockingbird_mawkingbird_metrics') ?? '{}');
    expect(stored.s).toEqual([]);
  });

  it('ignores a corrupt stored blob rather than throwing', () => {
    localStorage.setItem('mockingbird_mawkingbird_metrics', 'not json');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [MawkingbirdMetrics] });
    expect(TestBed.inject(MawkingbirdMetrics).totals().calls).toBe(0);
  });
});
