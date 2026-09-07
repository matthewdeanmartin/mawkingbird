import { inject, Injectable, Injector } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { from, switchMap } from 'rxjs';
import { CorsProxySettings } from '../cors-proxy/cors-proxy-settings';

/**
 * How the interceptor gets a supporter token.
 *
 * A tiny indirection with a specific job: keep `PlusSession` — and through it
 * the 20 KB AuthKit SDK — out of the initial bundle, while still being
 * replaceable in tests.
 *
 * A static import here would be loaded eagerly, because interceptors are
 * registered in `app.config.ts`. Measured at +24 kB initial with `index.html`
 * preloading the chunk, for a feature most visitors never use. A bare
 * `import()` inside the interceptor fixes the bundle but is untestable — a
 * dynamic import cannot be resolved by draining microtasks, and the module's
 * class identity does not match a `TestBed` provider anyway.
 *
 * So the dynamic import lives behind an injectable service, and specs provide
 * their own. Same seam as `WORKOS_CREATE_CLIENT` in `workos-session.ts`, for
 * the same reason: an injector is unambiguous where a module registry is not.
 */
@Injectable({ providedIn: 'root' })
export class PlusTokenSource {
  private injector = inject(Injector);

  async token(): Promise<string | null> {
    const { PlusSession } = await import('./plus-session');
    return this.injector.get(PlusSession).token();
  }
}

/** The header the Worker reads. Must match `TOKEN_HEADER` in the proxy. */
export const PLUS_TOKEN_HEADER = 'X-Mawkingbird-Token';

/**
 * Attaches the supporter token to requests bound for the Mawkingbird proxy.
 *
 * ## Why an interceptor rather than the request builder
 *
 * `CorsProxy.proxyRequest` is synchronous and called from seven places, while
 * getting a token is asynchronous — it may need a network round trip to mint
 * one. Threading a promise through every caller would change seven signatures
 * to solve a problem none of them have. An interceptor does it once, in the
 * one place that already sees every outgoing request.
 *
 * ## What it deliberately does not do
 *
 * It attaches the token to **exactly one destination**: the proxy, and only
 * when the user has selected the Plus entry. Not to the free Mawkingbird
 * proxy, not to a third-party proxy, and never to a feed's own host.
 *
 * That narrowness is the whole point. The token is a bearer credential; the
 * blast radius of getting this wrong is handing it to whichever host a user
 * typed into their feed list. The check is on the request URL's *origin*, not
 * a substring, so a target like `https://evil.test/?x=workers.dev` cannot
 * match.
 *
 * ## Failure is silent, and that is correct
 *
 * No token means the request goes unauthenticated and the proxy applies free
 * limits. A supporter mid-refresh sees no error, just an ordinary response.
 * Failing loudly here would turn a momentary gap into a broken feed for the
 * one person who is paying.
 */
export const plusTokenInterceptor: HttpInterceptorFn = (request, next) => {
  const settings = inject(CorsProxySettings);
  const source = inject(PlusTokenSource);

  // `chosen()`, not `currentId()`. The stored id is what the user picked; the
  // chosen entry is what the app is actually using, and an entitled supporter is
  // upgraded from the free Mawkingbird entry automatically (see
  // `upgradeToSupporterTier`). Gating on the stored id would attach no token to
  // exactly those auto-upgraded requests, so the Worker would meter a paying
  // supporter at the free rate — the one outcome this whole path exists to
  // prevent.
  if (settings.chosen()?.id !== 'mawkingbird-plus') {
    return next(request);
  }

  // The account endpoints are never proxied traffic, and attaching a token to
  // them **deadlocks**: `/plus/token` is how a token is obtained, so minting one
  // would re-enter this interceptor, which would wait for a mint that is itself
  // queued behind the token it is waiting for. `PlusSession.mint()` dedupes
  // concurrent callers, so the second request does not loop — it awaits a
  // promise that can never resolve. The symptom is a button stuck on "Starting
  // checkout…" with no network traffic at all.
  //
  // These endpoints authenticate with the WorkOS bearer token instead, which
  // `PlusSession` sets directly.
  if (new URL(request.url, location.href).pathname.startsWith('/plus/')) {
    return next(request);
  }

  const config = settings.resolve();
  if (!config || !isProxyRequest(request.url, config.pattern)) {
    return next(request);
  }

  return from(source.token()).pipe(
    switchMap((token) =>
      next(token ? request.clone({ setHeaders: { [PLUS_TOKEN_HEADER]: token } }) : request),
    ),
  );
};

/**
 * Whether this request is going to the configured proxy itself.
 *
 * Compares origins rather than testing for a substring: the proxied URL
 * carries the *target* in its query string, so a naive `includes` would match
 * a feed whose own address mentioned the proxy's hostname.
 */
function isProxyRequest(requestUrl: string, pattern: string): boolean {
  try {
    // The pattern still holds its `{route}`/`{url}` placeholders, which are
    // fine for parsing an origin out of — they only ever appear after the host.
    return new URL(requestUrl).origin === new URL(pattern).origin;
  } catch {
    return false;
  }
}
