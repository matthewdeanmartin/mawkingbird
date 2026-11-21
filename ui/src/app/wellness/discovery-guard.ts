import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { DiscoveryWindow } from './discovery-window';

/**
 * Discovery routes are reachable when no window is required or one is running;
 * otherwise the visitor lands on the closed page, which carries `next` so one
 * tap opens a window and continues to where they were going.
 */
export const discoveryWindowGuard: CanActivateFn = (_route, state) => {
  if (inject(DiscoveryWindow).isOpenNow()) return true;
  return inject(Router).createUrlTree(['/discovery-closed'], {
    queryParams: { next: state.url },
  });
};

/** Only same-app paths; anything else (or nothing) continues to Home. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/home';
}
