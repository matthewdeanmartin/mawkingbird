import { HttpEvent, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize, Observable, shareReplay } from 'rxjs';
import { Auth } from './auth';
import { EXTERNAL_FETCH } from './providers/external-fetch';

/** Identical, concurrent API GETs share one backend request. Completed responses are not cached. */
const inFlight = new Map<string, Observable<HttpEvent<unknown>>>();

export const dedupeInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET' || req.context.get(EXTERNAL_FETCH)) {
    return next(req);
  }

  // Include the active account and representation in the key. The interceptor runs
  // before authInterceptor, so the token is not present on req.headers yet.
  const token = inject(Auth).token() ?? '';
  const key = [req.urlWithParams, token, req.responseType, req.headers.get('Accept') ?? ''].join(
    '|',
  );
  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }

  const shared = next(req).pipe(
    finalize(() => inFlight.delete(key)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  inFlight.set(key, shared);
  return shared;
};
