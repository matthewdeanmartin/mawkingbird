import { inject, Injectable } from '@angular/core';
import { PageDiagnostics } from '../../page-diagnostics';
import { CorsProxy, CorsProxyRefusal } from '../cors-proxy/cors-proxy';
import { resolveEndpoint } from './webmention-discovery';

/**
 * Telling the other site that you linked to it.
 *
 * **Most sends will report `no-endpoint`, and that is the correct outcome, not
 * a failure.** Mastodon does not accept webmentions — it federates over
 * ActivityPub, which has native Like and Announce activities, so there is no
 * gap for webmention to fill. Bluesky does not either, and neither do RSS items
 * or tweets. The audience that does is people running indieweb blogs.
 *
 * That shapes the UI more than the code: a red error on every Mastodon like
 * would train the user to ignore the feature within a day. `no-endpoint` is a
 * neutral state meaning *your record is published; there was nobody to notify*.
 *
 * ## Why this needs the CORS proxy
 *
 * Both halves — reading a stranger's HTML to find their endpoint, and POSTing
 * to it — are cross-origin requests to arbitrary hosts with no CORS contract
 * with anyone. Neither works from a browser directly.
 *
 * Unusually for this app, that is close to harmless here: a webmention carries
 * two public URLs and no secret whatsoever, so it goes through the
 * *uncredentialed* {@link CorsProxy.proxyRequest} path, which refuses to carry
 * credentials by construction. No consent dialog is needed because there is
 * nothing to consent to disclosing — unlike Mataroa, where the proxy sees an
 * API key.
 */
export type DeliveryState =
  /** Checked; the target does not accept webmentions. The normal case. */
  | 'no-endpoint'
  /** The endpoint returned 2xx — accepted for verification, not "verified". */
  | 'delivered'
  /** Reachable, and refused it. */
  | 'failed'
  /** No proxy able to make this request is configured. */
  | 'unsupported';

export interface DeliveryResult {
  state: DeliveryState;
  /** The endpoint we found, when we found one. */
  endpoint: string | null;
  /** One sentence for the UI. Never dresses `no-endpoint` up as success. */
  message: string;
}

@Injectable({ providedIn: 'root' })
export class WebmentionSend {
  private readonly proxy = inject(CorsProxy);
  private readonly diagnostics = inject(PageDiagnostics);

  /**
   * Per-batch endpoint memo.
   *
   * Several queued entries often target the same host, and discovering the same
   * endpoint five times is five requests to a stranger's site. Deliberately
   * **not** persisted: caching "this site has no endpoint" across sessions
   * would quietly outlive the day someone adds one.
   */
  private readonly cache = new Map<string, string | null>();

  /** Forget memoised endpoints. Called between batches. */
  resetCache(): void {
    this.cache.clear();
  }

  /**
   * Discover the target's endpoint and, if it has one, notify it.
   *
   * `source` is the URL on *your* site carrying the record — it must already be
   * live, because a conscientious receiver fetches it to verify the link. The
   * caller waits for the site build before getting here.
   */
  async send(targetUrl: string, sourceUrl: string): Promise<DeliveryResult> {
    let endpoint: string | null;
    try {
      endpoint = await this.discover(targetUrl);
    } catch (error: unknown) {
      if (error instanceof CorsProxyRefusal) {
        return {
          state: 'unsupported',
          endpoint: null,
          message: 'Set up a CORS proxy to send webmentions. Your record is published either way.',
        };
      }
      // Could not read the page at all — offline, DNS, a 500. We genuinely do
      // not know whether it accepts webmentions, and guessing "failed" would
      // overstate it.
      return {
        state: 'no-endpoint',
        endpoint: null,
        message: 'Could not check whether this site accepts webmentions.',
      };
    }

    if (!endpoint) {
      return {
        state: 'no-endpoint',
        endpoint: null,
        message: 'This site does not accept webmentions. Your record is published.',
      };
    }

    return this.deliver(endpoint, targetUrl, sourceUrl);
  }

  private async discover(targetUrl: string): Promise<string | null> {
    const cached = this.cache.get(targetUrl);
    if (cached !== undefined) {
      return cached;
    }
    // Throws CorsProxyRefusal when nothing is configured, which `send` maps to
    // `unsupported` rather than swallowing.
    const proxied = this.proxy.proxyRequest(targetUrl, 'webmention-discover');
    const response = await fetch(proxied.url, {
      headers: toHeaderRecord(proxied.headers),
    });
    if (!response.ok) {
      this.diagnostics.warn('POSSE', 'webmention:unreadable', {
        target: targetUrl,
        via: proxied.url,
        status: response.status,
      });
      throw new Error(`HTTP ${response.status}`);
    }
    const body = await response.text();
    // The Link header is the *proxy's*, not the target's — a proxy that does not
    // forward headers loses any endpoint advertised that way, and the markup is
    // the only source left. Logged so a missing endpoint can be told apart from
    // a lost one.
    const linkHeader = response.headers.get('Link');
    const endpoint = resolveEndpoint(targetUrl, linkHeader, body);
    this.diagnostics.info('POSSE', 'webmention:discover', {
      target: targetUrl,
      via: proxied.url,
      endpoint: endpoint ?? '(none advertised)',
      from: endpoint === null ? 'none' : linkHeader ? 'link-header' : 'markup',
      bytes: body.length,
    });
    this.cache.set(targetUrl, endpoint);
    return endpoint;
  }

  private async deliver(
    endpoint: string,
    targetUrl: string,
    sourceUrl: string,
  ): Promise<DeliveryResult> {
    let proxied: { url: string; headers: unknown };
    try {
      proxied = this.proxy.proxyRequest(endpoint, 'webmention-send');
    } catch {
      return {
        state: 'unsupported',
        endpoint,
        message: 'This webmention cannot be sent through the configured proxy.',
      };
    }

    const body = new URLSearchParams({ source: sourceUrl, target: targetUrl });
    let response: Response;
    try {
      response = await fetch(proxied.url, {
        method: 'POST',
        headers: {
          ...toHeaderRecord(proxied.headers),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });
    } catch {
      // A proxy that will not forward a POST at all — AllOrigins, for one — is
      // a configuration limit, not the target refusing. Reporting it as
      // `failed` would blame the wrong party.
      return {
        state: 'unsupported',
        endpoint,
        message:
          'The configured CORS proxy cannot send this. Choose one that forwards POST requests.',
      };
    }

    if (response.ok) {
      // Many endpoints return 202 and verify asynchronously, so this means
      // "accepted for processing", never "verified". The copy says so.
      this.diagnostics.info('POSSE', 'webmention:delivered', {
        endpoint,
        target: targetUrl,
        source: sourceUrl,
        status: response.status,
      });
      return {
        state: 'delivered',
        endpoint,
        message: 'Webmention accepted — the other site will verify it shortly.',
      };
    }

    // The endpoint's own explanation, which is almost always the actionable
    // part. Throwing it away and reporting a bare status code is what made a
    // real 404 ("target domain not found on this account") unactionable.
    const detail = await readEndpointError(response);
    this.diagnostics.warn('POSSE', 'webmention:refused', {
      endpoint,
      target: targetUrl,
      source: sourceUrl,
      status: response.status,
      detail,
    });
    return {
      state: 'failed',
      endpoint,
      message: refusalMessage(response.status, detail, endpoint, targetUrl),
    };
  }
}

/** The endpoint's error text, JSON or plain, trimmed to something readable. */
async function readEndpointError(response: Response): Promise<string> {
  let body: string;
  try {
    body = (await response.text()).trim();
  } catch {
    return '';
  }
  if (!body) {
    return '';
  }
  try {
    const parsed = JSON.parse(body) as {
      error_description?: string;
      error?: string;
      message?: string;
    };
    const described = parsed.error_description ?? parsed.message ?? parsed.error;
    if (described) {
      return described;
    }
  } catch {
    // Not JSON; fall through to the raw text.
  }
  // An HTML error page is noise, not an explanation.
  if (/^\s*</.test(body)) {
    return '';
  }
  return body.length > 200 ? `${body.slice(0, 199)}…` : body;
}

/**
 * Turn a refusal into something the user can act on.
 *
 * `invalid_target` is called out by name because it is the mistake this setup
 * invites: webmention.io registers a site under the exact URL you signed in
 * with, and a target under a *different* path — or the same path with the
 * trailing slash flipped — is "not on this account". The endpoint says so
 * clearly; the previous version of this code discarded that sentence.
 */
function refusalMessage(
  status: number,
  detail: string,
  endpoint: string,
  targetUrl: string,
): string {
  const base = `${endpoint} refused this (HTTP ${status})`;
  if (!detail) {
    return `${base}.`;
  }
  if (/not found on this account|invalid_target/i.test(detail)) {
    return `${base}: ${detail}. That receiver is registered for a different address than ${targetUrl} — check the exact URL (including the trailing slash) you signed up with.`;
  }
  return `${base}: ${detail}`;
}

/** `HttpHeaders`-ish to a plain record, since this uses `fetch` not HttpClient. */
function toHeaderRecord(headers: unknown): Record<string, string> {
  const source = headers as { keys?: () => string[]; get?: (key: string) => string | null };
  if (typeof source?.keys !== 'function' || typeof source.get !== 'function') {
    return {};
  }
  const record: Record<string, string> = {};
  for (const key of source.keys()) {
    const value = source.get(key);
    if (value !== null) {
      record[key] = value;
    }
  }
  return record;
}
