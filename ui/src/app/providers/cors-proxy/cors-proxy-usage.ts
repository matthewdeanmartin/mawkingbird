import { HttpResponse } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';

/**
 * How much traffic has gone through a CORS proxy, for the Observability page.
 *
 * Separate from {@link ApiMetrics} on purpose. That service is scoped to the
 * *instance's* API and its interceptor deliberately skips foreign hosts, which
 * is the right boundary — proxied feed fetches are not instance traffic and
 * folding them in would make endpoint stats lie. What is worth surfacing is
 * much smaller: how many requests this browser has handed to a third party,
 * and how many of those failed.
 *
 * Counters only, never URLs. Which feeds someone reads is exactly the thing a
 * proxy already learns, and writing it to a second place would only widen the
 * disclosure. `mockingbird_rss_feeds` already holds the subscription list for
 * anyone who legitimately needs it.
 *
 * ## Two counters, deliberately
 *
 * `requests` counts what *this browser* sent. `accountTotal` is what the
 * Mawkingbird proxy reports for the whole subscription, read from the
 * `X-Proxy-Usage` header it attaches to responses for supporters.
 *
 * The account figure is the one that answers "am I getting value out of this",
 * because it survives a cleared browser and counts every device. It arrives on
 * traffic that was happening anyway, so knowing it costs no extra request — see
 * `plus/usage.ts` in `mawkingbird_cors_proxy`. It is absent for free-tier users
 * and for other proxies, which is why it is nullable rather than zero: nobody
 * has told us, and zero would be a claim.
 */

const STORAGE_KEY = 'mockingbird_cors_proxy_usage';

export interface CorsProxyUsage {
  /** Requests sent through a proxy since the counter was last reset. */
  requests: number;
  /** How many of those failed. */
  failures: number;
  /** Epoch ms of the most recent proxied request, or 0 if never. */
  lastAt: number;
  /**
   * The subscription-wide total the Mawkingbird proxy last reported.
   *
   * Null when nothing has reported one — a free-tier caller, a different proxy,
   * or simply no proxied request yet this session. Not zero: zero would assert
   * that the proxy has never been used, which is a different claim from not
   * knowing.
   */
  accountTotal?: number | null;
}

const EMPTY: CorsProxyUsage = { requests: 0, failures: 0, lastAt: 0, accountTotal: null };

@Injectable({ providedIn: 'root' })
export class CorsProxyUsageStore {
  readonly usage = signal<CorsProxyUsage>(read());

  record(ok: boolean, response?: Response | null): void {
    this.recordTotal(ok, readAccountTotal(response));
  }

  /** Record one browser request whose account total arrived inside a batch body. */
  recordBatch(ok: boolean, accountTotal: number | null): void {
    this.recordTotal(ok, accountTotal);
  }

  private recordTotal(ok: boolean, accountTotal: number | null): void {
    const current = this.usage();
    this.write({
      requests: current.requests + 1,
      failures: current.failures + (ok ? 0 : 1),
      lastAt: Date.now(),
      accountTotal: accountTotal ?? current.accountTotal ?? null,
    });
  }

  /**
   * Clear this browser's counters.
   *
   * Keeps `accountTotal`: it is not this browser's to reset. It belongs to the
   * subscription and is held by the proxy, so zeroing it here would invent a
   * number rather than clear one.
   */
  reset(): void {
    this.write({ ...EMPTY, accountTotal: this.usage().accountTotal ?? null });
  }

  private write(next: CorsProxyUsage): void {
    this.usage.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Counters are diagnostics; losing them costs nothing.
    }
  }
}

function read(): CorsProxyUsage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...EMPTY };
    }
    const parsed = JSON.parse(raw) as Partial<CorsProxyUsage>;
    return {
      requests: numberOr(parsed.requests),
      failures: numberOr(parsed.failures),
      lastAt: numberOr(parsed.lastAt),
      accountTotal:
        parsed.accountTotal === null || parsed.accountTotal === undefined
          ? null
          : numberOr(parsed.accountTotal),
    };
  } catch {
    return { ...EMPTY };
  }
}

function numberOr(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * The subscription-wide total from a proxied response, if it carried one.
 *
 * Tolerant by design: a missing header is the normal case for the free tier and
 * for every non-Mawkingbird proxy, and a malformed one is not worth a failure
 * on a response that already succeeded.
 */
function readAccountTotal(response?: Response | null): number | null {
  const raw = response?.headers?.get?.('X-Proxy-Usage');
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Adapt an Angular `HttpResponse` to what {@link CorsProxyUsageStore.record}
 * reads.
 *
 * Only the headers are needed, and `HttpHeaders` is not a `Headers`. Rather
 * than widen the store's signature to two header shapes, callers pass this —
 * so the store keeps one narrow contract and the adapter stays in one place.
 */
export function toResponse(response: HttpResponse<unknown>): Response {
  return {
    headers: { get: (name: string) => response.headers.get(name) },
  } as Response;
}
