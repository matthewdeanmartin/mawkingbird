import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Auth } from './auth';
import { EXTERNAL_FETCH } from './providers/external-fetch';
import { SEARCH_SERVER_REQUEST, SearchServer } from './search-server';
import { Server } from './server';

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
  const token = inject(Auth).token();
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req);
};
