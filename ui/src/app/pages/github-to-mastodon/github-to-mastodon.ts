import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { GitHubFriendsWorkbench } from './github-friends-workbench';

/**
 * GitHub friends → Mastodon as a focused mini-app.
 *
 * Signed out, a public page that explains the three steps; signed in with
 * Mastodon, the shell's trimmed nav around the GitHub connector and finder.
 * The workbench is deferred and only exists signed in.
 */
@Component({
  selector: 'app-github-to-mastodon',
  imports: [RouterLink, MbButton, MbContentLink, GitHubFriendsWorkbench],
  templateUrl: './github-to-mastodon.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class GithubToMastodon {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/github-to-mastodon' };
}
