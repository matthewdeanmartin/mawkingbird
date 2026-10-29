import { Component, computed, inject } from '@angular/core';
import { GitHubSession } from '../../providers/github/github-session';
import { FocusedNextSteps } from '../focused-apps/focused-next-steps';
import { ConnectionGitHub } from '../settings/connections/github/connection-github';
import { GitHubFriendDiscovery } from '../settings/import-export/github-friend-discovery';
import { GitHubFriendsImport } from '../settings/import-export/github-friends-import';

/**
 * The signed-in body: connect GitHub with the existing connector, then the
 * shared finder from Settings → Import/Export, then the way into the app.
 */
@Component({
  selector: 'app-github-friends-workbench',
  imports: [ConnectionGitHub, GitHubFriendsImport, FocusedNextSteps],
  template: `
    @if (github.connected()) {
      <app-github-friends-import />
      @if (searched()) {
        <app-focused-next-steps inviteLink="/github-to-mastodon/invite" />
      }
    } @else {
      <section class="panel">
        <h2>Connect GitHub</h2>
        <app-connection-github [embedded]="true" />
      </section>
    }
  `,
  styleUrl: '../focused-apps/focused-page.css',
})
export class GitHubFriendsWorkbench {
  protected readonly github = inject(GitHubSession);
  private readonly discovery = inject(GitHubFriendDiscovery);
  /** Next steps wait until a search has run, like every mini-app. */
  protected readonly searched = computed(() => this.discovery.callCount() > 0);
}
