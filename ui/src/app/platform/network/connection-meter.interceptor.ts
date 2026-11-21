import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize, tap } from 'rxjs';
import { latencyFamily, normalizeEndpoint } from '../../observability/api-metrics';
import { EXTERNAL_FETCH } from '../http/external-fetch';
import { SERVER_ROLE, whales } from '../http/server-role';
import { ABANDON_MIN_MS, ConnectionSample } from './connection-quality';
import { ConnectionMeter } from './connection-meter';

/**
 * Feeds every request the app makes into {@link ConnectionMeter}. Passive: it
 * never sends, delays or alters anything.
 *
 * Three judgement calls live here rather than in the model:
 *
 * - **Foreign-host failures are ignored; their successes count.** A status 0
 *   from an RSS feed or another site is usually CORS or a dead site, not the
 *   user's network, so it must not make the connection look flaky. An answer
 *   from anywhere, though, proves the network carried it.
 * - **Abandonment needs {@link ABANDON_MIN_MS}.** Callers time out with their
 *   own `timeout(...)`, which reaches this chain only as an unsubscribe. A long
 *   unanswered wait is real evidence; a quick cancel is the user navigating.
 * - **Latency counts only ordinary reads**: GETs of endpoints that are fast by
 *   design (see `latencyFamily`), and only on the home server, whose shape the
 *   endpoint list describes.
 */
export const connectionMeterInterceptor: HttpInterceptorFn = (req, next) => {
  const meter = inject(ConnectionMeter);
  const external = req.context.get(EXTERNAL_FETCH);
  const home = !external && whales(req.context.get(SERVER_ROLE));
  const latency =
    !external &&
    req.method === 'GET' &&
    latencyFamily(`GET ${normalizeEndpoint(req.url)}`) === 'fast';
  const started = performance.now();
  let settled = false;

  const sample = (outcome: ConnectionSample['outcome'], bytes?: number): ConnectionSample => ({
    at: Date.now(),
    ms: performance.now() - started,
    outcome,
    latency,
    home,
    ...(bytes ? { bytes } : {}),
  });

  return next(req).pipe(
    tap({
      next: (event) => {
        if (!(event instanceof HttpResponse)) return;
        settled = true;
        const length = Number(event.headers.get('content-length'));
        meter.record(sample('ok', Number.isFinite(length) && length > 0 ? length : undefined));
      },
      error: (err: unknown) => {
        settled = true;
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        if (status !== 0) {
          meter.record(sample('answered-error'));
        } else if (!external) {
          meter.record(sample('unreachable'));
        }
      },
    }),
    finalize(() => {
      if (settled) return;
      if (performance.now() - started >= ABANDON_MIN_MS) {
        meter.record(sample('abandoned'));
      }
    }),
  );
};
