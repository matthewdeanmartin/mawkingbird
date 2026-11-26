import { Component, inject, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MockApi } from '../../mock-api';
import { BugReportDialog } from '../../shell/bug-report-dialog/bug-report-dialog';
import { AuthorizedApp } from '../../platform/api/models';

/** Development: applications authorized against this account, plus bug reporting. */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.development.title: Development
// i18n settings.development.intro: Applications with access to your account.
// i18n settings.development.none: No applications have been authorized for this account.
// i18n settings.development.lastUsed: Last used: {{date}}
// i18n settings.development.register: New applications register themselves via POST /api/v1/apps.
// i18n settings.development.reportBug: Feedback
// i18n settings.development.reportBug.hint: Report a bug, suggest a feature, or contact the maintainer privately about security.
@Component({
  selector: 'app-settings-development',
  imports: [BugReportDialog, TranslocoPipe],
  templateUrl: './settings-development.html',
  changeDetection: ChangeDetectionStrategy.Eager,
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
