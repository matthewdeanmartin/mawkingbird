import { Component, computed, inject, signal } from '@angular/core';
import { BulkActionId, BulkActions } from '../../bulk-actions';
import { BulkActionsDialog } from '../../bulk-actions-dialog/bulk-actions-dialog';
import { BulkProgress } from '../../bulk-progress/bulk-progress';
import { MbButton } from '../../design-system/button/button';
import { FocusedNextSteps } from '../focused-apps/focused-next-steps';

/**
 * The signed-in body of /turn-off-boosts-mastodon: the bulk "boosts off for
 * everyone you follow" action from Settings → Bulk moderation, and its undo.
 *
 * The dialog counts how many accounts would change before anything happens, and
 * the job reports through the shared progress panel, exactly as in Settings.
 */
@Component({
  selector: 'app-boosts-workbench',
  imports: [BulkActionsDialog, BulkProgress, FocusedNextSteps, MbButton],
  template: `
    <app-bulk-progress />

    <section class="panel">
      <h2>Turn boosts off</h2>
      <p>
        Keep following everyone, but stop their boosts reaching your home timeline. Their own posts
        still appear.
      </p>
      <button mbButton type="button" [disabled]="running()" (click)="pending.set('reblogs-off')">
        {{ running() && job()?.action === 'reblogs-off' ? 'Working…' : 'Review and turn off' }}
      </button>
    </section>

    <section class="panel">
      <h2>Changed your mind?</h2>
      <p>Let boosts from everyone you follow back into your home timeline.</p>
      <button
        mbButton
        variant="outline"
        type="button"
        [disabled]="running()"
        (click)="pending.set('reblogs-on')"
      >
        {{ running() && job()?.action === 'reblogs-on' ? 'Working…' : 'Review and turn on' }}
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
      <app-focused-next-steps inviteLink="/turn-off-boosts-mastodon/invite" />
    }
  `,
  styleUrl: '../focused-apps/focused-page.css',
})
export class BoostsWorkbench {
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
