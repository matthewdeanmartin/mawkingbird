import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { HandleWorkbench } from './handle-workbench';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';
import { AppOnlyLinkRel } from '../../public-page-urls';

/**
 * Mastodon handle generator: suggestions from a name, checked for availability
 * on the server the visitor means to join and on the biggest servers.
 *
 * The one tool page that works signed out (owner decision): its visitors have
 * no account yet, and the lookups need none. The workbench is still deferred,
 * so the prerender holds only the copy and makes no requests.
 */
@Component({
  selector: 'app-mastodon-handle-generator',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, LanguageVersions, HandleWorkbench],
  templateUrl: './mastodon-handle-generator.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class MastodonHandleGenerator {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
}

/**
 * The German page (focused-tools.json `lang: "de"`): the same tool and logic,
 * German words, and everything translated inside it pinned to German (see
 * page-language.ts).
 */
@Component({
  selector: 'app-mastodon-handle-generator-de',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, LanguageVersions, HandleWorkbench],
  templateUrl: './mastodon-handle-generator.de.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonHandleGeneratorDe extends MastodonHandleGenerator {}

/**
 * The Japanese page (focused-tools.json `lang: "ja"`): the same tool and
 * logic, Japanese words, and everything translated inside it pinned to
 * Japanese (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-handle-generator-ja',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, LanguageVersions, HandleWorkbench],
  templateUrl: './mastodon-handle-generator.ja.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonHandleGeneratorJa extends MastodonHandleGenerator {}

/**
 * The French page (focused-tools.json `lang: "fr"`): the same tool and
 * logic, French words, and everything translated inside it pinned to
 * French (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-handle-generator-fr',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, LanguageVersions, HandleWorkbench],
  templateUrl: './mastodon-handle-generator.fr.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonHandleGeneratorFr extends MastodonHandleGenerator {}

/**
 * The Spanish page (focused-tools.json `lang: "es"`): the same tool and
 * logic, Spanish words, and everything translated inside it pinned to
 * Spanish (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-handle-generator-es',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, LanguageVersions, HandleWorkbench],
  templateUrl: './mastodon-handle-generator.es.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonHandleGeneratorEs extends MastodonHandleGenerator {}

/**
 * The Traditional Chinese page (focused-tools.json `lang: "zh-Hant"`): the same tool and
 * logic, Traditional Chinese words, and everything translated inside it pinned to
 * Traditional Chinese (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-handle-generator-zh-hant',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, LanguageVersions, HandleWorkbench],
  templateUrl: './mastodon-handle-generator.zh-hant.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonHandleGeneratorZhHant extends MastodonHandleGenerator {}

/**
 * The Korean page (focused-tools.json `lang: "ko"`): the same tool and
 * logic, Korean words, and everything translated inside it pinned to
 * Korean (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-handle-generator-ko',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, LanguageVersions, HandleWorkbench],
  templateUrl: './mastodon-handle-generator.ko.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonHandleGeneratorKo extends MastodonHandleGenerator {}

/**
 * The Portuguese (Brazil) page (focused-tools.json `lang: "pt"`): the same tool and
 * logic, Portuguese (Brazil) words, and everything translated inside it pinned to
 * Portuguese (Brazil) (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-handle-generator-pt',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, LanguageVersions, HandleWorkbench],
  templateUrl: './mastodon-handle-generator.pt.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonHandleGeneratorPt extends MastodonHandleGenerator {}

/**
 * The Italian page (focused-tools.json `lang: "it"`): the same tool and
 * logic, Italian words, and everything translated inside it pinned to
 * Italian (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-handle-generator-it',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, LanguageVersions, HandleWorkbench],
  templateUrl: './mastodon-handle-generator.it.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonHandleGeneratorIt extends MastodonHandleGenerator {}

/**
 * The Polish page (focused-tools.json `lang: "pl"`): the same tool and
 * logic, Polish words, and everything translated inside it pinned to
 * Polish (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-handle-generator-pl',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, LanguageVersions, HandleWorkbench],
  templateUrl: './mastodon-handle-generator.pl.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonHandleGeneratorPl extends MastodonHandleGenerator {}

/** Ukrainian public page, with embedded tools pinned to the route language. */
@Component({
  selector: 'app-mastodon-handle-generator-uk',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, LanguageVersions, HandleWorkbench],
  templateUrl: './mastodon-handle-generator.uk.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonHandleGeneratorUk extends MastodonHandleGenerator {}

/** Hindi public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-handle-generator-hi',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, LanguageVersions, HandleWorkbench],
  templateUrl: './mastodon-handle-generator.hi.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonHandleGeneratorHi extends MastodonHandleGenerator {}

/** Dutch public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-handle-generator-nl',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, LanguageVersions, HandleWorkbench],
  templateUrl: './mastodon-handle-generator.nl.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonHandleGeneratorNl extends MastodonHandleGenerator {}

/** Indonesian public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-handle-generator-id',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, LanguageVersions, HandleWorkbench],
  templateUrl: './mastodon-handle-generator.id.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonHandleGeneratorId extends MastodonHandleGenerator {}

/** Russian public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-handle-generator-ru',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, LanguageVersions, HandleWorkbench],
  templateUrl: './mastodon-handle-generator.ru.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonHandleGeneratorRu extends MastodonHandleGenerator {}

/** Swedish public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-handle-generator-sv',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, LanguageVersions, HandleWorkbench],
  templateUrl: './mastodon-handle-generator.sv.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonHandleGeneratorSv extends MastodonHandleGenerator {}

/** Vietnamese public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-handle-generator-vi',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, LanguageVersions, HandleWorkbench],
  templateUrl: './mastodon-handle-generator.vi.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonHandleGeneratorVi extends MastodonHandleGenerator {}

/** Turkish public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-handle-generator-tr',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink, LanguageVersions, HandleWorkbench],
  templateUrl: './mastodon-handle-generator.tr.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonHandleGeneratorTr extends MastodonHandleGenerator {}
