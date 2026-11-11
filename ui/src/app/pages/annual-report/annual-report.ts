import { NgOptimizedImage } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { accountProfilePath } from '../../account-route';
import { Api } from '../../api';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbNotice } from '../../design-system/notice/notice';
import { MbPageHeader, MbSection } from '../../design-system/page-header/page-header';
import { AnnualReport, AnnualReports, AnnualReportState } from '../../models';
import { describeHttpError } from '../../page-diagnostics';
import { StatusCard } from '../../status-card/status-card';
import { reportSections } from './annual-report-sections';

// i18n annualReport.title: Annual report
// i18n annualReport.yearTitle: Your {{year}} on your server
// i18n annualReport.intro: Year-in-review reports your Mastodon server made for you. Only you can see them unless you share them.
// i18n annualReport.loading: Loading…
// i18n annualReport.none: Your server has no annual reports for you yet.
// i18n annualReport.unsupported: Your server doesn't offer annual reports.
// i18n annualReport.missing: There is no {{year}} report for you on your server.
// i18n annualReport.failed: Could not load the report. {{detail}}
// i18n annualReport.reports: Your reports
// i18n annualReport.thisYear: {{year}}
// i18n annualReport.state.eligible: You can ask your server to make your {{year}} report.
// i18n annualReport.state.generating: Your server is making your {{year}} report. Check back in a little while.
// i18n annualReport.state.ineligible: Your server can't make a {{year}} report for you (usually there isn't enough activity yet).
// i18n annualReport.generate: Make my {{year}} report
// i18n annualReport.refresh: Check again
// i18n annualReport.generateFailed: Could not ask for the report. {{detail}}
// i18n annualReport.share: Share link
// i18n annualReport.allReports: ← All reports
// i18n annualReport.unknownAccount: An account that is no longer available

/**
 * The server-provided annual report ("Wrapstodon", Mastodon 4.3+). Without a
 * year it lists your reports and, on 4.6+, offers to generate this year's;
 * with a year it shows that report. Separate from the client-side Year in Posts.
 */
@Component({
  selector: 'app-annual-report',
  imports: [
    MbPageHeader,
    MbSection,
    MbContentState,
    MbNotice,
    MbButton,
    RouterLink,
    NgOptimizedImage,
    StatusCard,
    TranslocoPipe,
  ],
  templateUrl: './annual-report.html',
  styleUrl: './annual-report.css',
})
export class AnnualReportPage implements OnInit {
  private readonly api = inject(Api);
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);
  protected readonly accountProfilePath = accountProfilePath;

  protected readonly year = signal<number | null>(null);
  protected readonly loading = signal(true);
  protected readonly unsupported = signal(false);
  protected readonly error = signal('');
  protected readonly result = signal<AnnualReports | null>(null);
  /** This year's generation state on 4.6+; null when unknown or unsupported. */
  protected readonly state = signal<AnnualReportState | null>(null);
  protected readonly stateYear = new Date().getFullYear();
  protected readonly generating = signal(false);
  protected readonly generateError = signal('');

  protected readonly reports = computed<AnnualReport[]>(() =>
    [...(this.result()?.annual_reports ?? [])].sort((a, b) => b.year - a.year),
  );
  protected readonly report = computed(() => {
    const year = this.year();
    return year === null ? null : (this.reports().find((r) => r.year === year) ?? null);
  });
  protected readonly sections = computed(() => {
    const result = this.result();
    return reportSections(
      this.report()?.data,
      result?.accounts ?? [],
      result?.statuses ?? [],
      this.transloco.getActiveLang() || undefined,
    );
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const raw = params.get('year');
      const year = raw && /^\d{4}$/u.test(raw) ? Number(raw) : null;
      this.year.set(year);
      this.load(year);
    });
  }

  private load(year: number | null): void {
    this.loading.set(true);
    this.error.set('');
    this.unsupported.set(false);
    this.result.set(null);
    const request: Observable<AnnualReports> =
      year === null
        ? this.api.annualReports()
        : // 4.4+ has the per-year route; 4.3 only has the list.
          this.api
            .annualReport(year)
            .pipe(
              catchError((error: unknown) =>
                error instanceof HttpErrorResponse && error.status === 404
                  ? this.api.annualReports()
                  : throwError(() => error),
              ),
            );
    request.subscribe({
      next: (result) => {
        this.result.set(result);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        if (error instanceof HttpErrorResponse && error.status === 404) {
          this.unsupported.set(true);
        } else {
          this.error.set(
            this.transloco.translate('annualReport.failed', { detail: describeHttpError(error) }),
          );
        }
      },
    });
    if (year === null) this.loadState();
  }

  /** 4.6+ only; older servers 404 and the generate offer stays hidden. */
  protected loadState(): void {
    this.api
      .annualReportState(this.stateYear)
      .pipe(
        map((state): AnnualReportState | null => state),
        catchError(() => of(null)),
      )
      .subscribe((state) => this.state.set(state));
  }

  protected generate(): void {
    if (this.generating()) return;
    this.generating.set(true);
    this.generateError.set('');
    this.api.generateAnnualReport(this.stateYear).subscribe({
      next: () => {
        this.generating.set(false);
        this.state.set('generating');
      },
      error: (error: unknown) => {
        this.generating.set(false);
        this.generateError.set(
          this.transloco.translate('annualReport.generateFailed', {
            detail: describeHttpError(error),
          }),
        );
      },
    });
  }

  /** Re-check after generating: the report appears in the list once it is ready. */
  protected refresh(): void {
    this.load(this.year());
  }

  protected hasReportFor(year: number): boolean {
    return this.reports().some((r) => r.year === year);
  }
}
