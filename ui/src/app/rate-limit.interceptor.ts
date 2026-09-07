import {
  HttpErrorResponse,
  HttpHeaders,
  HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, defer, Observable, switchMap, tap, throwError, timer } from 'rxjs';
import { EXTERNAL_FETCH } from './providers/external-fetch';

const MAX_WAIT_MS = 5 * 60_000;
const SAFE_RETRY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Coordinates server-provided rate-limit cooldowns per API origin. */
@Injectable({ providedIn: 'root' })
export class RateLimitCoordinator {
  private blockedUntil = new Map<string, number>();

  wait(origin: string): Observable<unknown> {
    const delay = Math.max(0, (this.blockedUntil.get(origin) ?? 0) - Date.now());
    return delay > 0 ? timer(delay) : defer(() => [undefined]);
  }

  observe(origin: string, headers: HttpHeaders, status?: number): number {
    const remaining = Number(headers.get('X-RateLimit-Remaining'));
    const waitMs = this.waitFromHeaders(headers);
    if (status === 429 || (Number.isFinite(remaining) && remaining <= 0)) {
      const until = Date.now() + waitMs;
      if (waitMs > 0) {
        this.blockedUntil.set(origin, Math.max(this.blockedUntil.get(origin) ?? 0, until));
      }
    }
    return waitMs;
  }

  /**
   * How long the server says to wait, without recording anything.
   *
   * {@link observe} is the interceptor's path and has the side effect of arming
   * the cooldown; a caller that only wants to *report* the wait (a long-running
   * bulk job showing a countdown) must not arm it a second time.
   */
  retryDelayMs(headers: HttpHeaders): number {
    return this.waitFromHeaders(headers);
  }

  private waitFromHeaders(headers: HttpHeaders): number {
    const retryAfter = headers.get('Retry-After');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds)) {
        return Math.min(Math.max(0, seconds * 1000), MAX_WAIT_MS);
      }
      const date = Date.parse(retryAfter);
      if (Number.isFinite(date)) {
        return Math.min(Math.max(0, date - Date.now()), MAX_WAIT_MS);
      }
    }

    const reset = headers.get('X-RateLimit-Reset');
    if (!reset) {
      return 0;
    }
    const numeric = Number(reset);
    const resetAt = Number.isFinite(numeric)
      ? numeric > 1_000_000_000_000
        ? numeric
        : numeric * 1000
      : Date.parse(reset);
    return Number.isFinite(resetAt) ? Math.min(Math.max(0, resetAt - Date.now()), MAX_WAIT_MS) : 0;
  }
}

/**
 * Delays calls while the server says the current window is exhausted. A 429 is
 * retried once only for safe methods; mutations surface the error but establish
 * the cooldown for subsequent requests.
 */
export const rateLimitInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(EXTERNAL_FETCH)) {
    return next(req);
  }
  const coordinator = inject(RateLimitCoordinator);
  const origin = new URL(req.url, location.origin).origin;

  const send = () =>
    next(req).pipe(
      tap((event) => {
        if (event instanceof HttpResponse) {
          coordinator.observe(origin, event.headers, event.status);
        }
      }),
    );

  return coordinator.wait(origin).pipe(
    switchMap(send),
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }
      const waitMs = coordinator.observe(origin, error.headers, error.status);
      if (error.status !== 429 || waitMs <= 0 || !SAFE_RETRY_METHODS.has(req.method)) {
        return throwError(() => error);
      }
      return timer(waitMs).pipe(switchMap(send));
    }),
  );
};
