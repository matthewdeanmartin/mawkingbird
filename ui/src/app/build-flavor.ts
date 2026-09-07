/**
 * Runtime "which deployment am I?" helpers, derived from the <base href>.
 *
 * The canary site is built with a /canary/ base href (MOCKINGBIRD_BASE_HREF in
 * .github/workflows/mockingbird-canary.yml); production uses /. That base href
 * is the only reliable signal available in the browser, so we read it from
 * document.baseURI rather than baking a flag into the build.
 */

// Type-only: ClientPrefs imports this module, so a value import would be a cycle.
import type { ArtStyle } from './client-prefs';

/** True when the app is served from the /canary/ sub-path. */
export function isCanaryBuild(baseUri: string = document.baseURI): boolean {
  try {
    return new URL(baseUri).pathname.replace(/\/+$/, '').endsWith('/canary');
  } catch {
    return false;
  }
}

/**
 * True when the app is served from the /test/ sub-path.
 *
 * ## What /test/ is
 *
 * The deployment where **money is fake**. It talks to the sandbox CORS Worker,
 * which holds Stripe test credentials and its own KV namespace, so a
 * subscription bought here is a test-mode subscription and buys nothing real.
 *
 * Production and canary are both *production* — canary is the preview of
 * upcoming features for real customers, on real billing. /test/ is the third
 * thing, and the only one where a mistake costs nobody anything.
 *
 * ## Why this must be visible
 *
 * A test build that looks identical to production is a trap for its own
 * operator: "why did my subscription vanish" has a very boring answer six
 * months later. Hence the banner in the shell and the grey page background —
 * see `isTestBuild` usage in `shell.ts` and the `.is-test-build` rules in
 * `styles.scss`.
 *
 * Access is not enforced here. The Worker refuses `/plus/*` to accounts absent
 * from its tester list, which is the check that matters, because this bundle is
 * public and forkable and anything it decided could be edited out.
 */
export function isTestBuild(baseUri: string = document.baseURI): boolean {
  try {
    return new URL(baseUri).pathname.replace(/\/+$/, '').endsWith('/test');
  } catch {
    return false;
  }
}

/**
 * The Mawkingbird CORS proxy this deployment talks to.
 *
 * Two Workers exist, from one repository, deployed as separate Cloudflare
 * environments (`wrangler deploy` vs `wrangler deploy --env test`):
 *
 * - **production** — live Stripe, the real entitlement store, generous limits.
 *   Used by `/` and `/canary/`, because canary *is* production: it is the
 *   preview of upcoming features for real, paying customers.
 * - **test** — sandbox Stripe, its own KV namespace, deliberately hostile rate
 *   limits for anonymous callers, and `/plus/*` closed to anyone absent from
 *   its tester list. Used by `/test/` and by local development.
 *
 * Nothing is portable between them — not the price id, not the API key, not
 * the webhook secret, not a single entitlement record. That is the point: a
 * mistake on the test Worker cannot cost anyone money or revoke anyone's
 * subscription.
 *
 * Derived from the base href rather than a build configuration so that one
 * bundle behaves correctly wherever it is published, and so this cannot drift
 * out of step with {@link isTestBuild}.
 */
export function corsProxyOrigin(baseUri: string = document.baseURI): string {
  return isTestBuild(baseUri)
    ? 'https://mawkingbird-cors-proxy-test.matthewdeanmartin.workers.dev'
    : 'https://cors.mawkingbird.com';
}

/**
 * Brand-mark image (104px @2x): the canary logo on canary, else the normal one,
 * in whichever illustration set the reader prefers (see {@link ArtStyle}).
 *
 * The two dimensions are independent — canary still has to look like canary
 * whichever art is on — so both files exist for both flavors.
 */
export function brandLogoSrc(style: ArtStyle = 'hand', baseUri: string = document.baseURI): string {
  if (style === 'ai') {
    return isCanaryBuild(baseUri) ? 'canary_logo_104.png' : 'mockigbird_logo_104.png';
  }
  return isCanaryBuild(baseUri) ? 'canary_hand_104.png' : 'mockingbird_hand_104.png';
}

/**
 * Fail-whale illustration, with its intrinsic size.
 *
 * The dimensions travel with the file rather than being written into each
 * template: the two drawings are not the same shape (4:3 generated, 640x451
 * hand-drawn), and an `<img>` carrying the wrong width/height attributes
 * stretches the art — see the `height: auto` note in the demo page's styles.
 */
export interface WhaleArt {
  src: string;
  width: number;
  height: number;
}

const WHALES: Record<ArtStyle, WhaleArt> = {
  ai: { src: 'insufficient_whale_640.png', width: 640, height: 480 },
  hand: { src: 'insufficient_whale_hand_640.png', width: 640, height: 451 },
};

/** Fail-whale illustration, in the reader's preferred illustration set. */
export function failWhaleArt(style: ArtStyle = 'hand'): WhaleArt {
  return WHALES[style] ?? WHALES.hand;
}
