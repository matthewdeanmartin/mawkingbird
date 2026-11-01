import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { ContactsWorkbench } from './contacts-workbench';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';

/**
 * "Find my contacts on Mastodon" as a focused mini-app: the contacts finder from
 * Settings → Import/Export, behind a Mastodon sign-in.
 *
 * The finder also works anonymously in Settings, but this page signs in first
 * like the other tools (owner decision, sprint/seo-tools-2026-10-30.md), so a
 * match followed here is a real follow on the visitor's account.
 */
@Component({
  selector: 'app-find-contacts-on-mastodon',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ContactsWorkbench],
  templateUrl: './find-contacts-on-mastodon.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class FindContactsOnMastodon {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/find-contacts-on-mastodon' };
}

/**
 * The German page (focused-tools.json `lang: "de"`): the same tool and logic,
 * German words, and everything translated inside it pinned to German (see
 * page-language.ts).
 */
@Component({
  selector: 'app-find-contacts-on-mastodon-de',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ContactsWorkbench],
  templateUrl: './find-contacts-on-mastodon.de.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FindContactsOnMastodonDe extends FindContactsOnMastodon {
  protected override readonly returnHere = { next: '/de/kontakte-auf-mastodon-finden' };
}

/**
 * The Japanese page (focused-tools.json `lang: "ja"`): the same tool and
 * logic, Japanese words, and everything translated inside it pinned to
 * Japanese (see page-language.ts).
 */
@Component({
  selector: 'app-find-contacts-on-mastodon-ja',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ContactsWorkbench],
  templateUrl: './find-contacts-on-mastodon.ja.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FindContactsOnMastodonJa extends FindContactsOnMastodon {
  protected override readonly returnHere = { next: '/ja/find-contacts-on-mastodon' };
}
