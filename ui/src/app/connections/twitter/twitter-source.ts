/**
 * The Twitter data services this app can read through, as inert catalog data.
 *
 * Neither is X. Both are third-party scrapers that resell public Twitter data, and
 * both must be treated as replaceable: endpoints change without notice, fields
 * appear and vanish, and a provider can lose access to an X feature overnight.
 * That is why the catalog exists at all — so switching costs one entry and one
 * adapter rather than a rewrite.
 *
 * ## Everything here is read-only
 *
 * Following, liking, reposting and posting all require an authenticated X
 * account, which this app deliberately never asks for. It never accepts an X
 * password, 2FA seed, session cookie, `auth_token`, or `ct0` — see the spec's
 * §2.2 and §19. "Follow" in Mawkingbird means a local subscription stored in
 * this browser, not a follow on Twitter.
 *
 * ## Why per-request cost is modelled here
 *
 * These providers bill differently. The catalog gives the UI each provider's
 * pricing terms so a reader can see the cost before requesting data.
 */

/** Identity of a source, and the value persisted in settings. */
export type TwitterSourceId = 'twitterapi-io' | 'getxapi';

export interface TwitterSourceEntry {
  id: TwitterSourceId;
  /** Display name, as the service spells it. */
  label: string;
  /** One sentence: what this service is, for someone who has never used it. */
  pitch: string;
  /** Origin of the API, for the credential-host guard and the proxy target. */
  baseUrl: string;
  /**
   * The header this service authenticates with.
   *
   * Both providers use a header that requires a CORS preflight for direct
   * cross-origin browser requests. See {@link TwitterTransport} for routing.
   */
  authHeader: string;
  /** Prefix before the key, e.g. `Bearer `. Empty when the key stands alone. */
  authPrefix: string;
  /** Where the user gets a key. */
  keyUrl: string;
  /** How the service bills, in the user's terms. Shown as-is. */
  pricingNote: string;
  /** The service's own page, for the user to verify any of the above. */
  homepage: string;
  /**
   * Whether this app has a working adapter for the source yet.
   *
   * The catalog lists both because the plan is to support both, but a source
   * with no adapter must not be selectable — offering a choice that cannot work
   * is the same sin as listing a CORS proxy that is guaranteed to fail.
   */
  implemented: boolean;
}

export const TWITTER_SOURCE_CATALOG: readonly TwitterSourceEntry[] = [
  {
    id: 'twitterapi-io',
    label: 'TwitterAPI.io',
    pitch: 'Public Twitter data — profiles, posts, search — billed per record returned.',
    baseUrl: 'https://api.twitterapi.io',
    authHeader: 'X-API-Key',
    authPrefix: '',
    keyUrl: 'https://twitterapi.io/',
    pricingNote:
      'Billed per record returned, with a minimum charge per call. A profile lookup costs roughly one credit.',
    homepage: 'https://twitterapi.io/',
    implemented: true,
  },
  {
    id: 'getxapi',
    label: 'GetXAPI',
    pitch:
      'Public Twitter data with a flat per-call price and dedicated thread and media endpoints.',
    baseUrl: 'https://api.getxapi.com',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    keyUrl: 'https://getxapi.com/',
    pricingNote: 'Billed per call at a flat rate, with thread lookups priced higher.',
    homepage: 'https://getxapi.com/',
    // Transport configuration exists, but the data adapter is still missing.
    implemented: false,
  },
];

export function twitterSourceEntry(
  id: TwitterSourceId | null | undefined,
): TwitterSourceEntry | undefined {
  return TWITTER_SOURCE_CATALOG.find((entry) => entry.id === id);
}

/** The sources a user can actually pick today. */
export function availableTwitterSources(): readonly TwitterSourceEntry[] {
  return TWITTER_SOURCE_CATALOG.filter((entry) => entry.implemented);
}

/** Every source's API host, for the CORS proxy's credential-host guard. */
export function twitterApiHosts(): string[] {
  return TWITTER_SOURCE_CATALOG.map((entry) => new URL(entry.baseUrl).hostname);
}
