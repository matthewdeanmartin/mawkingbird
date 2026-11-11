import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { AmnestyWorkbench } from './amnesty-workbench';
import { provideRouteLanguage } from '../../i18n/page-language';
import { LanguageVersions } from '../../public-pages/focused-apps/language-versions';
import { AppOnlyLinkRel } from '../../public-pages/public-page-urls';

/**
 * Mute Amnesty and Block Amnesty as a focused mini-app: unmute or unblock
 * everyone on Mastodon at once, which Mastodon itself only does one account at
 * a time. The workbench is deferred and only exists signed in.
 */
@Component({
  selector: 'app-mastodon-mute-block-amnesty',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    AmnestyWorkbench,
  ],
  templateUrl: './mastodon-mute-block-amnesty.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
})
export class MastodonMuteBlockAmnesty {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/mastodon-mute-block-amnesty' };
}

/**
 * The German page (focused-tools.json `lang: "de"`): the same tool and logic,
 * German words, and everything translated inside it pinned to German (see
 * page-language.ts).
 */
@Component({
  selector: 'app-mastodon-mute-block-amnesty-de',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    AmnestyWorkbench,
  ],
  templateUrl: './mastodon-mute-block-amnesty.de.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonMuteBlockAmnestyDe extends MastodonMuteBlockAmnesty {
  protected override readonly returnHere = { next: '/de/mastodon-stummschaltungen-aufheben' };
}

/**
 * The Japanese page (focused-tools.json `lang: "ja"`): the same tool and
 * logic, Japanese words, and everything translated inside it pinned to
 * Japanese (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-mute-block-amnesty-ja',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    AmnestyWorkbench,
  ],
  templateUrl: './mastodon-mute-block-amnesty.ja.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonMuteBlockAmnestyJa extends MastodonMuteBlockAmnesty {
  protected override readonly returnHere = { next: '/ja/mastodon-mute-block-amnesty' };
}

/**
 * The French page (focused-tools.json `lang: "fr"`): the same tool and
 * logic, French words, and everything translated inside it pinned to
 * French (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-mute-block-amnesty-fr',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    AmnestyWorkbench,
  ],
  templateUrl: './mastodon-mute-block-amnesty.fr.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonMuteBlockAmnestyFr extends MastodonMuteBlockAmnesty {
  protected override readonly returnHere = { next: '/fr/demasquer-et-debloquer-sur-mastodon' };
}

/**
 * The Spanish page (focused-tools.json `lang: "es"`): the same tool and
 * logic, Spanish words, and everything translated inside it pinned to
 * Spanish (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-mute-block-amnesty-es',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    AmnestyWorkbench,
  ],
  templateUrl: './mastodon-mute-block-amnesty.es.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonMuteBlockAmnestyEs extends MastodonMuteBlockAmnesty {
  protected override readonly returnHere = {
    next: '/es/dejar-de-silenciar-y-desbloquear-en-mastodon',
  };
}

/**
 * The Traditional Chinese page (focused-tools.json `lang: "zh-Hant"`): the same tool and
 * logic, Traditional Chinese words, and everything translated inside it pinned to
 * Traditional Chinese (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-mute-block-amnesty-zh-hant',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    AmnestyWorkbench,
  ],
  templateUrl: './mastodon-mute-block-amnesty.zh-hant.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonMuteBlockAmnestyZhHant extends MastodonMuteBlockAmnesty {
  protected override readonly returnHere = { next: '/zh-hant/mastodon-mute-block-amnesty' };
}

/**
 * The Korean page (focused-tools.json `lang: "ko"`): the same tool and
 * logic, Korean words, and everything translated inside it pinned to
 * Korean (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-mute-block-amnesty-ko',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    AmnestyWorkbench,
  ],
  templateUrl: './mastodon-mute-block-amnesty.ko.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonMuteBlockAmnestyKo extends MastodonMuteBlockAmnesty {
  protected override readonly returnHere = { next: '/ko/mastodon-mute-block-amnesty' };
}

/**
 * The Portuguese (Brazil) page (focused-tools.json `lang: "pt"`): the same tool and
 * logic, Portuguese (Brazil) words, and everything translated inside it pinned to
 * Portuguese (Brazil) (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-mute-block-amnesty-pt',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    AmnestyWorkbench,
  ],
  templateUrl: './mastodon-mute-block-amnesty.pt.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonMuteBlockAmnestyPt extends MastodonMuteBlockAmnesty {
  protected override readonly returnHere = { next: '/pt/dessilenciar-e-desbloquear-no-mastodon' };
}

/**
 * The Italian page (focused-tools.json `lang: "it"`): the same tool and
 * logic, Italian words, and everything translated inside it pinned to
 * Italian (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-mute-block-amnesty-it',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    AmnestyWorkbench,
  ],
  templateUrl: './mastodon-mute-block-amnesty.it.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonMuteBlockAmnestyIt extends MastodonMuteBlockAmnesty {
  protected override readonly returnHere = { next: '/it/riattivare-e-sbloccare-tutti-su-mastodon' };
}

/**
 * The Polish page (focused-tools.json `lang: "pl"`): the same tool and
 * logic, Polish words, and everything translated inside it pinned to
 * Polish (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-mute-block-amnesty-pl',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    AmnestyWorkbench,
  ],
  templateUrl: './mastodon-mute-block-amnesty.pl.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonMuteBlockAmnestyPl extends MastodonMuteBlockAmnesty {
  protected override readonly returnHere = {
    next: '/pl/odcisz-i-odblokuj-wszystkich-na-mastodonie',
  };
}

/** Ukrainian public page, with embedded tools pinned to the route language. */
@Component({
  selector: 'app-mastodon-mute-block-amnesty-uk',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    AmnestyWorkbench,
  ],
  templateUrl: './mastodon-mute-block-amnesty.uk.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonMuteBlockAmnestyUk extends MastodonMuteBlockAmnesty {
  protected override readonly returnHere = {
    next: '/uk/mastodon-mute-block-amnesty',
  };
}

/** Hindi public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-mute-block-amnesty-hi',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    AmnestyWorkbench,
  ],
  templateUrl: './mastodon-mute-block-amnesty.hi.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonMuteBlockAmnestyHi extends MastodonMuteBlockAmnesty {
  protected override readonly returnHere = {
    next: '/hi/mastodon-mute-block-amnesty',
  };
}

/** Dutch public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-mute-block-amnesty-nl',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    AmnestyWorkbench,
  ],
  templateUrl: './mastodon-mute-block-amnesty.nl.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonMuteBlockAmnestyNl extends MastodonMuteBlockAmnesty {
  protected override readonly returnHere = {
    next: '/nl/mastodon-dempen-blokkeren-opheffen',
  };
}

/** Indonesian public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-mute-block-amnesty-id',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    AmnestyWorkbench,
  ],
  templateUrl: './mastodon-mute-block-amnesty.id.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonMuteBlockAmnestyId extends MastodonMuteBlockAmnesty {
  protected override readonly returnHere = {
    next: '/id/cabut-pembisuan-dan-blokir-mastodon',
  };
}

/** Russian public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-mute-block-amnesty-ru',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    AmnestyWorkbench,
  ],
  templateUrl: './mastodon-mute-block-amnesty.ru.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonMuteBlockAmnestyRu extends MastodonMuteBlockAmnesty {
  protected override readonly returnHere = {
    next: '/ru/mastodon-mute-block-amnesty',
  };
}

/** Swedish public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-mute-block-amnesty-sv',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    AmnestyWorkbench,
  ],
  templateUrl: './mastodon-mute-block-amnesty.sv.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonMuteBlockAmnestySv extends MastodonMuteBlockAmnesty {
  protected override readonly returnHere = {
    next: '/sv/mastodon-avtysta-avblockera',
  };
}

/** Vietnamese public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-mute-block-amnesty-vi',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    AmnestyWorkbench,
  ],
  templateUrl: './mastodon-mute-block-amnesty.vi.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonMuteBlockAmnestyVi extends MastodonMuteBlockAmnesty {
  protected override readonly returnHere = {
    next: '/vi/mastodon-mute-block-amnesty',
  };
}

/** Turkish public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-mute-block-amnesty-tr',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    AmnestyWorkbench,
  ],
  templateUrl: './mastodon-mute-block-amnesty.tr.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonMuteBlockAmnestyTr extends MastodonMuteBlockAmnesty {
  protected override readonly returnHere = {
    next: '/tr/mastodon-ses-ac-engel-kaldir',
  };
}
