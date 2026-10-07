import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { catchError, tap, throwError } from 'rxjs';
import { CorsProxySettings } from './cors-proxy-settings';
import { ProxyActivity } from './proxy-activity';
import { corsProxyOrigin } from '../../build-flavor';
import { SupporterStatus } from '../account/supporter-status';
import { proxyErrorBody, proxyLimitDetails, QUIET_PROXY_LIMIT } from './proxy-limit-details';

export const proxyLimitInterceptor: HttpInterceptorFn = (request, next) => {
  const settings = inject(CorsProxySettings);
  const activity = inject(ProxyActivity);
  const supporter = inject(SupporterStatus);
  const url = new URL(request.url, location.href);
  const config = settings.resolve();
  if (url.pathname.startsWith('/plus/') || !config || url.origin !== new URL(config.pattern).origin)
    return next(request);
  const own = url.origin === corsProxyOrigin();
  const route = url.searchParams.get('route') ?? undefined;
  try {
    activity.assertAllowed(route, own, !request.context.get(QUIET_PROXY_LIMIT));
  } catch (error) {
    return throwError(() => error);
  }
  return next(request).pipe(
    tap((event) => {
      if (!own || !(event instanceof HttpResponse)) return;
      const results = proxyErrorBody(event.body)['results'];
      if (Array.isArray(results)) {
        for (const value of results) {
          const item = proxyErrorBody(value);
          if (
            (item['status'] === 429 ||
              (item['status'] === 403 &&
                proxyErrorBody(item['body'])['code'] === 'free_destination_denied')) &&
            item['source'] === 'proxy'
          ) {
            activity.exhausted(
              typeof item['retryAfter'] === 'string' ? item['retryAfter'] : null,
              !supporter.isSupporter(),
              proxyLimitDetails(item['body'], route),
              !request.context.get(QUIET_PROXY_LIMIT),
            );
          }
        }
      }
    }),
    catchError((error: unknown) => {
      if (
        own &&
        error instanceof HttpErrorResponse &&
        (error.status === 429 ||
          (error.status === 403 &&
            proxyErrorBody(error.error)['code'] === 'free_destination_denied')) &&
        (error.headers.get('X-Proxy-Source') ?? proxyErrorBody(error.error)['source']) === 'proxy'
      ) {
        activity.exhausted(
          error.headers.get('Retry-After'),
          !supporter.isSupporter(),
          proxyLimitDetails(error.error, route),
          !request.context.get(QUIET_PROXY_LIMIT),
        );
      }
      return throwError(() => error);
    }),
  );
};
