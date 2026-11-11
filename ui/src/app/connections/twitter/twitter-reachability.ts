import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, switchMap } from 'rxjs';
import { CorsProxy } from '../cors-proxy/cors-proxy';
import { TwitterApiError } from './twitter-errors';
import { TwitterSettings } from './twitter-settings';
import { TwitterProxyRequired, TwitterTransport } from './twitter-transport';

/**
 * "Can I reach this Twitter data service, and how?"
 *
 * ## Why this exists rather than a claim in the copy
 *
 * The app *knows* these services refuse browsers — it was measured. It could
 * simply say so. But a user being asked to send an API key to a third-party
 * proxy deserves to see the reason with their own eyes rather than take the
 * app's word for it, and the requirement driving this feature was explicit: the
 * user must affirmatively see that the service does not work without a proxy
 * before agreeing to use one.
 *
 * So Test does the honest thing in order:
 *
 * 1. Try direct. Expect failure; record the verdict either way.
 * 2. If a consented proxy exists, try that too, so the result is actionable
 *    ("it works this way") rather than only negative.
 *
 * If a provider ever fixes its preflight, step 1 notices and the app stops
 * asking for proxy consent it no longer needs.
 *
 * ## What a browser can and cannot tell you
 *
 * A failed cross-origin request reports `status: 0` and nothing else —
 * deliberately, since the detail is itself cross-origin information. CORS
 * refusal, DNS failure, being offline and an extension cancelling the request
 * are indistinguishable. These verdicts therefore report only what is
 * observable, and never guess a cause.
 *
 * ## Cost
 *
 * Up to two billable requests: one direct (which usually dies at the preflight,
 * before reaching the service — and so usually costs nothing at all) and one
 * proxied. The connector page states this before the button is pressed.
 */

/** A cheap, side-effect-free read that proves both reachability and the key. */
const PROBE = {
  path: '/twitter/user/info',
  // A stable, famous, long-lived public account. Deliberately not a celebrity
  // whose handle might change (spec §18.3): user id 12 is Twitter's own founder
  // account and one of the oldest on the platform.
  params: { userName: 'jack' },
};

export type TwitterReachabilityStatus =
  /** Direct browser request succeeded — no proxy needed. Unexpected but honoured. */
  | 'direct'
  /** Direct failed, the consented proxy worked. The normal success case. */
  | 'proxy'
  /** Direct failed and no proxy is configured. */
  | 'needs-proxy'
  /** Direct failed, a proxy exists, but this pairing needs consent first. */
  | 'needs-consent'
  /** Direct failed and the proxy failed too. */
  | 'unreachable'
  /** The service answered, and rejected the key. */
  | 'bad-key'
  /** The service answered, and the account is out of credits. */
  | 'no-credits'
  /** Nothing could be concluded. */
  | 'unknown';

export interface TwitterReachabilityResult {
  status: TwitterReachabilityStatus;
  /** One sentence for the connector page. Written for a human, safe to render. */
  message: string;
  /** When the probe ran, so the page can say how fresh the answer is. */
  checkedAt: number;
}

@Injectable({ providedIn: 'root' })
export class TwitterReachability {
  private transport = inject(TwitterTransport);
  private settings = inject(TwitterSettings);
  private proxy = inject(CorsProxy);

  /**
   * Probe the active source: direct first, then the proxy.
   *
   * Routed through {@link TwitterTransport} rather than a bespoke fetch so it
   * exercises the exact path a real request takes, headers included. A probe
   * that took a different route could pass while the feature fails — which is
   * how the `Accept`-header preflight bug survived as long as it did.
   */
  probe(): Observable<TwitterReachabilityResult> {
    const active = this.settings.activeId();
    if (!active) {
      return of(this.result('unknown'));
    }

    return this.transport.probeDirect(PROBE).pipe(
      switchMap((reachedDirectly) => {
        this.settings.recordDirectReachability(active, reachedDirectly ? 'reachable' : 'blocked');
        if (reachedDirectly) {
          return of(this.result('direct'));
        }
        return this.probeProxy();
      }),
      catchError((error: unknown) => of(this.failure(error))),
    );
  }

  /** The proxied leg, run after direct has been shown to fail. */
  private probeProxy(): Observable<TwitterReachabilityResult> {
    return this.transport.request<unknown>(PROBE).pipe(
      map(() => this.result('proxy')),
      catchError((error: unknown) => of(this.failure(error))),
    );
  }

  private failure(error: unknown): TwitterReachabilityResult {
    if (error instanceof TwitterProxyRequired) {
      return this.result(error.noProxyConfigured ? 'needs-proxy' : 'needs-consent');
    }
    if (error instanceof TwitterApiError) {
      switch (error.code) {
        case 'INVALID_API_KEY':
          return this.result('bad-key');
        case 'INSUFFICIENT_CREDITS':
          return this.result('no-credits');
        case 'CORS_UNAVAILABLE':
        case 'NETWORK_ERROR':
        case 'PROVIDER_UNAVAILABLE':
          return this.result('unreachable');
        default:
          // A real answer from the service — even a rejection — means the
          // request arrived. That is reachability, whatever else went wrong.
          return this.result(error.httpStatus && error.httpStatus > 0 ? 'proxy' : 'unknown');
      }
    }
    return this.result('unknown');
  }

  private result(status: TwitterReachabilityStatus): TwitterReachabilityResult {
    return {
      status,
      message: MESSAGES[status](this.proxy.label() ?? 'your CORS proxy'),
      checkedAt: Date.now(),
    };
  }
}

/** Verdict copy. Each states only what was observed — never a guessed cause. */
const MESSAGES: Record<TwitterReachabilityStatus, (proxy: string) => string> = {
  direct: () =>
    'Reachable directly from your browser — no CORS proxy needed. That is unexpected for this service; it may have changed its CORS policy.',
  proxy: (proxy) =>
    `Confirmed: your browser cannot reach this service directly, but it works through ${proxy}. Requests will use the proxy.`,
  'needs-proxy': () =>
    'Confirmed: your browser cannot reach this service directly. It does not answer browsers, so Mawkingbird needs a CORS proxy to read Twitter data at all. Set one up under Settings → Connections → CORS proxy.',
  'needs-consent': (proxy) =>
    `Confirmed: your browser cannot reach this service directly. It can be reached through ${proxy}, but Mawkingbird will not send your API key to that proxy until you say so.`,
  unreachable: (proxy) =>
    `Could not reach this service directly or through ${proxy}. The proxy may be down, rate-limiting you, or dropping the API key header — not every proxy forwards custom headers.`,
  'bad-key': () =>
    'The service answered, and rejected the API key. Check the key, or whether your CORS proxy forwards custom headers — a proxy that strips them looks exactly like a bad key.',
  'no-credits': () => 'The service answered: your account is out of credits.',
  unknown: () => 'Could not determine whether this service is reachable.',
};
