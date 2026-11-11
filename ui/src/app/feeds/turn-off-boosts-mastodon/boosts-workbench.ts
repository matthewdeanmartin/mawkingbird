import { Component, computed, inject, signal } from '@angular/core';
import { BulkActionId, BulkActions } from '../../accounts/bulk-actions';
import { BulkActionsDialog } from '../../accounts/bulk-actions-dialog/bulk-actions-dialog';
import { BulkProgress } from '../../accounts/bulk-progress/bulk-progress';
import { MbButton } from '../../design-system/button/button';
import {
  FocusedNextSteps,
  toolInviteLink,
} from '../../public-pages/focused-apps/focused-next-steps';

// i18n focusedTools.working: Working…
// i18n focusedTools.boosts.offTitle: Turn boosts off
// i18n focusedTools.boosts.offBody: Keep following everyone, but stop their boosts reaching your home timeline. Their own posts still appear.
// i18n focusedTools.boosts.offButton: Review and turn off
// i18n focusedTools.boosts.onTitle: Changed your mind?
// i18n focusedTools.boosts.onBody: Let boosts from everyone you follow back into your home timeline.
// i18n focusedTools.boosts.onButton: Review and turn on
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * The signed-in body of /turn-off-boosts-mastodon: the bulk "boosts off for
 * everyone you follow" action from Settings → Bulk moderation, and its undo.
 *
 * The dialog counts how many accounts would change before anything happens, and
 * the job reports through the shared progress panel, exactly as in Settings.
 */
@Component({
  selector: 'app-boosts-workbench',
  imports: [TranslocoPipe, BulkActionsDialog, BulkProgress, FocusedNextSteps, MbButton],
  template: `
    <app-bulk-progress />

    <section class="panel">
      <h2>{{ 'focusedTools.boosts.offTitle' | transloco }}</h2>
      <p>{{ 'focusedTools.boosts.offBody' | transloco }}</p>
      <button mbButton type="button" [disabled]="running()" (click)="pending.set('reblogs-off')">
        {{
          (running() && job()?.action === 'reblogs-off'
            ? 'focusedTools.working'
            : 'focusedTools.boosts.offButton'
          ) | transloco
        }}
      </button>
    </section>

    <section class="panel">
      <h2>{{ 'focusedTools.boosts.onTitle' | transloco }}</h2>
      <p>{{ 'focusedTools.boosts.onBody' | transloco }}</p>
      <button
        mbButton
        variant="outline"
        type="button"
        [disabled]="running()"
        (click)="pending.set('reblogs-on')"
      >
        {{
          (running() && job()?.action === 'reblogs-on'
            ? 'focusedTools.working'
            : 'focusedTools.boosts.onButton'
          ) | transloco
        }}
      </button>
    </section>

    @if (pending(); as id) {
      <app-bulk-actions-dialog
        [action]="id"
        (confirmed)="confirm()"
        (cancelled)="pending.set(null)"
      />
    }

    @if (finished()) {
      <app-focused-next-steps [inviteLink]="invite" />
    }
  `,
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
})
export class BoostsWorkbench {
  protected readonly invite = toolInviteLink();
  private readonly bulk = inject(BulkActions);
  protected readonly running = this.bulk.running;
  protected readonly job = this.bulk.job;

  /** Which action's confirmation dialog is open, if any. */
  protected readonly pending = signal<'reblogs-off' | 'reblogs-on' | null>(null);

  /** A boosts job ran to the end: the task is done, so the next steps can show. */
  protected readonly finished = computed(() => {
    const job = this.job();
    return !!job && isBoostsAction(job.action) && job.phase === 'done';
  });

  protected confirm(): void {
    const id = this.pending();
    this.pending.set(null);
    // Not awaited: the job reports through the progress panel, as in Settings.
    if (id) void this.bulk.start(id);
  }
}

function isBoostsAction(action: BulkActionId): boolean {
  return action === 'reblogs-off' || action === 'reblogs-on';
}
