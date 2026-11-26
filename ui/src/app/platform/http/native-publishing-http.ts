import {
  HttpErrorResponse,
  HttpHeaders,
  HttpInterceptorFn,
  HttpParams,
  HttpResponse,
} from '@angular/common/http';
import { catchError, defer, map, throwError } from 'rxjs';
import { invokeSocial } from './native-invoke';

interface Result {
  status: number;
  body: string;
  headers: Record<string, string>;
}

/** Only the existing adapters' scoped operations cross IPC; never an arbitrary relay. */
export const nativePublishingInterceptor: HttpInterceptorFn = (request, next) => {
  const url = new URL(request.urlWithParams, location.href);
  if (!['tinyurl.com', 'is.gd', 'rentry.co', 'api.github.com'].includes(url.hostname))
    return next(request);
  if (
    url.hostname === 'api.github.com' &&
    url.pathname !== '/user' &&
    !url.pathname.startsWith('/gists')
  )
    return next(request);
  return defer(async () => {
    const refuse = () => {
      throw new Error('This publishing operation is not supported.');
    };
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      (url.hostname !== 'api.github.com' && request.headers.has('Authorization'))
    )
      refuse();
    if (url.hostname === 'api.github.com') {
      const handle = request.headers.get('Authorization')?.replace(/^Bearer /, '');
      if (!handle || !/^native-connector:[A-Za-z0-9_-]{43}$/.test(handle)) return refuse();
      return invokeSocial<Result>('connector_request', {
        provider: 'gist',
        handle,
        url: url.href,
        method: request.method,
        body: request.body,
        workspace: null,
      });
    }
    if (url.hostname !== 'rentry.co') {
      const tiny = url.hostname === 'tinyurl.com';
      const allowed = tiny ? ['url'] : ['url', 'format', 'shorturl'];
      if (
        request.method !== 'GET' ||
        url.pathname !== (tiny ? '/api-create.php' : '/create.php') ||
        [...url.searchParams.keys()].some(
          (k) => !allowed.includes(k) || url.searchParams.getAll(k).length !== 1,
        ) ||
        (!tiny && url.searchParams.get('format') !== 'json')
      )
        refuse();
      return invokeSocial<Result>('shorten_link', {
        provider: tiny ? 'tinyurl' : 'isgd',
        destination: url.searchParams.get('url') ?? '',
        slug: url.searchParams.get('shorturl'),
      });
    }
    const match = /^\/api\/(new|edit|delete|raw)(?:\/([a-zA-Z0-9_-]{1,100}))?$/.exec(url.pathname);
    if (!match || url.search) return refuse();
    const action = match[1];
    const slug = match[2] ?? null;
    if (action === 'raw') {
      if (request.method !== 'GET' || !slug) return refuse();
      return invokeSocial<Result>('rentry_request', { action, slug, handle: null, text: null });
    }
    if (request.method !== 'POST' || !(request.body instanceof HttpParams)) return refuse();
    const form = request.body;
    const allowed =
      action === 'new'
        ? ['url', 'edit_code', 'text']
        : action === 'edit'
          ? ['edit_code', 'text']
          : ['edit_code'];
    if (form.keys().some((k) => !allowed.includes(k) || form.getAll(k)?.length !== 1))
      return refuse();
    const handle = form.get('edit_code');
    if (
      action === 'new'
        ? slug || handle || form.get('url')
        : !slug || handle !== `native-rentry:${slug}`
    )
      return refuse();
    return invokeSocial<Result>('rentry_request', {
      action,
      slug,
      handle: action === 'new' ? null : handle,
      text: form.get('text'),
    });
  }).pipe(
    map((result) => {
      if (result.status < 200 || result.status >= 300)
        throw new HttpErrorResponse({
          status: result.status,
          error: { message: 'The publishing service refused the request.' },
          headers: new HttpHeaders(result.headers),
        });
      return new HttpResponse({
        status: result.status,
        headers: new HttpHeaders(result.headers),
        body:
          result.status === 204
            ? null
            : request.responseType === 'text'
              ? result.body
              : JSON.parse(result.body),
      });
    }),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) return throwError(() => error);
      const failure = error as { kind?: string; message?: string };
      return throwError(
        () =>
          new HttpErrorResponse({
            status: failure.kind === 'busy' ? 429 : 502,
            error: { message: failure.message ?? 'Publishing failed. See Help > Open logs.' },
          }),
      );
    }),
  );
};
