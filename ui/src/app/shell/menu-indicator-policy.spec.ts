import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INDICATOR_PREFERENCES,
  indicatorPreferences,
  inQuietHours,
  ordinaryDue,
} from './menu-indicator-policy';

const prefs = { ...DEFAULT_INDICATOR_PREFERENCES, hours: [9, 17], chatMinutes: 5 };

describe('menu indicator schedule', () => {
  it('delivers new-user dots immediately outside quiet hours and preserves saved schedules', () => {
    const defaults = indicatorPreferences({});
    expect(defaults.chatMinutes).toBe(0);
    expect(defaults.hours).toEqual([]);
    const now = new Date(2026, 8, 7, 10);
    expect(ordinaryDue(now.getTime(), now, defaults)).toBe(true);
    expect(ordinaryDue(now.getTime(), new Date(2026, 8, 7, 23), defaults)).toBe(false);
    expect(indicatorPreferences(prefs)).toEqual(prefs);
  });
  it('holds both lanes from 11 pm until 7 am, including exact boundaries', () => {
    for (const hour of [23, 0, 6])
      expect(inQuietHours(new Date(2026, 8, 7, hour), prefs)).toBe(true);
    for (const hour of [7, 22]) expect(inQuietHours(new Date(2026, 8, 7, hour), prefs)).toBe(false);
  });
  it('delivers only activity pending before a delivery slot', () => {
    const since = new Date(2026, 8, 7, 10).getTime();
    expect(ordinaryDue(since, new Date(2026, 8, 7, 16, 59), prefs)).toBe(false);
    expect(ordinaryDue(since, new Date(2026, 8, 7, 17), prefs)).toBe(true);
    expect(ordinaryDue(since, new Date(2026, 8, 8, 7), prefs)).toBe(true);
  });
  it('holds a quiet-hour scheduled slot until morning', () => {
    const custom = { ...prefs, hours: [23] };
    const since = new Date(2026, 8, 7, 22).getTime();
    expect(ordinaryDue(since, new Date(2026, 8, 8, 6), custom)).toBe(false);
    expect(ordinaryDue(since, new Date(2026, 8, 8, 7), custom)).toBe(true);
  });
  it('supports daytime quiet hours, rounded delivery hours and immediate chat', () => {
    const custom = indicatorPreferences({
      hours: [8.6, 9, 16.7],
      quietStart: 12,
      quietEnd: 14,
      chatMinutes: 0,
    });
    expect(custom.hours).toEqual([9, 17]);
    expect(custom.chatMinutes).toBe(0);
    expect(inQuietHours(new Date(2026, 8, 7, 13), custom)).toBe(true);
    expect(inQuietHours(new Date(2026, 8, 7, 23), custom)).toBe(false);
  });
});
