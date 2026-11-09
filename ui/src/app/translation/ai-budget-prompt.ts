import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import { MbDialog } from '../design-system/dialog/dialog';
import { AiBudget, formatUsd } from './ai-budget';

// i18n aiBudget.title: Today's AI translation budget is used up
// i18n aiBudget.body: AI translation has spent {{spent}} of today's {{limit}}. Raise today's limit to keep translating with AI? Free translators still work either way.
// i18n aiBudget.raise: Raise today to {{limit}}
// i18n aiBudget.notToday: Not today
// i18n aiBudget.settings: Change the daily limit
// i18n aiBudget.close: Close

/**
 * Asks, once a day, whether to raise today's AI translation limit when it runs
 * out (owner decision 2026-11-09: offer to increase in a pop-up). Mounted in
 * the shell so it appears wherever the translation was refused. "Raise" adds
 * one more cap's worth for today only; the standing cap changes in Settings.
 */
@Component({
  selector: 'app-ai-budget-prompt',
  imports: [MbDialog, MbButton, RouterLink, TranslocoPipe],
  template: `
    @if (budget.promptOpen()) {
      <mb-dialog
        [title]="'aiBudget.title' | transloco"
        [closeLabel]="'aiBudget.close' | transloco"
        (dismissed)="budget.declineToday()"
      >
        <p>
          {{ 'aiBudget.body' | transloco: { spent: spent(), limit: limit() } }}
        </p>
        <p>
          <a routerLink="/settings/i18n" (click)="budget.declineToday()">{{
            'aiBudget.settings' | transloco
          }}</a>
        </p>
        <div mbDialogActions>
          <button mbButton variant="outline" type="button" (click)="budget.declineToday()">
            {{ 'aiBudget.notToday' | transloco }}
          </button>
          <button mbButton type="button" (click)="raise()">
            {{ 'aiBudget.raise' | transloco: { limit: raisedLimit() } }}
          </button>
        </div>
      </mb-dialog>
    }
  `,
})
export class AiBudgetPrompt {
  protected readonly budget = inject(AiBudget);

  /** Raising adds one more standing cap for today (at least five cents). */
  private readonly step = computed(() => Math.max(0.05, this.budget.capUsd()));
  protected readonly spent = computed(() => formatUsd(this.budget.spentTodayUsd()));
  protected readonly limit = computed(() => formatUsd(this.budget.limitTodayUsd()));
  protected readonly raisedLimit = computed(() =>
    formatUsd(this.budget.limitTodayUsd() + this.step()),
  );

  protected raise(): void {
    this.budget.raiseToday(this.step());
  }
}
