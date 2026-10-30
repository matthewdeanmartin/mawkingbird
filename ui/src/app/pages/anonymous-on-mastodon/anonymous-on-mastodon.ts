import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { PseudonymityWorkbench } from './pseudonymity-workbench';

/**
 * "How to be (pseudo)anonymous on Mastodon" as a focused mini-app.
 *
 * Signed out, a guide: what pseudonymity can and cannot do on Mastodon. Signed
 * in, the account's own server settings flipped towards pseudonymity in one
 * step, the things only the person can change, and then Mawkingbird's
 * browser-side pseudonymity mode. The workbench is deferred and signed-in only.
 */
@Component({
  selector: 'app-anonymous-on-mastodon',
  imports: [RouterLink, MbButton, MbContentLink, PseudonymityWorkbench],
  templateUrl: './anonymous-on-mastodon.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class AnonymousOnMastodon {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/how-to-be-anonymous-on-mastodon' };
}
