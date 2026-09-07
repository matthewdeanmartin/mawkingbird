import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MataroaApi } from '../../../../providers/mataroa/mataroa-api';
import { MataroaSettings } from '../../../../providers/mataroa/mataroa-settings';
import { CorsProxy } from '../../../../providers/cors-proxy/cors-proxy';
import { ProxyConsent } from '../../../../providers/proxy-consent-store';
import { expiryLabel } from '../expiry-label';
import { credentialLocation, StorageBadge } from '../storage-badge';
import { VaultBridge } from '../../../../providers/vault/vault-bridge';

/** The registry base this page's credential is stored under. */
const MATAROA_KEY = 'mockingbird_mataroa_connection';
import { CONNECTION_SCOPE_COPY } from '../connection-catalog';
import { PageDiagnostics } from '../../../../page-diagnostics';

// i18n settings.connections.mataroa.title: ✍️ Blog (Mataroa)
// i18n settings.connections.mataroa.introBefore: Publish Markdown posts to one Mataroa blog from the composer. One Mataroa blog per signed-in account; the
// i18n settings.connections.mataroa.bloggerLink: Blogger connector
// i18n settings.connections.mataroa.introAfter: is separate and can be connected at the same time.
// i18n settings.connections.mataroa.step1: Open Mataroa's dashboard and copy the API key from its API page.
// i18n settings.connections.mataroa.setUpProxyLink: Set up a CORS proxy
// i18n settings.connections.mataroa.setUpProxyAfter: that forwards custom headers.
// i18n settings.connections.mataroa.step3: Enter the public address of your blog, then save and test the connection.
// i18n settings.connections.mataroa.credentialWarning: Mataroa's API key can publish, edit, and delete your writing. Its API does not accept browser requests directly, so the configured CORS proxy will see this key and the posts you publish. Only continue with a proxy operator you trust.
// i18n settings.connections.mataroa.connected: Connected
// i18n settings.connections.mataroa.viewBlog: View blog ↗
// i18n settings.connections.mataroa.disconnect: Disconnect
// i18n settings.connections.mataroa.keyDeletedOn: This API key is deleted from this browser on {{date}}.
// i18n settings.connections.mataroa.keyClearedOn: This API key is cleared from this browser on {{date}}, and fetched back from your vault the next time it is needed.
// i18n settings.connections.mataroa.includeRssLabel: Include my blog's RSS feed in my profile feed
// i18n settings.connections.mataroa.includeRssNote: Your published blog posts appear alongside your Mawkingbird posts on your own profile.
// i18n settings.connections.mataroa.apiKeyLabel: API key
// i18n settings.connections.mataroa.apiKeyPlaceholder: Mataroa API key
// i18n settings.connections.mataroa.blogUrlLabel: Public blog address
// i18n settings.connections.mataroa.blogUrlPlaceholder: https://you.mataroa.blog/
// i18n settings.connections.mataroa.includeRssCheckbox: Include this blog's RSS feed in my profile feed
// i18n settings.connections.mataroa.proxyConsent: I understand that {{proxy}} can read my Mataroa API key and post contents.
// i18n settings.connections.mataroa.proxyCannotForward: {{proxy}} cannot forward the Authorization header Mataroa requires.
// i18n settings.connections.mataroa.noProxy: No CORS proxy is configured.
// i18n settings.connections.mataroa.testing: Testing…
// i18n settings.connections.mataroa.saveAndTest: Save and test connection
// i18n settings.connections.mataroa.needsProxyFirst: Choose a CORS proxy that forwards custom headers first.
// i18n settings.connections.mataroa.needsConsent: Confirm that you understand what the proxy can see.
// i18n settings.connections.mataroa.saveFailed: Couldn't save this connection.
// i18n settings.connections.mataroa.connectedFull: Mataroa connected. Blog is now available in the composer.
// i18n settings.connections.mataroa.rejectedWithMessage: Mataroa rejected the connection: {{message}}
// i18n settings.connections.mataroa.unreachableViaProxy: Mataroa couldn't be reached through this proxy.
/** Settings → Connections → Blog (Mataroa). */
@Component({
  selector: 'app-connection-mataroa',
  imports: [FormsModule, RouterLink, StorageBadge, TranslocoPipe],
  templateUrl: './connection-mataroa.html',
  styleUrls: ['../connection-page.css', './connection-mataroa.css'],
})
export class ConnectionMataroa implements OnInit {
  protected readonly settings = inject(MataroaSettings);
  private readonly bridge = inject(VaultBridge);
  private readonly api = inject(MataroaApi);
  private readonly proxy = inject(CorsProxy);
  private readonly consent = inject(ProxyConsent);
  private readonly diagnostics = inject(PageDiagnostics);
  private readonly transloco = inject(TranslocoService);

  protected readonly apiKey = signal('');
  protected readonly blogUrl = signal('');
  protected readonly includeInProfile = signal(false);
  protected readonly understandsProxy = signal(false);
  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly proxyEntry = computed(() => this.proxy.entry());
  protected readonly proxyReady = computed(
    () => this.proxy.available() && this.proxyEntry()?.forwardsCustomHeaders === true,
  );
  protected readonly scopeDetail = CONNECTION_SCOPE_COPY.account.detail;
  protected readonly expiryLabel = expiryLabel;

  /**
   * Where this credential lives, for the badge.
   *
   * Reads the connector's own facts rather than the vault's state: a locked
   * vault is not a locked credential. See `storage-badge.ts`.
   */
  protected where() {
    return credentialLocation(this.bridge.syncs(MATAROA_KEY), this.settings.needsFetch());
  }

  ngOnInit(): void {
    this.settings.enforceLifetime();
    this.blogUrl.set(this.settings.blogUrl() ?? '');
    this.includeInProfile.set(this.settings.includeInProfile());
  }

  connect(): void {
    const proxy = this.proxyEntry();
    if (!proxy || !this.proxyReady()) {
      this.error.set(
        this.transloco.translate<string>('settings.connections.mataroa.needsProxyFirst'),
      );
      return;
    }
    if (!this.understandsProxy()) {
      this.error.set(this.transloco.translate<string>('settings.connections.mataroa.needsConsent'));
      return;
    }
    this.error.set(null);
    this.notice.set(null);
    try {
      this.settings.connect(this.apiKey(), this.blogUrl(), this.includeInProfile());
    } catch (error: unknown) {
      this.diagnostics.error('Mataroa', 'save-connection:error', error);
      this.error.set(
        error instanceof Error
          ? error.message
          : this.transloco.translate<string>('settings.connections.mataroa.saveFailed'),
      );
      return;
    }

    this.consent.grant('mataroa', proxy.id);
    this.busy.set(true);
    this.api.listPosts().subscribe({
      next: () => {
        this.busy.set(false);
        this.apiKey.set('');
        this.notice.set(
          this.transloco.translate<string>('settings.connections.mataroa.connectedFull'),
        );
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.settings.disconnect();
        this.consent.revoke('mataroa', proxy.id);
        this.error.set(
          error instanceof Error
            ? this.transloco.translate<string>('settings.connections.mataroa.rejectedWithMessage', {
                message: error.message,
              })
            : this.transloco.translate<string>('settings.connections.mataroa.unreachableViaProxy'),
        );
      },
    });
  }

  setProfileFeed(include: boolean): void {
    this.includeInProfile.set(include);
    this.settings.setIncludeInProfile(include);
  }

  disconnect(): void {
    this.settings.disconnect();
    this.consent.revokeAll('mataroa');
    this.notice.set(null);
    this.error.set(null);
    this.understandsProxy.set(false);
  }
}
