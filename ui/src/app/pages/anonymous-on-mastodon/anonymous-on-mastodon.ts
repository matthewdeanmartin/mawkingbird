import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { PseudonymityWorkbench } from './pseudonymity-workbench';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';

/**
 * "How to be (pseudo)anonymous on Mastodon" as a focused mini-app.
 *
 * Signed out, a guide: what pseudonymity can and cannot do on Mastodon. Signed
 * in, the account's own server settings flipped towards pseudonymity in one
 * step, the things only the person can change, and then Mawkingbird's
 * browser-side pseudonymity mode. The workbench is deferred and signed-in only.
 */
@Component({
  selector: 'app-anonymous-on-mastodon',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, PseudonymityWorkbench],
  templateUrl: './anonymous-on-mastodon.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class AnonymousOnMastodon {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/how-to-be-anonymous-on-mastodon' };
}

/**
 * The German page (focused-tools.json `lang: "de"`): the same tool and logic,
 * German words, and everything translated inside it pinned to German (see
 * page-language.ts).
 */
@Component({
  selector: 'app-anonymous-on-mastodon-de',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, PseudonymityWorkbench],
  templateUrl: './anonymous-on-mastodon.de.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class AnonymousOnMastodonDe extends AnonymousOnMastodon {
  protected override readonly returnHere = { next: '/de/anonym-auf-mastodon' };
}

/**
 * The Japanese page (focused-tools.json `lang: "ja"`): the same tool and
 * logic, Japanese words, and everything translated inside it pinned to
 * Japanese (see page-language.ts).
 */
@Component({
  selector: 'app-anonymous-on-mastodon-ja',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, PseudonymityWorkbench],
  templateUrl: './anonymous-on-mastodon.ja.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class AnonymousOnMastodonJa extends AnonymousOnMastodon {
  protected override readonly returnHere = { next: '/ja/how-to-be-anonymous-on-mastodon' };
}

/**
 * The French page (focused-tools.json `lang: "fr"`): the same tool and
 * logic, French words, and everything translated inside it pinned to
 * French (see page-language.ts).
 */
@Component({
  selector: 'app-anonymous-on-mastodon-fr',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, PseudonymityWorkbench],
  templateUrl: './anonymous-on-mastodon.fr.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class AnonymousOnMastodonFr extends AnonymousOnMastodon {
  protected override readonly returnHere = { next: '/fr/anonyme-sur-mastodon' };
}

/**
 * The Spanish page (focused-tools.json `lang: "es"`): the same tool and
 * logic, Spanish words, and everything translated inside it pinned to
 * Spanish (see page-language.ts).
 */
@Component({
  selector: 'app-anonymous-on-mastodon-es',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, PseudonymityWorkbench],
  templateUrl: './anonymous-on-mastodon.es.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class AnonymousOnMastodonEs extends AnonymousOnMastodon {
  protected override readonly returnHere = { next: '/es/anonimo-en-mastodon' };
}

/**
 * The Traditional Chinese page (focused-tools.json `lang: "zh-Hant"`): the same tool and
 * logic, Traditional Chinese words, and everything translated inside it pinned to
 * Traditional Chinese (see page-language.ts).
 */
@Component({
  selector: 'app-anonymous-on-mastodon-zh-hant',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, PseudonymityWorkbench],
  templateUrl: './anonymous-on-mastodon.zh-hant.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class AnonymousOnMastodonZhHant extends AnonymousOnMastodon {
  protected override readonly returnHere = { next: '/zh-hant/how-to-be-anonymous-on-mastodon' };
}

/**
 * The Korean page (focused-tools.json `lang: "ko"`): the same tool and
 * logic, Korean words, and everything translated inside it pinned to
 * Korean (see page-language.ts).
 */
@Component({
  selector: 'app-anonymous-on-mastodon-ko',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, PseudonymityWorkbench],
  templateUrl: './anonymous-on-mastodon.ko.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class AnonymousOnMastodonKo extends AnonymousOnMastodon {
  protected override readonly returnHere = { next: '/ko/how-to-be-anonymous-on-mastodon' };
}

/**
 * The Portuguese (Brazil) page (focused-tools.json `lang: "pt"`): the same tool and
 * logic, Portuguese (Brazil) words, and everything translated inside it pinned to
 * Portuguese (Brazil) (see page-language.ts).
 */
@Component({
  selector: 'app-anonymous-on-mastodon-pt',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, PseudonymityWorkbench],
  templateUrl: './anonymous-on-mastodon.pt.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class AnonymousOnMastodonPt extends AnonymousOnMastodon {
  protected override readonly returnHere = { next: '/pt/anonimo-no-mastodon' };
}

/**
 * The Italian page (focused-tools.json `lang: "it"`): the same tool and
 * logic, Italian words, and everything translated inside it pinned to
 * Italian (see page-language.ts).
 */
@Component({
  selector: 'app-anonymous-on-mastodon-it',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, PseudonymityWorkbench],
  templateUrl: './anonymous-on-mastodon.it.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class AnonymousOnMastodonIt extends AnonymousOnMastodon {
  protected override readonly returnHere = { next: '/it/anonimo-su-mastodon' };
}

/**
 * The Polish page (focused-tools.json `lang: "pl"`): the same tool and
 * logic, Polish words, and everything translated inside it pinned to
 * Polish (see page-language.ts).
 */
@Component({
  selector: 'app-anonymous-on-mastodon-pl',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, PseudonymityWorkbench],
  templateUrl: './anonymous-on-mastodon.pl.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class AnonymousOnMastodonPl extends AnonymousOnMastodon {
  protected override readonly returnHere = { next: '/pl/anonimowo-na-mastodonie' };
}
