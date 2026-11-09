import { computed, Injectable, signal } from '@angular/core';

/**
 * A daily dollar cap on AI translation (OpenRouter, the reader's own key).
 *
 * Call counts (`TranslationUsage`) say how often; this says how much it cost,
 * read from OpenRouter's own per-call `usage.cost`. Default **$0.25 a day**
 * (owner decision, 2026-11-09). When a call would go over, the request is
 * refused and {@link promptOpen} asks the reader once a day whether to raise
 * today's limit, rather than translations silently stopping.
 *
 * "Today" is the local calendar day, like the other translation budgets.
 */

export const AI_BUDGET_KEY = 'mockingbird_ai_translation_budget';
export const DEFAULT_DAILY_CAP_USD = 0.25;

interface StoredBudget {
  /** The reader's standing daily cap, in US dollars. */
  capUsd: number;
  /** Local day (`YYYY-MM-DD`) that `spentUsd` and `extraUsd` count. */
  day: string;
  spentUsd: number;
  /** Raised for today only from the cap-reached prompt. */
  extraUsd: number;
  /** The prompt was answered (either way) on this day; it does not return until tomorrow. */
  promptAnsweredDay?: string;
}

function localDay(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function read(): StoredBudget {
  const fresh: StoredBudget = {
    capUsd: DEFAULT_DAILY_CAP_USD,
    day: localDay(),
    spentUsd: 0,
    extraUsd: 0,
  };
  try {
    const raw = JSON.parse(
      localStorage.getItem(AI_BUDGET_KEY) ?? 'null',
    ) as Partial<StoredBudget> | null;
    if (!raw || typeof raw !== 'object') return fresh;
    const capUsd =
      typeof raw.capUsd === 'number' && raw.capUsd >= 0 ? raw.capUsd : DEFAULT_DAILY_CAP_USD;
    if (raw.day !== localDay()) {
      return { ...fresh, capUsd };
    }
    return {
      capUsd,
      day: raw.day,
      spentUsd: typeof raw.spentUsd === 'number' && raw.spentUsd >= 0 ? raw.spentUsd : 0,
      extraUsd: typeof raw.extraUsd === 'number' && raw.extraUsd >= 0 ? raw.extraUsd : 0,
      ...(typeof raw.promptAnsweredDay === 'string'
        ? { promptAnsweredDay: raw.promptAnsweredDay }
        : {}),
    };
  } catch {
    return fresh;
  }
}

@Injectable({ providedIn: 'root' })
export class AiBudget {
  private readonly state = signal<StoredBudget>(read());

  /** The standing daily cap. */
  readonly capUsd = computed(() => this.state().capUsd);
  /** Spent today, from OpenRouter's reported costs. */
  readonly spentTodayUsd = computed(() => this.fresh().spentUsd);
  /** Today's limit: the cap plus anything raised for today. */
  readonly limitTodayUsd = computed(() => this.fresh().capUsd + this.fresh().extraUsd);
  readonly remainingTodayUsd = computed(() =>
    Math.max(0, this.limitTodayUsd() - this.spentTodayUsd()),
  );

  /** The cap-reached prompt is showing. */
  readonly promptOpen = signal(false);

  /** Whether another AI translation may start now. */
  canSpend(): boolean {
    return this.spentTodayUsd() < this.limitTodayUsd();
  }

  /**
   * A translation was refused for the cap: offer to raise it, once a day.
   * Automatic translation can hit this many times in a scroll; the reader is
   * asked once.
   */
  refused(): void {
    if (this.fresh().promptAnsweredDay !== localDay()) this.promptOpen.set(true);
  }

  /** Record what one OpenRouter call cost (null when the reply did not say). */
  record(costUsd: number | null): void {
    if (costUsd === null || !Number.isFinite(costUsd) || costUsd <= 0) return;
    this.update((s) => ({ ...s, spentUsd: s.spentUsd + costUsd }));
  }

  /** Raise today's limit by `amountUsd` (today only), from the prompt. */
  raiseToday(amountUsd: number): void {
    this.update((s) => ({ ...s, extraUsd: s.extraUsd + amountUsd, promptAnsweredDay: s.day }));
    this.promptOpen.set(false);
  }

  /** "Not today": keep the limit and stop asking until tomorrow. */
  declineToday(): void {
    this.update((s) => ({ ...s, promptAnsweredDay: s.day }));
    this.promptOpen.set(false);
  }

  /** Change the standing daily cap (Settings). */
  setCap(capUsd: number): void {
    if (!Number.isFinite(capUsd) || capUsd < 0) return;
    this.update((s) => ({ ...s, capUsd: Math.round(capUsd * 100) / 100 }));
  }

  /** The stored state, rolled over to today if the day changed. */
  private fresh(): StoredBudget {
    const s = this.state();
    return s.day === localDay() ? s : { ...s, day: localDay(), spentUsd: 0, extraUsd: 0 };
  }

  private update(change: (s: StoredBudget) => StoredBudget): void {
    const next = change(this.fresh());
    this.state.set(next);
    try {
      localStorage.setItem(AI_BUDGET_KEY, JSON.stringify(next));
    } catch {
      // The limit still applies for this visit.
    }
  }
}

/** "$0.25", "$1.50", "$0.004" — enough digits to see a fraction of a cent. */
export function formatUsd(amount: number): string {
  if (amount > 0 && amount < 0.01) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}
