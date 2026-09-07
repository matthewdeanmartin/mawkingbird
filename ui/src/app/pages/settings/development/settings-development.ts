import { Component, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MockApi } from '../../../mock-api';
import { BugReportDialog } from '../../../bug-report-dialog/bug-report-dialog';
import { AuthorizedApp } from '../../../models';

/** Development: applications authorized against this account, plus bug reporting. */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.development.title: Development
// i18n settings.development.intro: Applications with access to your account.
// i18n settings.development.none: No applications have been authorized for this account.
// i18n settings.development.lastUsed: Last used: {{date}}
// i18n settings.development.register: New applications register themselves via POST /api/v1/apps.
// i18n settings.development.reportBug: Report a bug
// i18n settings.development.reportBug.hint: Builds a report from your description plus build and environment details. Nothing is sent automatically — you review it, then copy it or open a prefilled GitHub issue.
@Component({
  selector: 'app-settings-development',
  imports: [BugReportDialog, TranslocoPipe],
  templateUrl: './settings-development.html',
  styleUrl: './settings-development.css',
})
export class SettingsDevelopment implements OnInit {
  private api = inject(MockApi);

  protected apps = signal<AuthorizedApp[]>([]);
  protected loading = signal(true);

  /** Whether the "Report a bug" dialog is open. */
  protected reporting = signal(false);

  ngOnInit(): void {
    this.api.authorizedApps().subscribe({
      next: (apps) => {
        this.apps.set(apps);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected formatDate(iso: string | null): string {
    return iso ? new Date(iso).toLocaleString() : 'Never used';
  }
}
