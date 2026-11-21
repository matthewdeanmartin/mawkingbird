import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '../../platform/session/auth';

/**
 * Account setup is for a signed-in Mastodon or Bluesky-first account; anyone
 * else goes Home.
 * Its own tiny file so the route table can use it without loading the page.
 */
export const setupGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const allowed = auth.kind() === 'bluesky' || (!auth.lacksMastodonToken && !auth.isAnonymous);
  return allowed ? true : inject(Router).parseUrl('/home');
};
