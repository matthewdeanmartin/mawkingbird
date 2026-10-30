import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { AmnestyWorkbench } from './amnesty-workbench';

/**
 * Mute Amnesty and Block Amnesty as a focused mini-app: unmute or unblock
 * everyone on Mastodon at once, which Mastodon itself only does one account at
 * a time. The workbench is deferred and only exists signed in.
 */
@Component({
  selector: 'app-mastodon-mute-block-amnesty',
  imports: [RouterLink, MbButton, MbContentLink, AmnestyWorkbench],
  templateUrl: './mastodon-mute-block-amnesty.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class MastodonMuteBlockAmnesty {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/mastodon-mute-block-amnesty' };
}
