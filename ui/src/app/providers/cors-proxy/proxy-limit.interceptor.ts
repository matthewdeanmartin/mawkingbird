import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { catchError, tap, throwError } from 'rxjs';
import { CorsProxySettings } from './cors-proxy-settings';
import { ProxyActivity } from './proxy-activity';
import { corsProxyOrigin } from '../../build-flavor';
import { SupporterStatus } from '../account/supporter-status';

export const proxyLimitInterceptor: HttpInterceptorFn = (request, next) => {
  const settings = inject(CorsProxySettings);
  const activity = inject(ProxyActivity);
  const supporter = inject(SupporterStatus);
  const url = new URL(request.url, location.href);
  const config = settings.resolve();
  if (url.pathname.startsWith('/plus/') || !config || url.origin !== new URL(config.pattern).origin)
    return next(request);
  try {
    activity.assertAllowed();
  } catch (error) {
    return throwError(() => error);
  }
  const own = url.origin === corsProxyOrigin();
  return next(request).pipe(
    tap((event) => {
      if (!own || !(event instanceof HttpResponse)) return;
      const results = (event.body as { results?: { status: number; source?: string }[] } | null)
        ?.results;
      if (
        Array.isArray(results) &&
        results.some((item) => item.status === 429 && item.source === 'proxy')
      ) {
        activity.exhausted('60', !supporter.isSupporter());
      }
    }),
    catchError((error: unknown) => {
      if (
        own &&
        error instanceof HttpErrorResponse &&
        error.status === 429 &&
        error.headers.get('X-Proxy-Source') === 'proxy'
      ) {
        activity.exhausted(error.headers.get('Retry-After'), !supporter.isSupporter());
      }
      return throwError(() => error);
    }),
  );
};
