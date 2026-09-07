import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, tap, throwError } from 'rxjs';
import { CorsProxy } from '../cors-proxy/cors-proxy';
import { CorsProxyUsageStore, toResponse } from '../cors-proxy/cors-proxy-usage';
import { externalFetch } from '../external-fetch';

/**
 * Fetches a paste service's public feed, optionally through the CORS proxy.
 *
 * The paste hosts are the case the proxy exists for: not one of them sends an
 * `access-control-*` header, so every one of these feeds is unreadable from a
 * browser without a relay. That makes it tempting to route them automatically,
 * and this deliberately does not — the flag comes from the subscription's own
 * `useProxy`, set by the user on the Pastes page, exactly as `RssFetch` takes
 * it from an `RssFeedSub`. A proxy operator can read and rewrite everything
 * that passes through, so choosing one is the user's call per feed.
 *
 * Thinner than {@link RssFetch} on purpose: no IndexedDB cache and no failure
 * cooldown. Paste feeds are fetched once per home-timeline load by a provider
 * that marks itself exhausted after the first page, so the request volume that
 * made those layers necessary for RSS is not there. What it does share is the
 * part that matters — the refusal-vs-network distinction, and error copy that
 * says which of the two happened.
 */
@Injectable({ providedIn: 'root' })
export class PasteFeedFetch {
  private http = inject(HttpClient);
  private corsProxy = inject(CorsProxy);
  private proxyUsage = inject(CorsProxyUsageStore);

  /** Whether a usable proxy is configured, for UI that offers the opt-in. */
  proxyAvailable(): boolean {
    return this.corsProxy.available();
  }

  /** The configured proxy's display name, or null. */
  proxyLabel(): string | null {
    return this.corsProxy.label();
  }

  /**
   * GET a feed as JSON.
   *
   * @param useProxy Route through the configured CORS proxy. Only ever set from
   * the subscription's own opt-in flag — never inferred from a failure.
   * @param extraHeaders Request headers the feed itself needs, such as an API
   * key that only authenticates as a header. Merged *under* the proxy's own
   * headers so a proxy's auth can never be clobbered by a feed's.
   */
  json<T>(
    url: string,
    useProxy: boolean,
    label: string,
    extraHeaders?: Record<string, string>,
  ): Observable<T> {
    let requestUrl = url;
    let headers = extraHeaders ? new HttpHeaders(extraHeaders) : undefined;
    if (useProxy) {
      try {
        // The `paste` route rather than `feeds`: these are the paste hosts
        // specifically, and that route is the one permitted to carry the
        // `X-API-Key` that `extraHeaders` may hold. `feeds` forwards no headers
        // at all, so a keyed subscription would silently read as unauthenticated.
        const proxied = this.corsProxy.proxyRequest(url, 'paste');
        requestUrl = proxied.url;
        // The proxy's headers win on collision, and the feed's ride along. Many
        // proxies drop unknown request headers, so a key sent this way may not
        // reach the origin — the caller's error copy has to survive that.
        headers = proxied.headers;
        for (const name of Object.keys(extraHeaders ?? {})) {
          if (!headers.has(name)) {
            headers = headers.set(name, (extraHeaders ?? {})[name]);
          }
        }
      } catch (error: unknown) {
        // A refusal is the app's own configuration saying no. It must reach the
        // user unchanged — it is fixed by editing a setting, not by retrying.
        return throwError(() =>
          error instanceof Error ? error : new Error(`${label} cannot be proxied.`),
        );
      }
    }

    return this.http
      .get<T>(requestUrl, {
        // `observe: 'response'` so the proxy's `X-Proxy-Usage` header is
        // readable. The body is unwrapped again below.
        observe: 'response',
        context: externalFetch(),
        ...(headers ? { headers } : {}),
      })
      .pipe(
        tap({
          next: (response) => useProxy && this.proxyUsage.record(true, toResponse(response)),
          error: () => useProxy && this.proxyUsage.record(false),
        }),
        map((response) => response.body as T),
        catchError((error: unknown) =>
          throwError(() => new Error(describeFeedError(error, useProxy, label))),
        ),
      );
  }
}

/**
 * Turn a failure into something a reader can act on.
 *
 * The distinction that matters for these feeds is direct-vs-proxied: a status 0
 * on a direct fetch is almost always the missing CORS header, which no amount
 * of retrying fixes and which the proxy opt-in does fix. Saying so is the
 * difference between a dead end and a next step.
 */
export function describeFeedError(error: unknown, viaProxy: boolean, label: string): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return viaProxy
        ? `Couldn't reach ${label} through the CORS proxy. The proxy may be down, rate-limiting ` +
            'you, or refusing this address — check it on Settings → Connections → CORS proxy.'
        : `${label} doesn't allow cross-origin access, so the browser can't read it directly. ` +
            'Mockingbird has no server of its own, so this feed can only be read through a CORS ' +
            'proxy — set one up on Settings → Connections → CORS proxy, then turn it on for ' +
            'this feed.';
    }
    if (viaProxy && (error.status === 401 || error.status === 403)) {
      return `The CORS proxy rejected the request (${error.status}). It probably needs an API key, or the key it has is wrong or out of quota.`;
    }
    if (viaProxy && error.status === 429) {
      return 'The CORS proxy is rate-limiting you. Wait a little, or switch to a proxy you hold a key for.';
    }
    return viaProxy
      ? `The CORS proxy answered ${error.status}.`
      : `${label} answered ${error.status}.`;
  }
  return error instanceof Error ? error.message : `Unknown error reading ${label}.`;
}
