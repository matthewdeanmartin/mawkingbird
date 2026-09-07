import { isTestBuild } from '../../build-flavor';

/**
 * Where the profile service lives, for this deployment.
 *
 * Two Workers exist, from one repository, deployed as separate Cloudflare
 * environments — the same split as the CORS proxy and the auth services, and
 * for the same reason: a test-minted token cannot be spent in production
 * because the issuers differ and the service pins its own.
 *
 * Must agree with `hostsFor()` in `mawkingbird_profile/src/hosts.ts`. A
 * disagreement means the app talks to a service that will refuse its origin,
 * which surfaces as a CORS failure rather than anything that names the cause.
 *
 * Unlike the auth services, this one is called with a **bearer header** and
 * never `credentials: 'include'` — there is no cookie in play, so third-party
 * cookie blocking does not apply. The subdomain is for uniformity, not
 * necessity.
 */
export function profileOrigin(baseUri: string = document.baseURI): string {
  return isTestBuild(baseUri)
    ? 'https://profile-test.mawkingbird.com'
    : 'https://profile.mawkingbird.com';
}
