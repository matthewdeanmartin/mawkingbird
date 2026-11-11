import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { CrosspostWorkbench } from './crosspost-workbench';
import { provideRouteLanguage } from '../../i18n/page-language';
import { LanguageVersions } from '../../public-pages/focused-apps/language-versions';
import { AppOnlyLinkRel } from '../../public-pages/public-page-urls';

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
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    CrosspostWorkbench,
  ],
  templateUrl: './crosspost.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
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
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    CrosspostWorkbench,
  ],
  templateUrl: './crosspost.de.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostDe extends Crosspost {
  protected override readonly returnHere = { next: '/de/mastodon-und-bluesky-gleichzeitig-posten' };
}

/**
 * The Japanese page (focused-tools.json `lang: "ja"`): the same tool and
 * logic, Japanese words, and everything translated inside it pinned to
 * Japanese (see page-language.ts).
 */
@Component({
  selector: 'app-crosspost-ja',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    CrosspostWorkbench,
  ],
  templateUrl: './crosspost.ja.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostJa extends Crosspost {
  protected override readonly returnHere = { next: '/ja/crosspost' };
}

/**
 * The French page (focused-tools.json `lang: "fr"`): the same tool and
 * logic, French words, and everything translated inside it pinned to
 * French (see page-language.ts).
 */
@Component({
  selector: 'app-crosspost-fr',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    CrosspostWorkbench,
  ],
  templateUrl: './crosspost.fr.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostFr extends Crosspost {
  protected override readonly returnHere = { next: '/fr/publier-sur-mastodon-et-bluesky' };
}

/**
 * The Spanish page (focused-tools.json `lang: "es"`): the same tool and
 * logic, Spanish words, and everything translated inside it pinned to
 * Spanish (see page-language.ts).
 */
@Component({
  selector: 'app-crosspost-es',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    CrosspostWorkbench,
  ],
  templateUrl: './crosspost.es.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostEs extends Crosspost {
  protected override readonly returnHere = { next: '/es/publicar-en-mastodon-y-bluesky' };
}

/**
 * The Traditional Chinese page (focused-tools.json `lang: "zh-Hant"`): the same tool and
 * logic, Traditional Chinese words, and everything translated inside it pinned to
 * Traditional Chinese (see page-language.ts).
 */
@Component({
  selector: 'app-crosspost-zh-hant',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    CrosspostWorkbench,
  ],
  templateUrl: './crosspost.zh-hant.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostZhHant extends Crosspost {
  protected override readonly returnHere = { next: '/zh-hant/crosspost' };
}

/**
 * The Korean page (focused-tools.json `lang: "ko"`): the same tool and
 * logic, Korean words, and everything translated inside it pinned to
 * Korean (see page-language.ts).
 */
@Component({
  selector: 'app-crosspost-ko',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    CrosspostWorkbench,
  ],
  templateUrl: './crosspost.ko.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostKo extends Crosspost {
  protected override readonly returnHere = { next: '/ko/crosspost' };
}

/**
 * The Portuguese (Brazil) page (focused-tools.json `lang: "pt"`): the same tool and
 * logic, Portuguese (Brazil) words, and everything translated inside it pinned to
 * Portuguese (Brazil) (see page-language.ts).
 */
@Component({
  selector: 'app-crosspost-pt',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    CrosspostWorkbench,
  ],
  templateUrl: './crosspost.pt.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostPt extends Crosspost {
  protected override readonly returnHere = { next: '/pt/publicar-no-mastodon-e-no-bluesky' };
}

/**
 * The Italian page (focused-tools.json `lang: "it"`): the same tool and
 * logic, Italian words, and everything translated inside it pinned to
 * Italian (see page-language.ts).
 */
@Component({
  selector: 'app-crosspost-it',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    CrosspostWorkbench,
  ],
  templateUrl: './crosspost.it.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostIt extends Crosspost {
  protected override readonly returnHere = { next: '/it/pubblicare-su-mastodon-e-bluesky' };
}

/**
 * The Polish page (focused-tools.json `lang: "pl"`): the same tool and
 * logic, Polish words, and everything translated inside it pinned to
 * Polish (see page-language.ts).
 */
@Component({
  selector: 'app-crosspost-pl',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    CrosspostWorkbench,
  ],
  templateUrl: './crosspost.pl.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostPl extends Crosspost {
  protected override readonly returnHere = { next: '/pl/publikuj-na-mastodonie-i-bluesky' };
}

/** Ukrainian public page, with embedded tools pinned to the route language. */
@Component({
  selector: 'app-crosspost-uk',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    CrosspostWorkbench,
  ],
  templateUrl: './crosspost.uk.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostUk extends Crosspost {
  protected override readonly returnHere = { next: '/uk/crosspost' };
}

/** Hindi public page; embedded tools use the route language. */
@Component({
  selector: 'app-crosspost-hi',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    CrosspostWorkbench,
  ],
  templateUrl: './crosspost.hi.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostHi extends Crosspost {
  protected override readonly returnHere = { next: '/hi/crosspost' };
}

/** Dutch public page; embedded tools use the route language. */
@Component({
  selector: 'app-crosspost-nl',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    CrosspostWorkbench,
  ],
  templateUrl: './crosspost.nl.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostNl extends Crosspost {
  protected override readonly returnHere = { next: '/nl/mastodon-en-bluesky-tegelijk' };
}

/** Indonesian public page; embedded tools use the route language. */
@Component({
  selector: 'app-crosspost-id',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    CrosspostWorkbench,
  ],
  templateUrl: './crosspost.id.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostId extends Crosspost {
  protected override readonly returnHere = { next: '/id/posting-mastodon-dan-bluesky' };
}

/** Russian public page; embedded tools use the route language. */
@Component({
  selector: 'app-crosspost-ru',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    CrosspostWorkbench,
  ],
  templateUrl: './crosspost.ru.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostRu extends Crosspost {
  protected override readonly returnHere = { next: '/ru/crosspost' };
}

/** Swedish public page; embedded tools use the route language. */
@Component({
  selector: 'app-crosspost-sv',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    CrosspostWorkbench,
  ],
  templateUrl: './crosspost.sv.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostSv extends Crosspost {
  protected override readonly returnHere = { next: '/sv/posta-pa-mastodon-och-bluesky' };
}

/** Vietnamese public page; embedded tools use the route language. */
@Component({
  selector: 'app-crosspost-vi',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    CrosspostWorkbench,
  ],
  templateUrl: './crosspost.vi.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostVi extends Crosspost {
  protected override readonly returnHere = { next: '/vi/crosspost' };
}

/** Turkish public page; embedded tools use the route language. */
@Component({
  selector: 'app-crosspost-tr',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    CrosspostWorkbench,
  ],
  templateUrl: './crosspost.tr.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostTr extends Crosspost {
  protected override readonly returnHere = { next: '/tr/mastodon-bluesky-ortak-paylasim' };
}
