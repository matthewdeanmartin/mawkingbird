import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError } from 'rxjs';
import { Auth } from '../session/auth';
import { EXTERNAL_FETCH } from './external-fetch';
import { SEARCH_SERVER_REQUEST, SearchServer } from './search-server';
import { SIGN_IN_REQUEST } from './sign-in-request';
import { Server } from './server';
import { mastodonConnectorServer } from '../../connections/mastodon/mastodon-connector';
import { normalizeHostUrl } from './host-url';

/** Mastodon's REST surface. Misskey's `/api/<endpoint>` never matches this. */
const MASTODON_ROUTE = /^\/api\/v[12]\//;

/**
 * True when the active identity has no Mastodon server to ask: a Bluesky or
 * Misskey account without a usable Mastodon connector.
 */
export function lacksMastodonServer(auth: Auth, server: Server): boolean {
  if (auth.isMisskeyPrimary) return true;
  if (!auth.isBlueskyPrimary) return false;
  return !auth.token() || normalizeHostUrl(mastodonConnectorServer() ?? '') !== server.baseUrl();
}

/**
 * Refuse Mastodon-only routes for an identity that has no Mastodon server.
 *
 * Without this, a Bluesky-only account still sent every shared widget's
 * Mastodon request (trending tags, instance probes, …) to whatever the server
 * setting held, on every page. Callers should not ask in the first place; this
 * is the one place that guarantees it. It runs first, so the refusal never
 * reaches the network, the metrics, or server-health accounting.
 */
export const mastodonRouteInterceptor: HttpInterceptorFn = (req, next) => {
  if (
    !MASTODON_ROUTE.test(req.url) ||
    req.context.get(EXTERNAL_FETCH) ||
    req.context.get(SIGN_IN_REQUEST)
  ) {
    return next(req);
  }
  if (req.context.get(SEARCH_SERVER_REQUEST) && inject(SearchServer).active()) {
    return next(req);
  }
  if (!lacksMastodonServer(inject(Auth), inject(Server))) {
    return next(req);
  }
  return throwError(
    () =>
      new HttpErrorResponse({
        status: 0,
        statusText: 'No Mastodon account',
        url: req.url,
      }),
  );
};
