import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AdminApi } from '../admin-api';
import { AdminReport } from '../../models';

// i18n adminReports.tabs.open: Open
// i18n adminReports.tabs.resolved: Resolved
// i18n adminReports.loading: Loading…
// i18n adminReports.empty.open: No open reports.
// i18n adminReports.empty.resolved: No resolved reports.
// i18n adminReports.item.against: against
// i18n adminReports.item.by: by @{{username}}
// i18n adminReports.statusCount.one: {{count}} reported status
// i18n adminReports.statusCount.other: {{count}} reported statuses
// i18n adminReports.item.assignedTo: assigned to @{{username}}
// i18n adminReports.actions.assignToMe: Assign to me
// i18n adminReports.actions.reopen: Reopen
// i18n adminReports.actions.resolve: Resolve

@Component({
  selector: 'app-admin-reports',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './admin-reports.html',
  styleUrl: './admin-reports.css',
})
export class AdminReports implements OnInit {
  private api = inject(AdminApi);

  protected resolved = signal(false);
  protected reports = signal<AdminReport[]>([]);
  protected loading = signal(true);

  ngOnInit(): void {
    this.load();
  }

  setResolved(resolved: boolean): void {
    if (this.resolved() === resolved) {
      return;
    }
    this.resolved.set(resolved);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.reports(this.resolved()).subscribe({
      next: (r) => {
        this.reports.set(r);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** A report leaves the current tab once resolved/reopened, so just drop it. */
  private remove(id: string): void {
    this.reports.update((list) => list.filter((r) => r.id !== id));
  }

  private replace(updated: AdminReport): void {
    this.reports.update((list) => list.map((r) => (r.id === updated.id ? updated : r)));
  }

  assign(r: AdminReport): void {
    this.api.assignReport(r.id).subscribe((u) => this.replace(u));
  }

  resolve(r: AdminReport): void {
    this.api.resolveReport(r.id).subscribe(() => this.remove(r.id));
  }

  reopen(r: AdminReport): void {
    this.api.reopenReport(r.id).subscribe(() => this.remove(r.id));
  }
}
