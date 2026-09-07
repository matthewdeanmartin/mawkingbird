import { TestBed } from '@angular/core/testing';
import { FeatureFlags } from '../feature-flags';

/**
 * Turn the third-party CORS proxies back on for one spec.
 *
 * AllOrigins, CORS.SH, Corsfix and cors.lol ship `off` by default — see the
 * `proxies` group in `feature-flags.ts` for why. That default is correct for
 * users and inconvenient for tests, because a large number of specs use one of
 * those proxies as a *vehicle* for testing proxy mechanics that have nothing to
 * do with which vendor is chosen: consent flows, key headers, URL encoding,
 * blame-the-proxy error handling.
 *
 * Rewriting all of them to use the Mawkingbird proxy would be worse. Its entry
 * is destination-scoped and carries no key, so it cannot exercise the
 * key-forwarding and consent paths those specs exist to cover, and several of
 * them would quietly stop testing anything.
 *
 * So the flags are lifted explicitly, per spec, by a call that names what it is
 * doing. A spec that needs a flagged proxy says so in one line; a spec that does
 * not gets the shipped defaults. Never do this in `test-setup.ts` — a global
 * override would mean no test ever runs against the configuration users get.
 *
 * Call after `TestBed.configureTestingModule`, before selecting the proxy.
 */
export function enableProxyFlags(): void {
  const flags = TestBed.inject(FeatureFlags);
  flags.setState('proxy-allorigins', 'production');
  flags.setState('proxy-corssh', 'production');
  flags.setState('proxy-corsfix', 'production');
  flags.setState('proxy-corslol', 'production');
}
