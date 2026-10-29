import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { TwitterArchiveImport } from '../settings/import-export/twitter-archive-import';
import { TwitterImportNextSteps } from './twitter-import-next-steps';

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
  imports: [RouterLink, MbButton, MbContentLink, TwitterArchiveImport, TwitterImportNextSteps],
  templateUrl: './twitter-to-mastodon.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class TwitterToMastodon {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
}
