import { Component, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MbControl, MbField } from '../../design-system/field/field';
import { Auth } from '../../platform/session/auth';
import { Server } from '../../platform/http/server';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { ContentWarningsWorkbench } from './content-warnings-workbench';
import { provideRouteLanguage } from '../../i18n/page-language';
import { LanguageVersions } from '../../public-pages/focused-apps/language-versions';
import { OpenApp } from '../../public-pages/focused-apps/open-app';
import { AppOnlyLinkRel } from '../../public-pages/public-page-urls';

/**
 * "How to turn off content warnings on Mastodon" as a focused mini-app, at
 * /turn-off-content-warnings-mastodon.
 *
 * The Mastodon website guide and server link remain visible for every visitor.
 * Mawkingbird is an optional, explicitly client-only section below the answer.
 */
@Component({
  selector: 'app-mastodon-content-warnings',
  imports: [
    FormsModule,
    MbField,
    MbControl,
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    OpenApp,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.html',
  styleUrls: [
    '../../public-pages/focused-apps/focused-page.css',
    './mastodon-content-warnings.css',
  ],
})
export class MastodonContentWarnings {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/turn-off-content-warnings-mastodon' };
  private readonly auth = isPlatformBrowser(inject(PLATFORM_ID)) ? inject(Auth) : null;
  // Only a connected Mastodon account identifies the visitor's own server.
  // Anonymous browsing may have selected somebody else's public server.
  protected readonly serverInput = signal(
    this.auth && !this.auth.lacksMastodonToken && !this.auth.isAnonymous
      ? inject(Server).baseUrl()
      : '',
  );
  protected readonly preferencesUrl = computed(() => {
    let value = this.serverInput().trim();
    if (!value || /[\s\\]/.test(value)) return null;
    if (!value.includes('://') && value.includes('@')) {
      const handle = /^@?[^@/:]+@([^@/:]+)$/.exec(value);
      if (!handle) return null;
      value = handle[1];
    }
    try {
      const url = new URL(value.includes('://') ? value : `https://${value}`);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        !url.hostname.includes('.') ||
        url.search ||
        url.hash ||
        (url.pathname !== '/' && url.pathname !== '')
      )
        return null;
      return `${url.origin}/settings/preferences/appearance`;
    } catch {
      return null;
    }
  });
}

/**
 * The German page (focused-tools.json `lang: "de"`): the same tool and logic,
 * German words, and everything translated inside it pinned to German (see
 * page-language.ts).
 */
@Component({
  selector: 'app-mastodon-content-warnings-de',
  imports: [
    FormsModule,
    MbField,
    MbControl,
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    OpenApp,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.de.html',
  styleUrls: [
    '../../public-pages/focused-apps/focused-page.css',
    './mastodon-content-warnings.css',
  ],
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
    FormsModule,
    MbField,
    MbControl,
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    OpenApp,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.ja.html',
  styleUrls: [
    '../../public-pages/focused-apps/focused-page.css',
    './mastodon-content-warnings.css',
  ],
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
    FormsModule,
    MbField,
    MbControl,
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    OpenApp,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.fr.html',
  styleUrls: [
    '../../public-pages/focused-apps/focused-page.css',
    './mastodon-content-warnings.css',
  ],
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
    FormsModule,
    MbField,
    MbControl,
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    OpenApp,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.es.html',
  styleUrls: [
    '../../public-pages/focused-apps/focused-page.css',
    './mastodon-content-warnings.css',
  ],
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
    FormsModule,
    MbField,
    MbControl,
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    OpenApp,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.zh-hant.html',
  styleUrls: [
    '../../public-pages/focused-apps/focused-page.css',
    './mastodon-content-warnings.css',
  ],
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
    FormsModule,
    MbField,
    MbControl,
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    OpenApp,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.ko.html',
  styleUrls: [
    '../../public-pages/focused-apps/focused-page.css',
    './mastodon-content-warnings.css',
  ],
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
    FormsModule,
    MbField,
    MbControl,
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    OpenApp,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.pt.html',
  styleUrls: [
    '../../public-pages/focused-apps/focused-page.css',
    './mastodon-content-warnings.css',
  ],
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
    FormsModule,
    MbField,
    MbControl,
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    OpenApp,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.it.html',
  styleUrls: [
    '../../public-pages/focused-apps/focused-page.css',
    './mastodon-content-warnings.css',
  ],
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
    FormsModule,
    MbField,
    MbControl,
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    OpenApp,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.pl.html',
  styleUrls: [
    '../../public-pages/focused-apps/focused-page.css',
    './mastodon-content-warnings.css',
  ],
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsPl extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/pl/wylacz-ostrzezenia-o-tresci-mastodon' };
}

/** Ukrainian public page, with embedded tools pinned to the route language. */
@Component({
  selector: 'app-mastodon-content-warnings-uk',
  imports: [
    FormsModule,
    MbField,
    MbControl,
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    OpenApp,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.uk.html',
  styleUrls: [
    '../../public-pages/focused-apps/focused-page.css',
    './mastodon-content-warnings.css',
  ],
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsUk extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/uk/turn-off-content-warnings-mastodon' };
}

/** Hindi public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-content-warnings-hi',
  imports: [
    FormsModule,
    MbField,
    MbControl,
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    OpenApp,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.hi.html',
  styleUrls: [
    '../../public-pages/focused-apps/focused-page.css',
    './mastodon-content-warnings.css',
  ],
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsHi extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/hi/turn-off-content-warnings-mastodon' };
}

/** Dutch public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-content-warnings-nl',
  imports: [
    FormsModule,
    MbField,
    MbControl,
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    OpenApp,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.nl.html',
  styleUrls: [
    '../../public-pages/focused-apps/focused-page.css',
    './mastodon-content-warnings.css',
  ],
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsNl extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/nl/inhoudswaarschuwingen-uitzetten-mastodon' };
}

/** Indonesian public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-content-warnings-id',
  imports: [
    FormsModule,
    MbField,
    MbControl,
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    OpenApp,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.id.html',
  styleUrls: [
    '../../public-pages/focused-apps/focused-page.css',
    './mastodon-content-warnings.css',
  ],
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsId extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/id/nonaktifkan-peringatan-konten-mastodon' };
}

/** Russian public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-content-warnings-ru',
  imports: [
    FormsModule,
    MbField,
    MbControl,
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    OpenApp,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.ru.html',
  styleUrls: [
    '../../public-pages/focused-apps/focused-page.css',
    './mastodon-content-warnings.css',
  ],
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsRu extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/ru/turn-off-content-warnings-mastodon' };
}

/** Swedish public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-content-warnings-sv',
  imports: [
    FormsModule,
    MbField,
    MbControl,
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    OpenApp,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.sv.html',
  styleUrls: [
    '../../public-pages/focused-apps/focused-page.css',
    './mastodon-content-warnings.css',
  ],
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsSv extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/sv/stang-av-innehallsvarningar-mastodon' };
}

/** Vietnamese public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-content-warnings-vi',
  imports: [
    FormsModule,
    MbField,
    MbControl,
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    OpenApp,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.vi.html',
  styleUrls: [
    '../../public-pages/focused-apps/focused-page.css',
    './mastodon-content-warnings.css',
  ],
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsVi extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/vi/turn-off-content-warnings-mastodon' };
}

/** Turkish public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-content-warnings-tr',
  imports: [
    FormsModule,
    MbField,
    MbControl,
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    OpenApp,
    ContentWarningsWorkbench,
  ],
  templateUrl: './mastodon-content-warnings.tr.html',
  styleUrls: [
    '../../public-pages/focused-apps/focused-page.css',
    './mastodon-content-warnings.css',
  ],
  providers: [provideRouteLanguage()],
})
export class MastodonContentWarningsTr extends MastodonContentWarnings {
  protected override readonly returnHere = { next: '/tr/mastodon-icerik-uyarilarini-kapat' };
}
