import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { EXTERNAL_FETCH } from '../providers/external-fetch';
import { Server } from '../server';
import { ApiMetrics } from './api-metrics';
import { BillingTier, MawkingbirdMetrics, mawkingbirdService } from './mawkingbird-metrics';
import { CorsProxySettings } from '../providers/cors-proxy/cors-proxy-settings';
import { DiagnosticLog } from '../diagnostic-log';

/**
 * Times every instance API call and folds it into {@link ApiMetrics} for the
 * Observability page. Foreign-host fetches (RSS feeds etc.) are skipped — they
 * aren't the instance's traffic.
 *
 * Calls bound for Mawkingbird's own services are skipped by that same rule —
 * the CORS proxy is a foreign host — but are not unmeasured: they go to
 * {@link MawkingbirdMetrics} instead, which counts them per service and per
 * billing tier. See that class for why they are kept apart from the instance's
 * endpoint stats.
 *
 * Uses `performance.now()` for a monotonic duration unaffected by clock changes.
 */
export const metricsInterceptor: HttpInterceptorFn = (req, next) => {
  const server = inject(Server);
  const diagnostics = inject(DiagnosticLog);
  const target = requestTarget(req.url);
  const logFailure = (error: unknown): void => {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    diagnostics.writeThrottled(
      'error',
      'Mockingbird HTTP',
      'request:failed',
      `${req.method} ${target} ${status}`,
      { method: req.method, target, status, error },
    );
  };
  if (req.context.get(EXTERNAL_FETCH) && !targetsActiveServer(req.url, server.baseUrl())) {
    const service = mawkingbirdService(req.url);
    if (!service) {
      return next(req).pipe(tap({ error: logFailure }));
    }
    // Which tier pays for this call is decided by the same condition
    // `plusTokenInterceptor` gates on — the *chosen* proxy entry, not the
    // stored id, since an entitled supporter is auto-upgraded from the free
    // entry and gating on the stored id would count their paid calls as free.
    //
    // Deliberately not read from the request's headers. This interceptor is
    // outermost and `plusTokenInterceptor` is last, so the supporter token is
    // attached to a *clone* made downstream of here: at this point in the
    // chain the header is never present, and testing for it would label every
    // proxied call free.
    const tier: BillingTier =
      inject(CorsProxySettings).chosen()?.id === 'mawkingbird-plus' ? 'paid' : 'free';
    const mawkingbird = inject(MawkingbirdMetrics);
    const externalStart = performance.now();
    return next(req).pipe(
      tap({
        next: (event) => {
          if (event instanceof HttpResponse) {
            mawkingbird.record(service, tier, performance.now() - externalStart, true);
          }
        },
        error: (error: unknown) => {
          mawkingbird.record(service, tier, performance.now() - externalStart, false);
          logFailure(error);
        },
      }),
    );
  }
  const metrics = inject(ApiMetrics);
  const start = performance.now();
  return next(req).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse) {
          metrics.record(req.method, req.url, performance.now() - start, event.status, true);
        }
      },
      error: (err) => {
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        const ok = status >= 200 && status < 400;
        metrics.record(req.method, req.url, performance.now() - start, status, ok);
        logFailure(err);
      },
    }),
  );
};

/** Query-free, credential-free request identity for diagnostics and flood suppression. */
function requestTarget(url: string): string {
  try {
    const parsed = new URL(url, location.origin);
    parsed.username = '';
    parsed.password = '';
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split(/[?#]/, 1)[0];
  }
}

function targetsActiveServer(url: string, baseUrl: string): boolean {
  if (url.startsWith('/')) {
    return true;
  }
  if (!baseUrl) {
    return false;
  }
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}
