import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { TwitterArchiveImport } from '../settings/import-export/twitter-archive-import';
import { TwitterImportNextSteps } from './twitter-import-next-steps';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';

/**
 * The Twitter importer as its own small app, for people who arrive searching
 * for exactly that.
 *
 * Signed out it is a public, prerendered page with its own header: read the
 * archive, then sign in. Signed in with Mastodon it sits in the shell's
 * focused nav (Home · Import · Invite) with no rails. The interactive parts
 * are deferred, so prerendering touches no session, storage or account.
 */
@Component({
  selector: 'app-twitter-to-mastodon',
  imports: [
    RouterLink,
    MbButton,
    MbContentLink,
    LanguageVersions,
    TwitterArchiveImport,
    TwitterImportNextSteps,
  ],
  templateUrl: './twitter-to-mastodon.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class TwitterToMastodon {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
}

/**
 * The German page (focused-tools.json `lang: "de"`): the same tool and logic,
 * German words, and everything translated inside it pinned to German (see
 * page-language.ts).
 */
@Component({
  selector: 'app-twitter-to-mastodon-de',
  imports: [
    RouterLink,
    MbButton,
    MbContentLink,
    LanguageVersions,
    TwitterArchiveImport,
    TwitterImportNextSteps,
  ],
  templateUrl: './twitter-to-mastodon.de.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TwitterToMastodonDe extends TwitterToMastodon {}

/**
 * The Japanese page (focused-tools.json `lang: "ja"`): the same tool and
 * logic, Japanese words, and everything translated inside it pinned to
 * Japanese (see page-language.ts).
 */
@Component({
  selector: 'app-twitter-to-mastodon-ja',
  imports: [
    RouterLink,
    MbButton,
    MbContentLink,
    LanguageVersions,
    TwitterArchiveImport,
    TwitterImportNextSteps,
  ],
  templateUrl: './twitter-to-mastodon.ja.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TwitterToMastodonJa extends TwitterToMastodon {}

/**
 * The French page (focused-tools.json `lang: "fr"`): the same tool and
 * logic, French words, and everything translated inside it pinned to
 * French (see page-language.ts).
 */
@Component({
  selector: 'app-twitter-to-mastodon-fr',
  imports: [
    RouterLink,
    MbButton,
    MbContentLink,
    LanguageVersions,
    TwitterArchiveImport,
    TwitterImportNextSteps,
  ],
  templateUrl: './twitter-to-mastodon.fr.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TwitterToMastodonFr extends TwitterToMastodon {}

/**
 * The Spanish page (focused-tools.json `lang: "es"`): the same tool and
 * logic, Spanish words, and everything translated inside it pinned to
 * Spanish (see page-language.ts).
 */
@Component({
  selector: 'app-twitter-to-mastodon-es',
  imports: [
    RouterLink,
    MbButton,
    MbContentLink,
    LanguageVersions,
    TwitterArchiveImport,
    TwitterImportNextSteps,
  ],
  templateUrl: './twitter-to-mastodon.es.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TwitterToMastodonEs extends TwitterToMastodon {}

/**
 * The Traditional Chinese page (focused-tools.json `lang: "zh-Hant"`): the same tool and
 * logic, Traditional Chinese words, and everything translated inside it pinned to
 * Traditional Chinese (see page-language.ts).
 */
@Component({
  selector: 'app-twitter-to-mastodon-zh-hant',
  imports: [
    RouterLink,
    MbButton,
    MbContentLink,
    LanguageVersions,
    TwitterArchiveImport,
    TwitterImportNextSteps,
  ],
  templateUrl: './twitter-to-mastodon.zh-hant.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TwitterToMastodonZhHant extends TwitterToMastodon {}

/**
 * The Korean page (focused-tools.json `lang: "ko"`): the same tool and
 * logic, Korean words, and everything translated inside it pinned to
 * Korean (see page-language.ts).
 */
@Component({
  selector: 'app-twitter-to-mastodon-ko',
  imports: [
    RouterLink,
    MbButton,
    MbContentLink,
    LanguageVersions,
    TwitterArchiveImport,
    TwitterImportNextSteps,
  ],
  templateUrl: './twitter-to-mastodon.ko.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TwitterToMastodonKo extends TwitterToMastodon {}

/**
 * The Portuguese (Brazil) page (focused-tools.json `lang: "pt"`): the same tool and
 * logic, Portuguese (Brazil) words, and everything translated inside it pinned to
 * Portuguese (Brazil) (see page-language.ts).
 */
@Component({
  selector: 'app-twitter-to-mastodon-pt',
  imports: [
    RouterLink,
    MbButton,
    MbContentLink,
    LanguageVersions,
    TwitterArchiveImport,
    TwitterImportNextSteps,
  ],
  templateUrl: './twitter-to-mastodon.pt.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TwitterToMastodonPt extends TwitterToMastodon {}

/**
 * The Italian page (focused-tools.json `lang: "it"`): the same tool and
 * logic, Italian words, and everything translated inside it pinned to
 * Italian (see page-language.ts).
 */
@Component({
  selector: 'app-twitter-to-mastodon-it',
  imports: [
    RouterLink,
    MbButton,
    MbContentLink,
    LanguageVersions,
    TwitterArchiveImport,
    TwitterImportNextSteps,
  ],
  templateUrl: './twitter-to-mastodon.it.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TwitterToMastodonIt extends TwitterToMastodon {}

/**
 * The Polish page (focused-tools.json `lang: "pl"`): the same tool and
 * logic, Polish words, and everything translated inside it pinned to
 * Polish (see page-language.ts).
 */
@Component({
  selector: 'app-twitter-to-mastodon-pl',
  imports: [
    RouterLink,
    MbButton,
    MbContentLink,
    LanguageVersions,
    TwitterArchiveImport,
    TwitterImportNextSteps,
  ],
  templateUrl: './twitter-to-mastodon.pl.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TwitterToMastodonPl extends TwitterToMastodon {}

/** Ukrainian public page, with embedded tools pinned to the route language. */
@Component({
  selector: 'app-twitter-to-mastodon-uk',
  imports: [
    RouterLink,
    MbButton,
    MbContentLink,
    LanguageVersions,
    TwitterArchiveImport,
    TwitterImportNextSteps,
  ],
  templateUrl: './twitter-to-mastodon.uk.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TwitterToMastodonUk extends TwitterToMastodon {}

/** Hindi public page; embedded tools use the route language. */
@Component({
  selector: 'app-twitter-to-mastodon-hi',
  imports: [
    RouterLink,
    MbButton,
    MbContentLink,
    LanguageVersions,
    TwitterArchiveImport,
    TwitterImportNextSteps,
  ],
  templateUrl: './twitter-to-mastodon.hi.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TwitterToMastodonHi extends TwitterToMastodon {}

/** Dutch public page; embedded tools use the route language. */
@Component({
  selector: 'app-twitter-to-mastodon-nl',
  imports: [
    RouterLink,
    MbButton,
    MbContentLink,
    LanguageVersions,
    TwitterArchiveImport,
    TwitterImportNextSteps,
  ],
  templateUrl: './twitter-to-mastodon.nl.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TwitterToMastodonNl extends TwitterToMastodon {}

/** Indonesian public page; embedded tools use the route language. */
@Component({
  selector: 'app-twitter-to-mastodon-id',
  imports: [
    RouterLink,
    MbButton,
    MbContentLink,
    LanguageVersions,
    TwitterArchiveImport,
    TwitterImportNextSteps,
  ],
  templateUrl: './twitter-to-mastodon.id.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TwitterToMastodonId extends TwitterToMastodon {}

/** Russian public page; embedded tools use the route language. */
@Component({
  selector: 'app-twitter-to-mastodon-ru',
  imports: [
    RouterLink,
    MbButton,
    MbContentLink,
    LanguageVersions,
    TwitterArchiveImport,
    TwitterImportNextSteps,
  ],
  templateUrl: './twitter-to-mastodon.ru.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TwitterToMastodonRu extends TwitterToMastodon {}

/** Swedish public page; embedded tools use the route language. */
@Component({
  selector: 'app-twitter-to-mastodon-sv',
  imports: [
    RouterLink,
    MbButton,
    MbContentLink,
    LanguageVersions,
    TwitterArchiveImport,
    TwitterImportNextSteps,
  ],
  templateUrl: './twitter-to-mastodon.sv.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TwitterToMastodonSv extends TwitterToMastodon {}

/** Vietnamese public page; embedded tools use the route language. */
@Component({
  selector: 'app-twitter-to-mastodon-vi',
  imports: [
    RouterLink,
    MbButton,
    MbContentLink,
    LanguageVersions,
    TwitterArchiveImport,
    TwitterImportNextSteps,
  ],
  templateUrl: './twitter-to-mastodon.vi.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TwitterToMastodonVi extends TwitterToMastodon {}
