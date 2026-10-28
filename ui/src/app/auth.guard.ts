import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { Auth } from './auth';
import { radioAccount, radioPostRef } from './radio-links';
import { Server } from './server';

/**
 * Matches only a signed-in Mastodon account with its own token.
 *
 * For routes that have a public twin under the same path: everyone else —
 * signed out, Anonymous, Bluesky-primary — falls through to the public route
 * rather than being redirected away from the page they asked for.
 */
export const mastodonSignedInMatch: CanMatchFn = () => {
  const auth = inject(Auth);
  return !auth.lacksMastodonToken && !auth.isAnonymous;
};

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (auth.isAuthenticated) {
    return true;
  }
  // Public content links must also work on a fresh browser. Preserve a chosen
  // instance for legacy numeric IDs; portable public references carry their own.
  const link = new URL(state.url ?? '/', 'https://app.invalid');
  const publicRadio =
    link.pathname === '/radio' &&
    !!(radioAccount(link.searchParams.get('acct')) || radioPostRef(link.searchParams.get('post')));
  // The project's own pages are prerendered for search engines, and the public
  // starter-kit pages link to the in-app kit. Sending either to `/` would make the
  // dispatcher land a fresh visitor (or crawler) on /home instead.
  const projectPage = /^\/(about|funding|blog|credits|collections\/starter(\/[\w-]+)?)\/?$/.test(
    link.pathname,
  );
  if (
    publicRadio ||
    projectPage ||
    /^\/(read|statuses|accounts|tags)\/[^/?#]+/.test(state.url ?? '')
  ) {
    auth.enterAnonymous(inject(Server).baseUrl() || 'https://mastodon.social');
    return true;
  }
  // The front page, not the login page: a stranger who has just arrived should
  // see what this app is before being asked to choose a server and grant scopes.
  // `/` offers both "log in" and "continue without logging in".
  return router.parseUrl('/');
};
