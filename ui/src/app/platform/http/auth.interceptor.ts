import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { throwError } from 'rxjs';
import { AccountTabGuard } from '../session/account-tab-guard/account-tab-guard';
import { inject } from '@angular/core';
import { Auth } from '../session/auth';
import { EXTERNAL_FETCH } from './external-fetch';
import { SEARCH_SERVER_REQUEST, SearchServer } from './search-server';
import { Server } from './server';
import { mastodonConnectorServer } from '../../connections/mastodon/mastodon-connector';
import { normalizeHostUrl } from './host-url';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Attach the Mastodon token only to the selected instance's API. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Never send the Mastodon token to foreign hosts (RSS feeds etc.).
  if (req.context.get(EXTERNAL_FETCH)) {
    return next(req);
  }
  // Same reasoning for a separately chosen search server: the token belongs to the
  // primary instance, so search there runs anonymously (results are public-only).
  if (req.context.get(SEARCH_SERVER_REQUEST) && inject(SearchServer).active()) {
    return next(req);
  }
  // Respect a caller-supplied Authorization (e.g. signup uses an app token).
  if (req.headers.has('Authorization')) {
    return next(req);
  }
  const server = inject(Server);
  try {
    const base = server.baseUrl();
    if (!base && !server.allowsThisServer) return next(req);
    const instance = new URL(base || location.origin);
    const destination = new URL(req.url, location.origin);
    const apiPath = `${instance.pathname.replace(/\/$/, '')}/api/`;
    if (
      destination.origin !== instance.origin ||
      !destination.pathname.startsWith(apiPath) ||
      destination.username ||
      destination.password
    ) {
      return next(req);
    }
  } catch {
    return next(req);
  }
  const auth = inject(Auth);
  // A connector credential belongs to its recorded server, even if a caller
  // temporarily changes the global server selection without switching identity.
  if (
    auth.isBlueskyPrimary &&
    normalizeHostUrl(mastodonConnectorServer() ?? '') !== server.baseUrl()
  ) {
    return next(req);
  }
  const token = auth.token();
  // A write with this tab's token while another tab has switched accounts (or
  // after this tab reloaded as someone else) would act as an account the reader
  // did not see the post under. Stop it here, the one place every authenticated
  // request passes; the shell's banner says why. Reads are never blocked.
  if (token && !READ_METHODS.has(req.method) && !inject(AccountTabGuard).allowWrite()) {
    return throwError(
      () =>
        new HttpErrorResponse({
          url: req.url,
          status: 0,
          statusText: 'Account changed in another tab',
          error: { error: 'Account changed in another tab' },
        }),
    );
  }
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req);
};
