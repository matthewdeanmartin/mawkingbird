import type { SampleReach, ThreadReach } from './reach-model';

/**
 * Time-based views over an account's archived history (native only: web holds
 * a 100-post sample, too short for these). Pure functions over the reach the
 * page already computed, so they cost no requests.
 *
 * Coverage matters: the archive may start after a window does. A window the
 * archive only partly covers is marked, never silently counted as quiet.
 */

const DAY_MS = 86_400_000;

export interface PeriodTotals {
  threads: number;
  reach: number;
  /** Favourites + boosts + replies + quotes. */
  interactions: number;
  likes: number;
  boosts: number;
}

export interface PeriodComparison {
  days: number;
  current: PeriodTotals;
  previous: PeriodTotals;
  /** The archive reaches back past the start of the previous window. */
  previousCovered: boolean;
}

export type Coverage = 'full' | 'partial' | 'none';

export interface MonthRow extends PeriodTotals {
  /** `YYYY-MM`. */
  month: string;
  /** Mean est. reach per thread, rounded; 0 with no threads. */
  perThread: number;
  coverage: Coverage;
}

function empty(): PeriodTotals {
  return { threads: 0, reach: 0, interactions: 0, likes: 0, boosts: 0 };
}

function add(totals: PeriodTotals, t: ThreadReach): void {
  const th = t.thread;
  totals.threads += 1;
  totals.reach += t.net;
  totals.likes += th.likes;
  totals.boosts += th.boosts;
  totals.interactions += th.likes + th.boosts + th.replies + th.quotes;
}

const startOf = (t: ThreadReach) => new Date(t.thread.root.created_at).getTime();

/** The last `days` days against the `days` before them. */
export function comparePeriods(
  reach: SampleReach,
  archiveStart: string | null,
  now: Date = new Date(),
  days = 30,
): PeriodComparison {
  const end = now.getTime();
  const mid = end - days * DAY_MS;
  const start = mid - days * DAY_MS;
  const current = empty();
  const previous = empty();
  for (const t of reach.threads) {
    const at = startOf(t);
    if (at >= mid && at < end) add(current, t);
    else if (at >= start && at < mid) add(previous, t);
  }
  return {
    days,
    current,
    previous,
    previousCovered: archiveStart !== null && new Date(archiveStart).getTime() <= start,
  };
}

/** Percent change from `before` to `after`; null when there is no base. */
export function percentChange(before: number, after: number): number | null {
  return before > 0 ? Math.round(((after - before) / before) * 100) : null;
}

const monthKey = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** The last `months` calendar months (UTC), oldest first. */
export function monthlyReport(
  reach: SampleReach,
  archiveStart: string | null,
  now: Date = new Date(),
  months = 12,
): MonthRow[] {
  const rows = new Map<string, MonthRow>();
  const first = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1);
  const startAt = archiveStart ? new Date(archiveStart).getTime() : Infinity;
  for (let i = 0; i < months; i++) {
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1) + i, 1);
    const nextStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1) + i + 1, 1);
    const coverage: Coverage =
      startAt <= monthStart ? 'full' : startAt < nextStart ? 'partial' : 'none';
    const key = monthKey(new Date(monthStart));
    rows.set(key, { month: key, ...empty(), perThread: 0, coverage });
  }
  for (const t of reach.threads) {
    const at = startOf(t);
    if (at < first) continue;
    const row = rows.get(monthKey(new Date(at)));
    if (row) add(row, t);
  }
  return [...rows.values()].map((row) => ({
    ...row,
    perThread: row.threads ? Math.round(row.reach / row.threads) : 0,
  }));
}

/** The monthly report as CSV, for a spreadsheet. */
export function monthlyCsv(rows: readonly MonthRow[]): string {
  const header = [
    'Month',
    'Threads',
    'Est. reach',
    'Reach per thread',
    'Interactions',
    'Favourites',
    'Boosts',
    'Archive coverage',
  ];
  const lines = rows.map((r) =>
    [r.month, r.threads, r.reach, r.perThread, r.interactions, r.likes, r.boosts, r.coverage].join(
      ',',
    ),
  );
  return [header.join(','), ...lines].join('\r\n') + '\r\n';
}

/** When a post's boosts (or favourites) arrived, relative to posting. */
export interface ArrivalBucket {
  /** i18n key suffix: `hour`, `sixHours`, `day`, `threeDays`, `week`, `month`, `later`. */
  key: string;
  count: number;
  /** Share of all arrivals up to and including this bucket, 0–100. */
  cumulativePct: number;
}

const ARRIVAL_EDGES: readonly [string, number][] = [
  ['hour', 1 / 24],
  ['sixHours', 0.25],
  ['day', 1],
  ['threeDays', 3],
  ['week', 7],
  ['month', 30],
  ['later', Infinity],
];

export function arrivalBuckets(postedAt: string, times: readonly string[]): ArrivalBucket[] {
  const posted = new Date(postedAt).getTime();
  const counts = ARRIVAL_EDGES.map(() => 0);
  for (const time of times) {
    const days = Math.max(0, new Date(time).getTime() - posted) / DAY_MS;
    counts[ARRIVAL_EDGES.findIndex(([, edge]) => days < edge)] += 1;
  }
  let running = 0;
  return ARRIVAL_EDGES.map(([key], i) => {
    running += counts[i];
    return {
      key,
      count: counts[i],
      cumulativePct: times.length ? Math.round((running / times.length) * 100) : 0,
    };
  });
}

export interface FollowerMonth {
  month: string;
  /** Last recorded follower count in the month. */
  followers: number | null;
  /** Change since the previous month's last reading; null without both. */
  change: number | null;
  /** New-follower notifications in the month. */
  newFollows: number;
}

/** Monthly follower counts and new follows, oldest first. */
export function followerMonths(
  snapshots: readonly { day: string; followers: number }[],
  follows: readonly { month: string; count: number }[],
): FollowerMonth[] {
  const last = new Map<string, number>();
  for (const s of snapshots) last.set(s.day.slice(0, 7), s.followers);
  const newFollows = new Map(follows.map((f) => [f.month, f.count]));
  const months = [...new Set([...last.keys(), ...newFollows.keys()])].sort();
  let previous: number | null = null;
  return months.map((month) => {
    const followers = last.get(month) ?? null;
    const change = followers !== null && previous !== null ? followers - previous : null;
    if (followers !== null) previous = followers;
    return { month, followers, change, newFollows: newFollows.get(month) ?? 0 };
  });
}
