import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { accountProfilePath } from '../../../account-route';
import { MbButton } from '../../../design-system/button/button';
import { GitHubSession } from '../../../providers/github/github-session';
import { GitHubFriendDiscovery, GitHubFriendStatus } from './github-friend-discovery';

// i18n settings.importExport.github.callsUsed: {{used}} / {{limit}} username-search calls used.
// i18n settings.importExport.github.checked.a: Checked
// i18n settings.importExport.github.checked.b: starred repositories and
// i18n settings.importExport.github.checked.c: unique owners; contributors were not loaded.
// i18n settings.importExport.github.checkingStarred: Checking starred repo owners…
// i18n settings.importExport.github.follows.body: The shorter, higher-confidence list. Direct profile links are matched first; remaining profiles can be searched once by GitHub username.
// i18n settings.importExport.github.follows.title: People you follow on GitHub
// i18n settings.importExport.github.friends.one: {{count}} GitHub friend
// i18n settings.importExport.github.friends.other: {{count}} GitHub friends
// i18n settings.importExport.github.intro: Use either or both GitHub sources. Exact handles are resolved through your Mastodon server so results open inside Mawkingbird and show your follow status.
// i18n settings.importExport.github.linkedSummary: {{count}} matched directly from GitHub profile links. Loaded in
// i18n settings.importExport.github.loadingFollows: Loading GitHub follows…
// i18n settings.importExport.github.mastodonMatches.one: {{count}} Mastodon match
// i18n settings.importExport.github.mastodonMatches.other: {{count}} Mastodon matches
// i18n settings.importExport.github.matchViaFriends: Get matches via GitHub friends
// i18n settings.importExport.github.matchViaStars: Get matches via GitHub stars
// i18n settings.importExport.github.reloadFollows: Reload GitHub follows
// i18n settings.importExport.github.requests.one: {{count}} GitHub GraphQL request
// i18n settings.importExport.github.requests.other: {{count}} GitHub GraphQL requests
// i18n settings.importExport.github.resolved.one: and resolved {{count}} exact linked profile through your server.
// i18n settings.importExport.github.resolved.other: and resolved {{count}} exact linked profiles through your server.
// i18n settings.importExport.github.starred.body: The longer, lower-confidence list. Checks each unique repository owner for a direct Mastodon profile link. Contributors and stargazers are never loaded.
// i18n settings.importExport.github.starred.title: Owners of repositories you starred
// i18n settings.importExport.github.starredMatches.one: {{count}} starred-owner match
// i18n settings.importExport.github.starredMatches.other: {{count}} starred-owner matches
// i18n settings.importExport.github.starsChecked: GitHub stars checked
// i18n settings.importExport.github.title: Find GitHub friends on Mastodon
// i18n settings.importExport.github.youStarred: You starred:

/**
 * GitHub follows and starred-repo owners → Mastodon accounts, with in-place
 * follows. Profile links first, then a limited username search.
 *
 * Shared by Settings → Import/Export and the /github-to-mastodon mini-app; both
 * render it only once GitHub is connected and a Mastodon account is signed in.
 */
@Component({
  selector: 'app-github-friends-import',
  imports: [FormsModule, RouterLink, TranslocoPipe, MbButton],
  templateUrl: './github-friends-import.html',
  styleUrl: './friend-finder.css',
})
export class GitHubFriendsImport {
  protected readonly accountProfilePath = accountProfilePath;
  protected github = inject(GitHubSession);
  protected githubDiscovery = inject(GitHubFriendDiscovery);
  protected githubCallLimit = signal(20);
  protected hideGithubFollowed = signal(false);

  protected githubFoundCount = computed(() =>
    this.githubDiscovery
      .rows()
      .reduce((count, row) => count + (row.identity ? 1 : row.matches.length), 0),
  );
  protected githubLinkedCount = computed(
    () => this.githubDiscovery.rows().filter((row) => row.identity).length,
  );
  protected githubPendingCount = computed(
    () => this.githubDiscovery.rows().filter((row) => row.status === 'pending').length,
  );
  protected githubFollowingProfileCount = computed(
    () => this.githubDiscovery.rows().filter((row) => row.source !== 'starred-owner').length,
  );
  protected githubStarredMatchCount = computed(
    () => this.githubDiscovery.rows().filter((row) => row.source === 'starred-owner').length,
  );
  protected githubVisibleRows = computed(() =>
    this.githubDiscovery.rows().filter((row) => {
      const renderable =
        row.identity || row.matches.length || row.status === 'searching' || row.status === 'failed';
      return (
        renderable &&
        (!this.hideGithubFollowed() ||
          !row.matches.length ||
          row.matches.some(
            (match) => !this.githubDiscovery.relationship(match.account.id)?.following,
          ))
      );
    }),
  );

  protected loadGitHubFriends(): void {
    void this.githubDiscovery.load();
  }

  protected loadGitHubStarredOwners(): void {
    void this.githubDiscovery.loadStarredOwners();
  }

  protected startGitHubSearch(): void {
    void this.githubDiscovery.start(this.githubCallLimit());
  }

  protected setGitHubCallLimit(value: number | string): void {
    const parsed = Number(value);
    this.githubCallLimit.set(
      Number.isFinite(parsed) ? Math.min(1000, Math.max(1, Math.floor(parsed))) : 20,
    );
  }

  protected githubStatusLabel(status: GitHubFriendStatus): string {
    switch (status) {
      case 'pending':
        return 'waiting';
      case 'searching':
        return 'searching…';
      case 'complete':
        return 'checked';
      default:
        return 'failed';
    }
  }
}
