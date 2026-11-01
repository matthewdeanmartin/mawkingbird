import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { MastodonAnalyticsPanel } from './mastodon-analytics-panel';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';

/**
 * Mastodon account analytics as a focused mini-app.
 *
 * Signed out, a public page that says what you will see; signed in with
 * Mastodon, the shell's trimmed nav around the analytics themselves. The panel
 * is deferred and only exists signed in, so prerendering touches no account.
 */
@Component({
  selector: 'app-mastodon-analytics',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, MastodonAnalyticsPanel],
  templateUrl: './mastodon-analytics.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class MastodonAnalytics {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/mastodon-analytics' };
}

/**
 * The German page (focused-tools.json `lang: "de"`): the same tool and logic,
 * German words, and everything translated inside it pinned to German (see
 * page-language.ts).
 */
@Component({
  selector: 'app-mastodon-analytics-de',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, MastodonAnalyticsPanel],
  templateUrl: './mastodon-analytics.de.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonAnalyticsDe extends MastodonAnalytics {
  protected override readonly returnHere = { next: '/de/mastodon-statistik' };
}

/**
 * The Japanese page (focused-tools.json `lang: "ja"`): the same tool and
 * logic, Japanese words, and everything translated inside it pinned to
 * Japanese (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-analytics-ja',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, MastodonAnalyticsPanel],
  templateUrl: './mastodon-analytics.ja.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonAnalyticsJa extends MastodonAnalytics {
  protected override readonly returnHere = { next: '/ja/mastodon-analytics' };
}
