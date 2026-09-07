import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { GistProvider } from '../../../../providers/paste/gist-provider';
import { GistSettings } from '../../../../providers/paste/gist-settings';
import { CONNECTION_SCOPE_COPY } from '../connection-catalog';
import { expiryLabel } from '../expiry-label';
import { credentialLocation, StorageBadge } from '../storage-badge';
import { VaultBridge } from '../../../../providers/vault/vault-bridge';
import { PageDiagnostics } from '../../../../page-diagnostics';

/** The registry base this page's credential is stored under. */
const GIST_KEY = 'mockingbird_gist_credentials';

// i18n settings.connections.gist.back: ‹ All connections
// i18n settings.connections.gist.title: 📝 GitHub Gist
// i18n settings.connections.gist.intro.a: Publish pastes as gists on your GitHub account. Gist becomes one more option wherever you can post a paste — and because every paste service is also a draft source, anything you create shows up in
// i18n settings.connections.gist.drafts: Drafts
// i18n settings.connections.gist.intro.b: and in
// i18n settings.connections.gist.write: Write
// i18n settings.connections.gist.intro.c: alongside the rest of your unpublished writing.
// i18n settings.connections.gist.step1.open: Open
// i18n settings.connections.gist.step1.link: GitHub → Settings → Developer settings → Personal access tokens ↗
// i18n settings.connections.gist.step1.after: and generate a classic token.
// i18n settings.connections.gist.step2.tick: Tick
// i18n settings.connections.gist.step2.scope: gist
// i18n settings.connections.gist.step2.rest: , and nothing else. This connector needs no repository access at all.
// i18n settings.connections.gist.step3: Paste it below and connect.
// i18n settings.connections.gist.warning.a: This token can create, edit, and delete gists on your account. It is deliberately separate from the token used by the
// i18n settings.connections.gist.githubConnector: GitHub connector
// i18n settings.connections.gist.warning.b: (read-only) and the one used by
// i18n settings.connections.gist.hugo: Hugo
// i18n settings.connections.gist.warning.c: (one repository) — so that no single stored string reaches more of your account than the feature it belongs to.
// i18n settings.connections.gist.connected: Connected
// i18n settings.connections.gist.viewGists: View your gists ↗
// i18n settings.connections.gist.disconnect: Disconnect
// i18n settings.connections.gist.deletedOn: This token is deleted from this browser on {{date}}.
// i18n settings.connections.gist.tokenLabel: Personal access token (classic, gist scope)
// i18n settings.connections.gist.tokenPlaceholder: ghp_…
// i18n settings.connections.gist.checking: Checking…
// i18n settings.connections.gist.connect: Connect
// i18n settings.connections.gist.whatIsTitle: What a gist paste is
// i18n settings.connections.gist.public: Public
// i18n settings.connections.gist.publicDesc: gists are listed on your GitHub profile.
// i18n settings.connections.gist.unlisted: Unlisted
// i18n settings.connections.gist.unlistedDesc: ones are GitHub's "secret" gists — not listed anywhere, but anyone with the link can read them. Neither is private.
// i18n settings.connections.gist.noExpiry: Gists never expire. There is no burn-after-reading and no time limit.
// i18n settings.connections.gist.editingWorks: Editing works from here, unlike the anonymous paste services: the gist belongs to your account rather than to an edit code saved in this browser. Losing this browser does not lose the gist.
// i18n settings.connections.gist.singleFileOnly: Only gists with a single file are listed back — a multi-file gist is a project, not a note.
// i18n settings.connections.gist.error.noToken: Paste a GitHub personal access token with the gist scope.
// i18n settings.connections.gist.error.saveFailed: Couldn't save this token.
// i18n settings.connections.gist.error.rejected: GitHub rejected that token. Check it is active and has the gist scope — nothing else.
// i18n settings.connections.gist.notice.connected: Connected as @{{login}}. Gist is now an option wherever you post a paste.
// i18n settings.connections.gist.notice.disconnected: Disconnected. Gists you already created are untouched on GitHub.

/**
 * Settings → Connections → GitHub Gist.
 *
 * No CORS proxy here, unlike Mataroa: `api.github.com` sends
 * `Access-Control-Allow-Origin` on authenticated writes, so the browser can
 * talk to it directly. That is a verified property of the API, not an
 * assumption — the Hugo connector depends on the same thing.
 */
@Component({
  selector: 'app-connection-gist',
  imports: [FormsModule, RouterLink, StorageBadge, TranslocoPipe],
  templateUrl: './connection-gist.html',
  styleUrls: ['../connection-page.css'],
})
export class ConnectionGist implements OnInit {
  protected readonly settings = inject(GistSettings);
  private readonly bridge = inject(VaultBridge);
  private readonly provider = inject(GistProvider);
  private readonly diagnostics = inject(PageDiagnostics);
  private readonly transloco = inject(TranslocoService);

  protected readonly token = signal('');
  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly scopeDetail = CONNECTION_SCOPE_COPY.account.detail;
  protected readonly expiryLabel = expiryLabel;

  /**
   * Where this credential lives, for the badge.
   *
   * Reads the connector's own facts rather than the vault's state: a locked
   * vault is not a locked credential. See `storage-badge.ts`.
   */
  protected where() {
    return credentialLocation(this.bridge.syncs(GIST_KEY), this.settings.needsFetch());
  }

  ngOnInit(): void {
    this.settings.enforceLifetime();
  }

  /**
   * Prove the token works, *then* store it.
   *
   * In that order deliberately: a token that turns out to be bad should never
   * have been written to storage at all. `/user` is the cheapest call that
   * proves the token is live, and it returns the login the provider names
   * itself with — so one request does both jobs.
   */
  connect(): void {
    const token = this.token().trim();
    this.error.set(null);
    this.notice.set(null);
    if (!token) {
      this.error.set(this.transloco.translate('settings.connections.gist.error.noToken'));
      return;
    }

    this.busy.set(true);
    this.provider.whoami(token).subscribe({
      next: (user) => {
        this.busy.set(false);
        try {
          this.settings.connect(token, { login: user.login });
        } catch (error: unknown) {
          this.diagnostics.error('Gist', 'save-token:error', error);
          this.error.set(
            error instanceof Error
              ? error.message
              : this.transloco.translate('settings.connections.gist.error.saveFailed'),
          );
          return;
        }
        this.token.set('');
        this.notice.set(
          this.transloco.translate('settings.connections.gist.notice.connected', {
            login: user.login,
          }),
        );
      },
      error: () => {
        this.busy.set(false);
        // Nothing was stored, so there is nothing to undo.
        this.error.set(this.transloco.translate('settings.connections.gist.error.rejected'));
      },
    });
  }

  disconnect(): void {
    this.settings.disconnect();
    this.token.set('');
    this.notice.set(this.transloco.translate('settings.connections.gist.notice.disconnected'));
    this.error.set(null);
  }
}
