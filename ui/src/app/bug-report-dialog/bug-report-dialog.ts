import { Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { BugReport } from '../bug-report';
import { ErrorLog } from '../error-log';
import { FocusTrap } from '../a11y/focus-trap';
import { DiagnosticLog } from '../diagnostic-log';
import { PageDiagnostics } from '../page-diagnostics';

/**
 * "Report a bug" dialog. It assembles a Markdown report — the user's
 * description plus build/env details and (optionally) the recent in-app errors
 * — and hands it off two ways: copy to clipboard, or open a prefilled GitHub
 * issue in a new tab. Nothing is ever sent automatically; the user always does
 * the final submit on GitHub. The technical details are shown in full before
 * anything leaves, and the recent-errors section is opt-out.
 */
// i18n bugReport.title: Report a bug
// i18n bugReport.intro: This builds a report you can file or paste yourself. Nothing is sent automatically — you'll review it, then either copy it or open a prefilled GitHub issue.
// i18n bugReport.whatHappened: What happened?
// i18n bugReport.descriptionPlaceholder: What were you doing, and what went wrong?
// i18n bugReport.includeErrors.one: Include the {{count}} most recent error captured in this tab
// i18n bugReport.includeErrors.other: Include the {{count}} most recent errors captured in this tab
// i18n bugReport.includeDiagnostics: Include up to 100 recent diagnostic entries from this tab
// i18n bugReport.toggle.hide: Hide exactly what will be included
// i18n bugReport.toggle.show: Show exactly what will be included
// i18n bugReport.close: Close
// i18n bugReport.copied: Copied ✓
// i18n bugReport.copyReport: Copy report
// i18n bugReport.openGithubIssue: Open GitHub issue
@Component({
  selector: 'app-bug-report-dialog',
  imports: [FocusTrap, FormsModule, TranslocoPipe],
  templateUrl: './bug-report-dialog.html',
  styleUrl: './bug-report-dialog.css',
})
export class BugReportDialog {
  private readonly report = inject(BugReport);
  protected readonly errorLog = inject(ErrorLog);
  protected readonly diagnosticLog = inject(DiagnosticLog);
  private readonly diagnostics = inject(PageDiagnostics);

  readonly closed = output<void>();

  protected description = signal('');
  protected includeErrors = signal(true);
  protected includeDiagnostics = signal(true);
  protected showDetails = signal(false);
  protected copied = signal(false);

  protected readonly hasErrors = computed(() => this.errorLog.entries().length > 0);
  protected readonly hasDiagnostics = computed(() => this.diagnosticLog.entries().length > 0);

  /** Live preview of the exact Markdown that will be copied / filed. */
  protected readonly preview = computed(() =>
    this.report.buildMarkdown({
      description: this.description(),
      includeErrors: this.includeErrors(),
      includeDiagnostics: this.includeDiagnostics(),
    }),
  );

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.preview());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch (error: unknown) {
      this.diagnostics.error('BugReport', 'clipboard:error', error);
      // Clipboard can be blocked (permissions, insecure context). The GitHub
      // button still works, and the preview text is selectable by hand.
      this.copied.set(false);
    }
  }

  openGithub(): void {
    const url = this.report.buildGithubUrl({
      description: this.description(),
      includeErrors: this.includeErrors(),
      includeDiagnostics: this.includeDiagnostics(),
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
