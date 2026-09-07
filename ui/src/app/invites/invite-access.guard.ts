import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '../auth';
import { normalizeHostUrl } from '../host-url';
import { probeServerAvailability } from '../server-availability';

/**
 * Put a fresh visitor into the normal Anonymous shell before the Invites page mounts.
 *
 * A bare query key keeps shared links short: `/invites?mastodon.social`. A real
 * signed-in account always wins over that suggestion; the URL must never switch
 * somebody away from their authenticated home server.
 */
export const inviteAccessGuard: CanActivateFn = async (route) => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (auth.isAuthenticated && !auth.isAnonymous) {
    return true;
  }

  const sharedHost = route.queryParamMap.keys[0] ?? 'mastodon.social';
  const server = normalizeHostUrl(sharedHost) || 'https://mastodon.social';
  const result = await probeServerAvailability(server);
  if (result.status !== 'available') {
    return router.parseUrl('/login');
  }
  auth.enterAnonymous(server);
  return true;
};
