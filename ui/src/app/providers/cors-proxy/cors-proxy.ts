import { inject, Injectable } from '@angular/core';
import { HttpHeaders } from '@angular/common/http';
import { Server } from '../../server';
import { CorsProxyEntry, CorsProxyRoute } from './cors-proxy-catalog';
import { CorsProxyConfig, CorsProxySettings } from './cors-proxy-settings';

/**
 * Builds proxied requests, and refuses to build the dangerous ones.
 *
 * ## The guarantee
 *
 * A CORS proxy sees the full URL it is asked to fetch, every request header it
 * is given, and every byte of the response. Routing a *public RSS feed* through
 * one discloses nothing that was not already public. Routing anything
 * authenticated through one hands a stranger a credential.
 *
 * The rule is therefore enforced here, in the one place that can build a
 * proxied URL, rather than by asking callers to be careful. Callers get things
 * wrong; a feature added a year from now will not remember this rule. Every
 * path to a proxy goes through {@link proxyRequest}, and every violation
 * {@link throws} — it never silently falls back to a direct fetch, because a
 * silent fallback turns "we nearly leaked your token" into a mystery
 * intermittent CORS bug instead of a loud error.
 *
 * ## What is refused, and why
 *
 * - **Anything with an `Authorization` header** — the single most direct way to
 *   hand over a bearer token.
 * - **The selected Mastodon instance** — its API is authenticated and its
 *   responses are the user's own timeline. Refused even when the immediate
 *   request looks anonymous, because the host is one an interceptor may later
 *   decide to attach a token to.
 * - **Every connected service's host** — bsky.social and any PDS, OpenRouter,
 *   Raindrop, GitHub, Dropbox. These are exactly the hosts whose traffic
 *   carries the credentials this app stores.
 * - **URLs carrying credentials in themselves** — userinfo (`https://u:p@host`)
 *   and non-HTTP(S) schemes.
 * - **Plain `http://` targets from an HTTPS page** — the proxy would be
 *   laundering mixed content the browser is right to block.
 *
 * The blocklist is a backstop, not the primary defence: the primary defence is
 * that only feed and article fetches ever call this at all. A backstop that is
 * never hit is doing its job.
 */

/** Hosts whose traffic carries a credential this app holds. Suffix-matched. */
const CREDENTIAL_HOSTS: readonly string[] = [
  'bsky.social',
  'bsky.network',
  'openrouter.ai',
  'raindrop.io',
  'github.com',
  'dropboxapi.com',
  'dropbox.com',
  // The link shorteners this app can hold a key for. Listed here so the
  // ordinary path refuses them like any other credentialed host; they are
  // reachable only through `proxyCredentialedRequest`, which demands recorded
  // user consent first.
  //
  // is.gd is pointedly absent: it has no accounts, so a proxied request to it
  // carries no credential and there is nothing to consent to. TinyURL is present
  // because its token is optional rather than nonexistent — the transport takes
  // the consented path only when one is actually stored.
  'dub.co',
  'short.io',
  't.ly',
  'rebrandly.com',
  'tinyurl.com',
  // The Twitter data services. Their keys spend a credit balance, so they belong here
  // like any other credentialed host — and, like the shorteners, they are
  // reachable only through `proxyCredentialedRequest` after recorded consent.
  //
  // Unlike the shorteners there is no direct route at all: these services refuse
  // browser requests outright (their CORS preflight demands the API-key header a
  // preflight cannot carry), so the consented path is the *only* path. See
  // `twitter-transport.ts`.
  'twitterapi.io',
  'getxapi.com',
];

/** Credentialed API hosts whose public subdomains remain safe to proxy. */
const EXACT_CREDENTIAL_HOSTS: readonly string[] = ['mataroa.blog'];

/** Raised when a request must not be proxied. Never caught into a direct fetch. */
export class CorsProxyRefusal extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'CorsProxyRefusal';
  }
}

/** A request rewritten to go through the proxy. */
export interface ProxiedRequest {
  url: string;
  headers: HttpHeaders;
}

export interface CorsProxyBatchItem {
  id: string;
  url: string;
}

/** A request for a proxy's native multi-target endpoint. */
export interface ProxiedBatchRequest {
  url: string;
  headers: HttpHeaders;
  body: string;
}

@Injectable({ providedIn: 'root' })
export class CorsProxy {
  private settings = inject(CorsProxySettings);
  private server = inject(Server);

  /** Whether a usable proxy is configured. */
  available(): boolean {
    return this.settings.usable();
  }

  /** The configured proxy's display name, for UI that names it. */
  label(): string | null {
    return this.settings.chosen()?.label ?? null;
  }

  /**
   * Rewrite a target URL into a proxied one.
   *
   * @throws CorsProxyRefusal when no proxy is configured, or when routing this
   * target through one would disclose a secret.
   */
  proxyRequest(targetUrl: string, route: CorsProxyRoute = 'feeds'): ProxiedRequest {
    const config = this.settings.resolve();
    if (!config) {
      throw new CorsProxyRefusal('No CORS proxy is configured.');
    }
    assertProxyable(targetUrl, this.server.baseUrl());
    return {
      url: buildProxiedUrl(config, targetUrl, route),
      headers: proxyHeaders(config),
    };
  }

  /** Maximum native batch size for this route, or zero when batching is unavailable. */
  batchCapacity(route: CorsProxyRoute = 'feeds'): number {
    const batch = this.settings.resolve()?.entry.batch;
    return batch?.routes.includes(route) ? batch.maxItems : 0;
  }

  /**
   * Build a request for the configured proxy's native batch endpoint.
   *
   * Every target passes the same disclosure guard as an ordinary proxied
   * request. Third-party and custom proxies are deliberately unsupported: a
   * batch URL is an explicit wire contract, not something safe to guess from a
   * single-target template.
   */
  proxyBatchRequest(
    items: readonly CorsProxyBatchItem[],
    route: CorsProxyRoute = 'feeds',
  ): ProxiedBatchRequest {
    return this.buildBatchRequest(items, route, false);
  }

  /** Build a credential-carrying batch after the caller's explicit consent. */
  proxyCredentialedBatchRequest(
    items: readonly CorsProxyBatchItem[],
    consented: boolean,
    route: CorsProxyRoute,
  ): ProxiedBatchRequest {
    if (!consented) {
      throw new CorsProxyRefusal(
        'Refusing to send an API key through a CORS proxy without your explicit consent.',
      );
    }
    return this.buildBatchRequest(items, route, true);
  }

  private buildBatchRequest(
    items: readonly CorsProxyBatchItem[],
    route: CorsProxyRoute,
    credentialed: boolean,
  ): ProxiedBatchRequest {
    const config = this.settings.resolve();
    if (!config) {
      throw new CorsProxyRefusal('No CORS proxy is configured.');
    }
    const batch = config.entry.batch;
    if (!batch || !batch.routes.includes(route)) {
      throw new CorsProxyRefusal(`${config.entry.label} does not support ${route} batches.`);
    }
    if (items.length < 1 || items.length > batch.maxItems) {
      throw new CorsProxyRefusal(
        `A ${route} batch must contain between 1 and ${batch.maxItems} requests.`,
      );
    }
    for (const item of items) {
      if (!item.id) {
        throw new CorsProxyRefusal('Every batched request needs an id.');
      }
      if (credentialed) {
        assertProxyableIgnoringCredentialHosts(item.url, this.server.baseUrl());
      } else {
        assertProxyable(item.url, this.server.baseUrl());
      }
    }
    return {
      url: batch.pattern.replace('{route}', route),
      headers: proxyHeaders(config).set('Content-Type', 'text/plain;charset=UTF-8'),
      body: JSON.stringify({ requests: items }),
    };
  }

  /**
   * Build a proxied request that is *allowed* to carry a credential, because the
   * user was told exactly what that means and agreed to it.
   *
   * ## Why this exists at all
   *
   * {@link proxyRequest} refuses credentialed traffic, and that refusal is the
   * right default — it is the reason a stray feature cannot quietly leak a token
   * to AllOrigins. But the link shorteners' APIs are built for server-to-server
   * use and largely do not answer browsers, and this app has no server. For many
   * users the honest choice is "route the key through a proxy, or the feature
   * does not exist". Removing the guard to allow that would remove it for
   * everything; so instead there is this second door, and it is deliberately
   * hard to open by accident:
   *
   * - The caller must pass `consented: true`, which the shortener transport only
   *   does after {@link ShortenerProxyConsent} confirms a recorded grant for this
   *   exact `(shortener, proxy)` pair.
   * - That grant can only be created by the dialog that names the proxy
   *   operator, links its homepage and privacy policy, and states the concrete
   *   risk — that whoever runs the proxy can read the key and use it to create
   *   or delete links in the user's account.
   * - Every other guard still applies. The Mastodon instance, the connected
   *   services, userinfo URLs, and mixed content are refused here too; consent
   *   covers the shortener's own key and nothing else.
   *
   * The `Authorization` header is attached by the caller, not here, because the
   * value is the provider's business — Short.io wants a bare key where the
   * others want `Bearer`.
   *
   * @throws CorsProxyRefusal when no proxy is configured, when consent was not
   * given, or when the target is refused for any of the ordinary reasons.
   */
  proxyCredentialedRequest(
    targetUrl: string,
    consented: boolean,
    route: CorsProxyRoute = 'feeds',
  ): ProxiedRequest {
    if (!consented) {
      throw new CorsProxyRefusal(
        'Refusing to send an API key through a CORS proxy without your explicit consent.',
      );
    }
    const config = this.settings.resolve();
    if (!config) {
      throw new CorsProxyRefusal('No CORS proxy is configured.');
    }
    // The credential-host blocklist is skipped — that is the whole point of this
    // method — but nothing else is. A consented shortener request still must not
    // be a plain-http target from an https page, or carry userinfo, or point at
    // the user's own instance.
    assertProxyableIgnoringCredentialHosts(targetUrl, this.server.baseUrl());
    return {
      url: buildProxiedUrl(config, targetUrl, route),
      headers: proxyHeaders(config),
    };
  }

  /** Whether the configured proxy is one the user runs themselves. */
  isSelfHosted(): boolean {
    return this.settings.currentId() === 'custom';
  }

  /** The configured proxy's catalog entry, for the consent dialog to describe it. */
  entry(): CorsProxyEntry | null {
    return this.settings.chosen();
  }
}

/**
 * Splice the target into the proxy's template.
 *
 * Exported for testing and for the settings page's preview, which shows the
 * user the exact URL their configuration produces — the fastest way to spot a
 * template with the placeholder in the wrong place.
 */
export function buildProxiedUrl(
  config: CorsProxyConfig,
  targetUrl: string,
  route: CorsProxyRoute = 'feeds',
): string {
  const target = config.encodeTarget ? encodeURIComponent(targetUrl) : targetUrl;
  // `{route}` is substituted unconditionally rather than only for routed
  // proxies: a pattern without the placeholder is unaffected, and a custom
  // template that happens to include one then works too, which is the friendly
  // behaviour for someone who deploys their own copy of our Worker.
  return config.pattern.replace('{route}', route).replace('{url}', target);
}

/** The headers a proxied request carries: the proxy's key, and nothing else. */
export function proxyHeaders(config: CorsProxyConfig): HttpHeaders {
  let headers = new HttpHeaders();
  if (config.header) {
    headers = headers.set(config.header.name, config.header.value);
  }
  return headers;
}

/**
 * Throw unless `targetUrl` is safe to hand to a third-party proxy.
 *
 * Exported so callers that want to *ask* (to grey out a toggle, say) can use
 * {@link canProxy} without triggering a request.
 */
export function assertProxyable(targetUrl: string, mastodonBaseUrl: string): void {
  assertProxyableIgnoringCredentialHosts(targetUrl, mastodonBaseUrl);

  const host = new URL(targetUrl).hostname.toLowerCase();
  if (EXACT_CREDENTIAL_HOSTS.includes(host)) {
    throw new CorsProxyRefusal(
      `Refusing to send a request for ${host} through a CORS proxy — you have a connected account there.`,
    );
  }
  for (const credentialHost of CREDENTIAL_HOSTS) {
    if (hostMatches(host, credentialHost)) {
      throw new CorsProxyRefusal(
        `Refusing to send a request for ${credentialHost} through a CORS proxy — you have a connected account there.`,
      );
    }
  }
}

/**
 * Every proxyability check except the connected-services blocklist.
 *
 * Split out for {@link CorsProxy.proxyCredentialedRequest}, which exists
 * precisely to reach one of those hosts with consent. Nothing else should use
 * this: it is not "assertProxyable but lenient", it is the half of the checks
 * that are about the *URL* rather than about which secrets this app holds.
 */
export function assertProxyableIgnoringCredentialHosts(
  targetUrl: string,
  mastodonBaseUrl: string,
): void {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    throw new CorsProxyRefusal(`Not a valid absolute URL: ${targetUrl}`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new CorsProxyRefusal(`Only http(s) URLs can be proxied, not ${url.protocol}`);
  }

  if (url.username || url.password) {
    throw new CorsProxyRefusal(
      'This URL carries a username or password, which must never be sent through a proxy.',
    );
  }

  if (url.protocol === 'http:' && location.protocol === 'https:') {
    throw new CorsProxyRefusal('Refusing to proxy an insecure http:// address from a secure page.');
  }

  const host = url.hostname.toLowerCase();

  if (hostMatches(host, mastodonHost(mastodonBaseUrl))) {
    throw new CorsProxyRefusal(
      'Refusing to send a request for your Mastodon instance through a CORS proxy — those requests are authenticated.',
    );
  }

  // Origin, not hostname: a different port is a different server. Comparing
  // hostnames would refuse a feed on 127.0.0.1:8901 while the app runs on
  // 127.0.0.1:8899, which is exactly the local-development case, and it is a
  // real cross-origin request that genuinely needs the proxy.
  if (url.origin === location.origin) {
    throw new CorsProxyRefusal(
      "Refusing to proxy this app's own origin. Same-origin requests never need a proxy.",
    );
  }
}

/** Non-throwing form of {@link assertProxyable}, for UI that needs to ask first. */
export function canProxy(targetUrl: string, mastodonBaseUrl: string): boolean {
  try {
    assertProxyable(targetUrl, mastodonBaseUrl);
    return true;
  } catch {
    return false;
  }
}

/** Why a URL cannot be proxied, or null when it can. */
export function proxyRefusalReason(targetUrl: string, mastodonBaseUrl: string): string | null {
  try {
    assertProxyable(targetUrl, mastodonBaseUrl);
    return null;
  } catch (error: unknown) {
    return error instanceof Error ? error.message : 'This URL cannot be proxied.';
  }
}

/**
 * The instance's hostname, or null for the mock (whose base URL is empty).
 *
 * Hostname rather than origin, deliberately and unlike the same-origin check:
 * `files.mastodon.social` is not the API host but is still the user's
 * instance's infrastructure, and over-refusing an authenticated host costs a
 * feed nobody wanted to proxy anyway.
 */
function mastodonHost(baseUrl: string): string | null {
  if (!baseUrl) {
    return null;
  }
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Whether `host` is `candidate` or a subdomain of it.
 *
 * Suffix-matched on a dot boundary so `bsky.social` also covers a user's PDS at
 * `morel.us-east.host.bsky.network`, while `notbsky.social` does not match.
 */
function hostMatches(host: string, candidate: string | null): boolean {
  if (!candidate) {
    return false;
  }
  return host === candidate || host.endsWith(`.${candidate}`);
}
