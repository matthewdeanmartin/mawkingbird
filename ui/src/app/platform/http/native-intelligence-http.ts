import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpParams,
  HttpResponse,
} from '@angular/common/http';
import { defer, map, catchError, throwError } from 'rxjs';
import { invokeSocial } from './native-invoke';

/** Translation requests retain the shared chunking, quota and language-pair logic. */
export const nativeIntelligenceInterceptor: HttpInterceptorFn = (request, next) => {
  const url = new URL(request.urlWithParams, location.href);
  if (!['api.mymemory.translated.net', 'apertium.org'].includes(url.hostname)) return next(request);
  return defer(() =>
    invokeSocial<{ status: number; body: string; headers: Record<string, string> }>(
      'intelligence_public_request',
      {
        url: request.urlWithParams,
        method: request.method,
        body: request.body instanceof HttpParams ? request.body.toString() : (request.body ?? null),
      },
    ),
  ).pipe(
    map((result) => {
      if (result.status < 200 || result.status >= 300)
        throw new HttpErrorResponse({
          status: result.status,
          error: result.body,
          url: request.urlWithParams,
        });
      return new HttpResponse({
        status: result.status,
        body: JSON.parse(result.body) as unknown,
        headers: undefined,
        url: request.urlWithParams,
      });
    }),
    catchError((error) =>
      throwError(() =>
        error instanceof HttpErrorResponse
          ? error
          : new HttpErrorResponse({ status: 0, error, url: request.urlWithParams }),
      ),
    ),
  );
};
