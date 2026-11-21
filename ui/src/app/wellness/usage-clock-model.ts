import { DAY_RESET_HOUR } from './discovery-window-model';

/**
 * The usage clock (Wellness), pure part: how long Mawkingbird has been in
 * active use today on this device. Feeds auto-grayscale, break reminders and
 * the check-in's time budget.
 *
 * Per device and never synced: time on the phone and time on the desktop are
 * different sittings, and a synced clock would gray out a device you just
 * picked up.
 */

/** Grayscale starts after this much use in a day... */
export const GRAY_START_MINUTES = 45;
/** ...and is complete this many minutes later. */
export const GRAY_FADE_MINUTES = 15;

/** No input for this long and the clock stops (the person walked away). */
export const IDLE_AFTER_MS = 2 * 60_000;

/** A gap this long ends a sitting: the break-reminder count starts over. */
export const SITTING_GAP_MS = 10 * 60_000;

/** Continuous use before a natural stop suggests a break. */
export const BREAK_AFTER_MINUTES = 25;

/** After a suggestion (taken or not), the next waits at least this long. */
export const BREAK_COOLDOWN_MINUTES = 20;

/** The wellness day a moment belongs to: "YYYY-MM-DD", turning over at 04:00 local. */
export function wellnessDay(now: number): string {
  const date = new Date(now - DAY_RESET_HOUR * 3_600_000);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export interface UsageRecord {
  day: string;
  /** Active ms today. */
  ms: number;
}

/** Stored record made safe; a record from another day counts as zero. */
export function normalizeUsage(value: unknown, now: number): UsageRecord {
  const today = wellnessDay(now);
  if (
    value &&
    typeof value === 'object' &&
    (value as UsageRecord).day === today &&
    typeof (value as UsageRecord).ms === 'number' &&
    Number.isFinite((value as UsageRecord).ms) &&
    (value as UsageRecord).ms >= 0
  ) {
    return { day: today, ms: (value as UsageRecord).ms };
  }
  return { day: today, ms: 0 };
}

/**
 * Add an active interval. The interval is capped (a suspended laptop must not
 * bank eight hours in one tick) and a day change starts the count over.
 */
export function addActive(
  record: UsageRecord,
  elapsedMs: number,
  now: number,
  capMs: number,
): UsageRecord {
  const today = wellnessDay(now);
  const base = record.day === today ? record.ms : 0;
  return { day: today, ms: base + Math.max(0, Math.min(elapsedMs, capMs)) };
}

/** 0 (full colour) to 1 (fully gray) for a day's active minutes. */
export function grayLevel(activeMinutes: number): number {
  const level = (activeMinutes - GRAY_START_MINUTES) / GRAY_FADE_MINUTES;
  return Math.round(Math.min(1, Math.max(0, level)) * 100) / 100;
}

/** Whether a natural stop should suggest a break. */
export function breakDue(options: {
  sittingMinutes: number;
  budgetMinutes: number | null;
  todayMinutes: number;
  budgetStartMinutes: number;
  minutesSinceLastSuggestion: number | null;
}): 'sitting' | 'budget' | null {
  if (
    options.minutesSinceLastSuggestion !== null &&
    options.minutesSinceLastSuggestion < BREAK_COOLDOWN_MINUTES
  ) {
    return null;
  }
  if (
    options.budgetMinutes !== null &&
    options.todayMinutes - options.budgetStartMinutes >= options.budgetMinutes
  ) {
    return 'budget';
  }
  return options.sittingMinutes >= BREAK_AFTER_MINUTES ? 'sitting' : null;
}
