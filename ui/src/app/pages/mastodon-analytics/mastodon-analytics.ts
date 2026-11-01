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

/**
 * The French page (focused-tools.json `lang: "fr"`): the same tool and
 * logic, French words, and everything translated inside it pinned to
 * French (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-analytics-fr',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, MastodonAnalyticsPanel],
  templateUrl: './mastodon-analytics.fr.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonAnalyticsFr extends MastodonAnalytics {
  protected override readonly returnHere = { next: '/fr/statistiques-mastodon' };
}

/**
 * The Spanish page (focused-tools.json `lang: "es"`): the same tool and
 * logic, Spanish words, and everything translated inside it pinned to
 * Spanish (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-analytics-es',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, MastodonAnalyticsPanel],
  templateUrl: './mastodon-analytics.es.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonAnalyticsEs extends MastodonAnalytics {
  protected override readonly returnHere = { next: '/es/estadisticas-de-mastodon' };
}

/**
 * The Traditional Chinese page (focused-tools.json `lang: "zh-Hant"`): the same tool and
 * logic, Traditional Chinese words, and everything translated inside it pinned to
 * Traditional Chinese (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-analytics-zh-hant',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, MastodonAnalyticsPanel],
  templateUrl: './mastodon-analytics.zh-hant.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonAnalyticsZhHant extends MastodonAnalytics {
  protected override readonly returnHere = { next: '/zh-hant/mastodon-analytics' };
}

/**
 * The Korean page (focused-tools.json `lang: "ko"`): the same tool and
 * logic, Korean words, and everything translated inside it pinned to
 * Korean (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-analytics-ko',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, MastodonAnalyticsPanel],
  templateUrl: './mastodon-analytics.ko.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonAnalyticsKo extends MastodonAnalytics {
  protected override readonly returnHere = { next: '/ko/mastodon-analytics' };
}

/**
 * The Portuguese (Brazil) page (focused-tools.json `lang: "pt"`): the same tool and
 * logic, Portuguese (Brazil) words, and everything translated inside it pinned to
 * Portuguese (Brazil) (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-analytics-pt',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, MastodonAnalyticsPanel],
  templateUrl: './mastodon-analytics.pt.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonAnalyticsPt extends MastodonAnalytics {
  protected override readonly returnHere = { next: '/pt/estatisticas-do-mastodon' };
}

/**
 * The Italian page (focused-tools.json `lang: "it"`): the same tool and
 * logic, Italian words, and everything translated inside it pinned to
 * Italian (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-analytics-it',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, MastodonAnalyticsPanel],
  templateUrl: './mastodon-analytics.it.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonAnalyticsIt extends MastodonAnalytics {
  protected override readonly returnHere = { next: '/it/statistiche-mastodon' };
}

/**
 * The Polish page (focused-tools.json `lang: "pl"`): the same tool and
 * logic, Polish words, and everything translated inside it pinned to
 * Polish (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-analytics-pl',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, MastodonAnalyticsPanel],
  templateUrl: './mastodon-analytics.pl.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonAnalyticsPl extends MastodonAnalytics {
  protected override readonly returnHere = { next: '/pl/statystyki-mastodona' };
}

/** Ukrainian public page, with embedded tools pinned to the route language. */
@Component({
  selector: 'app-mastodon-analytics-uk',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, MastodonAnalyticsPanel],
  templateUrl: './mastodon-analytics.uk.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonAnalyticsUk extends MastodonAnalytics {
  protected override readonly returnHere = { next: '/uk/mastodon-analytics' };
}

/** Hindi public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-analytics-hi',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, MastodonAnalyticsPanel],
  templateUrl: './mastodon-analytics.hi.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonAnalyticsHi extends MastodonAnalytics {
  protected override readonly returnHere = { next: '/hi/mastodon-analytics' };
}

/** Dutch public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-analytics-nl',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, MastodonAnalyticsPanel],
  templateUrl: './mastodon-analytics.nl.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonAnalyticsNl extends MastodonAnalytics {
  protected override readonly returnHere = { next: '/nl/mastodon-statistieken' };
}

/** Indonesian public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-analytics-id',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, MastodonAnalyticsPanel],
  templateUrl: './mastodon-analytics.id.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonAnalyticsId extends MastodonAnalytics {
  protected override readonly returnHere = { next: '/id/statistik-mastodon' };
}

/** Russian public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-analytics-ru',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, MastodonAnalyticsPanel],
  templateUrl: './mastodon-analytics.ru.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonAnalyticsRu extends MastodonAnalytics {
  protected override readonly returnHere = { next: '/ru/mastodon-analytics' };
}

/** Swedish public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-analytics-sv',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, MastodonAnalyticsPanel],
  templateUrl: './mastodon-analytics.sv.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonAnalyticsSv extends MastodonAnalytics {
  protected override readonly returnHere = { next: '/sv/mastodon-statistik' };
}

/** Vietnamese public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-analytics-vi',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, MastodonAnalyticsPanel],
  templateUrl: './mastodon-analytics.vi.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonAnalyticsVi extends MastodonAnalytics {
  protected override readonly returnHere = { next: '/vi/mastodon-analytics' };
}

/** Turkish public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-analytics-tr',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, MastodonAnalyticsPanel],
  templateUrl: './mastodon-analytics.tr.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonAnalyticsTr extends MastodonAnalytics {
  protected override readonly returnHere = { next: '/tr/mastodon-istatistikleri' };
}
