import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { CrosspostWorkbench } from './crosspost-workbench';

/**
 * The Mastodon + Bluesky crossposter as a focused mini-app.
 *
 * Signed out, a public page that offers sign-in with either network. Signed in
 * with either, the shell's trimmed nav around a small composer and a way to
 * connect the other network. The workbench is deferred and only exists signed
 * in, so prerendering touches no session or account.
 */
@Component({
  selector: 'app-crosspost',
  imports: [RouterLink, MbButton, MbContentLink, CrosspostWorkbench],
  templateUrl: './crosspost.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class Crosspost {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/crosspost' };
}
