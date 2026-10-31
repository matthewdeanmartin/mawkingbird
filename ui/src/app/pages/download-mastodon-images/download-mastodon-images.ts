import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { MediaDownloadWorkbench } from './media-download-workbench';

/**
 * "Download images from Mastodon" as a focused mini-app: an account's pictures
 * on one wall, and all of them in a zip.
 *
 * Works signed out, like the handle generator: everything it reads is public,
 * and the visitors it is for arrived from a search, not with a session. Signing
 * in is offered, not required. The workbench is deferred, so the prerender
 * holds only the copy and makes no requests.
 */
@Component({
  selector: 'app-download-mastodon-images',
  imports: [RouterLink, MbButton, MbContentLink, MediaDownloadWorkbench],
  templateUrl: './download-mastodon-images.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class DownloadMastodonImages {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/download-mastodon-images' };
}
