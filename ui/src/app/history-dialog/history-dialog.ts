import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../api';
import { StatusEdit } from '../models';
import { AnonymousPublicApi } from '../providers/anonymous/anonymous-public-api';
import { FocusTrap } from '../a11y/focus-trap';

// i18n history.title: Edit history
// i18n history.loading: Loading…
// i18n history.empty: No history.
// i18n history.current: Current
// i18n history.version: Version {{version}}
// i18n history.close: Close

/** A modal showing the edit-history snapshots of a status. */
@Component({
  selector: 'app-history-dialog',
  imports: [FocusTrap, TranslocoPipe],
  templateUrl: './history-dialog.html',
  styleUrl: './history-dialog.css',
})
export class HistoryDialog implements OnInit {
  private api = inject(Api);
  private anonymousApi = inject(AnonymousPublicApi);

  readonly statusId = input.required<string>();
  readonly server = input<string | null>(null);
  readonly closed = output<void>();

  protected edits = signal<StatusEdit[]>([]);
  protected loading = signal(true);

  ngOnInit(): void {
    const request = this.server()
      ? this.anonymousApi.getStatusHistory({ server: this.server()!, id: this.statusId() })
      : this.api.statusHistory(this.statusId());
    request.subscribe({
      next: (edits) => {
        this.edits.set(edits);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
