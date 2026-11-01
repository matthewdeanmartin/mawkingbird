import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { SimilarHashtagsWorkbench } from './similar-hashtags-workbench';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';

/**
 * "Similar hashtags on Mastodon" as a focused mini-app: the hashtags that turn
 * up alongside the ones you give, ranked by how many recent posts they share.
 *
 * Works signed out: tag timelines are public on the big servers. Signed out it
 * samples mastodon.social; signed in, your own server. The workbench is
 * deferred, so the prerender holds only the copy and makes no requests.
 */
@Component({
  selector: 'app-mastodon-similar-hashtags',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class MastodonSimilarHashtags {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/mastodon-similar-hashtags' };
}

/**
 * The German page (focused-tools.json `lang: "de"`): the same tool and logic,
 * German words, and everything translated inside it pinned to German (see
 * page-language.ts).
 */
@Component({
  selector: 'app-mastodon-similar-hashtags-de',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.de.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonSimilarHashtagsDe extends MastodonSimilarHashtags {
  protected override readonly returnHere = { next: '/de/aehnliche-hashtags-mastodon' };
}

/**
 * The Japanese page (focused-tools.json `lang: "ja"`): the same tool and
 * logic, Japanese words, and everything translated inside it pinned to
 * Japanese (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-similar-hashtags-ja',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.ja.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonSimilarHashtagsJa extends MastodonSimilarHashtags {
  protected override readonly returnHere = { next: '/ja/mastodon-similar-hashtags' };
}

/**
 * The French page (focused-tools.json `lang: "fr"`): the same tool and
 * logic, French words, and everything translated inside it pinned to
 * French (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-similar-hashtags-fr',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.fr.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonSimilarHashtagsFr extends MastodonSimilarHashtags {
  protected override readonly returnHere = { next: '/fr/hashtags-similaires-mastodon' };
}

/**
 * The Spanish page (focused-tools.json `lang: "es"`): the same tool and
 * logic, Spanish words, and everything translated inside it pinned to
 * Spanish (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-similar-hashtags-es',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.es.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonSimilarHashtagsEs extends MastodonSimilarHashtags {
  protected override readonly returnHere = { next: '/es/hashtags-similares-mastodon' };
}

/**
 * The Traditional Chinese page (focused-tools.json `lang: "zh-Hant"`): the same tool and
 * logic, Traditional Chinese words, and everything translated inside it pinned to
 * Traditional Chinese (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-similar-hashtags-zh-hant',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.zh-hant.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonSimilarHashtagsZhHant extends MastodonSimilarHashtags {
  protected override readonly returnHere = { next: '/zh-hant/mastodon-similar-hashtags' };
}

/**
 * The Korean page (focused-tools.json `lang: "ko"`): the same tool and
 * logic, Korean words, and everything translated inside it pinned to
 * Korean (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-similar-hashtags-ko',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.ko.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonSimilarHashtagsKo extends MastodonSimilarHashtags {
  protected override readonly returnHere = { next: '/ko/mastodon-similar-hashtags' };
}

/**
 * The Portuguese (Brazil) page (focused-tools.json `lang: "pt"`): the same tool and
 * logic, Portuguese (Brazil) words, and everything translated inside it pinned to
 * Portuguese (Brazil) (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-similar-hashtags-pt',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.pt.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonSimilarHashtagsPt extends MastodonSimilarHashtags {
  protected override readonly returnHere = { next: '/pt/hashtags-semelhantes-mastodon' };
}

/**
 * The Italian page (focused-tools.json `lang: "it"`): the same tool and
 * logic, Italian words, and everything translated inside it pinned to
 * Italian (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-similar-hashtags-it',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.it.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonSimilarHashtagsIt extends MastodonSimilarHashtags {
  protected override readonly returnHere = { next: '/it/hashtag-simili-mastodon' };
}

/**
 * The Polish page (focused-tools.json `lang: "pl"`): the same tool and
 * logic, Polish words, and everything translated inside it pinned to
 * Polish (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-similar-hashtags-pl',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.pl.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonSimilarHashtagsPl extends MastodonSimilarHashtags {
  protected override readonly returnHere = { next: '/pl/podobne-hashtagi-mastodon' };
}

/** Ukrainian public page, with embedded tools pinned to the route language. */
@Component({
  selector: 'app-mastodon-similar-hashtags-uk',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.uk.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonSimilarHashtagsUk extends MastodonSimilarHashtags {
  protected override readonly returnHere = { next: '/uk/mastodon-similar-hashtags' };
}

/** Hindi public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-similar-hashtags-hi',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.hi.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonSimilarHashtagsHi extends MastodonSimilarHashtags {
  protected override readonly returnHere = { next: '/hi/mastodon-similar-hashtags' };
}

/** Dutch public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-similar-hashtags-nl',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.nl.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonSimilarHashtagsNl extends MastodonSimilarHashtags {
  protected override readonly returnHere = { next: '/nl/vergelijkbare-mastodon-hashtags' };
}

/** Indonesian public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-similar-hashtags-id',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.id.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonSimilarHashtagsId extends MastodonSimilarHashtags {
  protected override readonly returnHere = { next: '/id/tagar-serupa-mastodon' };
}

/** Russian public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-similar-hashtags-ru',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.ru.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonSimilarHashtagsRu extends MastodonSimilarHashtags {
  protected override readonly returnHere = { next: '/ru/mastodon-similar-hashtags' };
}

/** Swedish public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-similar-hashtags-sv',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.sv.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonSimilarHashtagsSv extends MastodonSimilarHashtags {
  protected override readonly returnHere = { next: '/sv/liknande-mastodon-hashtaggar' };
}

/** Vietnamese public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-similar-hashtags-vi',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.vi.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonSimilarHashtagsVi extends MastodonSimilarHashtags {
  protected override readonly returnHere = { next: '/vi/mastodon-similar-hashtags' };
}

/** Turkish public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-similar-hashtags-tr',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.tr.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonSimilarHashtagsTr extends MastodonSimilarHashtags {
  protected override readonly returnHere = { next: '/tr/mastodon-benzer-etiketler' };
}
