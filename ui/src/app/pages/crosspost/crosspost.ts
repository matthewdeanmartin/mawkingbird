import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { CrosspostWorkbench } from './crosspost-workbench';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';

/**
 * The Mastodon + Bluesky crossposter as a focused mini-app.
 *
 * Signed out, a public page that offers sign-in with either network. Signed in
 * with either, the shell's trimmed nav around a small composer and a way to
 * connect the other network. The workbench is deferred and only exists signed
 * in, so prerendering touches no session or account.
 */
@Component({
  selector: 'app-crosspost',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, CrosspostWorkbench],
  templateUrl: './crosspost.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class Crosspost {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/crosspost' };
}

/**
 * The German page (focused-tools.json `lang: "de"`): the same tool and logic,
 * German words, and everything translated inside it pinned to German (see
 * page-language.ts).
 */
@Component({
  selector: 'app-crosspost-de',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, CrosspostWorkbench],
  templateUrl: './crosspost.de.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostDe extends Crosspost {
  protected override readonly returnHere = { next: '/de/mastodon-und-bluesky-gleichzeitig-posten' };
}
