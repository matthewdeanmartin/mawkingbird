import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { SEARCH_SERVER_REQUEST, SearchServer } from './search-server';
import { Server } from './server';

/**
 * Prefix relative API/OAuth requests with the currently selected instance base URL.
 *
 * Requests tagged with SEARCH_SERVER_REQUEST go to the separately chosen search
 * server when one is configured — that is the whole multi-server split: search on
 * one instance, everything else on the primary one.
 */
export const serverInterceptor: HttpInterceptorFn = (req, next) => {
  const searchServer = inject(SearchServer);
  const server = inject(Server);
  const searchBase = req.context.get(SEARCH_SERVER_REQUEST) ? searchServer.baseUrl() : '';
  const baseUrl = searchBase || server.baseUrl();
  if (!baseUrl || !req.url.startsWith('/')) {
    return next(req);
  }
  return next(req.clone({ url: `${baseUrl}${req.url}` }));
};
