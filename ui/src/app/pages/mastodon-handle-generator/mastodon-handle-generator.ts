import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { HandleWorkbench } from './handle-workbench';

/**
 * Mastodon handle generator: suggestions from a name, checked for availability
 * on the server the visitor means to join and on the biggest servers.
 *
 * The one tool page that works signed out (owner decision): its visitors have
 * no account yet, and the lookups need none. The workbench is still deferred,
 * so the prerender holds only the copy and makes no requests.
 */
@Component({
  selector: 'app-mastodon-handle-generator',
  imports: [RouterLink, MbButton, MbContentLink, HandleWorkbench],
  templateUrl: './mastodon-handle-generator.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class MastodonHandleGenerator {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
}
