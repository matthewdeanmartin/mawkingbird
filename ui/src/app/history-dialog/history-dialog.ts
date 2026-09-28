import { MbMetadata } from '../design-system/metadata/metadata';
import { Component, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../api';
import { StatusEdit } from '../models';
import { AnonymousPublicApi } from '../providers/anonymous/anonymous-public-api';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MbDialog } from '../design-system/dialog/dialog';
import { MbButton } from '../design-system/button/button';
import { MbContentState } from '../design-system/content-state/content-state';

// i18n history.title: Edit history
// i18n history.loading: Loading…
// i18n history.empty: No history.
// i18n history.current: Current
// i18n history.version: Version {{version}}
// i18n history.close: Close
// i18n history.failed: Could not load edit history. Try again.
// i18n history.retry: Retry

/** A modal showing the edit-history snapshots of a status. */
@Component({
  selector: 'app-history-dialog',
  imports: [MbMetadata, MbDialog, MbButton, MbContentState, TranslocoPipe],
  templateUrl: './history-dialog.html',
  styleUrl: './history-dialog.css',
})
export class HistoryDialog implements OnInit {
  private api = inject(Api);
  private readonly destroyRef = inject(DestroyRef);
  private anonymousApi = inject(AnonymousPublicApi);

  readonly statusId = input.required<string>();
  readonly server = input<string | null>(null);
  readonly closed = output<void>();

  protected edits = signal<StatusEdit[]>([]);
  protected loading = signal(false);
  protected failed = signal(false);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.failed.set(false);
    const request = this.server()
      ? this.anonymousApi.getStatusHistory({ server: this.server()!, id: this.statusId() })
      : this.api.statusHistory(this.statusId());
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (edits) => {
        this.edits.set(edits);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });
  }
}
