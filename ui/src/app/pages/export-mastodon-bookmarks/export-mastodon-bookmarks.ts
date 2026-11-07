import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { BookmarksExportWorkbench } from './bookmarks-export-workbench';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';
import { AppOnlyLinkRel } from '../../public-page-urls';

/**
 * "Export your Mastodon bookmarks" as a focused mini-app: every native bookmark
 * as a browser bookmark file, optionally unwrapped to the links the posts
 * shared. Mastodon's own data export lists bookmarks as a CSV of post
 * addresses, which no browser imports.
 */
@Component({
  selector: 'app-export-mastodon-bookmarks',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    BookmarksExportWorkbench,
  ],
  templateUrl: './export-mastodon-bookmarks.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class ExportMastodonBookmarks {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/export-mastodon-bookmarks' };
}

/**
 * The German page (focused-tools.json `lang: "de"`): the same tool and logic,
 * German words, and everything translated inside it pinned to German (see
 * page-language.ts).
 */
@Component({
  selector: 'app-export-mastodon-bookmarks-de',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    BookmarksExportWorkbench,
  ],
  templateUrl: './export-mastodon-bookmarks.de.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ExportMastodonBookmarksDe extends ExportMastodonBookmarks {
  protected override readonly returnHere = { next: '/de/mastodon-lesezeichen-exportieren' };
}

/**
 * The Japanese page (focused-tools.json `lang: "ja"`): the same tool and
 * logic, Japanese words, and everything translated inside it pinned to
 * Japanese (see page-language.ts).
 */
@Component({
  selector: 'app-export-mastodon-bookmarks-ja',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    BookmarksExportWorkbench,
  ],
  templateUrl: './export-mastodon-bookmarks.ja.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ExportMastodonBookmarksJa extends ExportMastodonBookmarks {
  protected override readonly returnHere = { next: '/ja/export-mastodon-bookmarks' };
}

/**
 * The French page (focused-tools.json `lang: "fr"`): the same tool and
 * logic, French words, and everything translated inside it pinned to
 * French (see page-language.ts).
 */
@Component({
  selector: 'app-export-mastodon-bookmarks-fr',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    BookmarksExportWorkbench,
  ],
  templateUrl: './export-mastodon-bookmarks.fr.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ExportMastodonBookmarksFr extends ExportMastodonBookmarks {
  protected override readonly returnHere = { next: '/fr/exporter-les-signets-mastodon' };
}

/**
 * The Spanish page (focused-tools.json `lang: "es"`): the same tool and
 * logic, Spanish words, and everything translated inside it pinned to
 * Spanish (see page-language.ts).
 */
@Component({
  selector: 'app-export-mastodon-bookmarks-es',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    BookmarksExportWorkbench,
  ],
  templateUrl: './export-mastodon-bookmarks.es.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ExportMastodonBookmarksEs extends ExportMastodonBookmarks {
  protected override readonly returnHere = { next: '/es/exportar-marcadores-de-mastodon' };
}

/**
 * The Traditional Chinese page (focused-tools.json `lang: "zh-Hant"`): the same tool and
 * logic, Traditional Chinese words, and everything translated inside it pinned to
 * Traditional Chinese (see page-language.ts).
 */
@Component({
  selector: 'app-export-mastodon-bookmarks-zh-hant',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    BookmarksExportWorkbench,
  ],
  templateUrl: './export-mastodon-bookmarks.zh-hant.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ExportMastodonBookmarksZhHant extends ExportMastodonBookmarks {
  protected override readonly returnHere = { next: '/zh-hant/export-mastodon-bookmarks' };
}

/**
 * The Korean page (focused-tools.json `lang: "ko"`): the same tool and
 * logic, Korean words, and everything translated inside it pinned to
 * Korean (see page-language.ts).
 */
@Component({
  selector: 'app-export-mastodon-bookmarks-ko',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    BookmarksExportWorkbench,
  ],
  templateUrl: './export-mastodon-bookmarks.ko.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ExportMastodonBookmarksKo extends ExportMastodonBookmarks {
  protected override readonly returnHere = { next: '/ko/export-mastodon-bookmarks' };
}

/**
 * The Portuguese (Brazil) page (focused-tools.json `lang: "pt"`): the same tool and
 * logic, Portuguese (Brazil) words, and everything translated inside it pinned to
 * Portuguese (Brazil) (see page-language.ts).
 */
@Component({
  selector: 'app-export-mastodon-bookmarks-pt',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    BookmarksExportWorkbench,
  ],
  templateUrl: './export-mastodon-bookmarks.pt.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ExportMastodonBookmarksPt extends ExportMastodonBookmarks {
  protected override readonly returnHere = { next: '/pt/exportar-marcadores-do-mastodon' };
}

/**
 * The Italian page (focused-tools.json `lang: "it"`): the same tool and
 * logic, Italian words, and everything translated inside it pinned to
 * Italian (see page-language.ts).
 */
@Component({
  selector: 'app-export-mastodon-bookmarks-it',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    BookmarksExportWorkbench,
  ],
  templateUrl: './export-mastodon-bookmarks.it.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ExportMastodonBookmarksIt extends ExportMastodonBookmarks {
  protected override readonly returnHere = { next: '/it/esportare-segnalibri-mastodon' };
}

/**
 * The Polish page (focused-tools.json `lang: "pl"`): the same tool and
 * logic, Polish words, and everything translated inside it pinned to
 * Polish (see page-language.ts).
 */
@Component({
  selector: 'app-export-mastodon-bookmarks-pl',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    BookmarksExportWorkbench,
  ],
  templateUrl: './export-mastodon-bookmarks.pl.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ExportMastodonBookmarksPl extends ExportMastodonBookmarks {
  protected override readonly returnHere = { next: '/pl/eksport-zakladek-mastodon' };
}

/** Ukrainian public page, with embedded tools pinned to the route language. */
@Component({
  selector: 'app-export-mastodon-bookmarks-uk',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    BookmarksExportWorkbench,
  ],
  templateUrl: './export-mastodon-bookmarks.uk.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ExportMastodonBookmarksUk extends ExportMastodonBookmarks {
  protected override readonly returnHere = { next: '/uk/export-mastodon-bookmarks' };
}

/** Hindi public page; embedded tools use the route language. */
@Component({
  selector: 'app-export-mastodon-bookmarks-hi',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    BookmarksExportWorkbench,
  ],
  templateUrl: './export-mastodon-bookmarks.hi.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ExportMastodonBookmarksHi extends ExportMastodonBookmarks {
  protected override readonly returnHere = { next: '/hi/export-mastodon-bookmarks' };
}

/** Dutch public page; embedded tools use the route language. */
@Component({
  selector: 'app-export-mastodon-bookmarks-nl',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    BookmarksExportWorkbench,
  ],
  templateUrl: './export-mastodon-bookmarks.nl.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ExportMastodonBookmarksNl extends ExportMastodonBookmarks {
  protected override readonly returnHere = { next: '/nl/mastodon-bladwijzers-exporteren' };
}

/** Indonesian public page; embedded tools use the route language. */
@Component({
  selector: 'app-export-mastodon-bookmarks-id',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    BookmarksExportWorkbench,
  ],
  templateUrl: './export-mastodon-bookmarks.id.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ExportMastodonBookmarksId extends ExportMastodonBookmarks {
  protected override readonly returnHere = { next: '/id/ekspor-markah-mastodon' };
}

/** Russian public page; embedded tools use the route language. */
@Component({
  selector: 'app-export-mastodon-bookmarks-ru',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    BookmarksExportWorkbench,
  ],
  templateUrl: './export-mastodon-bookmarks.ru.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ExportMastodonBookmarksRu extends ExportMastodonBookmarks {
  protected override readonly returnHere = { next: '/ru/export-mastodon-bookmarks' };
}

/** Swedish public page; embedded tools use the route language. */
@Component({
  selector: 'app-export-mastodon-bookmarks-sv',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    BookmarksExportWorkbench,
  ],
  templateUrl: './export-mastodon-bookmarks.sv.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ExportMastodonBookmarksSv extends ExportMastodonBookmarks {
  protected override readonly returnHere = { next: '/sv/exportera-mastodon-bokmarken' };
}

/** Vietnamese public page; embedded tools use the route language. */
@Component({
  selector: 'app-export-mastodon-bookmarks-vi',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    BookmarksExportWorkbench,
  ],
  templateUrl: './export-mastodon-bookmarks.vi.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ExportMastodonBookmarksVi extends ExportMastodonBookmarks {
  protected override readonly returnHere = { next: '/vi/export-mastodon-bookmarks' };
}

/** Turkish public page; embedded tools use the route language. */
@Component({
  selector: 'app-export-mastodon-bookmarks-tr',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    BookmarksExportWorkbench,
  ],
  templateUrl: './export-mastodon-bookmarks.tr.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ExportMastodonBookmarksTr extends ExportMastodonBookmarks {
  protected override readonly returnHere = { next: '/tr/mastodon-yer-imlerini-aktar' };
}
