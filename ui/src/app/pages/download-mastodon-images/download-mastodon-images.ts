import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { PageLanguage } from '../../focused-tools';
import { provideRouteLanguage } from '../../page-language';
import { MediaDownloadWorkbench } from './media-download-workbench';
import { DOWNLOAD_IMAGES_COPY } from './download-mastodon-images.copy';

/**
 * "Download images from Mastodon" as a focused mini-app: an account's pictures
 * on one wall, and all of them in a zip.
 *
 * Works signed out, like the handle generator: everything it reads is public,
 * and the visitors it is for arrived from a search, not with a session. Signing
 * in is offered, not required. The workbench is deferred, so the prerender
 * holds only the copy and makes no requests.
 *
 * One component for every language version: the route's `lang` picks the copy
 * and pins the tool's translations to that language (see page-language.ts).
 */
@Component({
  selector: 'app-download-mastodon-images',
  imports: [RouterLink, MbButton, MbContentLink, MediaDownloadWorkbench],
  templateUrl: './download-mastodon-images.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class DownloadMastodonImages {
  private readonly data = inject(ActivatedRoute).snapshot.data;
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = this.data['inShell'] === true;
  protected readonly lang: PageLanguage = this.data['lang'] === 'de' ? 'de' : 'en';
  protected readonly copy = DOWNLOAD_IMAGES_COPY[this.lang];
  protected readonly returnHere = { next: this.copy.path };
}
