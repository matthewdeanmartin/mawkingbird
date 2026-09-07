import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { GitHubSession } from '../../../../providers/github/github-session';
import { expiryLabel } from '../expiry-label';
import { credentialLocation, StorageBadge } from '../storage-badge';
import { VaultBridge } from '../../../../providers/vault/vault-bridge';

/** The registry base this page's credential is stored under. */
const GITHUB_KEY = 'mockingbird_github_credentials';
import { CONNECTION_SCOPE_COPY } from '../connection-catalog';
import { PageDiagnostics } from '../../../../page-diagnostics';

// i18n settings.connections.github.title: 🐙 GitHub
// i18n settings.connections.github.intro: GitHub's REST API works directly from this browser. GitHub's OAuth and device-flow token endpoints do not allow browser CORS, so a serverless connection must use a token you create and paste here.
// i18n settings.connections.github.disconnect: Disconnect
// i18n settings.connections.github.tokenPlaceholder: GitHub token (ghp_…)
// i18n settings.connections.github.calling: Calling GitHub…
// i18n settings.connections.github.runProof: Run API proof
// i18n settings.connections.github.tokenDeletedOn: This token is deleted from this browser on {{date}}.
// i18n settings.connections.github.tokenClearedOn: This token is cleared from this browser on {{date}}, and fetched back from your vault the next time it is needed.
// i18n settings.connections.github.lookingForFriends: Looking for the same people on Mastodon?
// i18n settings.connections.github.findFriendsLink: Find GitHub friends
// i18n settings.connections.github.findFriendsAfter: using profile links first, then a limited username search—with follow actions in the results.
// i18n settings.connections.github.success: Success.
// i18n settings.connections.github.unreadNotifications.one: Read {{count}} unread notification
// i18n settings.connections.github.unreadNotifications.other: Read {{count}} unread notifications
// i18n settings.connections.github.followedAccounts.one: and the first {{count}} followed account
// i18n settings.connections.github.followedAccounts.other: and the first {{count}} followed accounts
// i18n settings.connections.github.directlyFrom: directly from <code>api.github.com</code>.
// i18n settings.connections.github.createTokenLink: Create a classic personal access token
// i18n settings.connections.github.tokenScopes: with <code>notifications</code> and <code>read:user</code>.
// i18n settings.connections.github.validatesWith: Paste it below. Mawkingbird validates it with <code>GET /user</code>.
// i18n settings.connections.github.credentialWarning: This token can read your GitHub notifications. It is stored in this browser's localStorage, never sent to Mawkingbird, and sent only to <code>api.github.com</code>. Use a browser profile and device you trust; revoke the token in GitHub to invalidate it.
// i18n settings.connections.github.checking: Checking…
// i18n settings.connections.github.connect: Connect GitHub
// i18n settings.connections.github.connectedAs: GitHub connected as @{{login}}.
// i18n settings.connections.github.connectFailed: Couldn't connect GitHub.
// i18n settings.connections.github.proofCompleted: GitHub API proof completed in this browser.
// i18n settings.connections.github.proofFailed: Couldn't call the GitHub API.
/** Settings → Connections → GitHub. Token paste, validation, and the API proof. */
@Component({
  selector: 'app-connection-github',
  imports: [FormsModule, RouterLink, StorageBadge, TranslocoPipe],
  templateUrl: './connection-github.html',
  styleUrls: ['../connection-page.css', './connection-github.css'],
})
export class ConnectionGitHub implements OnInit {
  protected github = inject(GitHubSession);
  private bridge = inject(VaultBridge);
  private diagnostics = inject(PageDiagnostics);
  private transloco = inject(TranslocoService);

  protected githubToken = signal('');
  protected githubBusy = signal(false);
  protected githubError = signal<string | null>(null);
  protected githubNotice = signal<string | null>(null);

  protected readonly expiryLabel = expiryLabel;

  /**
   * Where this credential lives, for the badge.
   *
   * Reads the connector's own facts rather than the vault's state: a locked
   * vault is not a locked credential. See `storage-badge.ts`.
   */
  protected where() {
    return credentialLocation(this.bridge.syncs(GITHUB_KEY), this.github.needsFetch());
  }

  /** The storage-scope sentence shown under the heading. */
  protected readonly scopeDetail = CONNECTION_SCOPE_COPY.account.detail;

  ngOnInit(): void {
    // The catalog page governs the whole set for the policy picker; this page
    // may have been reached by deep link, in which case nothing has re-checked
    // this credential against a policy the user shortened elsewhere.
    this.github.enforceLifetime();
  }

  async connectGitHub(): Promise<void> {
    if (this.githubBusy()) {
      return;
    }
    this.githubBusy.set(true);
    this.githubError.set(null);
    this.githubNotice.set(null);
    try {
      const user = await this.github.connect(this.githubToken());
      this.githubToken.set('');
      this.githubNotice.set(
        this.transloco.translate<string>('settings.connections.github.connectedAs', {
          login: user.login,
        }),
      );
    } catch (error: unknown) {
      this.diagnostics.error('GitHub', 'connect:error', error);
      this.githubError.set(
        describeError(
          error,
          this.transloco.translate<string>('settings.connections.github.connectFailed'),
        ),
      );
    } finally {
      this.githubBusy.set(false);
    }
  }

  async proveGitHubConnection(): Promise<void> {
    if (this.githubBusy()) {
      return;
    }
    this.githubBusy.set(true);
    this.githubError.set(null);
    this.githubNotice.set(null);
    try {
      await this.github.runProof();
      this.githubNotice.set(
        this.transloco.translate<string>('settings.connections.github.proofCompleted'),
      );
    } catch (error: unknown) {
      this.diagnostics.error('GitHub', 'proof:error', error);
      this.githubError.set(
        describeError(
          error,
          this.transloco.translate<string>('settings.connections.github.proofFailed'),
        ),
      );
    } finally {
      this.githubBusy.set(false);
    }
  }

  disconnectGitHub(): void {
    this.github.disconnect();
    this.githubNotice.set(null);
    this.githubError.set(null);
  }
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
