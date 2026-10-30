import { Component, computed, inject, signal } from '@angular/core';
import { BulkActionId, BulkActions } from '../../bulk-actions';
import { BulkActionsDialog } from '../../bulk-actions-dialog/bulk-actions-dialog';
import { BulkProgress } from '../../bulk-progress/bulk-progress';
import { MbButton } from '../../design-system/button/button';
import { FocusedNextSteps } from '../focused-apps/focused-next-steps';

type Amnesty = 'mute-amnesty' | 'block-amnesty';

/**
 * The signed-in body of /mastodon-mute-block-amnesty: Settings → Bulk
 * moderation's Mute Amnesty and Block Amnesty, on their own.
 *
 * The shared dialog counts the list and offers to back it up before anything
 * happens, because neither amnesty can be undone without that file.
 */
@Component({
  selector: 'app-amnesty-workbench',
  imports: [BulkActionsDialog, BulkProgress, FocusedNextSteps, MbButton],
  template: `
    <app-bulk-progress />

    <section class="panel">
      <h2>Mute Amnesty</h2>
      <p>
        Unmute every account you have muted and start over. Muted words and filters are not touched.
      </p>
      <button mbButton type="button" [disabled]="running()" (click)="pending.set('mute-amnesty')">
        {{ running() && job()?.action === 'mute-amnesty' ? 'Working…' : 'Review Mute Amnesty' }}
      </button>
    </section>

    <section class="panel">
      <h2>Block Amnesty</h2>
      <p>
        Unblock every account you have blocked. They can follow you and see your posts again, and
        are not told.
      </p>
      <button
        mbButton
        tone="danger"
        type="button"
        [disabled]="running()"
        (click)="pending.set('block-amnesty')"
      >
        {{ running() && job()?.action === 'block-amnesty' ? 'Working…' : 'Review Block Amnesty' }}
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
      <app-focused-next-steps inviteLink="/mastodon-mute-block-amnesty/invite" />
    }
  `,
  styleUrl: '../focused-apps/focused-page.css',
})
export class AmnestyWorkbench {
  private readonly bulk = inject(BulkActions);
  protected readonly running = this.bulk.running;
  protected readonly job = this.bulk.job;

  /** Which amnesty's confirmation dialog is open, if any. */
  protected readonly pending = signal<Amnesty | null>(null);

  /** An amnesty ran to the end: the task is done, so the next steps can show. */
  protected readonly finished = computed(() => {
    const job = this.job();
    return !!job && isAmnesty(job.action) && job.phase === 'done';
  });

  protected confirm(): void {
    const id = this.pending();
    this.pending.set(null);
    // Not awaited: the job reports through the progress panel, as in Settings.
    if (id) void this.bulk.start(id);
  }
}

function isAmnesty(action: BulkActionId): action is Amnesty {
  return action === 'mute-amnesty' || action === 'block-amnesty';
}
