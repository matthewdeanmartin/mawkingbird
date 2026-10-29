import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { MastodonAnalyticsPanel } from './mastodon-analytics-panel';

/**
 * Mastodon account analytics as a focused mini-app.
 *
 * Signed out, a public page that says what you will see; signed in with
 * Mastodon, the shell's trimmed nav around the analytics themselves. The panel
 * is deferred and only exists signed in, so prerendering touches no account.
 */
@Component({
  selector: 'app-mastodon-analytics',
  imports: [RouterLink, MbButton, MbContentLink, MastodonAnalyticsPanel],
  templateUrl: './mastodon-analytics.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class MastodonAnalytics {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/mastodon-analytics' };
}
