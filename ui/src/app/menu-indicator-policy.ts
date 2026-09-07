export interface IndicatorPreferences {
  hours: number[];
  quietStart: number;
  quietEnd: number;
  chatMinutes: number;
}

export const DEFAULT_INDICATOR_PREFERENCES: IndicatorPreferences = {
  hours: [9, 17],
  quietStart: 23,
  quietEnd: 7,
  chatMinutes: 5,
};

export function indicatorPreferences(value: Partial<IndicatorPreferences>): IndicatorPreferences {
  const hour = (n: unknown, fallback: number): number =>
    typeof n === 'number' && Number.isFinite(n) ? ((Math.round(n) % 24) + 24) % 24 : fallback;
  return {
    hours:
      Array.isArray(value.hours) && value.hours.length
        ? [...new Set(value.hours.map((n) => hour(n, 9)))].sort((a, b) => a - b)
        : [9, 17],
    quietStart: hour(value.quietStart, 23),
    quietEnd: hour(value.quietEnd, 7),
    chatMinutes:
      typeof value.chatMinutes === 'number' && Number.isFinite(value.chatMinutes)
        ? Math.max(0, Math.min(1440, Math.round(value.chatMinutes)))
        : 5,
  };
}

export function inQuietHours(now: Date, prefs: IndicatorPreferences): boolean {
  const hour = now.getHours();
  return prefs.quietStart < prefs.quietEnd
    ? hour >= prefs.quietStart && hour < prefs.quietEnd
    : prefs.quietStart > prefs.quietEnd && (hour >= prefs.quietStart || hour < prefs.quietEnd);
}

/** Find a scheduled delivery after the batch began, allowing a suspended tab to catch up. */
export function ordinaryDue(since: number, now: Date, prefs: IndicatorPreferences): boolean {
  if (inQuietHours(now, prefs)) return false;
  for (let days = 0; days < 2; days++) {
    for (const hour of prefs.hours) {
      const slot = new Date(now);
      slot.setDate(slot.getDate() - days);
      slot.setHours(hour, 0, 0, 0);
      // Slots within quiet hours wait until the next permitted hour.
      if (inQuietHours(slot, prefs)) {
        if (prefs.quietStart > prefs.quietEnd && hour >= prefs.quietStart)
          slot.setDate(slot.getDate() + 1);
        slot.setHours(prefs.quietEnd, 0, 0, 0);
      }
      if (slot.getTime() >= since && slot.getTime() <= now.getTime()) return true;
    }
  }
  return false;
}
