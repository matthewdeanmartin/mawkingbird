/**
 * The arithmetic behind the bulk scheduler: when each post goes out, and
 * whether the server will accept the batch.
 *
 * The limits are Mastodon's own (`ScheduledStatusValidator`), checked here so a
 * batch is refused before the first request rather than half-way through it.
 * The server still has the last word; these only avoid a predictable failure.
 */

/** Pending scheduled posts one account may hold, parked ones included. */
export const TOTAL_LIMIT = 300;
/** Scheduled posts one account may have on a single (UTC) day. */
export const DAILY_LIMIT = 25;
/** The server publishes anything closer than this at once instead of scheduling it. */
export const MINIMUM_OFFSET_MS = 5 * 60_000;
/**
 * Our own floor, a little above the server's: a batch takes a while to send,
 * and a post that was 5½ minutes out when checked must not be 4½ when it lands.
 */
export const SAFE_OFFSET_MS = 10 * 60_000;
/** Mastodon's default post length. Servers may allow more; none allow less. */
export const MAX_CHARS = 500;

export type CadenceUnit = 'minutes' | 'hours' | 'days';

export interface Cadence {
  /** First post's time, as a `datetime-local` value (browser-local time). */
  start: string;
  every: number;
  unit: CadenceUnit;
}

export interface PlannedPost {
  text: string;
  /** A `datetime-local` value the user typed for this row, overriding the cadence. */
  pinnedAt: string | null;
}

const UNIT_MS: Record<CadenceUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

/** Parse a `datetime-local` value as local time; null when blank or invalid. */
export function parseLocal(value: string): Date | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** Format a Date as a `datetime-local` value in the browser's time zone. */
export function toLocalInput(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `T${pad(at.getHours())}:${pad(at.getMinutes())}`
  );
}

/**
 * A sensible first slot: the top of the next hour that is at least
 * {@link SAFE_OFFSET_MS} away, so the default never starts out invalid.
 */
export function defaultStart(now: number = Date.now()): string {
  const at = new Date(now + SAFE_OFFSET_MS);
  if (at.getMinutes() || at.getSeconds() || at.getMilliseconds()) {
    at.setHours(at.getHours() + 1, 0, 0, 0);
  }
  return toLocalInput(at);
}

/**
 * The time for the post at `index`: its pinned time, or the cadence's.
 *
 * Days step by calendar day (`setDate`), not by 24 hours, so "daily at 9:00"
 * stays at 9:00 across a daylight-saving change.
 */
export function cadenceTime(cadence: Cadence, index: number): Date | null {
  const start = parseLocal(cadence.start);
  const every = Math.floor(cadence.every);
  if (!start || !(every >= 1)) return null;
  const at = new Date(start);
  if (cadence.unit === 'days') {
    at.setDate(at.getDate() + every * index);
    return at;
  }
  return new Date(at.getTime() + every * UNIT_MS[cadence.unit] * index);
}

export function postTime(post: PlannedPost, cadence: Cadence, index: number): Date | null {
  return post.pinnedAt !== null ? parseLocal(post.pinnedAt) : cadenceTime(cadence, index);
}

export type RowProblem = 'empty' | 'tooLong' | 'noTime' | 'tooSoon';

/** What is wrong with one row on its own, or null. */
export function rowProblem(text: string, at: Date | null, now: number): RowProblem | null {
  if (!text.trim()) return 'empty';
  if ([...text].length > MAX_CHARS) return 'tooLong';
  if (!at) return 'noTime';
  if (at.getTime() - now < SAFE_OFFSET_MS) return 'tooSoon';
  return null;
}

/** The UTC calendar day the server files a scheduled post under. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export interface LimitProblem {
  kind: 'total' | 'daily';
  /** For `daily`: the UTC day that is over. */
  day?: string;
  /** How many there would be, counting what is already scheduled. */
  count: number;
}

/**
 * Whether adding `times` to what is already scheduled breaks a server limit.
 * `existing` is every pending scheduled time on the account, parked ones too.
 */
export function limitProblems(times: readonly Date[], existing: readonly Date[]): LimitProblem[] {
  const problems: LimitProblem[] = [];
  const total = existing.length + times.length;
  if (total > TOTAL_LIMIT) problems.push({ kind: 'total', count: total });
  const perDay = new Map<string, number>();
  for (const at of existing) perDay.set(utcDay(at), (perDay.get(utcDay(at)) ?? 0) + 1);
  const newDays = new Set<string>();
  for (const at of times) {
    const day = utcDay(at);
    newDays.add(day);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  for (const day of [...newDays].sort()) {
    const count = perDay.get(day) ?? 0;
    if (count > DAILY_LIMIT) problems.push({ kind: 'daily', day, count });
  }
  return problems;
}
