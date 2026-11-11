import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { FeatureFlagId, FeatureFlags } from './feature-flags';

/**
 * Keep disabled feature routes from being opened through a saved deep link.
 *
 * ## Why the redirect drops the query string
 *
 * `parseUrl('/home')` alone preserves the current query, and that turned a
 * flagged-off route into a silent credential leak: signing in to Mawkingbird
 * Plus returns to `/settings/mawkingbird-plus?code=…`, this guard bounced it,
 * and the browser settled on `/home?code=…` — an unconsumed OAuth
 * authorization code sitting in the address bar of a page that has no idea what
 * to do with it. The code is then copied into history, into any bookmark, and
 * into the `Referer` of every link clicked from that page.
 *
 * Redirecting to a bare `/home` is the fix. The sign-in fails, which is correct
 * — the feature is off — and it fails without leaving a credential behind.
 *
 * Building the URL explicitly rather than trusting the default is deliberate:
 * this applies to any flagged route that is ever made an OAuth target, not just
 * the one where it was found.
 */
export const featureFlagGuard: CanActivateFn = (route) => {
  const flags = inject(FeatureFlags);
  const id = route.data['featureFlag'] as FeatureFlagId;
  if (flags.enabled(id)) {
    return true;
  }
  return inject(Router).createUrlTree(['/home']);
};
