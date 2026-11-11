import { Component, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AdminApi, AdminCohort, AdminDimension } from '../admin-api';
import { AdminMeasure } from '../../platform/api/models';

// i18n adminMetrics.intro: Server statistics over the last 30 days (the mock returns zero-valued measures).
// i18n adminMetrics.loading: Loading…
// i18n adminMetrics.empty: No measures.
// i18n adminMetrics.dimensions: Breakdowns, last 30 days
// i18n adminMetrics.dimension.languages: Languages posted in
// i18n adminMetrics.dimension.sources: Where sign-ups came from
// i18n adminMetrics.dimension.servers: Busiest other servers
// i18n adminMetrics.dimension.software_versions: Software
// i18n adminMetrics.dimension.space_usage: Storage
// i18n adminMetrics.dimensionEmpty: Nothing recorded.
// i18n adminMetrics.retention: Retention
// i18n adminMetrics.retentionIntro: Each row is the people who signed up that day, and the share of them still active after one day, a week and now.
// i18n adminMetrics.retentionEmpty: No sign-ups in the last 30 days.
// i18n adminMetrics.cohort: Signed up
// i18n adminMetrics.cohortSize: People
// i18n adminMetrics.after1: After 1 day
// i18n adminMetrics.after7: After 7 days
// i18n adminMetrics.latest: Latest

// The measure keys Mastodon's admin dashboard requests.
const MEASURE_KEYS = [
  'active_users',
  'new_users',
  'interactions',
  'opened_reports',
  'resolved_reports',
];

/** The breakdowns Mastodon's own dashboard shows. */
const DIMENSION_KEYS = ['languages', 'sources', 'servers', 'software_versions', 'space_usage'];

/** One retention row, ready to display. */
interface CohortRow {
  period: string;
  size: string;
  after1: number | null;
  after7: number | null;
  latest: number | null;
}

/** Turn a cohort's daily data into the four numbers the table shows. */
export function cohortRow(cohort: AdminCohort): CohortRow {
  const rate = (i: number) => (cohort.data[i] ? cohort.data[i].rate : null);
  return {
    period: cohort.period,
    size: cohort.data[0]?.value ?? '0',
    after1: rate(1),
    after7: rate(7),
    latest: cohort.data.length > 1 ? rate(cohort.data.length - 1) : null,
  };
}

@Component({
  selector: 'app-admin-metrics',
  imports: [TranslocoPipe],
  templateUrl: './admin-metrics.html',
  styleUrl: './admin-lists.css',
})
export class AdminMetrics implements OnInit {
  private api = inject(AdminApi);

  protected measures = signal<AdminMeasure[]>([]);
  protected loading = signal(true);
  protected dimensions = signal<AdminDimension[]>([]);
  protected cohorts = signal<CohortRow[] | null>(null);

  ngOnInit(): void {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 3600 * 1000);
    const [from, to] = [start.toISOString(), end.toISOString()];
    this.api.measures(MEASURE_KEYS, from, to).subscribe({
      next: (m) => {
        this.measures.set(m);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    // Each section stands alone: a role or server without it just shows less.
    this.api.dimensions(DIMENSION_KEYS, from, to).subscribe({
      next: (d) => this.dimensions.set(d ?? []),
      error: () => this.dimensions.set([]),
    });
    this.api.retention(from, to, 'day').subscribe({
      next: (c) => this.cohorts.set((c ?? []).map(cohortRow).reverse()),
      error: () => this.cohorts.set(null),
    });
  }

  protected percent(rate: number | null): string {
    return rate === null ? '—' : `${Math.round(rate * 100)}%`;
  }
}
