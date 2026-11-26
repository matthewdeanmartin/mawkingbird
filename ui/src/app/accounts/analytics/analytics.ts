import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Auth } from '../../platform/session/auth';
import { AccountAnalytics } from '../account-analytics/account-analytics';

// i18n analytics.title: Analytics
// i18n analytics.login: Log in to see your analytics.

/**
 * The standalone /analytics page: analytics for the logged-in account. The
 * actual crunching lives in the reusable {@link AccountAnalytics} component,
 * which the profile page also embeds behind a tab for any account.
 */
@Component({
  selector: 'app-analytics',
  imports: [AccountAnalytics, TranslocoPipe],
  templateUrl: './analytics.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './analytics.css',
})
export class Analytics {
  private auth = inject(Auth);
  protected me = computed(() => this.auth.account());
}
