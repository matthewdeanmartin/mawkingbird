import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { ContentWarningsWorkbench } from './content-warnings-workbench';
import { provideRouteLanguage } from '../../i18n/page-language';
import { LanguageVersions } from '../../public-pages/focused-apps/language-versions';
import { AppOnlyLinkRel } from '../../public-pages/public-page-urls';

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
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
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
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.de.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsDe extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/de/mastodon-inhaltswarnungen-ausschalten' };
}

/**
 * The Japanese page (focused-tools.json `lang: "ja"`): the same tool and
 * logic, Japanese words, and everything translated inside it pinned to
 * Japanese (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-content-warnings-ja',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.ja.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsJa extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/ja/turn-off-content-warnings-mastodon' };
}

/**
 * The French page (focused-tools.json `lang: "fr"`): the same tool and
 * logic, French words, and everything translated inside it pinned to
 * French (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-content-warnings-fr',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.fr.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsFr extends MastodonContentWarnings {
  protected override readonly returnHere = {
    next: '/fr/desactiver-avertissements-de-contenu-mastodon',
  };
}

/**
 * The Spanish page (focused-tools.json `lang: "es"`): the same tool and
 * logic, Spanish words, and everything translated inside it pinned to
 * Spanish (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-content-warnings-es',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.es.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsEs extends MastodonContentWarnings {
  protected override readonly returnHere = {
    next: '/es/desactivar-advertencias-de-contenido-mastodon',
  };
}

/**
 * The Traditional Chinese page (focused-tools.json `lang: "zh-Hant"`): the same tool and
 * logic, Traditional Chinese words, and everything translated inside it pinned to
 * Traditional Chinese (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-content-warnings-zh-hant',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.zh-hant.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsZhHant extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/zh-hant/turn-off-content-warnings-mastodon' };
}

/**
 * The Korean page (focused-tools.json `lang: "ko"`): the same tool and
 * logic, Korean words, and everything translated inside it pinned to
 * Korean (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-content-warnings-ko',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.ko.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsKo extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/ko/turn-off-content-warnings-mastodon' };
}

/**
 * The Portuguese (Brazil) page (focused-tools.json `lang: "pt"`): the same tool and
 * logic, Portuguese (Brazil) words, and everything translated inside it pinned to
 * Portuguese (Brazil) (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-content-warnings-pt',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.pt.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsPt extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/pt/desativar-avisos-de-conteudo-mastodon' };
}

/**
 * The Italian page (focused-tools.json `lang: "it"`): the same tool and
 * logic, Italian words, and everything translated inside it pinned to
 * Italian (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-content-warnings-it',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.it.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsIt extends MastodonContentWarnings {
  protected override readonly returnHere = {
    next: '/it/disattivare-avvisi-sul-contenuto-mastodon',
  };
}

/**
 * The Polish page (focused-tools.json `lang: "pl"`): the same tool and
 * logic, Polish words, and everything translated inside it pinned to
 * Polish (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-content-warnings-pl',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.pl.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsPl extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/pl/wylacz-ostrzezenia-o-tresci-mastodon' };
}

/** Ukrainian public page, with embedded tools pinned to the route language. */
@Component({
  selector: 'app-mastodon-content-warnings-uk',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.uk.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsUk extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/uk/turn-off-content-warnings-mastodon' };
}

/** Hindi public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-content-warnings-hi',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.hi.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsHi extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/hi/turn-off-content-warnings-mastodon' };
}

/** Dutch public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-content-warnings-nl',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.nl.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsNl extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/nl/inhoudswaarschuwingen-uitzetten-mastodon' };
}

/** Indonesian public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-content-warnings-id',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.id.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsId extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/id/nonaktifkan-peringatan-konten-mastodon' };
}

/** Russian public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-content-warnings-ru',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.ru.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsRu extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/ru/turn-off-content-warnings-mastodon' };
}

/** Swedish public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-content-warnings-sv',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.sv.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsSv extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/sv/stang-av-innehallsvarningar-mastodon' };
}

/** Vietnamese public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-content-warnings-vi',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.vi.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsVi extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/vi/turn-off-content-warnings-mastodon' };
}

/** Turkish public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-content-warnings-tr',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.tr.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsTr extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/tr/mastodon-icerik-uyarilarini-kapat' };
}
