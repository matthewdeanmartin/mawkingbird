import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { BookmarksExportWorkbench } from './bookmarks-export-workbench';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';

/**
 * "Export your Mastodon bookmarks" as a focused mini-app: every native bookmark
 * as a browser bookmark file, optionally unwrapped to the links the posts
 * shared. Mastodon's own data export lists bookmarks as a CSV of post
 * addresses, which no browser imports.
 */
@Component({
  selector: 'app-export-mastodon-bookmarks',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, BookmarksExportWorkbench],
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
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, BookmarksExportWorkbench],
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
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, BookmarksExportWorkbench],
  templateUrl: './export-mastodon-bookmarks.ja.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ExportMastodonBookmarksJa extends ExportMastodonBookmarks {
  protected override readonly returnHere = { next: '/ja/export-mastodon-bookmarks' };
}
