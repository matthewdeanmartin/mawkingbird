import { Component, computed, inject } from '@angular/core';
import { AccountAnalytics } from '../../account-analytics/account-analytics';
import { Auth } from '../../auth';
import { FocusedNextSteps, NextStepCard } from '../focused-apps/focused-next-steps';

/** The signed-in body: the app's own account analytics for the signed-in account. */
@Component({
  selector: 'app-mastodon-analytics-panel',
  imports: [AccountAnalytics, FocusedNextSteps],
  template: `
    @if (me(); as account) {
      <app-account-analytics [account]="account" />
    }
    <app-focused-next-steps inviteLink="/mastodon-analytics/invite" [lead]="keepUsing" />
  `,
})
export class MastodonAnalyticsPanel {
  private readonly auth = inject(Auth);
  protected readonly me = computed(() => this.auth.account());
  protected readonly keepUsing: NextStepCard = {
    link: '/analytics',
    title: 'Keep these analytics',
    body: 'Open them any time in Mawkingbird, and on the Analytics tab of any profile, yours included.',
  };
}
