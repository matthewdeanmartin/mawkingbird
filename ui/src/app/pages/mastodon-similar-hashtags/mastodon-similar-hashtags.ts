import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { SimilarHashtagsWorkbench } from './similar-hashtags-workbench';

/**
 * "Similar hashtags on Mastodon" as a focused mini-app: the hashtags that turn
 * up alongside the ones you give, ranked by how many recent posts they share.
 *
 * Works signed out: tag timelines are public on the big servers. Signed out it
 * samples mastodon.social; signed in, your own server. The workbench is
 * deferred, so the prerender holds only the copy and makes no requests.
 */
@Component({
  selector: 'app-mastodon-similar-hashtags',
  imports: [RouterLink, MbButton, MbContentLink, SimilarHashtagsWorkbench],
  templateUrl: './mastodon-similar-hashtags.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class MastodonSimilarHashtags {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/mastodon-similar-hashtags' };
}
