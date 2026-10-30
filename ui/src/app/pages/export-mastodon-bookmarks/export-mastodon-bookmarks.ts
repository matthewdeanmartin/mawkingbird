import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { BookmarksExportWorkbench } from './bookmarks-export-workbench';

/**
 * "Export your Mastodon bookmarks" as a focused mini-app: every native bookmark
 * as a browser bookmark file, optionally unwrapped to the links the posts
 * shared. Mastodon's own data export lists bookmarks as a CSV of post
 * addresses, which no browser imports.
 */
@Component({
  selector: 'app-export-mastodon-bookmarks',
  imports: [RouterLink, MbButton, MbContentLink, BookmarksExportWorkbench],
  templateUrl: './export-mastodon-bookmarks.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class ExportMastodonBookmarks {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/export-mastodon-bookmarks' };
}
