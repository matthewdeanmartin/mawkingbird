import { computed, inject, Injectable, signal } from '@angular/core';
import { UsageClock } from './usage-clock';
import { Wellness } from './wellness';
import { breakDue } from './usage-clock-model';

export type BreakReason = 'sitting' | 'budget';

/**
 * Break reminders (Wellness): suggestions, only at natural stopping points.
 *
 * Nothing here runs on a timer. Callers report a natural stop: a page change
 * (between posts by definition), a feed reaching its cap, a Catch-up
 * finishing. Only then is a break considered, so a suggestion can never land in
 * the middle of a post someone is reading.
 *
 * Two reasons: a long sitting (the Wellness switch), or the time budget the
 * person set at check-in. A budget is their own stated intention, so it is
 * honoured whenever one was set, whatever the switch says.
 */
@Injectable({ providedIn: 'root' })
export class BreakReminders {
  private wellness = inject(Wellness);
  private clock = inject(UsageClock);

  private readonly budget = signal<{ minutes: number; startedAt: number } | null>(null);
  private lastSuggested: number | null = null;
  /** The suggestion on screen, if any. */
  readonly suggestion = signal<BreakReason | null>(null);
  readonly budgetMinutes = computed(() => this.budget()?.minutes ?? null);

  /** From the check-in: "I'm here for N minutes". Null clears it. */
  setBudget(minutes: number | null): void {
    this.budget.set(minutes ? { minutes, startedAt: this.clock.todayMinutes() } : null);
  }

  /** A natural stopping point happened; suggest a break if one is due. */
  naturalStop(): void {
    if (this.suggestion()) return;
    const budget = this.budget();
    const sittingOn = this.wellness.flags().breakReminders;
    if (!sittingOn && !budget) return;
    const due = breakDue({
      sittingMinutes: sittingOn ? this.clock.sittingMinutes() : 0,
      budgetMinutes: budget?.minutes ?? null,
      todayMinutes: this.clock.todayMinutes(),
      budgetStartMinutes: budget?.startedAt ?? 0,
      minutesSinceLastSuggestion:
        this.lastSuggested === null ? null : (Date.now() - this.lastSuggested) / 60_000,
    });
    if (!due) return;
    this.lastSuggested = Date.now();
    // A budget is said once; after that it is the person's call.
    if (due === 'budget') this.budget.set(null);
    this.suggestion.set(due);
  }

  dismiss(): void {
    this.suggestion.set(null);
  }
}
