import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { ContentWarningsWorkbench } from './content-warnings-workbench';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';

/**
 * "How to turn off content warnings on Mastodon" as a focused mini-app, at
 * /turn-off-content-warnings-mastodon.
 *
 * Signed out, the answer for the Mastodon website too, then sign-in. Signed in,
 * Mawkingbird's two switches on their own, the server's matching preferences
 * (read-only), and the per-person trust that Mastodon itself does not have.
 */
@Component({
  selector: 'app-mastodon-content-warnings',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ContentWarningsWorkbench],
  templateUrl: './mastodon-content-warnings.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class MastodonContentWarnings {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/turn-off-content-warnings-mastodon' };
}

/**
 * The German page (focused-tools.json `lang: "de"`): the same tool and logic,
 * German words, and everything translated inside it pinned to German (see
 * page-language.ts).
 */
@Component({
  selector: 'app-mastodon-content-warnings-de',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ContentWarningsWorkbench],
  templateUrl: './mastodon-content-warnings.de.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsDe extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/de/mastodon-inhaltswarnungen-ausschalten' };
}
