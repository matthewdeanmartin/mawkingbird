import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, catchError, of } from 'rxjs';
import { Api } from '../api';
import { Auth } from '../auth';

/** Allow only accounts whose role is staff (admin/moderator/owner). */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const api = inject(Api);
  const router = inject(Router);

  const isStaff = (role: { name: string } | null | undefined): boolean =>
    !!role && role.name !== '';

  const current = auth.account();
  if (current) {
    return isStaff(current.role) ? true : router.parseUrl('/home');
  }

  // Account not loaded yet (deep link): fetch it, then decide.
  return api.verifyCredentials().pipe(
    map((acc) => {
      auth.setAccount(acc);
      return isStaff(acc.role) ? true : router.parseUrl('/home');
    }),
    // The Mastodon page, not the chooser: reaching here means an existing
    // Mastodon token failed verification, so the fix is to re-authenticate it.
    catchError(() => of(router.parseUrl('/login/mastodon'))),
  );
};
