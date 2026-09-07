import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, Subscriber, throwError, timeout, timer } from 'rxjs';
import { retry } from 'rxjs/operators';
import { PageDiagnostics } from '../../page-diagnostics';
import { CorsProxy, CorsProxyRefusal } from '../cors-proxy/cors-proxy';
import { externalFetch } from '../external-fetch';
import { ProxyConsent } from '../proxy-consent-store';
import {
  isProxyOriginRefusal,
  providerErrorInBody,
  toTwitterApiError,
  TwitterApiError,
} from './twitter-errors';
import { TwitterConfig, TwitterSettings } from './twitter-settings';
import { TwitterSourceId } from './twitter-source';
import { TwitterUsage } from './twitter-usage';

/**
 * The one place a Twitter data request is actually sent.
 *
 * ## Why this is proxy-*first*, unlike every other transport here
 *
 * {@link ShortenerTransport} tries direct on every request and falls back to a
 * proxy on failure, because shorteners genuinely vary — some answer browsers.
 * These services provably never will, and the reason is structural rather than
 * a policy that might soften:
 *
 * > Authentication is a custom header (`X-API-Key` / `Authorization`), which
 * > forces a CORS preflight. TwitterAPI.io answers that preflight with **401 and
 * > no `Access-Control-Allow-Origin`**, because it demands the API key on the
 * > preflight itself — which a browser is forbidden to send. There is no
 * > query-parameter auth to fall back to; all three plausible spellings 403.
 *
 * Measured 2026-07-31; see `sprint/twitter-1-transport.md`. So a direct attempt
 * is not a fallback worth trying, it is a guaranteed failure that costs seconds
 * of the user's time before every real request.
 *
 * The direct path therefore exists in exactly one place — {@link probeDirect},
 * called by the connector page's Test button — so that "this service refuses
 * browsers" is something the user *watches happen* rather than a claim the app
 * makes. The verdict is recorded and never re-derived per request.
 *
 * ## What that means for consent
 *
 * Because the proxy is the only route, refusing consent does not degrade the
 * feature — it disables it. The connector page has to say that plainly, and
 * {@link TwitterProxyRequired} carries the distinction between "no proxy
 * configured" and "not consented yet" so it can.
 */

/** Thrown when a request cannot proceed until the user configures or consents. */
export class TwitterProxyRequired extends Error {
  constructor(
    readonly source: TwitterSourceId,
    /** True when no usable proxy is configured at all. */
    readonly noProxyConfigured: boolean,
  ) {
    super(
      noProxyConfigured
        ? 'Twitter data services refuse direct browser requests, and no CORS proxy is configured.'
        : 'Sending your Twitter API key through the CORS proxy needs your consent.',
    );
    this.name = 'TwitterProxyRequired';
  }
}

export interface TwitterRequest {
  /** Path under the source's base URL, e.g. `/twitter/user/info`. */
  path: string;
  /** Query parameters. Values are encoded exactly once. */
  params?: Record<string, string | number | undefined>;
}

const MAX_RETRIES = 2;

@Injectable({ providedIn: 'root' })
export class TwitterTransport {
  private http = inject(HttpClient);
  private settings = inject(TwitterSettings);
  private proxy = inject(CorsProxy);
  private consent = inject(ProxyConsent);
  private usage = inject(TwitterUsage);
  private diagnostics = inject(PageDiagnostics);
  private batchQueue: PendingTwitterRequest[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private batchSequence = 0;

  /** Whether simultaneous reads can share one Mawkingbird invocation. */
  batchAvailable(): boolean {
    return this.proxy.batchCapacity(this.activeRoute()) > 1;
  }

  /**
   * Send an authenticated read to the active source, through the proxy.
   *
   * @throws TwitterApiError for anything the caller should show as a failure.
   * @throws TwitterProxyRequired when the caller should configure or ask first.
   */
  request<T>(spec: TwitterRequest): Observable<T> {
    const config = this.settings.resolve();
    if (!config) {
      return throwError(
        () =>
          new TwitterApiError(
            'INVALID_CONFIGURATION',
            this.settings.blockedReason() ?? 'No Twitter data service is configured.',
            this.settings.activeId() ?? 'twitterapi-io',
          ),
      );
    }

    // Checked before anything is sent. A daily hard limit that only reported
    // afterwards would be a receipt, not a limit.
    if (this.usage.check(1) === 'hard-limit') {
      return throwError(
        () =>
          new TwitterApiError(
            'INVALID_CONFIGURATION',
            `You have reached your daily limit of ${this.usage.hardLimit()} Twitter data requests. ` +
              'It resets at midnight, or you can raise it on the Twitter connector page.',
            config.entry.id,
          ),
      );
    }

    const targetUrl = buildUrl(config, spec);
    const entry = this.proxy.entry();

    // Nothing is sent — not even a doomed direct attempt — until there is a
    // consented proxy. This is the "costs nothing to be unconfigured" property.
    if (!entry || !this.proxy.available()) {
      return throwError(() => new TwitterProxyRequired(config.entry.id, true));
    }
    if (!this.consent.granted(config.entry.id, entry.id)) {
      return throwError(() => new TwitterProxyRequired(config.entry.id, false));
    }

    const route = config.entry.id === 'getxapi' ? 'getxapi' : 'twitterapi';
    let proxied: { url: string; headers: HttpHeaders };
    try {
      // Credentialed: the key rides through the proxy, which is exactly what the
      // consent above was for. Every other guard (mixed content, userinfo, the
      // user's own instance) still applies.
      // The route name tracks the source, because the Mawkingbird proxy has a
      // separate allowlist entry per data service.
      proxied = this.proxy.proxyCredentialedRequest(targetUrl, true, route);
    } catch (error: unknown) {
      const message =
        error instanceof CorsProxyRefusal ? error.message : 'This request cannot be proxied.';
      return throwError(() => new TwitterApiError('CORS_UNAVAILABLE', message, config.entry.id));
    }

    // Two credentials on one request, authenticating us to two different
    // parties: the source's key, and the proxy's own.
    let headers = new HttpHeaders().set(config.auth.header, config.auth.value);
    proxied.headers.keys().forEach((name) => {
      const value = proxied.headers.get(name);
      if (value) {
        headers = headers.set(name, value);
      }
    });

    const proxyLabel = entry.label;
    const startedAt = Date.now();
    // Counted at send time, not on success. A request that fails, times out, or
    // is retried has still been received and billed by the provider — counting
    // only successes would under-report exactly when things are going wrong,
    // which is when an accurate number matters most.
    this.usage.record(1);
    this.diagnostics.info('Twitter', 'request:start', {
      source: config.entry.id,
      path: spec.path,
      proxy: proxyLabel,
    });

    const response =
      this.proxy.batchCapacity(route) > 1
        ? this.sendBatched<T>(config, targetUrl, route, headers, proxyLabel)
        : this.send<T>(config, proxied.url, headers, proxyLabel);

    return response.pipe(
      map((body) => {
        // HTTP 200 is not success here — see providerErrorInBody. A proxy can
        // relay a 403 body under its own 200, which is precisely what AllOrigins
        // was observed doing.
        const embedded = providerErrorInBody(body, config.entry.id);
        if (embedded) {
          throw embedded;
        }
        this.diagnostics.info('Twitter', 'request:success', {
          source: config.entry.id,
          path: spec.path,
          ms: Date.now() - startedAt,
        });
        return body;
      }),
      catchError((error: unknown) => {
        const normalized = toTwitterApiError(error, config.entry.id, {
          viaProxy: true,
          proxyLabel,
        });
        this.diagnostics.error('Twitter', 'request:error', normalized, {
          source: config.entry.id,
          path: spec.path,
          code: normalized.code,
          ms: Date.now() - startedAt,
        });
        return throwError(() => normalized);
      }),
    );
  }

  private activeRoute(): 'twitterapi' | 'getxapi' {
    return this.settings.resolve()?.entry.id === 'getxapi' ? 'getxapi' : 'twitterapi';
  }

  private sendBatched<T>(
    config: TwitterConfig,
    targetUrl: string,
    route: 'twitterapi' | 'getxapi',
    headers: HttpHeaders,
    proxyLabel: string,
  ): Observable<T> {
    return new Observable((subscriber) => {
      const pending: PendingTwitterRequest = {
        id: `twitter-${++this.batchSequence}`,
        targetUrl,
        route,
        config,
        headers,
        proxyLabel,
        subscriber,
      };
      this.batchQueue.push(pending);
      if (this.batchTimer === null) {
        this.batchTimer = setTimeout(() => this.flushBatch(), BATCH_WINDOW_MS);
      }
      return () => {
        const index = this.batchQueue.indexOf(pending);
        if (index >= 0) this.batchQueue.splice(index, 1);
      };
    });
  }

  private flushBatch(): void {
    this.batchTimer = null;
    const pending = this.batchQueue.filter((item) => !item.subscriber.closed);
    this.batchQueue = [];
    const groups = new Map<string, PendingTwitterRequest[]>();
    for (const item of pending) {
      const key = `${item.route}\n${headerFingerprint(item.headers)}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    for (const items of groups.values()) {
      const capacity = this.proxy.batchCapacity(items[0].route);
      for (let index = 0; index < items.length; index += Math.max(1, capacity)) {
        const group = items.slice(index, index + Math.max(1, capacity));
        if (capacity < 2 || group.length === 1) this.sendQueuedSingle(group[0]);
        else this.sendQueuedBatch(group);
      }
    }
  }

  private sendQueuedSingle(item: PendingTwitterRequest): void {
    let proxied;
    try {
      proxied = this.proxy.proxyCredentialedRequest(item.targetUrl, true, item.route);
    } catch (error: unknown) {
      item.subscriber.error(error);
      return;
    }
    this.send<unknown>(item.config, proxied.url, item.headers, item.proxyLabel).subscribe(
      item.subscriber,
    );
  }

  private sendQueuedBatch(items: readonly PendingTwitterRequest[]): void {
    let request;
    try {
      request = this.proxy.proxyCredentialedBatchRequest(
        items.map(({ id, targetUrl }) => ({ id, url: targetUrl })),
        true,
        items[0].route,
      );
    } catch (error: unknown) {
      items.forEach((item) => item.subscriber.error(error));
      return;
    }
    let headers = request.headers;
    for (const name of items[0].headers.keys()) {
      const value = items[0].headers.get(name);
      if (value) headers = headers.set(name, value);
    }
    this.http
      .post<unknown>(request.url, request.body, {
        headers,
        context: externalFetch(),
      })
      .pipe(timeout(BATCH_TIMEOUT_MS))
      .subscribe({
        next: (body) => deliverTwitterBatch(items, body),
        error: (error: unknown) => items.forEach((item) => item.subscriber.error(error)),
      });
  }

  /**
   * Attempt one *direct* request, so the user can watch it fail.
   *
   * The only unproxied call in this module. It exists to make the app's claim
   * checkable rather than asserted, and its result is recorded so it never has
   * to run again. Costs one billable request when it does reach the service.
   *
   * Emits `true` if the browser somehow reached the service. If these providers
   * ever fix their preflight, this is what will notice.
   */
  probeDirect(spec: TwitterRequest): Observable<boolean> {
    const config = this.settings.resolve();
    if (!config) {
      return throwError(
        () =>
          new TwitterApiError(
            'INVALID_CONFIGURATION',
            this.settings.blockedReason() ?? 'No Twitter data service is configured.',
            this.settings.activeId() ?? 'twitterapi-io',
          ),
      );
    }
    // Counted like any other. It usually dies at the preflight without reaching
    // the service — and so usually costs nothing — but the app cannot observe
    // which happened, and over-counting a request that might have been billed
    // is the safe direction for a spend counter.
    this.usage.record(1);
    return this.http
      .get<unknown>(buildUrl(config, spec), {
        headers: new HttpHeaders().set(config.auth.header, config.auth.value),
        context: externalFetch(),
      })
      .pipe(
        map((body) => providerErrorInBody(body, config.entry.id) === null),
        catchError(() => {
          // Any failure means "not reachable directly". Deliberately not
          // distinguishing causes: the browser will not say, and a guessed
          // cause is worse than an honest "could not reach it".
          return [false];
        }),
      );
  }

  /** Whether a proxy is configured and consented for the active source. */
  proxyPosture(): { configured: boolean; consented: boolean; selfHosted: boolean } {
    const entry = this.proxy.entry();
    const active = this.settings.activeId();
    return {
      configured: this.proxy.available(),
      consented: entry && active ? this.consent.granted(active, entry.id) : false,
      selfHosted: this.proxy.isSelfHosted(),
    };
  }

  /**
   * Issue one request, retrying only the transient cases.
   *
   * Conservative by design (spec §11): these calls cost money, and a timed-out
   * request may already have been billed, so a retry must never be a guess.
   */
  private send<T>(
    config: TwitterConfig,
    url: string,
    headers: HttpHeaders,
    proxyLabel: string,
  ): Observable<T> {
    return this.http.get<T>(url, { headers, context: externalFetch() }).pipe(
      retry({
        count: MAX_RETRIES,
        delay: (error: unknown, attempt: number) => {
          const normalized = toTwitterApiError(error, config.entry.id, {
            viaProxy: true,
            proxyLabel,
          });
          if (!normalized.transient) {
            this.diagnostics.info('Twitter', 'retry:declined', {
              attempt,
              code: normalized.code,
              httpStatus: normalized.httpStatus,
              reason: 'not transient',
            });
            return throwError(() => error);
          }
          // A refusal the *proxy* issued on its own behalf is not worth the
          // retry budget. The free proxies this app relies on rate-limit by
          // origin and refuse in bulk for minutes at a time, so retrying buys
          // nothing but delay — and that delay is what made Home look frozen,
          // because the aggregator waits for every source. The data service's
          // own throttling still retries: it carries a provider message in the
          // body, and it does clear in seconds.
          if (isProxyOriginRefusal(normalized)) {
            this.diagnostics.warn('Twitter', 'retry:declined-proxy-refusal', {
              attempt,
              code: normalized.code,
              httpStatus: normalized.httpStatus,
              proxy: proxyLabel,
              reason: 'the proxy refused on its own behalf; retrying only adds delay',
            });
            return throwError(() => error);
          }
          this.diagnostics.warn('Twitter', 'retry:scheduled', {
            attempt,
            of: MAX_RETRIES,
            code: normalized.code,
            httpStatus: normalized.httpStatus,
            retryAfterMs: normalized.retryAfterMs ?? null,
          });
          // A retry is another billable request. Counting it keeps the total
          // honest, and — because `record` is what the hard limit reads — stops
          // a backoff loop from spending past the limit that was checked once
          // before the first attempt.
          this.usage.record(1);
          // Honour Retry-After; otherwise exponential backoff with full jitter,
          // capped at 8s per the spec.
          const base = normalized.retryAfterMs ?? Math.min(500 * 2 ** (attempt - 1), 8000);
          return timer(normalized.retryAfterMs ? base : Math.random() * base);
        },
      }),
    );
  }
}

const BATCH_WINDOW_MS = 10;
const BATCH_TIMEOUT_MS = 25_000;

interface PendingTwitterRequest {
  id: string;
  targetUrl: string;
  route: 'twitterapi' | 'getxapi';
  config: TwitterConfig;
  headers: HttpHeaders;
  proxyLabel: string;
  subscriber: Subscriber<unknown>;
}

function headerFingerprint(headers: HttpHeaders): string {
  return headers
    .keys()
    .sort()
    .map((name) => `${name}:${headers.get(name) ?? ''}`)
    .join('\n');
}

function deliverTwitterBatch(items: readonly PendingTwitterRequest[], value: unknown): void {
  if (!isRecord(value) || !Array.isArray(value['results'])) {
    const error = new Error('The CORS proxy returned an invalid batch response.');
    items.forEach((item) => item.subscriber.error(error));
    return;
  }
  const results = new Map<string, { status: number; ok: boolean; body: string }>();
  for (const candidate of value['results']) {
    if (
      !isRecord(candidate) ||
      typeof candidate['id'] !== 'string' ||
      typeof candidate['status'] !== 'number' ||
      typeof candidate['ok'] !== 'boolean' ||
      typeof candidate['body'] !== 'string'
    ) {
      const error = new Error('The CORS proxy returned an invalid batch response.');
      items.forEach((item) => item.subscriber.error(error));
      return;
    }
    results.set(candidate['id'], {
      status: candidate['status'],
      ok: candidate['ok'],
      body: candidate['body'],
    });
  }
  for (const item of items) {
    const result = results.get(item.id);
    if (!result) {
      item.subscriber.error(new Error('The CORS proxy omitted a Twitter request.'));
    } else if (!result.ok) {
      item.subscriber.error(new HttpErrorResponse({ status: result.status, error: result.body }));
    } else {
      try {
        item.subscriber.next(JSON.parse(result.body));
        item.subscriber.complete();
      } catch {
        item.subscriber.error(new Error('The Twitter data service returned invalid JSON.'));
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Build the absolute target URL.
 *
 * `URLSearchParams` rather than string concatenation, so a search query
 * containing `#`, `&` or a quoted phrase is encoded exactly once — the
 * double-encoding bug this repo has already been bitten by.
 */
export function buildUrl(config: TwitterConfig, spec: TwitterRequest): string {
  const url = new URL(spec.path, config.entry.baseUrl);
  for (const [name, value] of Object.entries(spec.params ?? {})) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(name, String(value));
    }
  }
  return url.toString();
}
