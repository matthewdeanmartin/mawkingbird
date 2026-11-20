import { describe, expect, it } from 'vitest';
import { Status } from '../platform/api/models';
import {
  arrivalBuckets,
  comparePeriods,
  followerMonths,
  monthlyCsv,
  monthlyReport,
  percentChange,
} from './analytics-history';
import { sampleReach } from './reach-model';

const NOW = new Date('2026-11-20T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function post(id: string, created: string, extra: Partial<Status> = {}): Status {
  return {
    id,
    created_at: created,
    account: { id: 'me' },
    reblog: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    ...extra,
  } as Status;
}

describe('comparePeriods', () => {
  const sample = [
    post('a', daysAgo(1), { favourites_count: 2, reblogs_count: 1 }),
    post('b', daysAgo(10), { replies_count: 3 }),
    post('c', daysAgo(40), { favourites_count: 1 }),
    post('d', daysAgo(70)),
  ];
  const reach = sampleReach(sample, 100);

  it('splits threads into the last 30 days and the 30 before', () => {
    const cmp = comparePeriods(reach, daysAgo(70), NOW);
    expect(cmp.current).toMatchObject({ threads: 2, likes: 2, boosts: 1, interactions: 6 });
    expect(cmp.previous).toMatchObject({ threads: 1, likes: 1, interactions: 1 });
    expect(cmp.current.reach).toBe(reach.threads[0].net + reach.threads[1].net);
    expect(cmp.previousCovered).toBe(true);
  });

  it('says when the archive does not reach back across the previous window', () => {
    expect(comparePeriods(reach, daysAgo(45), NOW).previousCovered).toBe(false);
    expect(comparePeriods(reach, null, NOW).previousCovered).toBe(false);
  });
});

describe('percentChange', () => {
  it('needs a base', () => {
    expect(percentChange(10, 15)).toBe(50);
    expect(percentChange(0, 5)).toBeNull();
  });
});

describe('monthlyReport', () => {
  const reach = sampleReach(
    [
      post('a', '2026-11-03T00:00:00Z', { favourites_count: 1 }),
      post('b', '2026-11-02T00:00:00Z'),
      post('c', '2026-09-15T00:00:00Z', { reblogs_count: 2 }),
      post('old', '2025-01-01T00:00:00Z'),
    ],
    100,
  );

  it('lists the last months oldest first and marks archive coverage', () => {
    const rows = monthlyReport(reach, '2026-09-10T00:00:00Z', NOW, 3);
    expect(rows.map((r) => r.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(rows.map((r) => r.coverage)).toEqual(['partial', 'full', 'full']);
    expect(rows[2]).toMatchObject({ threads: 2, likes: 1 });
    expect(rows[2].perThread).toBe(Math.round(rows[2].reach / 2));
    expect(rows[1]).toMatchObject({ threads: 0, perThread: 0 });
    expect(rows[0].boosts).toBe(2);
  });

  it('marks months before the archive as not covered', () => {
    expect(monthlyReport(reach, '2026-11-01T00:00:00Z', NOW, 2)[0].coverage).toBe('none');
  });

  it('exports CSV with a header row', () => {
    const csv = monthlyCsv(monthlyReport(reach, '2026-09-10T00:00:00Z', NOW, 1));
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe(
      'Month,Threads,Est. reach,Reach per thread,Interactions,Favourites,Boosts,Archive coverage',
    );
    expect(lines[1]).toMatch(/^2026-11,2,\d+,\d+,1,1,0,full$/);
  });
});

describe('arrivalBuckets', () => {
  it('places arrivals by time since posting, with a running share', () => {
    const posted = '2026-11-01T00:00:00Z';
    const buckets = arrivalBuckets(posted, [
      '2026-11-01T00:30:00Z',
      '2026-11-01T03:00:00Z',
      '2026-11-01T20:00:00Z',
      '2026-11-20T00:00:00Z',
    ]);
    expect(buckets.map((b) => b.count)).toEqual([1, 1, 1, 0, 0, 1, 0]);
    expect(buckets.map((b) => b.cumulativePct)).toEqual([25, 50, 75, 75, 75, 100, 100]);
  });

  it('is all zeros with nothing to place', () => {
    expect(arrivalBuckets('2026-11-01T00:00:00Z', []).every((b) => b.cumulativePct === 0)).toBe(
      true,
    );
  });
});

describe('followerMonths', () => {
  it('takes the last reading per month and counts new follows', () => {
    const months = followerMonths(
      [
        { day: '2026-09-30', followers: 90 },
        { day: '2026-10-02', followers: 95 },
        { day: '2026-10-28', followers: 100 },
      ],
      [
        { month: '2026-08', count: 4 },
        { month: '2026-10', count: 12 },
      ],
    );
    expect(months).toEqual([
      { month: '2026-08', followers: null, change: null, newFollows: 4 },
      { month: '2026-09', followers: 90, change: null, newFollows: 0 },
      { month: '2026-10', followers: 100, change: 10, newFollows: 12 },
    ]);
  });
});
