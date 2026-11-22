import {
  HttpErrorResponse,
  HttpEvent,
  HttpHeaders,
  HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, from, mergeMap, tap, throwError } from 'rxjs';
import { EXTERNAL_FETCH } from '../http/external-fetch';
import { SERVER_ROLE, whales } from '../http/server-role';
import { ConnectionMeter } from '../network/connection-meter';
import { accountScopeSuffix } from '../session/account-scope';
import { CachedRead, ReadCache, isCacheableRead } from './read-cache';

/** Set on a response rebuilt from the read cache; the value is when it was saved (epoch ms). */
export const SAVED_COPY_HEADER = 'X-Mawkingbird-Saved-At';

/**
 * Saves the reads in `isCacheableRead` as they arrive, and answers them from
 * the saved copy when there is no connection:
 *
 * - **Offline** (the meter or the browser says so): the saved copy at once,
 *   without first waiting for a request that cannot succeed. No copy: the
 *   request goes out and fails as usual.
 * - **Online**: the network, always. Only when that ends with no answer at all
 *   (status 0, including the read policy's timeouts, after its retries) is the
 *   saved copy used. A 4xx/5xx is a real answer and is passed on.
 *
 * Callers see an ordinary response, so feeds, threads and profiles need no
 * changes; {@link ReadCache.servedSavedAt} tells the offline banner to say the
 * page is a saved copy. Sits inside `metricsInterceptor` and outside the read
 * policy, so a saved copy is served only after the retries have given up.
 */
export const readCacheInterceptor: HttpInterceptorFn = (req, next) => {
  if (
    req.method !== 'GET' ||
    req.responseType !== 'json' ||
    req.context.get(EXTERNAL_FETCH) ||
    !whales(req.context.get(SERVER_ROLE)) ||
    !isCacheableRead(req.urlWithParams)
  ) {
    return next(req);
  }
  const cache = inject(ReadCache);
  const meter = inject(ConnectionMeter);
  const scope = accountScopeSuffix();
  if (!scope) return next(req);
  const url = req.urlWithParams;

  const live = (): Observable<HttpEvent<unknown>> =>
    next(req).pipe(
      tap((event) => {
        if (event instanceof HttpResponse && event.ok) {
          cache.noteLive();
          void cache.save(scope, url, event.body, event.headers.get('Link'));
        }
      }),
    );

  const offline = meter.verdict() === 'offline' || !meter.hints().online;
  if (offline) {
    return from(cache.get(scope, url)).pipe(
      mergeMap((saved) => (saved ? [rebuild(saved, url, cache)] : live())),
    );
  }

  return live().pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 0) {
        return throwError(() => error);
      }
      return from(cache.get(scope, url)).pipe(
        mergeMap((saved) => (saved ? [rebuild(saved, url, cache)] : throwError(() => error))),
      );
    }),
  );
};

function rebuild(saved: CachedRead, url: string, cache: ReadCache): HttpResponse<unknown> {
  cache.noteServed(saved.savedAt);
  let headers = new HttpHeaders({ [SAVED_COPY_HEADER]: String(saved.savedAt) });
  if (saved.link) headers = headers.set('Link', saved.link);
  return new HttpResponse({
    body: JSON.parse(saved.body) as unknown,
    headers,
    status: 200,
    statusText: 'OK (saved copy)',
    url,
  });
}
