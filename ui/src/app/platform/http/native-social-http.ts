import {
  HttpErrorResponse,
  HttpHeaders,
  HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { catchError, defer, map, throwError } from 'rxjs';

export function invokeSocial<T>(command: string, args: object): Promise<T> {
  const bridge = (
    window as unknown as {
      __TAURI__?: { core: { invoke<T>(command: string, args: object): Promise<T> } };
    }
  ).__TAURI__;
  if (!bridge) return Promise.reject(new Error('Native social transport is unavailable.'));
  return bridge.core.invoke<T>(command, args);
}

interface Result {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export const nativeSocialInterceptor: HttpInterceptorFn = (request, next) => {
  const url = new URL(request.urlWithParams, location.href);
  if (url.origin === location.origin) return next(request);
  const nodeinfo =
    request.method === 'GET' &&
    (url.pathname === '/.well-known/nodeinfo' || url.pathname.startsWith('/nodeinfo/'));
  const bluesky = url.pathname.startsWith('/xrpc/');
  const misskey =
    request.method === 'POST' &&
    url.pathname.startsWith('/api/') &&
    !/^\/api\/v[0-9]+\//.test(url.pathname);
  if (!nodeinfo && !bluesky && !misskey) return next(request);
  return defer(async () => {
    if (
      request.headers.has('Authorization') ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    ) {
      throw new Error('Native social transport rejects raw credentials and unsafe URLs.');
    }
    if (nodeinfo) return invokeSocial<Result>('misskey_nodeinfo', { url: url.href });
    if (bluesky)
      return invokeSocial<Result>('bluesky_request', {
        url: url.href,
        method: request.method,
        body: request.body,
        handle: null,
        labelers: [],
      });
    if (
      url.search ||
      !request.body ||
      typeof request.body !== 'object' ||
      Array.isArray(request.body)
    )
      throw new Error('Invalid native Misskey request.');
    const { i, ...body } = request.body as Record<string, unknown>;
    if (i != null && (typeof i !== 'string' || !i.startsWith('native-misskey:')))
      throw new Error('Sign in again in the native app.');
    return invokeSocial<Result>('misskey_request', {
      server: url.origin,
      endpoint: url.pathname.slice('/api/'.length),
      body,
      handle: i ?? null,
    });
  }).pipe(
    map((result) => {
      const body: unknown =
        result.status === 204
          ? null
          : request.responseType === 'text'
            ? result.body
            : JSON.parse(result.body);
      if (result.status < 200 || result.status >= 300)
        throw new HttpErrorResponse({
          status: result.status,
          error: body,
          url: request.url,
          headers: new HttpHeaders(result.headers),
        });
      return new HttpResponse({
        status: result.status,
        body,
        headers: new HttpHeaders(result.headers),
        url: request.url,
      });
    }),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) return throwError(() => error);
      const failure = error as { kind?: string; message?: string };
      return throwError(
        () =>
          new HttpErrorResponse({
            status: failure.kind === 'network' ? 0 : failure.kind === 'busy' ? 429 : 403,
            error: {
              error: {
                message: failure.message ?? 'Native social request failed. See Help > Open logs.',
              },
            },
            url: request.url,
          }),
      );
    }),
  );
};
