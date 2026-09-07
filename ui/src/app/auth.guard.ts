import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';
import { Server } from './server';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (auth.isAuthenticated) {
    return true;
  }
  // Public content links must also work on a fresh browser. Preserve a chosen
  // instance for legacy numeric IDs; portable public references carry their own.
  if (/^\/(read|statuses|accounts|tags)\/[^/?#]+/.test(state.url ?? '')) {
    auth.enterAnonymous(inject(Server).baseUrl() || 'https://mastodon.social');
    return true;
  }
  // The front page, not the login page: a stranger who has just arrived should
  // see what this app is before being asked to choose a server and grant scopes.
  // `/` offers both "log in" and "continue without logging in".
  return router.parseUrl('/');
};
