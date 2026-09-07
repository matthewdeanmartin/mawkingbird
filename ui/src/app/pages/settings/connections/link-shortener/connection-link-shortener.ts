import { Component, computed, inject, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { credentialLocation, StorageBadge } from '../storage-badge';
import { VaultBridge } from '../../../../providers/vault/vault-bridge';

/** The registry base this page's credentials are stored under. */
const SHORTENER_KEY = 'mockingbird_shortener_keys';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CorsProxy } from '../../../../providers/cors-proxy/cors-proxy';
import { CorsProxyEntry } from '../../../../providers/cors-proxy/cors-proxy-catalog';
import { ProxyConsentDialog } from '../../../../providers/shortener/proxy-consent-dialog/proxy-consent-dialog';
import { ShortenerProxyConsent } from '../../../../providers/shortener/proxy-consent';
import {
  SHORTENER_CATALOG,
  ShortenerCatalogEntry,
} from '../../../../providers/shortener/shortener-catalog';
import { ShortenerHistory } from '../../../../providers/shortener/shortener-history';
import {
  ReachabilityResult,
  ShortenerReachability,
} from '../../../../providers/shortener/shortener-reachability';
import { ShortenerId } from '../../../../providers/shortener/shortener-provider';
import { ShortenerRegistry } from '../../../../providers/shortener/shortener-registry';
import { ShortenerSettings } from '../../../../providers/shortener/shortener-settings';
import { ProxyConsentRequired } from '../../../../providers/shortener/shortener-transport';
import { CONNECTION_SCOPE_COPY } from '../connection-catalog';
import { expiryLabel } from '../expiry-label';
import { PageDiagnostics } from '../../../../page-diagnostics';

/**
 * Settings → Connections → Link shortener.
 *
 * ## Connect means verified, not "key pasted"
 *
 * The one rule this page exists to enforce. Storing a key and calling that
 * "connected" would be a lie in the common case: these APIs mostly refuse
 * browsers, so a perfectly valid key can still be useless here. Saving without
 * checking would leave the user with a green tick and a Links page that fails on
 * every action, with nothing pointing at the cause.
 *
 * So {@link save} runs the real sequence:
 *
 * 1. Store the key provisionally — the transport reads it from settings, so it
 *    has to be there to make the call at all.
 * 2. Call the provider's cheapest authenticated endpoint.
 * 3. On success, keep it. That is a connection.
 * 4. On a *credential* failure, roll the key back out of storage. A rejected key
 *    is not worth keeping, and leaving it would age into a mystery later.
 * 5. On a CORS failure, do not roll back yet — ask about the proxy, and retry if
 *    the user consents. The key may well be fine.
 *
 * Only step 5 needs the dialog, and the dialog only appears when a proxy is
 * actually configured. Without one there is nothing to consent to, so the page
 * says what to go and do instead.
 */
// i18n settings.connections.linkShortener.title: 🔗 Link shortener
// i18n settings.connections.linkShortener.intro: Shorten the URLs you post, and keep track of the links you have made. Connect one or more services; the active one is used whenever you shorten something.
// i18n settings.connections.linkShortener.credentialWarning: These API keys are stored in this browser's localStorage, because Mawkingbird has no server to keep them on. A key here can create and delete links in your account, so use a key scoped to link management if the service offers one, and only on a device you trust. You can revoke it on the provider's own site at any time.
// i18n settings.connections.linkShortener.servicesHeading: Services
// i18n settings.connections.linkShortener.activePill: Active
// i18n settings.connections.linkShortener.connectedPill: Connected
// i18n settings.connections.linkShortener.signInToBefore: Sign in to
// i18n settings.connections.linkShortener.signInToAnd: and open
// i18n settings.connections.linkShortener.apiSettingsLink: your API settings
// i18n settings.connections.linkShortener.createKey: Create a {{keyLabel}} and copy it.
// i18n settings.connections.linkShortener.domainNeeded: Note the short domain on your account — {{label}} needs it to make links.
// i18n settings.connections.linkShortener.pasteBelow: Paste it below. Mawkingbird tests the key before saving the connection.
// i18n settings.connections.linkShortener.noAccountNeeded: {{label}} has no accounts and needs no setup — choose it and start shortening. Because there is no account, it cannot list, edit or delete links afterwards; Mawkingbird keeps its own record of the ones you make here.
// i18n settings.connections.linkShortener.worksWithNoSetup: {{label}} works with no setup at all.
// i18n settings.connections.linkShortener.keySaved: Key saved
// i18n settings.connections.linkShortener.readyNoAccount: Ready — no account needed
// i18n settings.connections.linkShortener.makeActive: Make active
// i18n settings.connections.linkShortener.testing: Testing…
// i18n settings.connections.linkShortener.testAgain: Test again
// i18n settings.connections.linkShortener.disconnect: Disconnect
// i18n settings.connections.linkShortener.setUpProxyLink: Set up a CORS proxy
// i18n settings.connections.linkShortener.keyDeletedOn: This key is deleted from this browser on {{date}}.
// i18n settings.connections.linkShortener.consentBefore: You have allowed this key to be sent through
// i18n settings.connections.linkShortener.consentAfter: when a direct request fails.
// i18n settings.connections.linkShortener.withdraw: Withdraw that
// i18n settings.connections.linkShortener.workspaceLabel: Workspace
// i18n settings.connections.linkShortener.shortDomainLabel: Short domain
// i18n settings.connections.linkShortener.optional: (optional)
// i18n settings.connections.linkShortener.workspaceIdPlaceholder: Workspace ID
// i18n settings.connections.linkShortener.shortDomainPlaceholder: go.example.com
// i18n settings.connections.linkShortener.keyPlaceholder: {{label}} {{keyLabel}}
// i18n settings.connections.linkShortener.saveAndTest: Save and test connection
// i18n settings.connections.linkShortener.use: Use {{label}}
// i18n settings.connections.linkShortener.readPrivacyBefore: Read {{label}}'s
// i18n settings.connections.linkShortener.privacyPolicyLink: privacy policy
// i18n settings.connections.linkShortener.readPrivacyAfter: to see what they record about the links you create and the people who click them.
// i18n settings.connections.linkShortener.nowActive: {{label}} is now the active shortener.
// i18n settings.connections.linkShortener.pasteKeyFirst: Paste your {{label}} {{keyLabel}} first.
// i18n settings.connections.linkShortener.needsDomain: {{label}} needs the short domain from your account.
// i18n settings.connections.linkShortener.connectedFull: Connected to {{label}}. Your key works from this browser.
// i18n settings.connections.linkShortener.couldNotReach: Couldn't reach {{label}}.
// i18n settings.connections.linkShortener.needsProxy: {{label}}'s API doesn't answer web browsers directly, so Mawkingbird needs a CORS proxy to reach it. Set one up under CORS proxy, then come back and test again.
// i18n settings.connections.linkShortener.notSentThroughProxy: Not sent through {{proxy}}. The direct attempt also failed. Retry later, or choose a different CORS proxy.
// i18n settings.connections.linkShortener.probeResult: {{label}}: {{message}}
// i18n settings.connections.linkShortener.consentWithdrawn: Consent withdrawn. You will be asked again next time.
// i18n settings.connections.linkShortener.disconnectedFull: {{label}} disconnected and its saved links cleared.
@Component({
  selector: 'app-connection-link-shortener',
  imports: [FormsModule, RouterLink, ProxyConsentDialog, StorageBadge, TranslocoPipe],
  templateUrl: './connection-link-shortener.html',
  styleUrls: ['../connection-page.css', './connection-link-shortener.css'],
})
export class ConnectionLinkShortener {
  private readonly diagnostics = inject(PageDiagnostics);
  private readonly transloco = inject(TranslocoService);
  protected settings = inject(ShortenerSettings);
  protected registry = inject(ShortenerRegistry);
  protected consent = inject(ShortenerProxyConsent);
  private bridge = inject(VaultBridge);
  private proxy = inject(CorsProxy);
  private history = inject(ShortenerHistory);
  private reachability = inject(ShortenerReachability);

  protected readonly catalog = SHORTENER_CATALOG;
  protected readonly scopeDetail = CONNECTION_SCOPE_COPY.browser.detail;
  protected readonly expiryLabel = expiryLabel;

  /** Which provider's setup form is open. Defaults to the active one. */
  protected readonly selected = signal<ShortenerId>(this.settings.activeId() ?? 'dub');

  protected readonly entry = computed<ShortenerCatalogEntry>(
    () => this.catalog.find((item) => item.id === this.selected()) ?? this.catalog[0],
  );

  /** Draft key. Never prefilled from storage — a stored key is not readable back. */
  protected readonly keyDraft = signal('');
  protected readonly domainDraft = signal(this.settings.domain(this.selected()));

  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  /** Set while the consent dialog is open; holds what the retry needs. */
  protected readonly consentPrompt = signal<{
    shortener: ShortenerCatalogEntry;
    proxy: CorsProxyEntry;
    carriesCredential: boolean;
  } | null>(null);

  /** Which connectivity check should resume after the user grants consent. */
  private pendingConsentRetry: 'verify' | 'probe' = 'verify';

  /** The proxy in play, for the "already consented" note on the page. */
  protected readonly proxyEntry = computed(() => this.proxy.entry());

  /** The most recent reachability verdict, shown under the actions row. */
  protected readonly lastProbe = signal<ReachabilityResult | null>(null);

  protected choose(id: ShortenerId): void {
    this.selected.set(id);
    this.keyDraft.set('');
    this.domainDraft.set(this.settings.domain(id));
    this.notice.set(null);
    this.error.set(null);
    // A verdict belongs to the provider it was measured against.
    this.lastProbe.set(null);
  }

  /**
   * Whether the form can be submitted.
   *
   * A required-key provider needs a key typed in; the other two are always
   * submittable, because "use this one" is the entire configuration.
   */
  protected canSubmit(): boolean {
    return this.entry().keyPolicy !== 'required' || !!this.keyDraft().trim();
  }

  /**
   * Whether this provider is set up enough to be used.
   *
   * Not the same as "has a key": is.gd and TinyURL are ready with none, so this
   * asks whether they are *configured* rather than whether a secret is stored.
   */
  protected connected(id: ShortenerId): boolean {
    const entry = this.catalog.find((item) => item.id === id);
    return entry?.keyPolicy === 'required'
      ? this.settings.hasKey(id)
      : this.settings.hasKey(id) || this.settings.activeId() === id;
  }

  protected isActive(id: ShortenerId): boolean {
    return this.settings.activeId() === id;
  }

  /** Make an already-configured provider the active one. */
  protected activate(id: ShortenerId): void {
    this.settings.activate(id);
    this.notice.set(
      this.transloco.translate<string>('settings.connections.linkShortener.nowActive', {
        label: this.entryFor(id).label,
      }),
    );
    this.error.set(null);
  }

  /**
   * Save and verify. See the class note for why these are one action.
   *
   * The key is optional for TinyURL and meaningless for is.gd, so a blank field
   * is only an error when the provider actually requires one. For the other two
   * this is the "just use it" path: activate, verify (which is a no-op without
   * credentials), done.
   */
  protected async save(): Promise<void> {
    const entry = this.entry();
    const key = this.keyDraft().trim();
    if (entry.keyPolicy === 'required' && !key) {
      this.error.set(
        this.transloco.translate<string>('settings.connections.linkShortener.pasteKeyFirst', {
          label: entry.label,
          keyLabel: entry.keyLabel,
        }),
      );
      return;
    }
    if (entry.domainRequired && !this.domainDraft().trim()) {
      this.error.set(
        this.transloco.translate<string>('settings.connections.linkShortener.needsDomain', {
          label: entry.label,
        }),
      );
      return;
    }

    const hadKey = this.settings.hasKey(entry.id);
    if (key && entry.keyPolicy !== 'none') {
      this.settings.setKey(entry.id, key);
    }
    this.settings.setDomain(entry.id, this.domainDraft());
    this.settings.activate(entry.id);

    await this.verify({ rollbackTo: hadKey || !key ? 'keep' : 'clear' });
  }

  /**
   * Run the provider's verify call and interpret the outcome.
   *
   * `rollbackTo` says what to do with the key if this turns out to be a bad
   * credential: `clear` when we just added it (leave no junk behind), `keep`
   * when the user already had a working one and is only re-testing.
   */
  private async verify(options: { rollbackTo: 'clear' | 'keep' }): Promise<void> {
    const entry = this.entry();
    const provider = this.registry.get(entry.id);
    if (!provider) {
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await firstValueFrom(provider.verify());
      this.keyDraft.set('');
      this.notice.set(
        this.transloco.translate<string>('settings.connections.linkShortener.connectedFull', {
          label: entry.label,
        }),
      );
    } catch (error: unknown) {
      if (error instanceof ProxyConsentRequired) {
        this.handleProxyNeeded(error, entry);
        return;
      }
      this.diagnostics.error('Shortener', 'connect:error', error, { provider: entry.id });
      if (options.rollbackTo === 'clear') {
        // A key that does not work is not kept. See the class note.
        this.settings.clearKey(entry.id);
      }
      this.error.set(
        describeError(
          error,
          this.transloco.translate<string>('settings.connections.linkShortener.couldNotReach', {
            label: entry.label,
          }),
        ),
      );
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * The CORS branch: either point at the proxy settings, or ask for consent.
   *
   * The key is deliberately left in storage here. It has not been shown to be
   * bad — it has not been *tested* — and throwing it away would make the user
   * paste it again after configuring a proxy, for no gain.
   */
  private handleProxyNeeded(error: ProxyConsentRequired, entry: ShortenerCatalogEntry): void {
    if (error.noProxyConfigured) {
      this.error.set(
        this.transloco.translate<string>('settings.connections.linkShortener.needsProxy', {
          label: entry.label,
        }),
      );
      return;
    }
    const proxy = this.proxy.entry();
    if (!proxy) {
      return;
    }
    this.pendingConsentRetry = 'verify';
    this.consentPrompt.set({ shortener: entry, proxy, carriesCredential: error.carriesCredential });
  }

  /** The user accepted the disclosure: record it and retry the same check. */
  protected async acceptConsent(): Promise<void> {
    const prompt = this.consentPrompt();
    const retry = this.pendingConsentRetry;
    this.consentPrompt.set(null);
    if (!prompt) {
      return;
    }
    this.consent.grant(prompt.shortener.id, prompt.proxy.id);
    if (retry === 'probe') {
      await this.probeReachability();
    } else {
      // Retry with `keep`: the key is untested, not known-bad, so a second CORS
      // failure should not discard it.
      await this.verify({ rollbackTo: 'keep' });
    }
  }

  protected declineConsent(): void {
    const prompt = this.consentPrompt();
    this.consentPrompt.set(null);
    if (prompt) {
      this.error.set(
        this.transloco.translate<string>('settings.connections.linkShortener.notSentThroughProxy', {
          proxy: prompt.proxy.label,
        }),
      );
    }
  }

  /**
   * Re-test an existing connection without re-pasting the key.
   *
   * For a provider with a credential, `verify()` is the real test: it makes an
   * authenticated call, so reaching the service and having a working key are
   * settled together.
   *
   * For a keyless provider they are not the same thing at all. is.gd's `verify()`
   * reports success without touching the network (there is nothing to verify, and
   * its only endpoint is a create, which would litter a junk link on every press).
   * So "Test again" used to be able to say everything was fine while shortening
   * failed on the very next click. {@link reachability} closes that gap by making
   * the request the feature would actually make.
   */
  protected async test(): Promise<void> {
    if (this.entry().keyPolicy === 'none' || !this.settings.hasKey(this.entry().id)) {
      await this.probeReachability();
      return;
    }
    await this.verify({ rollbackTo: 'keep' });
  }

  /**
   * Ask whether this service is reachable from this browser right now, and say so
   * in the plainest terms the evidence supports.
   *
   * The verdict never claims a *cause*. A browser reports every cross-origin
   * failure as an indistinguishable `status: 0` — CORS, DNS, offline and
   * ad-blockers all look identical — so the copy is limited to what was observed:
   * direct worked, the proxy worked, or neither did. See
   * {@link ShortenerReachability}.
   */
  private async probeReachability(): Promise<void> {
    const entry = this.entry();
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const result = await firstValueFrom(this.reachability.probe(entry.id));
      this.lastProbe.set(result);
      if (result.status === 'direct' || result.status === 'proxy') {
        this.notice.set(
          this.transloco.translate<string>('settings.connections.linkShortener.probeResult', {
            label: entry.label,
            message: result.message,
          }),
        );
      } else if (result.status === 'needs-consent') {
        const proxy = this.proxy.entry();
        if (proxy) {
          this.pendingConsentRetry = 'probe';
          this.consentPrompt.set({
            shortener: entry,
            proxy,
            carriesCredential: this.settings.resolve()?.auth !== null,
          });
        }
      } else {
        this.error.set(
          this.transloco.translate<string>('settings.connections.linkShortener.probeResult', {
            label: entry.label,
            message: result.message,
          }),
        );
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** Withdraw a consent, so the next proxied request asks again. */
  protected revokeConsent(shortener: ShortenerId): void {
    const proxy = this.proxy.entry();
    if (proxy) {
      this.consent.revoke(shortener, proxy.id);
      this.notice.set(
        this.transloco.translate<string>('settings.connections.linkShortener.consentWithdrawn'),
      );
    }
  }

  protected hasConsent(id: ShortenerId): boolean {
    const proxy = this.proxy.entry();
    return proxy ? this.consent.granted(id, proxy.id) : false;
  }

  /** Forget a provider entirely: key, domain, consent, and local link history. */
  protected forget(id: ShortenerId): void {
    this.settings.forget(id);
    this.consent.revokeAll(id);
    this.history.clearProvider(id);
    this.keyDraft.set('');
    this.domainDraft.set('');
    this.notice.set(
      this.transloco.translate<string>('settings.connections.linkShortener.disconnectedFull', {
        label: this.entryFor(id).label,
      }),
    );
    this.error.set(null);
  }

  private entryFor(id: ShortenerId): ShortenerCatalogEntry {
    return this.catalog.find((item) => item.id === id) ?? this.catalog[0];
  }

  /**
   * Where a provider's key lives, for the badge.
   *
   * Per provider, because this store is a keyed map: one vault address holds
   * every provider's key, and `needsFetch` lists exactly the ones this browser
   * is missing. Reads the connector's own facts rather than the vault's state —
   * a locked vault is not a locked credential. See `storage-badge.ts`.
   */
  protected where(id: ShortenerId) {
    return credentialLocation(
      this.bridge.syncs(SHORTENER_KEY),
      this.settings.needsFetch().includes(id),
    );
  }
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
