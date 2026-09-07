import { computed, Injectable, Signal, signal } from '@angular/core';

/**
 * What translation has spent today, per engine, and the limits it spends against.
 *
 * ## Why this exists
 *
 * `Api.translate()` is a bare `POST /statuses/{id}/translate` with no counter and no
 * cap, and `RateLimitCoordinator` only reacts *after* a 429 comes back. That is harmless
 * while translation is one click on one post. It stops being harmless the moment
 * translation fires automatically on every post that scrolls past: the app becomes a bad
 * net citizen against a free service, or quietly drains an OpenRouter balance. This
 * store exists so the bulk-translation reading mode has something to be stopped by —
 * it ships *before* any automatic trigger does.
 *
 * ## Two budgets, deliberately never one
 *
 * The Mastodon endpoint and OpenRouter are metered **separately**, with separate limits
 * and separate counters. Not because a combined total would be hard, but because these
 * are different resources with different failure modes: OpenRouter could go out of
 * business, and an instance can disable its translation endpoint whenever it likes.
 * Either one vanishing has to leave the other's budget intact and still meaningful. A
 * single blended meter would let a dead engine's history eat a live engine's allowance.
 *
 * They also differ in *kind*. Mastodon translation is a free service belonging to
 * someone else, where the limit is politeness. OpenRouter is prepaid credit belonging to
 * the user, where the limit is money. Those deserve different numbers, so they get
 * different defaults.
 *
 * ## Counters only, never what was translated
 *
 * The rule {@link TwitterUsage} and `CorsProxyUsageStore` already follow. Which posts
 * someone reads in a foreign language is a startlingly intimate thing to write down, and
 * the count is the only part any limit needs.
 *
 * ## Why the day boundary is local, not UTC
 *
 * "Today" has to mean the user's today or the number on their screen is a lie. A limit
 * resetting at 00:00 UTC would reset mid-afternoon for some readers, which makes a daily
 * budget impossible to reason about.
 */

const STORAGE_KEY = 'mockingbird_translation_usage';

/**
 * The two things that can perform a translation.
 *
 * `mastodon` is `POST /api/v1/statuses/{id}/translate` — the instance's own endpoint,
 * which is DeepL or LibreTranslate behind the scenes depending on how the admin
 * configured it. `openrouter` is {@link AiTranslate} going out to a chosen model.
 */
export type TranslationEngine = 'mastodon' | 'openrouter';

export const TRANSLATION_ENGINES: readonly TranslationEngine[] = ['mastodon', 'openrouter'];

/** How each engine is named wherever a human reads it. */
export const ENGINE_LABELS: Record<TranslationEngine, string> = {
  // Named for the engines actually behind the endpoint rather than "your server":
  // someone deciding where to spend a daily allowance deserves to know what they are
  // about to hit.
  mastodon: 'Mastodon (DeepL/LibreTranslate)',
  openrouter: 'AI (OpenRouter)',
};

/**
 * Default soft limit for the instance endpoint: warn, but let it through.
 *
 * A hundred a day is the figure the free translation services are usually good for, and
 * it is far more than a person reads by hand — so tripping it means bulk mode is
 * running, which is exactly when someone wants to be told.
 */
export const DEFAULT_MASTODON_SOFT_LIMIT = 100;

/**
 * Default hard limit for the instance endpoint: refuse.
 *
 * Not a budget — a runaway guard. This is the number that stops a stuck
 * `IntersectionObserver` or a scroll loop from hammering someone else's free service
 * unattended. A reader who genuinely wants more can raise it; a bug cannot.
 */
export const DEFAULT_MASTODON_HARD_LIMIT = 250;

/**
 * Default soft limit for OpenRouter, deliberately far lower than Mastodon's.
 *
 * Every call here costs the user real money. Twenty-five is enough to translate a
 * reading session's worth of interesting posts and low enough that a mistake is a
 * rounding error rather than a bill.
 */
export const DEFAULT_OPENROUTER_SOFT_LIMIT = 25;

/** Default hard limit for OpenRouter. The runaway guard on the paid path. */
export const DEFAULT_OPENROUTER_HARD_LIMIT = 100;

const DEFAULT_LIMITS: Record<TranslationEngine, { soft: number; hard: number }> = {
  mastodon: { soft: DEFAULT_MASTODON_SOFT_LIMIT, hard: DEFAULT_MASTODON_HARD_LIMIT },
  openrouter: { soft: DEFAULT_OPENROUTER_SOFT_LIMIT, hard: DEFAULT_OPENROUTER_HARD_LIMIT },
};

/** One engine's counters. Shape mirrors `TwitterUsage`'s `StoredUsage`. */
interface EngineUsage {
  /** Local calendar day, `YYYY-MM-DD`, that `today` counts. */
  day: string;
  /** Translations spent on that day. */
  today: number;
  /** Translations spent ever, for the "since you started" line. */
  total: number;
  /** Epoch ms of the most recent translation. */
  lastAt: number;
  softLimit?: number;
  hardLimit?: number;
}

type StoredUsage = Record<TranslationEngine, EngineUsage>;

/** The local calendar day, as `YYYY-MM-DD`. */
export function localDay(at: number = Date.now()): string {
  const date = new Date(at);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function emptyEngine(): EngineUsage {
  return { day: localDay(), today: 0, total: 0, lastAt: 0 };
}

function emptyState(): StoredUsage {
  return { mastodon: emptyEngine(), openrouter: emptyEngine() };
}

/** One engine's stored counters, or a fresh set when the shape is unrecognisable. */
function readEngine(value: unknown): EngineUsage {
  const parsed = value as Partial<EngineUsage> | null | undefined;
  if (typeof parsed?.today !== 'number' || typeof parsed?.day !== 'string') {
    return emptyEngine();
  }
  return {
    day: parsed.day,
    today: parsed.today,
    total: typeof parsed.total === 'number' ? parsed.total : parsed.today,
    lastAt: typeof parsed.lastAt === 'number' ? parsed.lastAt : 0,
    softLimit: typeof parsed.softLimit === 'number' ? parsed.softLimit : undefined,
    hardLimit: typeof parsed.hardLimit === 'number' ? parsed.hardLimit : undefined,
  };
}

function read(): StoredUsage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyState();
    }
    const parsed = JSON.parse(raw) as Partial<StoredUsage>;
    // Each engine is validated independently, so a corrupt half doesn't discard the
    // other half's honest count.
    return {
      mastodon: readEngine(parsed?.mastodon),
      openrouter: readEngine(parsed?.openrouter),
    };
  } catch {
    return emptyState();
  }
}

/** Why a translation was refused, or null when it may proceed. */
export type SpendRefusal = 'hard-limit' | null;

/** The reactive view of one engine's budget, for templates and callers. */
export interface EngineBudget {
  engine: TranslationEngine;
  label: string;
  today: Signal<number>;
  total: Signal<number>;
  lastAt: Signal<number>;
  softLimit: Signal<number>;
  hardLimit: Signal<number>;
  overSoftLimit: Signal<boolean>;
  atHardLimit: Signal<boolean>;
  remainingToday: Signal<number>;
}

@Injectable({ providedIn: 'root' })
export class TranslationUsage {
  private state = signal<StoredUsage>(read());

  /**
   * A signal that changes when the local calendar day does.
   *
   * `computed` memoizes against its *signal* dependencies, and the wall clock is not
   * one. Without this, a browser left open overnight keeps serving yesterday's count
   * from cache and — much worse — keeps enforcing yesterday's exhausted limit into the
   * new day, so translation stays refused until something unrelated writes to storage.
   *
   * Polled rather than scheduled for midnight: a timer that fires once a day is a thing
   * to get wrong (suspend, clock changes, DST), while re-reading a date every minute
   * costs nothing and cannot drift.
   */
  private readonly currentDay = signal(localDay());

  constructor() {
    // Not guarded by a teardown: this service is `providedIn: 'root'` and lives for the
    // page's lifetime, so there is nothing that outlives it to clean up.
    setInterval(() => this.syncDay(), 60_000);
  }

  /** Translations spent on `engine` today, rolling over at local midnight. */
  today(engine: TranslationEngine): number {
    const stored = this.state()[engine];
    return stored.day === this.currentDay() ? stored.today : 0;
  }

  total(engine: TranslationEngine): number {
    return this.state()[engine].total;
  }

  lastAt(engine: TranslationEngine): number {
    return this.state()[engine].lastAt;
  }

  softLimit(engine: TranslationEngine): number {
    return this.state()[engine].softLimit ?? DEFAULT_LIMITS[engine].soft;
  }

  hardLimit(engine: TranslationEngine): number {
    return this.state()[engine].hardLimit ?? DEFAULT_LIMITS[engine].hard;
  }

  /** Past the soft limit: worth saying so, but nothing is blocked. */
  overSoftLimit(engine: TranslationEngine): boolean {
    return this.today(engine) >= this.softLimit(engine);
  }

  /** At the hard limit: further translations are refused until tomorrow. */
  atHardLimit(engine: TranslationEngine): boolean {
    return this.today(engine) >= this.hardLimit(engine);
  }

  /** How many more translations today's hard limit allows on `engine`. */
  remainingToday(engine: TranslationEngine): number {
    return Math.max(0, this.hardLimit(engine) - this.today(engine));
  }

  /**
   * The reactive budget for one engine.
   *
   * The methods above are plain calls so callers can ask a question without wiring a
   * signal graph; this wraps the same values as signals for templates, which need to
   * re-render when a count changes. Both read the same state, so they cannot disagree.
   */
  budget(engine: TranslationEngine): EngineBudget {
    return {
      engine,
      label: ENGINE_LABELS[engine],
      today: computed(() => this.today(engine)),
      total: computed(() => this.total(engine)),
      lastAt: computed(() => this.lastAt(engine)),
      softLimit: computed(() => this.softLimit(engine)),
      hardLimit: computed(() => this.hardLimit(engine)),
      overSoftLimit: computed(() => this.overSoftLimit(engine)),
      atHardLimit: computed(() => this.atHardLimit(engine)),
      remainingToday: computed(() => this.remainingToday(engine)),
    };
  }

  /**
   * Whether a translation of `cost` may proceed on `engine`.
   *
   * Checked *before* spending, and it refuses the whole operation rather than letting
   * part of a batch through. A bulk pass that stops halfway is worse than one that never
   * starts: the reader has spent the calls and still has a page of half-translated posts
   * with no way to tell which are which.
   */
  check(engine: TranslationEngine, cost = 1): SpendRefusal {
    this.syncDay();
    return this.today(engine) + cost > this.hardLimit(engine) ? 'hard-limit' : null;
  }

  /** Convenience for the common `check(...) === null` question. */
  canSpend(engine: TranslationEngine, cost = 1): boolean {
    return this.check(engine, cost) === null;
  }

  /**
   * Bring the day signal up to date.
   *
   * Belt and braces alongside the interval: any path about to make a spending decision
   * re-checks the date first, so a decision is never made against a stale day even if
   * the timer has not ticked — a suspended laptop, a tab throttled in the background, or
   * a test with fake timers.
   */
  syncDay(): void {
    const day = localDay();
    if (day !== this.currentDay()) {
      this.currentDay.set(day);
    }
  }

  /** Record spend. Called once per translation actually issued. */
  record(engine: TranslationEngine, count = 1): void {
    const day = localDay();
    const stored = this.state()[engine];
    const today = stored.day === day ? stored.today : 0;
    this.writeEngine(engine, {
      ...stored,
      day,
      today: today + count,
      total: stored.total + count,
      lastAt: Date.now(),
    });
  }

  /** Change one engine's limits. A hard limit below the soft one would be nonsense. */
  setLimits(engine: TranslationEngine, soft: number, hard: number): void {
    const safeHard = Math.max(1, Math.round(hard));
    this.writeEngine(engine, {
      ...this.state()[engine],
      softLimit: Math.max(1, Math.min(Math.round(soft), safeHard)),
      hardLimit: safeHard,
    });
  }

  /** Clear one engine's counters. Does not touch its limits, or the other engine. */
  reset(engine: TranslationEngine): void {
    this.writeEngine(engine, {
      ...this.state()[engine],
      day: localDay(),
      today: 0,
      total: 0,
      lastAt: 0,
    });
  }

  private writeEngine(engine: TranslationEngine, next: EngineUsage): void {
    const state = { ...this.state(), [engine]: next };
    this.state.set(state);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Honoured in memory for this session. Failing to persist a counter must never
      // fail the translation it was counting.
    }
  }
}
