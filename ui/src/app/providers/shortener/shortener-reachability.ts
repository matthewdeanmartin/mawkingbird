import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { CorsProxy } from '../cors-proxy/cors-proxy';
import { LinkProviderError, looksCorsBlocked } from './shortener-errors';
import { ShortenerId } from './shortener-provider';
import { ProxyConsentRequired, ShortenerTransport } from './shortener-transport';

/**
 * "Can I reach this shortener from a browser today?"
 *
 * ## What a browser can and cannot tell you
 *
 * This is the honest limit of the whole feature, and the reason the verdicts
 * below are worded the way they are. When a cross-origin request fails, the
 * browser reports `status: 0` and nothing else — deliberately, because the
 * failure detail is itself cross-origin information. CORS refusal, a DNS
 * failure, being offline, and an ad-blocker cancelling the request are all
 * indistinguishable from script.
 *
 * So this probe cannot report *why* something failed, and does not pretend to.
 * It reports only what is actually observable:
 *
 * - the direct request worked, so no proxy is needed;
 * - the direct request failed but the proxy worked, so the proxy is required;
 * - both failed;
 * - a proxy is needed but none is configured (or the pairing needs consent).
 *
 * Note the deliberate absence of "is blocked by CORS". For most of these
 * services it very likely is, but this code has no way to know that, and a
 * verdict stated with more confidence than the evidence supports is worse than a
 * vaguer true one when someone is debugging.
 *
 * ## Why every probe is a read
 *
 * Pressing Test must never leave anything behind. The credentialed providers all
 * expose a cheap authenticated read, which doubles as a check of the key; is.gd
 * has no accounts, so it is probed with its link-lookup endpoint instead.
 *
 * is.gd used to be probed with a real create, on the reasoning that it dedupes
 * identical destinations and so would return the same throwaway link every time.
 * That held until its database stopped accepting writes, at which point a probe
 * of the *write* path declared a service unreachable whose reads were answering
 * normally. Reachability is a question about the host, so the probe asks the
 * cheapest question that requires the host to answer it.
 */

export type ReachabilityStatus =
  /** Direct browser request succeeded. Nothing else needed. */
  | 'direct'
  /** Direct failed, the configured proxy succeeded. */
  | 'proxy'
  /** Direct failed and a proxy is needed, but none is configured. */
  | 'needs-proxy'
  /** Direct failed, a proxy exists, but this pairing needs the user's consent first. */
  | 'needs-consent'
  /** Direct failed and the proxy failed too. */
  | 'unreachable'
  /** Not probed: this provider has no operation that is safe to call speculatively. */
  | 'unknown';

export interface ReachabilityResult {
  shortener: ShortenerId;
  status: ReachabilityStatus;
  /** One sentence for the connectors page. Written for a human, safe to render. */
  message: string;
  /** When the probe ran, so the page can say how fresh the answer is. */
  checkedAt: number;
}

@Injectable({ providedIn: 'root' })
export class ShortenerReachability {
  private transport = inject(ShortenerTransport);
  private proxy = inject(CorsProxy);

  /**
   * Probe one provider by attempting its cheapest real operation.
   *
   * Deliberately routed through {@link ShortenerTransport} rather than a bespoke
   * fetch: the point is to exercise the exact path a real request takes, headers
   * and direct-then-proxy fallback included. A probe that took a different route
   * could pass while the real feature fails — which is precisely how the
   * `Accept`-header preflight bug survived as long as it did.
   */
  probe(shortener: ShortenerId): Observable<ReachabilityResult> {
    return this.transport
      .request<unknown>(shortener, {
        method: 'GET',
        url: this.probeUrl(shortener),
        // One attempt, deliberately. The retry path backs off for seconds on a
        // 5xx, and someone waiting on a "Test" button wants today's answer now —
        // a probe that retries is measuring persistence, not reachability.
        idempotent: false,
        simpleRequest: shortener === 'isgd',
      })
      .pipe(
        // The transport records which leg carried it, since a success looks the
        // same either way from here.
        map(() => this.result(shortener, this.transport.lastRouteUsed ?? 'direct')),
        catchError((error: unknown) => of(this.failure(shortener, error))),
      );
  }

  /** The verdict for a probe that threw. */
  private failure(shortener: ShortenerId, error: unknown): ReachabilityResult {
    if (error instanceof ProxyConsentRequired) {
      return this.result(shortener, error.noProxyConfigured ? 'needs-proxy' : 'needs-consent');
    }
    if (error instanceof LinkProviderError) {
      // A real answer from the service — auth, rate limit, a rejected slug — means
      // the request arrived. That is reachability, whatever else went wrong.
      if (error.status > 0 && error.code !== 'PROVIDER_UNAVAILABLE') {
        return this.result(shortener, this.transport.lastRouteUsed ?? 'direct');
      }
      return this.result(shortener, 'unreachable');
    }
    if (looksCorsBlocked(error)) {
      return this.result(shortener, 'unreachable');
    }
    return this.result(shortener, 'unknown');
  }

  private probeUrl(shortener: ShortenerId): string {
    if (shortener === 'isgd') {
      // `forward.php` (look up where a short link points), not the `create.php`
      // the connector actually calls. Creating was defensible while is.gd
      // deduped identical destinations — the same probe returned the same link
      // rather than piling up new ones — but that argument holds only while its
      // database accepts writes. When it stopped (observed 2026-08-14, answering
      // `Error, database insert failed` for every new URL), a create-based probe
      // reported the service unreachable while reads were working fine.
      //
      // A probe should measure whether the host answers this browser, and a read
      // does that without depending on the write path or leaving anything
      // behind. Same host, same API, same CORS treatment.
      return 'https://is.gd/forward.php?format=json&shorturl=is.gd';
    }
    // The credentialed providers all expose a cheap authenticated read, which is
    // a far better probe than a create: it proves reachability *and* the key.
    return PROBE_ENDPOINTS[shortener];
  }

  private result(shortener: ShortenerId, status: ReachabilityStatus): ReachabilityResult {
    return {
      shortener,
      status,
      message: MESSAGES[status](this.proxy.label() ?? 'your CORS proxy'),
      checkedAt: Date.now(),
    };
  }
}

/**
 * A cheap, side-effect-free endpoint per credentialed provider.
 *
 * Reads rather than creates, so pressing Test never leaves anything behind.
 */
const PROBE_ENDPOINTS: Record<Exclude<ShortenerId, 'isgd'>, string> = {
  dub: 'https://api.dub.co/links/count',
  shortio: 'https://api.short.io/api/domains',
  tly: 'https://api.t.ly/api/v1/link/list?limit=1',
  rebrandly: 'https://api.rebrandly.com/v1/account',
  tinyurl: 'https://api.tinyurl.com/user',
};

/** Verdict copy. Each states only what was observed — never a guessed cause. */
const MESSAGES: Record<ReachabilityStatus, (proxy: string) => string> = {
  direct: () => 'Reachable directly from your browser. No CORS proxy needed.',
  proxy: (proxy) =>
    `Not reachable directly, but it works through ${proxy}. Requests to this service will use the proxy.`,
  'needs-proxy': () =>
    'Your browser could not reach this service directly, and no CORS proxy is configured. Most shortener APIs refuse browser requests, so this one likely needs a proxy.',
  'needs-consent': (proxy) =>
    `Your browser could not reach this service directly. It can be retried through ${proxy}, but Mawkingbird will not send the request to that proxy until you consent.`,
  unreachable: (proxy) =>
    `Could not reach this service directly or through ${proxy}. The proxy may be down, or the service may be refusing browser requests entirely.`,
  unknown: () => 'Could not determine whether this service is reachable.',
};
