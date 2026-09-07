import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, tap, throwError, timer } from 'rxjs';
import { retry } from 'rxjs/operators';
import { CorsProxy, CorsProxyRefusal } from '../cors-proxy/cors-proxy';
import { externalFetch } from '../external-fetch';
import { PageDiagnostics } from '../../page-diagnostics';
import { ShortenerProxyConsent } from './proxy-consent';
import {
  LinkProviderError,
  looksCorsBlocked,
  ProviderErrorHints,
  toLinkProviderError,
} from './shortener-errors';
import { ShortenerSettings } from './shortener-settings';
import { shortenerEntry } from './shortener-catalog';
import { ShortenerId } from './shortener-provider';

/**
 * The one place a shortener request is actually sent.
 *
 * Every adapter goes through {@link request}, which owns three concerns the
 * adapters should not each re-implement: authentication, the direct-then-proxy
 * decision, and retry policy.
 *
 * ## The direct-then-proxy decision
 *
 * These APIs are designed for server-to-server use, and most of them do not send
 * `Access-Control-Allow-Origin` to a browser. But "most" is not "all", it varies
 * per endpoint, and it changes over time — so this never assumes. It tries the
 * direct request first, every time. Only when the browser reports the
 * indistinguishable `status: 0` failure (CORS, DNS, or offline — the browser
 * deliberately will not say which) does the proxy come into play, and then only
 * if the user has already consented for this exact provider-and-proxy pair.
 *
 * When there is no consent on file this throws {@link ProxyConsentRequired},
 * which is not an error the page shows as a failure: it is the signal to ask.
 * The connect flow catches it, presents the disclosure, and re-runs the request
 * if the user accepts. That is why it carries the reason rather than being
 * flattened into a generic `CORS_BLOCKED`.
 *
 * ## Retry policy
 *
 * The spec is specific and this follows it: retry `429` and transient `5xx` with
 * backoff, and *never* retry a create. A retried create is the one operation
 * that can silently produce two links where the user asked for one, because a
 * timeout does not tell you whether the first attempt landed. Adapters mark
 * creates with `idempotent: false` and get one attempt.
 */

/** Thrown when a request needs the proxy and the user has not yet been asked. */
export class ProxyConsentRequired extends Error {
  constructor(
    readonly shortener: ShortenerId,
    /** True when no proxy is configured at all, so the ask is "go configure one". */
    readonly noProxyConfigured: boolean,
    /** Whether this request would disclose a provider credential. */
    readonly carriesCredential: boolean,
  ) {
    super(
      noProxyConfigured
        ? 'This service refuses direct browser requests, and no CORS proxy is configured.'
        : carriesCredential
          ? 'This service refuses direct browser requests. Sending your API key through the proxy needs your consent.'
          : 'This service refuses direct browser requests. Sending the destination URL through the proxy needs your consent.',
    );
    this.name = 'ProxyConsentRequired';
  }
}

export interface ShortenerRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Absolute URL, query string included. */
  url: string;
  body?: unknown;
  /** Extra headers beyond authorization and content negotiation. */
  headers?: Record<string, string>;
  /**
   * Whether repeating this request is safe. Creates are never idempotent — see
   * the retry note above.
   */
  idempotent: boolean;
  /** Provider-specific error refinement. */
  hints?: ProviderErrorHints;
  /**
   * Keep this a CORS-*simple* request: send no header that would force the
   * browser to preflight it.
   *
   * Worth understanding before setting or clearing this. A cross-origin GET with
   * only safelisted headers is sent straight out, and the server needs nothing
   * but `Access-Control-Allow-Origin` on the response. Add one non-safelisted
   * header — an `Authorization` header counts — and the browser must first send
   * an `OPTIONS` preflight, which the server has to answer with a matching
   * `Access-Control-Allow-Headers`. A server can therefore be perfectly
   * CORS-friendly and *still* fail, purely because we asked for a header it does
   * not list in its preflight response.
   *
   * Providers that select JSON through the query string (is.gd's `format=json`)
   * lose nothing by omitting `Accept`. `Accept` itself is CORS-safelisted; this
   * option keeps the whole request simple if provider adapters evolve.
   */
  simpleRequest?: boolean;
}

const MAX_RETRIES = 2;

/**
 * What to say when a CORS-open service fails opaquely.
 *
 * The honest answer is a short list of causes, because the browser genuinely
 * does not say which one it was. What this must *not* do is name CORS as the
 * cause or suggest a proxy: this provider sends the headers, so both would send
 * the user to configure a workaround for a problem they do not have.
 *
 * The service being down is listed first because it is the likeliest and the
 * only one the user cannot act on — and, in the case that produced this code,
 * the actual answer.
 */
function corsOpenFailure(provider: ShortenerId): LinkProviderError {
  const label = shortenerEntry(provider)?.label ?? 'This service';
  return new LinkProviderError(
    'PROVIDER_UNAVAILABLE',
    `Couldn't reach ${label}. It answers browsers directly, so this is not a CORS problem and a proxy would not help — most likely the service is having trouble, or something on this network or in the browser (an extension, an ad blocker) stopped the request. Worth trying again shortly.`,
    provider,
  );
}

/**
 * The proxy's own refusal message, when a 4xx came from the relay rather than
 * from the shortener behind it.
 *
 * Deliberately narrow. The Mawkingbird Worker answers a request for a host its
 * route cannot reach with `403 {"error": "Route \"shortener\" does not reach
 * is.gd."}` — a sentence about *our* allowlist. Shortener error bodies also
 * carry an `error` key (Dub's is `{"error": {"code": ..., "message": ...}}`), so
 * matching on the key alone would start blaming the proxy for genuine provider
 * rejections. The signature required here is a string `error` that names a
 * route, which is the proxy's phrasing and nobody else's.
 *
 * Returns null for anything that might be the provider talking — when in doubt,
 * the existing pass-through is the safer answer, because it blames the party the
 * user was actually trying to reach.
 */
function proxyRefusalMessage(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse) || error.status < 400 || error.status >= 500) {
    return null;
  }
  const body = error.error as { error?: unknown } | string | null;
  const raw = typeof body === 'string' ? body : typeof body?.error === 'string' ? body.error : null;
  if (!raw) {
    return null;
  }
  // `route` plus a refusal verb: specific enough that a shortener would have to
  // be talking about routing to trip it.
  return /route\b/i.test(raw) && /does not reach|not allowed|refus|denied/i.test(raw)
    ? raw.trim()
    : null;
}

@Injectable({ providedIn: 'root' })
export class ShortenerTransport {
  private http = inject(HttpClient);
  private settings = inject(ShortenerSettings);
  private proxy = inject(CorsProxy);
  private consent = inject(ShortenerProxyConsent);
  private diagnostics = inject(PageDiagnostics);

  /**
   * Send an authenticated request to the active provider.
   *
   * @throws LinkProviderError for anything the caller should show as a failure.
   * @throws ProxyConsentRequired when the caller should ask, then retry.
   */
  /**
   * Which leg the most recent {@link request} succeeded on.
   *
   * Exists for {@link ShortenerReachability}, which has to report "worked
   * directly" versus "needed the proxy" and cannot otherwise tell: both come back
   * as an ordinary success. Deliberately not part of the observable's value —
   * every caller but the probe wants the response, not the route it took.
   */
  lastRouteUsed: 'direct' | 'proxy' | null = null;

  request<T>(provider: ShortenerId, spec: ShortenerRequest): Observable<T> {
    this.lastRouteUsed = null;
    const config = this.settings.resolve();
    if (!config) {
      return throwError(
        () =>
          new LinkProviderError(
            'AUTHENTICATION_FAILED',
            this.settings.blockedReason() ?? 'No link shortener is configured.',
            provider,
          ),
      );
    }

    const direct = () => {
      this.diagnostics.info('Shortener', 'request:start', {
        provider,
        method: spec.method,
        route: 'direct',
      });
      return this.send<T>(provider, spec, spec.url, this.authHeaders(config.auth, spec)).pipe(
        tap(() => {
          this.lastRouteUsed = 'direct';
          this.diagnostics.info('Shortener', 'request:success', { provider, route: 'direct' });
        }),
      );
    };

    return direct().pipe(
      catchError((error: unknown) => {
        if (!looksCorsBlocked(error)) {
          this.diagnostics.error('Shortener', 'request:error', error, {
            provider,
            route: 'direct',
          });
          return throwError(() => toLinkProviderError(error, provider, spec.hints));
        }
        this.diagnostics.warn('Shortener', 'request:opaque-failure', {
          provider,
          route: 'direct',
          hint: 'Browser reported status 0 (CORS, DNS, offline, or blocked request)',
        });
        // A proxy is only a remedy when the host is the thing refusing browsers.
        // For a service known to send CORS headers, `status: 0` means something
        // a relay cannot fix — the service is down, the network dropped it, or
        // an extension cancelled it — so offering one would send the user's
        // traffic through a third party to solve a problem it is not the cause
        // of. See `ShortenerCatalogEntry.corsOpen`.
        if (shortenerEntry(provider)?.corsOpen) {
          this.diagnostics.warn('Shortener', 'request:proxy-skipped', {
            provider,
            reason: 'Provider is CORS-open; a proxy cannot explain this failure.',
          });
          return throwError(() => corsOpenFailure(provider));
        }
        return this.viaProxy<T>(provider, spec, config.auth);
      }),
    );
  }

  /**
   * Whether a proxy retry is possible right now, and what it would cost.
   *
   * Used by the connect flow to decide which disclosure to show *before* the
   * request is attempted a second time, so the dialog can name the operator.
   */
  proxyPosture(provider: ShortenerId): {
    configured: boolean;
    consented: boolean;
    selfHosted: boolean;
  } {
    const entry = this.proxy.entry();
    return {
      configured: this.proxy.available(),
      consented: entry ? this.consent.granted(provider, entry.id) : false,
      selfHosted: this.proxy.isSelfHosted(),
    };
  }

  /**
   * The proxy leg, taken only after a direct request came back `status: 0`.
   *
   * Consent is required even when `auth` is null. A keyless request has no secret
   * credential, but the proxy still learns the destination URL. The dialog uses
   * a smaller disclosure for that case instead of treating configuration as
   * permission.
   */
  private viaProxy<T>(
    provider: ShortenerId,
    spec: ShortenerRequest,
    auth: { header: string; value: string } | null,
  ): Observable<T> {
    const entry = this.proxy.entry();
    if (!entry || !this.proxy.available()) {
      return throwError(() => new ProxyConsentRequired(provider, true, auth !== null));
    }

    const carriesCredential = auth !== null;
    if (!this.consent.granted(provider, entry.id)) {
      return throwError(() => new ProxyConsentRequired(provider, false, carriesCredential));
    }

    let proxied: { url: string; headers: HttpHeaders };
    try {
      proxied = carriesCredential
        ? this.proxy.proxyCredentialedRequest(spec.url, true, 'shortener')
        : this.proxy.proxyRequest(spec.url, 'shortener');
    } catch (error: unknown) {
      // A refusal here is a genuine safety stop (mixed content, userinfo), not
      // a missing consent — surface it as the error it is.
      const message =
        error instanceof CorsProxyRefusal ? error.message : 'This request cannot be proxied.';
      return throwError(() => new LinkProviderError('CORS_BLOCKED', message, provider));
    }

    // The proxy's own key rides alongside the provider's, when there is one:
    // each authenticates us to a different party.
    let headers = this.authHeaders(auth, spec);
    proxied.headers.keys().forEach((name) => {
      const value = proxied.headers.get(name);
      if (value) {
        headers = headers.set(name, value);
      }
    });

    const proxyLabel = entry.label;
    this.diagnostics.info('Shortener', 'request:start', {
      provider,
      method: spec.method,
      route: 'proxy',
      proxy: proxyLabel,
      carriesCredential,
    });
    return this.send<T>(provider, spec, proxied.url, headers).pipe(
      tap(() => {
        this.lastRouteUsed = 'proxy';
        this.diagnostics.info('Shortener', 'request:success', {
          provider,
          route: 'proxy',
          proxy: proxyLabel,
        });
      }),
      catchError((error: unknown) => {
        this.diagnostics.error('Shortener', 'request:error', error, {
          provider,
          route: 'proxy',
          proxy: proxyLabel,
        });
        return throwError(() => this.proxyLegError(error, provider, spec, proxyLabel));
      }),
    );
  }

  /**
   * Turn a failure on the *proxy* leg into an error that blames the right party.
   *
   * Without this, a proxy that is overloaded, has shut down, or is answering with
   * an HTML error page gets reported as though the shortener rejected the
   * request — which sends the user off to check an API key that was never the
   * problem. The proxy is a hop the user added, so when the hop is what broke,
   * the message says so and names it.
   *
   * The two shapes worth separating:
   *
   * - A `5xx` from the proxy host. The request never reached the shortener, so
   *   nothing about the shortener can be concluded.
   * - A `status: 0`, i.e. the proxy leg *also* died before any response. The
   *   usual cause is the proxy returning an error page without CORS headers, so
   *   the browser blocks its response too and we learn nothing at all.
   *
   * - A `4xx` carrying the *proxy's own* error envelope. A destination-restricted
   *   proxy answers 403 for a host it has no route to, and that is our allowlist
   *   refusing, not the service. Reported verbatim it became "This key is not
   *   allowed to do that. It may be missing a scope or a permission." — advice
   *   about a credential, for is.gd, which has no accounts and takes no key.
   *
   * Anything else — a real `4xx` carrying the shortener's own body — is passed
   * through untouched, because that genuinely is the shortener answering.
   */
  private proxyLegError(
    error: unknown,
    provider: ShortenerId,
    spec: ShortenerRequest,
    proxyLabel: string,
  ): LinkProviderError {
    const refusal = proxyRefusalMessage(error);
    if (refusal) {
      return new LinkProviderError(
        'CORS_BLOCKED',
        `${proxyLabel} refused to relay this request: ${refusal} That is this proxy's own destination policy, not the shortener rejecting you — a general-purpose proxy, or one you run yourself, would reach it.`,
        provider,
        error instanceof HttpErrorResponse ? error.status : 0,
      );
    }
    if (error instanceof HttpErrorResponse && error.status >= 500) {
      return new LinkProviderError(
        'PROVIDER_UNAVAILABLE',
        `The CORS proxy (${proxyLabel}) failed with a ${error.status}, so the request never reached the shortener. The proxy may be overloaded or down — try again, or pick a different proxy in Settings.`,
        provider,
        error.status,
      );
    }
    if (looksCorsBlocked(error)) {
      return new LinkProviderError(
        'CORS_BLOCKED',
        `The CORS proxy (${proxyLabel}) could not be reached, or answered without the CORS headers a browser needs — an error page instead of data would do that. Check the proxy in Settings, or try a different one.`,
        provider,
      );
    }
    return toLinkProviderError(error, provider, spec.hints);
  }

  private authHeaders(
    auth: { header: string; value: string } | null,
    spec: ShortenerRequest,
  ): HttpHeaders {
    // `Accept` is not on the CORS safelist for this value, so setting it forces a
    // preflight. Omitted when the caller asked to stay simple — see
    // {@link ShortenerRequest.simpleRequest}.
    let headers = spec.simpleRequest
      ? new HttpHeaders()
      : new HttpHeaders().set('Accept', 'application/json');
    if (auth) {
      // The header name is the provider's, not always `Authorization`:
      // Rebrandly reads a bespoke `apikey`.
      headers = headers.set(auth.header, auth.value);
    }
    for (const [name, value] of Object.entries(spec.headers ?? {})) {
      headers = headers.set(name, value);
    }
    return headers;
  }

  /**
   * Issue one HTTP request, with retry for the transient cases only.
   *
   * `externalFetch()` keeps the Mastodon auth interceptor from attaching the
   * instance token to a third-party host, and keeps the health interceptor from
   * treating a shortener outage as the Mastodon server being down.
   */
  private send<T>(
    provider: ShortenerId,
    spec: ShortenerRequest,
    url: string,
    headers: HttpHeaders,
  ): Observable<T> {
    const options = {
      headers,
      context: externalFetch(),
      // T.LY's DELETE carries a JSON body, which `HttpClient` supports only
      // through the generic `request` overload.
      body: spec.body,
    };

    const once = () =>
      this.http.request<T>(spec.method, url, options as never) as unknown as Observable<T>;

    if (!spec.idempotent) {
      return once();
    }

    return once().pipe(
      retry({
        count: MAX_RETRIES,
        delay: (error: unknown, attempt: number) => {
          const normalized = toLinkProviderError(error, provider, spec.hints);
          if (!normalized.transient) {
            return throwError(() => error);
          }
          // Honour Retry-After when the provider sent one; otherwise back off
          // exponentially from one second.
          const seconds = normalized.retryAfterSeconds ?? Math.min(2 ** (attempt - 1), 8);
          return timer(seconds * 1000);
        },
      }),
    );
  }
}
