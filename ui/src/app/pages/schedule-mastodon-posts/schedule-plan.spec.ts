import { describe, expect, it } from 'vitest';
import {
  Cadence,
  DAILY_LIMIT,
  SAFE_OFFSET_MS,
  TOTAL_LIMIT,
  cadenceTime,
  defaultStart,
  limitProblems,
  parseLocal,
  postTime,
  rowProblem,
  toLocalInput,
} from './schedule-plan';

const daily: Cadence = { start: '2030-03-01T09:00', every: 1, unit: 'days' };

describe('schedule plan', () => {
  it('round-trips datetime-local values in local time', () => {
    expect(toLocalInput(parseLocal('2030-03-01T09:05')!)).toBe('2030-03-01T09:05');
    expect(parseLocal('')).toBeNull();
    expect(parseLocal('not a date')).toBeNull();
  });

  it('defaults to the top of an hour at least the safe offset away', () => {
    const now = new Date(2030, 2, 1, 8, 55).getTime();
    expect(defaultStart(now)).toBe('2030-03-01T10:00');
    const exact = new Date(2030, 2, 1, 8, 50).getTime();
    expect(defaultStart(exact)).toBe('2030-03-01T09:00');
  });

  it('steps by calendar day, keeping the wall-clock time', () => {
    expect(toLocalInput(cadenceTime(daily, 0)!)).toBe('2030-03-01T09:00');
    expect(toLocalInput(cadenceTime(daily, 2)!)).toBe('2030-03-03T09:00');
    // Across a month end, and across a DST change wherever the runner is.
    expect(toLocalInput(cadenceTime(daily, 31)!)).toBe('2030-04-01T09:00');
  });

  it('steps by minutes and hours', () => {
    const hourly: Cadence = { start: '2030-03-01T09:00', every: 3, unit: 'hours' };
    expect(toLocalInput(cadenceTime(hourly, 2)!)).toBe('2030-03-01T15:00');
    const minutes: Cadence = { start: '2030-03-01T09:00', every: 45, unit: 'minutes' };
    expect(toLocalInput(cadenceTime(minutes, 1)!)).toBe('2030-03-01T09:45');
  });

  it('has no time for a blank start or a spacing below one', () => {
    expect(cadenceTime({ ...daily, start: '' }, 0)).toBeNull();
    expect(cadenceTime({ ...daily, every: 0 }, 1)).toBeNull();
    expect(cadenceTime({ ...daily, every: Number.NaN }, 1)).toBeNull();
  });

  it('lets a pinned row ignore the cadence', () => {
    const pinned = { text: 'x', pinnedAt: '2030-05-05T12:30' };
    expect(toLocalInput(postTime(pinned, daily, 4)!)).toBe('2030-05-05T12:30');
    expect(toLocalInput(postTime({ text: 'x', pinnedAt: null }, daily, 4)!)).toBe(
      '2030-03-05T09:00',
    );
  });

  it('flags empty, overlong, untimed and too-soon rows', () => {
    const now = Date.parse('2030-03-01T00:00:00Z');
    const later = new Date(now + SAFE_OFFSET_MS + 1);
    expect(rowProblem('  ', later, now)).toBe('empty');
    expect(rowProblem('a'.repeat(501), later, now)).toBe('tooLong');
    // Counted in characters, not UTF-16 units: 500 emoji fit.
    expect(rowProblem('🦣'.repeat(500), later, now)).toBeNull();
    expect(rowProblem('hi', null, now)).toBe('noTime');
    expect(rowProblem('hi', new Date(now + SAFE_OFFSET_MS - 1), now)).toBe('tooSoon');
    expect(rowProblem('hi', later, now)).toBeNull();
  });

  it('counts the daily limit per UTC day, including posts already waiting', () => {
    const at = (iso: string) => new Date(iso);
    const existing = Array.from({ length: DAILY_LIMIT - 1 }, () => at('2030-03-01T12:00:00Z'));
    expect(limitProblems([at('2030-03-01T23:59:00Z')], existing)).toEqual([]);
    expect(
      limitProblems([at('2030-03-01T23:59:00Z'), at('2030-03-01T00:00:00Z')], existing),
    ).toEqual([{ kind: 'daily', day: '2030-03-01', count: DAILY_LIMIT + 1 }]);
    // The next UTC day is a fresh count.
    expect(
      limitProblems([at('2030-03-01T23:59:00Z'), at('2030-03-02T00:00:00Z')], existing),
    ).toEqual([]);
  });

  it('counts the total limit across every pending post', () => {
    const days = (n: number) =>
      Array.from({ length: n }, (_, i) => new Date(Date.UTC(2030, 0, 1 + i, 12)));
    expect(limitProblems(days(1), days(TOTAL_LIMIT - 1))).toEqual([]);
    expect(limitProblems(days(2), days(TOTAL_LIMIT - 1))).toContainEqual({
      kind: 'total',
      count: TOTAL_LIMIT + 1,
    });
  });
});
