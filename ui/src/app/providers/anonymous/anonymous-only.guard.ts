import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '../../auth';

/** Keep anonymous-identity settings out of authenticated account configuration. */
export const anonymousOnlyGuard: CanActivateFn = () => {
  if (inject(Auth).isAnonymous) {
    return true;
  }
  return inject(Router).parseUrl('/settings/profile');
};
