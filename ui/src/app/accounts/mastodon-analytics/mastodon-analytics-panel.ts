import { Component, computed } from '@angular/core';
import { AnalyticsLookup } from './analytics-lookup';
import {
  FocusedNextSteps,
  NextStepCard,
  toolInviteLink,
} from '../../public-pages/focused-apps/focused-next-steps';
import { routeTranslate } from '../../i18n/page-language';

// i18n focusedTools.analytics.keepTitle: Keep these analytics
// i18n focusedTools.analytics.keepBody: Open them any time in Mawkingbird, and on the Analytics tab of any profile, yours included.

/** The signed-in body: your own analytics by default, or any public account's by handle. */
@Component({
  selector: 'app-mastodon-analytics-panel',
  imports: [AnalyticsLookup, FocusedNextSteps],
  template: `
    <app-analytics-lookup />
    <app-focused-next-steps [inviteLink]="invite" [lead]="keepUsing()" />
  `,
})
export class MastodonAnalyticsPanel {
  protected readonly invite = toolInviteLink();
  private keepTitle = routeTranslate('focusedTools.analytics.keepTitle');
  private keepBody = routeTranslate('focusedTools.analytics.keepBody');
  protected readonly keepUsing = computed<NextStepCard>(() => ({
    link: '/analytics',
    title: this.keepTitle(),
    body: this.keepBody(),
  }));
}
