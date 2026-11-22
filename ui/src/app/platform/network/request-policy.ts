import {
  HttpContext,
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { retry, throwError, timeout, timer } from 'rxjs';
import { ConnectionVerdict } from './connection-quality';
import { ConnectionMeter } from './connection-meter';

/**
 * One timeout-and-retry policy for reads, replacing per-call `timeout(...)`
 * guesses one feature at a time (spec/low-bandwidth-offline.md, Sprint 2).
 *
 * Opt-in through {@link readPolicy} on the request's context, not applied to
 * every GET: a retry is a behaviour change, and each call site that adopts it
 * must be one where a second identical read is harmless and worth waiting for.
 *
 * Only GET and HEAD are ever retried. A POST that timed out may have been
 * applied; repeating it is the outbox's job (with an idempotency key), never
 * this interceptor's.
 */
export interface RequestPolicy {
  /** Longest wait between events of one attempt before it is abandoned. */
  attemptTimeoutMs: number;
  /** Extra attempts after the first. */
  retries: number;
  /** Base delay before retry n (the last entry repeats); jittered ±30%. */
  backoffMs: readonly number[];
}

/** Timelines, notifications, a post and its thread: the reads a reader waits on. */
export const READ_POLICY: RequestPolicy = {
  attemptTimeoutMs: 20_000,
  retries: 2,
  backoffMs: [1_000, 3_000],
};

/** A slow-but-working connection gets this much longer per attempt. */
export const SLOW_TIMEOUT_FACTOR = 2;
/** `Retry-After` is honoured up to this long; beyond it, failing is kinder. */
export const MAX_RETRY_AFTER_MS = 30_000;

export const REQUEST_POLICY = new HttpContextToken<RequestPolicy | null>(() => null);

/** Mark a request as a reader-facing read. Extends an existing context when given. */
export function readPolicy(context: HttpContext = new HttpContext()): HttpContext {
  return context.set(REQUEST_POLICY, READ_POLICY);
}

/** Statuses worth repeating a read for: no answer, timeouts, throttling, gateway trouble. */
export function retryable(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || (status >= 502 && status <= 504);
}

export function attemptTimeout(policy: RequestPolicy, verdict: ConnectionVerdict): number {
  return verdict === 'slow' || verdict === 'flaky'
    ? policy.attemptTimeoutMs * SLOW_TIMEOUT_FACTOR
    : policy.attemptTimeoutMs;
}

/**
 * Delay before retry `attempt` (1-based). `Retry-After` wins when the server
 * sent one we can read (seconds or an HTTP date), else jittered backoff, so a
 * crowd of tabs recovering from the same outage does not retry in lockstep.
 * Returns null when the server asked for a wait longer than we will hold a reader.
 */
export function retryDelay(
  attempt: number,
  policy: RequestPolicy,
  error: unknown,
  now = Date.now(),
  random = Math.random,
): number | null {
  const header =
    error instanceof HttpErrorResponse ? (error.headers?.get('Retry-After') ?? null) : null;
  if (header !== null) {
    const seconds = Number(header);
    const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
    if (Number.isFinite(ms)) {
      return ms > MAX_RETRY_AFTER_MS ? null : Math.max(0, ms);
    }
  }
  const base = policy.backoffMs[Math.min(attempt - 1, policy.backoffMs.length - 1)] ?? 1_000;
  return Math.round(base * (0.7 + 0.6 * random()));
}

/**
 * Applies {@link REQUEST_POLICY}. Sits outside the transport-facing
 * interceptors so every attempt is rewritten, authenticated, measured and
 * health-checked on its own; inside `metricsInterceptor`, so the
 * Observability page counts one call with its total time.
 *
 * A timed-out attempt surfaces as status 0, the same as any request that
 * never got an answer, so callers keep one error path.
 */
export const requestPolicyInterceptor: HttpInterceptorFn = (req, next) => {
  const policy = req.context.get(REQUEST_POLICY);
  if (!policy || (req.method !== 'GET' && req.method !== 'HEAD')) {
    return next(req);
  }
  const meter = inject(ConnectionMeter);
  return next(req).pipe(
    timeout({
      // `each`: the Sent event arrives at once, so `first` would never fire.
      each: attemptTimeout(policy, meter.verdict()),
      with: () =>
        throwError(
          () =>
            new HttpErrorResponse({
              status: 0,
              statusText: 'Timeout',
              url: req.urlWithParams,
              error: new Error('The request took too long and was abandoned.'),
            }),
        ),
    }),
    retry({
      count: policy.retries,
      delay: (error: unknown, attempt: number) => {
        const status = error instanceof HttpErrorResponse ? error.status : -1;
        // Offline: retrying only burns battery. The meter's probe notices
        // the connection coming back, and the reader can reload then.
        if (!retryable(status) || meter.verdict() === 'offline') {
          return throwError(() => error);
        }
        const ms = retryDelay(attempt, policy, error);
        return ms === null ? throwError(() => error) : timer(ms);
      },
    }),
  );
};
