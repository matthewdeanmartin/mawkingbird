import { computed, Injectable, signal } from '@angular/core';

/**
 * What the Twitter data connector has spent, and the limits it spends against.
 *
 * ## Why this exists when nothing else in the app has it
 *
 * Every other connector here is free to call. A wasted RSS fetch costs a second
 * of someone's patience; a wasted X request costs money from a prepaid balance,
 * and the user finds out about it in a billing dashboard rather than in the app.
 * That asymmetry is the whole justification for this file: the app is spending
 * someone else's money, so it owes them a running total and a stop.
 *
 * ## Counters only, never what was requested
 *
 * The same rule {@link CorsProxyUsageStore} follows, for the same reason. Which
 * accounts someone reads is already disclosed to the proxy operator and the data
 * service; writing it to a third place would only widen the disclosure without
 * telling the user anything they cannot get from their follow list.
 *
 * ## Why the day boundary is local, not UTC
 *
 * "Today" has to mean the user's today or the number is a lie on their screen.
 * A limit that resets at 00:00 UTC would reset mid-afternoon for some readers,
 * which makes a daily budget impossible to reason about.
 */

const STORAGE_KEY = 'mockingbird_twitter_usage';

/**
 * Default soft limit: warn, but let it through.
 *
 * Fifty is roughly a day of ordinary reading — ten follows refreshed a few
 * times, plus some profile lookups. Chosen to be generous enough that a normal
 * day never trips it, so tripping it actually means something.
 */
export const DEFAULT_SOFT_LIMIT = 50;

/**
 * Default hard limit: refuse.
 *
 * Two hundred is deliberately far above the soft limit. This is not a budget —
 * it is a runaway guard, for the case where a bug or a stuck refresh loop is
 * spending money without anyone watching. A user who genuinely wants to read
 * more than this in one day can raise it; a loop cannot.
 */
export const DEFAULT_HARD_LIMIT = 200;

interface StoredUsage {
  /** Local calendar day, `YYYY-MM-DD`, that `today` counts. */
  day: string;
  /** Requests spent on that day. */
  today: number;
  /** Requests spent ever, for the "since you connected" line. */
  total: number;
  /** Epoch ms of the most recent request. */
  lastAt: number;
  softLimit?: number;
  hardLimit?: number;
}

/** The local calendar day, as `YYYY-MM-DD`. */
export function localDay(at: number = Date.now()): string {
  const date = new Date(at);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const EMPTY: StoredUsage = { day: localDay(), today: 0, total: 0, lastAt: 0 };

function read(): StoredUsage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...EMPTY };
    }
    const parsed = JSON.parse(raw) as StoredUsage;
    if (typeof parsed?.today !== 'number' || typeof parsed?.day !== 'string') {
      return { ...EMPTY };
    }
    return parsed;
  } catch {
    return { ...EMPTY };
  }
}

/** Why a request was refused, or null when it may proceed. */
export type SpendRefusal = 'hard-limit' | null;

@Injectable({ providedIn: 'root' })
export class TwitterUsage {
  private state = signal<StoredUsage>(read());

  /** Requests spent today, rolling over at local midnight. */
  /**
   * A signal that changes when the local calendar day does.
   *
   * Needed because `computed` memoizes against its *signal* dependencies, and
   * the wall clock is not one. Without this, a browser left open overnight kept
   * serving yesterday's count from cache — and, worse, kept enforcing yesterday's
   * exhausted limit into the new day, so the connector would refuse to work
   * until something unrelated happened to write to storage.
   *
   * Polled rather than scheduled for midnight: a timer that fires once a day is
   * a thing to get wrong (suspend, clock changes, DST), while re-reading a date
   * every minute costs nothing and cannot drift.
   */
  private readonly currentDay = signal(localDay());

  constructor() {
    // Not in a `setInterval` guard: this service is `providedIn: 'root'` and
    // lives for the page's lifetime, so there is nothing to tear down that
    // outlives it.
    setInterval(() => {
      const day = localDay();
      if (day !== this.currentDay()) {
        this.currentDay.set(day);
      }
    }, 60_000);
  }

  readonly today = computed(() => {
    const stored = this.state();
    return stored.day === this.currentDay() ? stored.today : 0;
  });

  readonly total = computed(() => this.state().total);
  readonly lastAt = computed(() => this.state().lastAt);
  readonly softLimit = computed(() => this.state().softLimit ?? DEFAULT_SOFT_LIMIT);
  readonly hardLimit = computed(() => this.state().hardLimit ?? DEFAULT_HARD_LIMIT);

  /** Past the soft limit: worth saying so, but nothing is blocked. */
  readonly overSoftLimit = computed(() => this.today() >= this.softLimit());
  /** At the hard limit: further requests are refused until tomorrow. */
  readonly atHardLimit = computed(() => this.today() >= this.hardLimit());

  /** How many more requests today's hard limit allows. */
  readonly remainingToday = computed(() => Math.max(0, this.hardLimit() - this.today()));

  /**
   * Whether a request of `cost` may proceed.
   *
   * Checked *before* spending, and it refuses the whole operation rather than
   * letting part of a fan-out through. A "refresh all" that stops halfway is
   * worse than one that does not start: the user has paid for a partial answer
   * and has no way to tell which accounts are current.
   */
  check(cost = 1): SpendRefusal {
    this.syncDay();
    return this.today() + cost > this.hardLimit() ? 'hard-limit' : null;
  }

  /**
   * Bring the day signal up to date.
   *
   * Belt and braces alongside the interval: any path about to make a spending
   * decision re-checks the date first, so a decision is never made against a
   * stale day even if the timer has not ticked — a suspended laptop, a tab
   * throttled in the background, or a test with fake timers.
   */
  syncDay(): void {
    const day = localDay();
    if (day !== this.currentDay()) {
      this.currentDay.set(day);
    }
  }

  /** Record spend. Called once per request actually issued. */
  record(count = 1): void {
    const day = localDay();
    const stored = this.state();
    const today = stored.day === day ? stored.today : 0;
    this.write({
      ...stored,
      day,
      today: today + count,
      total: stored.total + count,
      lastAt: Date.now(),
    });
  }

  /** Change the limits. A hard limit below the soft one would be nonsense. */
  setLimits(soft: number, hard: number): void {
    const safeHard = Math.max(1, Math.round(hard));
    this.write({
      ...this.state(),
      softLimit: Math.max(1, Math.min(Math.round(soft), safeHard)),
      hardLimit: safeHard,
    });
  }

  /** Clear the counters. Does not touch the limits. */
  reset(): void {
    this.write({ ...this.state(), day: localDay(), today: 0, total: 0, lastAt: 0 });
  }

  private write(next: StoredUsage): void {
    this.state.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Honoured in memory for this session. Failing to persist a counter must
      // never fail the request it was counting.
    }
  }
}
