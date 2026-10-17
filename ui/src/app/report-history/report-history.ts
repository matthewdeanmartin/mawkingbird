import { Component, Injectable, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { accountScopeSuffix } from '../account-scope';
import { Auth } from '../auth';
import { Server } from '../server';
import { MbHelp } from '../design-system/help/help';

interface SubmittedReport {
  at: string;
  accountId: string;
  profilePath?: (string | number)[];
  username: string;
  statusId?: string;
  category: string;
}
const KEY = 'mockingbird_submitted_reports';
@Injectable({ providedIn: 'root' })
export class SubmittedReports {
  private auth = inject(Auth);
  private server = inject(Server);
  private version = signal(0);
  readonly entries = computed<SubmittedReport[]>(() => {
    this.auth.account();
    this.server.baseUrl();
    this.version();
    try {
      return JSON.parse(localStorage.getItem(KEY + accountScopeSuffix()) ?? '[]');
    } catch {
      return [];
    }
  });
  scope(): string {
    return accountScopeSuffix();
  }
  record(report: Omit<SubmittedReport, 'at'>, scope: string): void {
    try {
      const key = KEY + scope;
      const previous = JSON.parse(localStorage.getItem(key) ?? '[]') as SubmittedReport[];
      localStorage.setItem(
        key,
        JSON.stringify([{ ...report, at: new Date().toISOString() }, ...previous].slice(0, 200)),
      );
      this.version.update((v) => v + 1);
    } catch {
      /* A receipt-storage failure must never resubmit a report. */
    }
  }
}
// i18n reportHistory.title: My reports
// i18n reportHistory.help: About report history
// i18n reportHistory.explanation: Reports successfully submitted through this app in this browser are listed here. Mastodon's API cannot retrieve older reports or their moderation outcomes. Report comments are not stored here.
// i18n reportHistory.empty: No reports saved for this account yet.
// i18n reportHistory.post: Reported post
// i18n reportHistory.account: Reported account
@Component({
  selector: 'app-report-history',
  imports: [DatePipe, RouterLink, TranslocoPipe, MbHelp],
  template: `
    <section class="ssection">
      <h2>
        {{ 'reportHistory.title' | transloco }}
        <mb-help [label]="'reportHistory.help' | transloco">{{
          'reportHistory.explanation' | transloco
        }}</mb-help>
      </h2>
      @for (report of history.entries(); track $index) {
        <p>
          {{ report.at | date: 'medium' }} · {{ report.username }} · {{ report.category }}
          @if (report.statusId) {
            <a [routerLink]="['/statuses', report.statusId]">{{
              'reportHistory.post' | transloco
            }}</a>
          } @else if (report.profilePath) {
            <a [routerLink]="report.profilePath">{{ 'reportHistory.account' | transloco }}</a>
          } @else {
            {{ 'reportHistory.account' | transloco }}
          }
        </p>
      } @empty {
        <p>{{ 'reportHistory.empty' | transloco }}</p>
      }
    </section>
  `,
})
export class ReportHistory {
  protected history = inject(SubmittedReports);
}
