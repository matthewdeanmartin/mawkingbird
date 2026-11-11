import { Component, computed, inject } from '@angular/core';
import { AccountAnalytics } from '../account-analytics/account-analytics';
import { Auth } from '../../platform/session/auth';
import {
  FocusedNextSteps,
  NextStepCard,
  toolInviteLink,
} from '../../public-pages/focused-apps/focused-next-steps';
import { routeTranslate } from '../../i18n/page-language';

// i18n focusedTools.analytics.keepTitle: Keep these analytics
// i18n focusedTools.analytics.keepBody: Open them any time in Mawkingbird, and on the Analytics tab of any profile, yours included.

/** The signed-in body: the app's own account analytics for the signed-in account. */
@Component({
  selector: 'app-mastodon-analytics-panel',
  imports: [AccountAnalytics, FocusedNextSteps],
  template: `
    @if (me(); as account) {
      <app-account-analytics [account]="account" />
    }
    <app-focused-next-steps [inviteLink]="invite" [lead]="keepUsing()" />
  `,
})
export class MastodonAnalyticsPanel {
  private readonly auth = inject(Auth);
  protected readonly me = computed(() => this.auth.account());
  protected readonly invite = toolInviteLink();
  private keepTitle = routeTranslate('focusedTools.analytics.keepTitle');
  private keepBody = routeTranslate('focusedTools.analytics.keepBody');
  protected readonly keepUsing = computed<NextStepCard>(() => ({
    link: '/analytics',
    title: this.keepTitle(),
    body: this.keepBody(),
  }));
}
