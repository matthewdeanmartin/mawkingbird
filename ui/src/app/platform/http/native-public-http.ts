import {
  HttpErrorResponse,
  HttpHeaders,
  HttpInterceptorFn,
  HttpParams,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { catchError, defer, from, map, throwError } from 'rxjs';

interface NativeResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

function invokePublic(
  url: string,
  handle?: string,
  favourite?: { server: string; statusId: string; liked: boolean },
): Promise<NativeResponse> {
  const bridge = (
    window as unknown as {
      __TAURI__?: { core: { invoke<T>(command: string, args: object): Promise<T> } };
    }
  ).__TAURI__;
  if (!bridge) return Promise.reject(new Error('Native HTTP bridge is unavailable.'));
  if (favourite)
    return bridge.core.invoke<NativeResponse>('mastodon_favourite', { handle, ...favourite });
  return handle
    ? bridge.core.invoke<NativeResponse>('mastodon_account_get', { url, handle })
    : bridge.core.invoke<NativeResponse>('public_mastodon_get', { url });
}

/** The instance probe uses fetch directly, outside Angular's interceptor chain. */
export async function nativePublicFetch(url: string, signal: AbortSignal): Promise<Response> {
  signal.throwIfAborted();
  const result = await invokePublic(url);
  signal.throwIfAborted();
  return new Response(result.body, { status: result.status, headers: result.headers });
}

interface NativeWrite {
  url: string;
  method: string;
  body?: object;
  form?: [string, string][];
  idempotencyKey?: string;
  picture?: FormData;
}

/**
 * A write as Rust takes it, or why it can't be sent. Which writes are permitted
 * is decided once, by the table in the host's `mastodon_write.rs`.
 */
function nativeWrite(request: HttpRequest<unknown>, destination: URL): NativeWrite | string {
  const write: NativeWrite = { url: destination.href, method: request.method };
  const key = request.headers.get('Idempotency-Key');
  if (key) write.idempotencyKey = key;
  const body = request.body;
  if (body == null) return write;
  if (body instanceof FormData) {
    const file = body.get('file');
    if (
      file instanceof File &&
      request.method === 'POST' &&
      destination.pathname === '/api/v2/media'
    ) {
      return { ...write, picture: body };
    }
    const form: [string, string][] = [];
    for (const [name, value] of body.entries()) {
      if (typeof value !== 'string')
        return 'Uploading files is not supported by Mawkingbird Native yet.';
      form.push([name, value]);
    }
    return { ...write, form };
  }
  if (body instanceof HttpParams)
    return {
      ...write,
      form: body
        .keys()
        .flatMap((name) => (body.getAll(name) ?? []).map((v) => [name, v] as [string, string])),
    };
  if (typeof body !== 'object' || Array.isArray(body) || body instanceof Blob)
    return 'This action is not supported by Mawkingbird Native yet.';
  return { ...write, body };
}

async function invokeWrite(handle: string, input: NativeWrite): Promise<NativeResponse> {
  const bridge = (
    window as unknown as {
      __TAURI__?: { core: { invoke<T>(command: string, args: object): Promise<T> } };
    }
  ).__TAURI__;
  if (!bridge) return Promise.reject(new Error('Native HTTP bridge is unavailable.'));
  if (input.picture) {
    const { uploadPicture } = await import('./native-picture-upload');
    return uploadPicture(handle, input.url, input.picture);
  }
  return bridge.core.invoke<NativeResponse>('mastodon_account_write', { handle, input });
}

/** Native reads and explicitly supported account actions; no generic write tunnel. */
export const nativePublicInterceptor: HttpInterceptorFn = (request, next) => {
  let destination: URL;
  try {
    destination = new URL(request.urlWithParams, location.href);
  } catch {
    return next(request);
  }
  if (destination.origin === location.origin || !destination.pathname.startsWith('/api/')) {
    return next(request);
  }
  const authorization = request.headers.get('Authorization');
  const handle = authorization?.startsWith('Bearer native-mastodon:')
    ? authorization.slice('Bearer '.length)
    : undefined;
  const match = /^\/api\/v1\/statuses\/([0-9]{1,40})\/(favourite|unfavourite)$/.exec(
    destination.pathname,
  );
  const emptyBody =
    request.body == null ||
    (typeof request.body === 'object' &&
      !Array.isArray(request.body) &&
      Object.keys(request.body).length === 0);
  const favourite =
    request.method === 'POST' &&
    destination.protocol === 'https:' &&
    !destination.username &&
    !destination.password &&
    !destination.port &&
    handle &&
    match &&
    !destination.search &&
    !destination.hash &&
    emptyBody
      ? { server: destination.origin, statusId: match[1], liked: match[2] === 'favourite' }
      : undefined;
  const write =
    request.method !== 'GET' &&
    !favourite &&
    handle &&
    destination.protocol === 'https:' &&
    !destination.username &&
    !destination.password &&
    !destination.port &&
    !destination.hash
      ? nativeWrite(request, destination)
      : undefined;
  if (
    (request.method !== 'GET' && !favourite && (!write || typeof write === 'string')) ||
    (authorization && !handle)
  ) {
    const bridge = (
      window as unknown as {
        __TAURI__?: { core: { invoke(command: string, args: object): Promise<unknown> } };
      }
    ).__TAURI__;
    void bridge?.core
      .invoke('report_native_event', { event: 'transport_denied' })
      .catch(() => undefined);
    return throwError(
      () =>
        new HttpErrorResponse({
          status: 403,
          url: request.url,
          error: {
            error:
              typeof write === 'string'
                ? write
                : handle
                  ? 'This action is not supported by Mawkingbird Native yet. See Help > Open logs.'
                  : 'Sign in again in the native app to do this.',
          },
        }),
    );
  }
  return defer(() =>
    from(
      handle && write && typeof write !== 'string'
        ? invokeWrite(handle, write)
        : invokePublic(request.urlWithParams, handle, favourite),
    ),
  ).pipe(
    map((result) => {
      let body: unknown;
      try {
        body = request.responseType === 'text' ? result.body : JSON.parse(result.body);
      } catch {
        throw new HttpErrorResponse({
          status: 502,
          url: request.url,
          error: 'Invalid JSON from server',
        });
      }
      if (result.status < 200 || result.status >= 300) {
        throw new HttpErrorResponse({
          status: result.status,
          url: request.url,
          headers: new HttpHeaders(result.headers),
          error: body,
        });
      }
      return new HttpResponse({
        status: result.status,
        url: request.url,
        headers: new HttpHeaders(result.headers),
        body,
      });
    }),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) return throwError(() => error);
      const failure = error as { kind?: string; message?: string };
      return throwError(
        () =>
          new HttpErrorResponse({
            url: request.url,
            status:
              failure?.kind === 'network'
                ? 0
                : failure?.kind === 'busy'
                  ? 429
                  : failure?.kind === 'policy' || failure?.kind === 'reauthorize'
                    ? 403
                    : 502,
            error: {
              error: failure?.message ?? 'Native request failed.',
              ...(failure?.kind === 'reauthorize'
                ? { code: 'native_reauthorization_required' }
                : {}),
            },
          }),
      );
    }),
  );
};
