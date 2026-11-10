import { inject } from '@angular/core';
import { CanMatchFn } from '@angular/router';
import { Auth } from '../../auth';

/**
 * Matches only while a Misskey identity is the active account.
 *
 * Placed on a Misskey page registered just before the shared route with the
 * same path (`/search`, `/tags/:tag`): Misskey accounts get the Misskey page,
 * everyone else falls through to the existing one, which stays untouched.
 */
export const misskeyPrimaryMatch: CanMatchFn = () => inject(Auth).isMisskeyPrimary;
