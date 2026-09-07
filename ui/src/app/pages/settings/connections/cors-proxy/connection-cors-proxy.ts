import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, map, of, timeout } from 'rxjs';
import {
  availableCorsProxies,
  CorsProxyEntry,
  CorsProxyId,
  isDevelopmentOrigin,
} from '../../../../providers/cors-proxy/cors-proxy-catalog';
import { CorsProxySettings } from '../../../../providers/cors-proxy/cors-proxy-settings';
import { buildProxiedUrl, proxyHeaders } from '../../../../providers/cors-proxy/cors-proxy';
import { externalFetch } from '../../../../providers/external-fetch';
import { expiryLabel } from '../expiry-label';
import { credentialLocation, StorageBadge } from '../storage-badge';
import { VaultBridge } from '../../../../providers/vault/vault-bridge';

/** The registry base this page's credential is stored under. */
const PROXY_KEY = 'mockingbird_cors_proxy_key';
import { CONNECTION_SCOPE_COPY } from '../connection-catalog';
import { FeatureFlagId, FeatureFlags } from '../../../../feature-flags';

/**
 * A small, stable, genuinely public feed to prove a proxy works.
 *
 * Public, long-lived, small enough that a failed test costs nothing, and
 * belonging to nobody involved here — testing against the user's own feeds would
 * leak which ones they read to a proxy they may be about to reject.
 *
 * Two properties make xkcd the right pick, and both were measured rather than
 * assumed (2026-08-13):
 *
 * 1. **It sends no `Access-Control-Allow-Origin`.** That makes this a real test:
 *    a feed that a browser could already read direct would pass even against a
 *    proxy that did nothing, which is the one result this button must never
 *    produce.
 * 2. **It answers datacentre IP ranges.** This replaces `www.w3.org/blog/news/feed`,
 *    which does not: w3.org sits behind a Cloudflare bot rule that serves
 *    "Sorry, you have been blocked" — an HTTP **403** — to requests coming from
 *    a proxy. Every proxy in the catalogue is hosted in a datacentre, so the old
 *    URL made a perfectly healthy proxy report `The proxy rejected the request
 *    (403). It needs a key, or the key is wrong or out of quota.` — three
 *    diagnoses, all wrong, for a fault that was never the proxy's.
 *
 * Verified 200 through both the Mawkingbird proxy and AllOrigins. Anything
 * replacing it should be checked the same way; `hnrss.org` is a near miss that
 * AllOrigins answers with 522.
 */
const TEST_FEED_URL = 'https://xkcd.com/rss.xml';

/** How long to wait before calling a proxy too slow to be useful. */
const TEST_TIMEOUT_MS = 15_000;

type TestState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ok'; ms: number }
  | { status: 'failed'; message: string };

/**
 * Settings → Connections → CORS proxy.
 *
 * The page has to do something none of the other connection pages do: talk the
 * user out of a bad default. The free proxies are the ones people reach for and
 * the ones that vanish, rate-limit, or read your traffic, so the copy is
 * explicit about what each one costs and the custom option is presented as the
 * one that actually keeps working.
 */
// i18n settings.connections.corsProxy.title: 🔀 CORS proxy
// i18n settings.connections.corsProxy.intro: Some sites refuse to answer requests that come from another site's JavaScript. Mawkingbird has no server of its own, so those feeds simply cannot be read — unless you route them through a relay that fetches on your behalf. That relay is a CORS proxy.
// i18n settings.connections.corsProxy.credentialWarning: A proxy can read every address you ask it for and every byte it sends back, and it can change the response. Only ever use one for public things — Mawkingbird refuses to send your Mastodon instance, any connected account, or anything carrying a login through a proxy, but a private feed URL with a key baked into it would still be exposed. Never point a proxy at one of those.
// i18n settings.connections.corsProxy.droppedSelection: Your previous proxy only works on localhost, so it has been cleared for this site. Choose one that works here.
// i18n settings.connections.corsProxy.chooseHeading: Choose a proxy
// i18n settings.connections.corsProxy.devOnlyHidden: Proxies whose free tier only answers <code>localhost</code> are hidden here, because they cannot work on this site. Run Mawkingbird locally to see them.
// i18n settings.connections.corsProxy.devOnlyTag: localhost only
// i18n settings.connections.corsProxy.keyRequiredTag: key required
// i18n settings.connections.corsProxy.supporterTag: Mawkingbird Plus active — supporter rate limit
// i18n settings.connections.corsProxy.proxyWebsite: {{label}} website
// i18n settings.connections.corsProxy.proxyUrlLabel: Proxy URL
// i18n settings.connections.corsProxy.proxyUrlPlaceholder: https://my-worker.example.workers.dev/?url={url}
// i18n settings.connections.corsProxy.putUrlPlaceholder: Put <code>{url}</code> where the address being fetched should go.
// i18n settings.connections.corsProxy.percentEncodeLabel: Percent-encode the address
// i18n settings.connections.corsProxy.percentEncodeNote: Needed when your proxy reads it from a query parameter, which is the common case. Turn off if your proxy takes the address as a plain path suffix.
// i18n settings.connections.corsProxy.headerNameLabel: Header name (optional)
// i18n settings.connections.corsProxy.headerNamePlaceholder: x-api-key
// i18n settings.connections.corsProxy.headerNameNote: Only if your proxy authenticates with a header.
// i18n settings.connections.corsProxy.apiKeyLabel: API key
// i18n settings.connections.corsProxy.optional: (optional)
// i18n settings.connections.corsProxy.keySavedPlaceholder: A key is saved — type to replace it
// i18n settings.connections.corsProxy.pasteKeyPlaceholder: Paste your key
// i18n settings.connections.corsProxy.keySaved: A key is saved in this browser.
// i18n settings.connections.corsProxy.removeKey: Remove key
// i18n settings.connections.corsProxy.keyDeletedOn: This key is deleted from this browser on {{date}}.
// i18n settings.connections.corsProxy.testFetchesBefore: Test fetches
// i18n settings.connections.corsProxy.testFetchesSentAs: , sent as:
// i18n settings.connections.corsProxy.saveProxy: Save proxy
// i18n settings.connections.corsProxy.testing: Testing…
// i18n settings.connections.corsProxy.testProxy: Test proxy
// i18n settings.connections.corsProxy.stopUsing: Stop using a proxy
// i18n settings.connections.corsProxy.pendingSelection: Save {{selected}} before testing it. Until you do, {{current}} is still the one feeds use — so a test now would tell you about the wrong service.
// i18n settings.connections.corsProxy.noProxy: no proxy
// i18n settings.connections.corsProxy.testWorked: Works — a test feed came back in {{ms}} ms.
// i18n settings.connections.corsProxy.testSlow: That is slow enough that feeds will feel sluggish.
// i18n settings.connections.corsProxy.runningYourOwn: Running your own
// i18n settings.connections.corsProxy.ownProxyNote: Free proxies are rate-limited, and they close down — of the well-known ones, most now refuse anything that is not <code>localhost</code>. A twenty-line Cloudflare Worker that only accepts your own origin is free, faster, and cannot read anything you would not have handed it anyway. It is the only option here that nobody else controls.
// i18n settings.connections.corsProxy.nowActive: {{label}} is now the active proxy.
// i18n settings.connections.corsProxy.chooseProxyFirst: Choose a proxy first.
// i18n settings.connections.corsProxy.customUrlNeedsPlaceholder: A custom proxy URL must contain {url} where the address being fetched should go.
// i18n settings.connections.corsProxy.needsKey: {{label}} needs an API key before it will answer any request.
// i18n settings.connections.corsProxy.savedFull: {{label}} saved. Turn it on per feed under Settings → RSS.
// i18n settings.connections.corsProxy.keyRemoved: API key removed from this browser.
// i18n settings.connections.corsProxy.disconnected: No proxy configured. Feeds are fetched directly again.
// i18n settings.connections.corsProxy.saveBeforeTest: Save a working configuration before testing it.
// i18n settings.connections.corsProxy.notAFeed: The proxy answered, but not with a feed. It may have returned its own error page — check any key or quota.
// i18n settings.connections.corsProxy.unreachable: Couldn't reach the proxy at all. It may be down, blocking this origin, or the URL may be wrong.
// i18n settings.connections.corsProxy.rejected401: The proxy rejected the request (401). It needs a key, or the key is wrong.
// i18n settings.connections.corsProxy.rejected403: A 403 came back. Either the proxy refused this request — a missing, wrong, or out-of-quota key, or an origin it has not been told to allow — or the test feed refused the proxy, which some sites do to any request from a datacentre. If your feeds still load, the proxy is fine.
// i18n settings.connections.corsProxy.rateLimited: The proxy is rate-limiting this browser right now.
// i18n settings.connections.corsProxy.answeredStatus: The proxy answered {{status}}.
// i18n settings.connections.corsProxy.timedOut: The proxy did not answer within 15 seconds. It is up but too slow to read feeds through.
// i18n settings.connections.corsProxy.unknownFailure: The test failed for an unknown reason.
@Component({
  selector: 'app-connection-cors-proxy',
  imports: [FormsModule, RouterLink, StorageBadge, TranslocoPipe],
  templateUrl: './connection-cors-proxy.html',
  styleUrls: ['../connection-page.css', './connection-cors-proxy.css'],
})
export class ConnectionCorsProxy implements OnInit {
  protected settings = inject(CorsProxySettings);
  private bridge = inject(VaultBridge);
  private http = inject(HttpClient);
  private transloco = inject(TranslocoService);

  protected readonly expiryLabel = expiryLabel;

  /**
   * Where this credential lives, for the badge.
   *
   * Reads the connector's own facts rather than the vault's state: a locked
   * vault is not a locked credential. See `storage-badge.ts`.
   */
  protected where() {
    return credentialLocation(this.bridge.syncs(PROXY_KEY), this.settings.needsFetch());
  }
  protected readonly scopeDetail = CONNECTION_SCOPE_COPY.browser.detail;
  protected readonly isDevOrigin = isDevelopmentOrigin();
  private readonly flags = inject(FeatureFlags);
  /**
   * Flagged-off proxies are not offered at all — see `proxyFeatureFlag`.
   *
   * The supporter tier is also absent, deliberately: it is not something to
   * choose. `CorsProxySettings` promotes the free Mawkingbird entry to it
   * automatically for an entitled account, so listing it here would offer a
   * radio button that either does nothing (already entitled) or cannot work
   * (not entitled) — and would let someone select a tier they have not bought,
   * whose only effect is a token the Worker refuses.
   */
  protected readonly proxies = availableCorsProxies(location.hostname, (id) =>
    this.flags.enabled(id as FeatureFlagId),
  ).filter((entry) => entry.id !== 'mawkingbird-plus');

  /** True when this account is getting supporter limits on the Mawkingbird proxy. */
  protected readonly onSupporterTier = computed(
    () => this.settings.chosen()?.id === 'mawkingbird-plus',
  );

  /** Form state, seeded from storage and written back only on save. */
  protected selectedId = signal<CorsProxyId | null>(this.settings.currentId());
  protected apiKey = signal('');
  protected customTemplate = signal(this.settings.customTemplate());
  protected customHeader = signal(this.settings.customHeader());
  protected customEncode = signal(this.settings.customEncodeTarget());

  protected notice = signal<string | null>(null);
  protected error = signal<string | null>(null);
  protected test = signal<TestState>({ status: 'idle' });
  /** Set when a dev-only selection was dropped because this build is deployed. */
  protected droppedSelection = signal(false);

  protected readonly selected = computed<CorsProxyEntry | null>(() => {
    const id = this.selectedId();
    return id ? (this.proxies.find((entry) => entry.id === id) ?? null) : null;
  });

  protected readonly isCustom = computed(() => this.selectedId() === 'custom');

  /** The currently-saved proxy's label, or a translated "no proxy" fallback. */
  protected readonly currentProxyLabel = computed(
    () =>
      this.settings.chosen()?.label ??
      this.transloco.translate<string>('settings.connections.corsProxy.noProxy'),
  );

  /**
   * True when the proxy on screen is not the one a test would actually use.
   *
   * {@link choose} commits most selections immediately, so this is only ever
   * reachable for the two that cannot be committed on selection alone: custom
   * before its template is saved, and a key-required proxy before its key is
   * pasted. Those are exactly the states where a Test result would describe the
   * wrong service, so the button is disabled and the reason is on screen.
   */
  protected readonly pendingSelection = computed(() => {
    const id = this.selectedId();
    return id !== null && id !== this.settings.currentId();
  });

  /** Whether the chosen proxy has anywhere to put a key. */
  protected readonly takesKey = computed(() => {
    const entry = this.selected();
    if (!entry) {
      return false;
    }
    return entry.id === 'custom' || entry.keyHeader !== undefined;
  });

  /**
   * The exact URL the current form would produce, so a misplaced `{url}` is
   * visible before it costs the user a confusing failure.
   */
  /** The feed the Test button fetches, so the template names it rather than a stale literal. */
  protected readonly testFeedUrl = TEST_FEED_URL;

  protected readonly preview = computed(() => {
    const entry = this.selected();
    if (!entry) {
      return null;
    }
    const pattern = entry.id === 'custom' ? this.customTemplate().trim() : entry.template.pattern;
    if (!pattern.includes('{url}')) {
      return null;
    }
    const encodeTarget = entry.id === 'custom' ? this.customEncode() : entry.template.encodeTarget;
    // The *real* test URL, not an illustrative one. These two used to differ —
    // the preview showed `example.com/feed.xml` while the button fetched
    // w3.org — so a user reading a failure message was told about a request
    // that had never been made. Showing exactly what Test will send is the
    // whole point of a preview.
    return buildProxiedUrl({ entry, pattern, encodeTarget, header: null }, TEST_FEED_URL);
  });

  ngOnInit(): void {
    // Deep-link case: re-check the key against a policy shortened on the
    // catalog page, and drop a localhost-only proxy chosen during development
    // that cannot work on this origin.
    this.settings.enforceLifetime();
    if (this.settings.dropUnavailableSelection()) {
      this.droppedSelection.set(true);
      this.selectedId.set(null);
    }
  }

  /**
   * Switch proxies, and commit the switch straight away when it is complete.
   *
   * The Test button tests what is *saved*, which is right — feeds use the saved
   * configuration, so testing unsaved form state would be a lie. But combined
   * with a selection that only took effect on Save, it produced the worst
   * possible reading: pick CORS.SH, press Test, watch a request go to the proxy
   * you just moved away from. Nothing on screen said the old one was still the
   * live one, so the picker looked broken and sticky.
   *
   * The link-shortener page does not have this problem, because choosing a
   * provider that needs nothing further activates it. Same rule here: for a
   * catalog proxy with no key to type, the radio button *is* the configuration,
   * so selecting it saves it. Custom still waits for Save — it is not
   * configured until a template exists — and so does a key-required proxy with
   * no key yet, since committing it would leave the app with a proxy it cannot
   * resolve.
   */
  choose(id: CorsProxyId): void {
    this.selectedId.set(id);
    this.test.set({ status: 'idle' });
    this.notice.set(null);
    this.error.set(null);

    const entry = this.selected();
    if (!entry || entry.id === 'custom') {
      return;
    }
    if (entry.keyRequired && !this.settings.hasKey()) {
      // Selecting it is not enough to make it work; leave the previous
      // selection in place rather than saving a proxy that resolves to null.
      return;
    }
    this.settings.select(entry.id);
    this.notice.set(
      this.transloco.translate<string>('settings.connections.corsProxy.nowActive', {
        label: entry.label,
      }),
    );
  }

  save(): void {
    const entry = this.selected();
    this.error.set(null);
    this.notice.set(null);
    this.test.set({ status: 'idle' });

    if (!entry) {
      this.error.set(
        this.transloco.translate<string>('settings.connections.corsProxy.chooseProxyFirst'),
      );
      return;
    }
    if (entry.id === 'custom' && !this.customTemplate().includes('{url}')) {
      this.error.set(
        this.transloco.translate<string>(
          'settings.connections.corsProxy.customUrlNeedsPlaceholder',
        ),
      );
      return;
    }

    this.settings.select(entry.id, {
      template: this.customTemplate(),
      encodeTarget: this.customEncode(),
    });

    // An untouched key field leaves the stored key alone: re-selecting a proxy
    // should not silently wipe a key the user pasted a month ago.
    const typedKey = this.apiKey().trim();
    if (typedKey) {
      this.settings.setKey(typedKey, this.customHeader());
      this.apiKey.set('');
    } else if (
      entry.id === 'custom' &&
      this.customHeader().trim() !== this.settings.customHeader()
    ) {
      // Header renamed without a new key: keep the key, move it to the new header.
      this.settings.setKey(this.storedKeyOrEmpty(), this.customHeader());
    }

    if (entry.keyRequired && !this.settings.hasKey()) {
      this.error.set(
        this.transloco.translate<string>('settings.connections.corsProxy.needsKey', {
          label: entry.label,
        }),
      );
      return;
    }
    this.notice.set(
      this.transloco.translate<string>('settings.connections.corsProxy.savedFull', {
        label: entry.label,
      }),
    );
  }

  clearKey(): void {
    this.settings.clearKey();
    this.apiKey.set('');
    this.notice.set(this.transloco.translate<string>('settings.connections.corsProxy.keyRemoved'));
  }

  disconnect(): void {
    this.settings.clear();
    this.selectedId.set(null);
    this.apiKey.set('');
    this.test.set({ status: 'idle' });
    this.notice.set(
      this.transloco.translate<string>('settings.connections.corsProxy.disconnected'),
    );
  }

  /**
   * Fetch one known public feed through the saved configuration.
   *
   * Tests what is *saved* rather than what is typed, because that is what feeds
   * will use — a test that passed against unsaved form state would be a lie.
   */
  runTest(): void {
    const config = this.settings.resolve();
    if (!config) {
      this.error.set(
        this.transloco.translate<string>('settings.connections.corsProxy.saveBeforeTest'),
      );
      return;
    }
    this.error.set(null);
    this.notice.set(null);
    this.test.set({ status: 'running' });

    const startedAt = Date.now();
    this.http
      // 'feeds' explicitly: this is a feed fetch, and naming it keeps the tested
      // path identical to the one RSS actually uses on a routed proxy.
      .get(buildProxiedUrl(config, TEST_FEED_URL, 'feeds'), {
        responseType: 'text',
        context: externalFetch(),
        headers: proxyHeaders(config),
      })
      .pipe(
        timeout(TEST_TIMEOUT_MS),
        map((body) => ({ ok: body.includes('<'), body })),
        catchError((err: unknown) => of({ ok: false, error: err })),
      )
      .subscribe((result) => {
        const ms = Date.now() - startedAt;
        if ('error' in result) {
          this.test.set({ status: 'failed', message: this.describeTestFailure(result.error) });
          return;
        }
        if (!result.ok) {
          this.test.set({
            status: 'failed',
            message: this.transloco.translate<string>('settings.connections.corsProxy.notAFeed'),
          });
          return;
        }
        this.test.set({ status: 'ok', ms });
      });
  }

  /**
   * The stored key, for the header-rename path above.
   *
   * {@link CorsProxySettings} deliberately exposes only `hasKey()`, so this
   * reaches for the resolved config instead of widening that surface.
   */
  private storedKeyOrEmpty(): string {
    return this.settings.resolve()?.header?.value ?? '';
  }

  private describeTestFailure(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) {
        return this.transloco.translate<string>('settings.connections.corsProxy.unreachable');
      }
      if (err.status === 401) {
        return this.transloco.translate<string>('settings.connections.corsProxy.rejected401');
      }
      if (err.status === 403) {
        // Deliberately two possibilities rather than one confident wrong answer.
        // A 403 here is ambiguous by construction: the proxy relays the target's
        // status as its own, so a target that blocks datacentre IP ranges — which
        // many do, and every proxy is hosted in one — is indistinguishable from
        // the proxy itself refusing us. Naming only the key sent people to check a
        // key that was never the problem.
        return this.transloco.translate<string>('settings.connections.corsProxy.rejected403');
      }
      if (err.status === 429) {
        return this.transloco.translate<string>('settings.connections.corsProxy.rateLimited');
      }
      return this.transloco.translate<string>('settings.connections.corsProxy.answeredStatus', {
        status: err.status,
      });
    }
    if (err instanceof Error && err.name === 'TimeoutError') {
      return this.transloco.translate<string>('settings.connections.corsProxy.timedOut');
    }
    return err instanceof Error
      ? err.message
      : this.transloco.translate<string>('settings.connections.corsProxy.unknownFailure');
  }
}
