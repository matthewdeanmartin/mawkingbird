import { Component, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { VaultBridge } from '../../../../providers/vault/vault-bridge';
import { credentialLocation, StorageBadge } from '../storage-badge';

/** The registry base this page's credential is stored under. */
const RAINDROP_KEY = 'mockingbird_raindrop_token';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RaindropSession } from '../../../../providers/raindrop/raindrop-session';
import { expiryLabel } from '../expiry-label';
import { CONNECTION_SCOPE_COPY } from '../connection-catalog';
import { PageDiagnostics } from '../../../../page-diagnostics';

// i18n settings.connections.raindrop.title: 💧 Raindrop.io bookmarks
// i18n settings.connections.raindrop.intro: Add Raindrop.io as a second bookmark provider. When you bookmark a post, you can save the post itself or unwrap it and save its first external link. Hashtags and links back to your Mastodon instance are skipped.
// i18n settings.connections.raindrop.step1: Create or open an app in Raindrop.io's App Management Console.
// i18n settings.connections.raindrop.copyThe: Copy the
// i18n settings.connections.raindrop.testToken: Test token
// i18n settings.connections.raindrop.shownInSettings: shown in that app's settings.
// i18n settings.connections.raindrop.step3: Paste the Test token below and choose "Save connection".
// i18n settings.connections.raindrop.oauthNote: Client ID/secret OAuth is intentionally not used here: Raindrop's OAuth token exchange does not permit browser CORS. Their Test token is the supported shortcut when an app only accesses its owner's account; bookmark API calls still go directly from this browser to Raindrop.io.
// i18n settings.connections.raindrop.credentialWarning: The Test token grants access to your Raindrop.io account and is stored in this browser's localStorage. Only use this on a device and browser profile you trust. You can replace the token in Raindrop.io to revoke access.
// i18n settings.connections.raindrop.connected: Connected
// i18n settings.connections.raindrop.disconnect: Disconnect
// i18n settings.connections.raindrop.tokenDeletedOn: This token is deleted from this browser on {{date}}.
// i18n settings.connections.raindrop.tokenClearedOn: This token is cleared from this browser on {{date}}, and fetched back from your vault the next time it is needed.
// i18n settings.connections.raindrop.tokenPlaceholder: Raindrop.io Test token
// i18n settings.connections.raindrop.save: Save connection
// i18n settings.connections.raindrop.connectedFull: Raindrop.io connected. Bookmark buttons now offer both providers.
// i18n settings.connections.raindrop.connectFailed: Couldn't connect Raindrop.io.
/** Settings → Connections → Raindrop.io. Test-token paste; no OAuth (see the copy). */
@Component({
  selector: 'app-connection-raindrop',
  imports: [FormsModule, RouterLink, StorageBadge, TranslocoPipe],
  templateUrl: './connection-raindrop.html',
  styleUrls: ['../connection-page.css', './connection-raindrop.css'],
})
export class ConnectionRaindrop implements OnInit {
  protected raindrop = inject(RaindropSession);
  private bridge = inject(VaultBridge);
  private diagnostics = inject(PageDiagnostics);
  private transloco = inject(TranslocoService);

  protected raindropToken = signal('');
  protected raindropError = signal<string | null>(null);
  protected raindropNotice = signal<string | null>(null);

  protected readonly expiryLabel = expiryLabel;

  /** The storage-scope sentence shown under the heading. */
  protected readonly scopeDetail = CONNECTION_SCOPE_COPY.account.detail;

  ngOnInit(): void {
    // Deep-link case: re-check against a policy shortened on the catalog page.
    this.raindrop.enforceLifetime();
  }

  connectRaindrop(): void {
    this.raindropError.set(null);
    this.raindropNotice.set(null);
    try {
      this.raindrop.connect(this.raindropToken());
      this.raindropToken.set('');
      this.raindropNotice.set(
        this.transloco.translate<string>('settings.connections.raindrop.connectedFull'),
      );
    } catch (error: unknown) {
      this.diagnostics.error('Raindrop', 'connect:error', error);
      this.raindropError.set(
        error instanceof Error
          ? error.message
          : this.transloco.translate<string>('settings.connections.raindrop.connectFailed'),
      );
    }
  }

  disconnectRaindrop(): void {
    this.raindrop.disconnect();
    this.raindropNotice.set(null);
  }

  /**
   * Where this credential lives, for the badge.
   *
   * Reads the connector's own facts rather than the vault's state: a locked
   * vault is not a locked credential. See `storage-badge.ts`.
   */
  protected where() {
    return credentialLocation(this.bridge.syncs(RAINDROP_KEY), this.raindrop.needsFetch());
  }
}
