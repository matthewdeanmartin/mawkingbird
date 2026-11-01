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

/**
 * The French page (focused-tools.json `lang: "fr"`): the same tool and
 * logic, French words, and everything translated inside it pinned to
 * French (see page-language.ts).
 */
@Component({
  selector: 'app-find-contacts-on-mastodon-fr',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ContactsWorkbench],
  templateUrl: './find-contacts-on-mastodon.fr.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FindContactsOnMastodonFr extends FindContactsOnMastodon {
  protected override readonly returnHere = { next: '/fr/trouver-ses-contacts-sur-mastodon' };
}

/**
 * The Spanish page (focused-tools.json `lang: "es"`): the same tool and
 * logic, Spanish words, and everything translated inside it pinned to
 * Spanish (see page-language.ts).
 */
@Component({
  selector: 'app-find-contacts-on-mastodon-es',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ContactsWorkbench],
  templateUrl: './find-contacts-on-mastodon.es.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FindContactsOnMastodonEs extends FindContactsOnMastodon {
  protected override readonly returnHere = { next: '/es/encontrar-tus-contactos-en-mastodon' };
}

/**
 * The Traditional Chinese page (focused-tools.json `lang: "zh-Hant"`): the same tool and
 * logic, Traditional Chinese words, and everything translated inside it pinned to
 * Traditional Chinese (see page-language.ts).
 */
@Component({
  selector: 'app-find-contacts-on-mastodon-zh-hant',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ContactsWorkbench],
  templateUrl: './find-contacts-on-mastodon.zh-hant.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FindContactsOnMastodonZhHant extends FindContactsOnMastodon {
  protected override readonly returnHere = { next: '/zh-hant/find-contacts-on-mastodon' };
}

/**
 * The Korean page (focused-tools.json `lang: "ko"`): the same tool and
 * logic, Korean words, and everything translated inside it pinned to
 * Korean (see page-language.ts).
 */
@Component({
  selector: 'app-find-contacts-on-mastodon-ko',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ContactsWorkbench],
  templateUrl: './find-contacts-on-mastodon.ko.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FindContactsOnMastodonKo extends FindContactsOnMastodon {
  protected override readonly returnHere = { next: '/ko/find-contacts-on-mastodon' };
}

/**
 * The Portuguese (Brazil) page (focused-tools.json `lang: "pt"`): the same tool and
 * logic, Portuguese (Brazil) words, and everything translated inside it pinned to
 * Portuguese (Brazil) (see page-language.ts).
 */
@Component({
  selector: 'app-find-contacts-on-mastodon-pt',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ContactsWorkbench],
  templateUrl: './find-contacts-on-mastodon.pt.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FindContactsOnMastodonPt extends FindContactsOnMastodon {
  protected override readonly returnHere = { next: '/pt/encontrar-contatos-no-mastodon' };
}

/**
 * The Italian page (focused-tools.json `lang: "it"`): the same tool and
 * logic, Italian words, and everything translated inside it pinned to
 * Italian (see page-language.ts).
 */
@Component({
  selector: 'app-find-contacts-on-mastodon-it',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ContactsWorkbench],
  templateUrl: './find-contacts-on-mastodon.it.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FindContactsOnMastodonIt extends FindContactsOnMastodon {
  protected override readonly returnHere = { next: '/it/trovare-i-contatti-su-mastodon' };
}
