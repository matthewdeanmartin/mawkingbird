import { Component, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AdminApi } from '../admin-api';
import { AdminMeasure } from '../../models';

// i18n adminMetrics.intro: Server statistics over the last 30 days (the mock returns zero-valued measures).
// i18n adminMetrics.loading: Loading…
// i18n adminMetrics.empty: No measures.

// The measure keys Mastodon's admin dashboard requests.
const MEASURE_KEYS = [
  'active_users',
  'new_users',
  'interactions',
  'opened_reports',
  'resolved_reports',
];

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

  ngOnInit(): void {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 3600 * 1000);
    this.api.measures(MEASURE_KEYS, start.toISOString(), end.toISOString()).subscribe({
      next: (m) => {
        this.measures.set(m);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
