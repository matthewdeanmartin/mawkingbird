import { Component, computed, inject } from '@angular/core';
import { GitHubSession } from '../../providers/github/github-session';
import { FocusedNextSteps, toolInviteLink } from '../focused-apps/focused-next-steps';

// i18n focusedTools.connectGithub: Connect GitHub
import { ConnectionGitHub } from '../settings/connections/github/connection-github';
import { GitHubFriendDiscovery } from '../settings/import-export/github-friend-discovery';
import { GitHubFriendsImport } from '../settings/import-export/github-friends-import';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * The signed-in body: connect GitHub with the existing connector, then the
 * shared finder from Settings → Import/Export, then the way into the app.
 */
@Component({
  selector: 'app-github-friends-workbench',
  imports: [TranslocoPipe, ConnectionGitHub, GitHubFriendsImport, FocusedNextSteps],
  template: `
    @if (github.connected()) {
      <app-github-friends-import />
      @if (searched()) {
        <app-focused-next-steps [inviteLink]="invite" />
      }
    } @else {
      <section class="panel">
        <h2>{{ 'focusedTools.connectGithub' | transloco }}</h2>
        <app-connection-github [embedded]="true" />
      </section>
    }
  `,
  styleUrl: '../focused-apps/focused-page.css',
})
export class GitHubFriendsWorkbench {
  protected readonly invite = toolInviteLink();
  protected readonly github = inject(GitHubSession);
  private readonly discovery = inject(GitHubFriendDiscovery);
  /** Next steps wait until a search has run, like every mini-app. */
  protected readonly searched = computed(() => this.discovery.callCount() > 0);
}
