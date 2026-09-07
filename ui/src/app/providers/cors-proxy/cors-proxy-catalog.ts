import { corsProxyOrigin } from '../../build-flavor';
import { proxyFeatureFlag } from '../../feature-flags';
import { PROXY_RATE_FREE_PER_MINUTE, PROXY_RATE_PLUS_PER_MINUTE } from '../../plus-benefits';

/**
 * Which Mawkingbird proxy deployment this build talks to.
 *
 * `/test/` gets the sandbox Worker; everything else — production and canary
 * alike — gets the real one. Both Mawkingbird entries below build on this, so
 * the free and Plus tiers can never end up pointed at different deployments,
 * which is the failure that would make a supporter token unverifiable.
 */
const MAWKINGBIRD_PROXY = corsProxyOrigin();

/**
 * The catalog of CORS proxies the RSS reader (and, later, article extraction)
 * can fall back to when a source refuses browser access.
 *
 * Like `connection-catalog.ts` this is deliberately inert data: enough to
 * choose a proxy, nothing about how the choice is stored or used. The one
 * addition is {@link CorsProxyEntry.template}, which *is* behaviour — but it is
 * the same kind of fact as the label (it is how the service spells its own API),
 * and keeping it here is what makes adding a proxy a one-entry change.
 *
 * ## Why this exists at all
 *
 * A proxy is a machine-in-the-middle by construction. It sees every URL it is
 * asked for and every byte that comes back, and it can lie about both. That is
 * an acceptable trade for a *public* RSS feed — the content is public anyway,
 * and the alternative is not reading it — and it is never acceptable for
 * anything carrying a credential. {@link buildProxiedUrl} enforces that in code
 * rather than trusting callers; see `cors-proxy.ts`.
 *
 * ## Why so few of them work
 *
 * Public CORS proxies churn constantly. CorsProxy.io's free tier is restricted
 * to localhost and other development origins: genuinely useful under `ng serve`
 * and unable to work at all from the deployed origin. It is marked
 * {@link CorsProxyEntry.devOnly} and filtered out of the picker on a deployed
 * build, because offering a choice that is guaranteed to fail is worse than not
 * offering it.
 *
 * Several widely-recommended proxies are absent entirely because they were
 * tested and do not work — see the comment among the entries below. Recording
 * the negative results is the point: they are the first hits when anyone
 * searches for a free CORS proxy.
 *
 * ## Two axes, not one
 *
 * "Does this proxy work?" turns out to be two independent questions, and the
 * second one is invisible until an authenticated API is involved:
 *
 * 1. **Will it answer my origin at all?** — {@link CorsProxyEntry.devOnly} and
 *    {@link CorsProxyEntry.originAllowlist}.
 * 2. **Will it forward my request headers?** —
 *    {@link CorsProxyEntry.forwardsCustomHeaders}. A proxy that drops them can
 *    fetch any public RSS feed perfectly while making every key-authenticated
 *    API look like it rejected the user's key.
 *
 * AllOrigins is the cautionary case: no signup, works from a deployed origin,
 * and completely unable to carry an API key. Corsfix is the opposite — it was
 * previously marked `devOnly` and hidden in production, when in fact its free
 * tier is *allowlist*-based (localhost implicitly, other domains once
 * registered) and it is the fastest option tested.
 */

/** Route-free identity of a proxy, and the value persisted in settings. */
export type CorsProxyId =
  | 'mawkingbird'
  | 'mawkingbird-plus'
  | 'allorigins'
  | 'corssh'
  | 'corsfix'
  | 'corslol'
  | 'corsproxy-io'
  | 'custom';

/**
 * Which policy a proxied request is asking for.
 *
 * Only the Mawkingbird proxy reads this; every other proxy ignores it, because
 * every other proxy is a general-purpose one that will fetch whatever it is
 * given. It exists because a proxy that restricts destinations has to be told
 * *which* restriction applies, and inferring that from the URL would mean a
 * newly added host silently picking up whichever policy happened to match it.
 *
 * The values are the route ids in the proxy's own `config.ts`. They are a wire
 * contract with a separately deployed service, so renaming one here without
 * deploying the Worker breaks the feature — see `mawkingbird_cors_proxy`.
 */
export type CorsProxyRoute =
  | 'feeds'
  // Reader article expansion. Unlike 'feeds' this route replaces a failed
  // upstream's body with the proxy's own error document, because a refused
  // article has no bytes worth relaying verbatim — only facts about the
  // refusal. Success stays a byte-for-byte relay. See the Worker's config.ts.
  | 'article'
  | 'webmention-discover'
  | 'webmention-send'
  | 'twitterapi'
  | 'getxapi'
  | 'mataroa'
  | 'shortener'
  | 'paste';

/** How a proxy wants the target URL spliced into its own. */
export interface CorsProxyTemplate {
  /**
   * The proxy URL with `{url}` standing in for the target.
   *
   * Empty for `custom`, whose template the user supplies.
   */
  pattern: string;
  /**
   * Whether `{url}` is percent-encoded before substitution.
   *
   * Both forms are in the wild and they are not interchangeable: a proxy that
   * reads the target from a query parameter needs it encoded or the target's
   * own `?a=1&b=2` is parsed as the *proxy's* parameters, while a proxy that
   * takes the target as a path suffix needs it raw.
   */
  encodeTarget: boolean;
  /**
   * Whether the pattern also carries a `{route}` placeholder.
   *
   * True only for the Mawkingbird proxy. A pattern with `{route}` and no
   * substitution would send the literal string `{route}` and be rejected, so
   * this is what tells the builder the placeholder is expected.
   */
  routed?: boolean;
}

/** A native multi-target endpoint offered by a proxy. */
export interface CorsProxyBatchTemplate {
  /** The endpoint URL, with `{route}` standing in for the requested policy. */
  pattern: string;
  /** Routes the endpoint accepts. Batch support is never inferred. */
  routes: readonly CorsProxyRoute[];
  /** Hard request-size ceiling published by the proxy. */
  maxItems: number;
}

export interface CorsProxyEntry {
  id: CorsProxyId;
  /** Display name, as the service spells it. */
  label: string;
  /** One sentence: what this service is and who it is for. */
  pitch: string;
  template: CorsProxyTemplate;
  /** Native batching, when this exact proxy implementation supports it. */
  batch?: CorsProxyBatchTemplate;
  /**
   * The header this proxy authenticates with, when it has one.
   *
   * Only the header *name* is catalog data; the value is the user's secret and
   * lives in {@link CorsProxySettings}. A proxy with a name here shows a key
   * field in the UI.
   */
  keyHeader?: string;
  /** Whether the proxy refuses to work without a key. */
  keyRequired?: boolean;
  /** What the key costs, for the UI to set expectations honestly. */
  keyNote?: string;
  /**
   * True when the free tier only accepts requests from localhost and similar
   * development origins. Hidden from the picker on a deployed build.
   */
  devOnly?: boolean;
  /**
   * Whether this proxy forwards non-safelisted request headers to the target.
   *
   * The property that decides whether an *authenticated* API is reachable at
   * all, and it is invisible from the outside until you test it. A proxy that
   * drops `X-API-Key` does not fail loudly: the target simply answers "no key
   * supplied", which reads like the user pasted the wrong key. Recording it
   * here turns a confusing dead end into a filtered picker.
   *
   * Measured, not assumed — see `sprint/twitter-1-transport.md`:
   *  - AllOrigins: `false`. Its preflight allows only `Origin,
   *    X-Requested-With, Content-Type, Content-Encoding, Accept`.
   *  - CORS.SH and Corsfix: `true`, both verified end to end against a real
   *    key-requiring API.
   *
   * `undefined` means unproven — the honest state for a proxy nobody has tested
   * this way, including `custom`, whose behaviour depends on what the user
   * deployed. Unproven is offered but labelled, never silently trusted.
   */
  forwardsCustomHeaders?: boolean;
  /**
   * How the proxy authorizes the *calling site* rather than the request.
   *
   * Corsfix is the case this exists for: it has no per-request key on the free
   * tier, it has an allowlist of registered domains. Its refusal
   * (`domain_not_registered`) is a setup step, not a fault, and the connector
   * page needs to say so instead of reporting a generic 403.
   */
  originAllowlist?: {
    /** Where the user registers their domain. */
    dashboardUrl: string;
    /** Shown when the proxy rejects this origin. */
    note: string;
  };
  /** Published limits, or the most reliable report of them. Shown as-is. */
  limits: string;
  /** The service's own page, for the user to verify any of the above. */
  homepage: string;
}

/**
 * Every proxy, in the order they appear.
 *
 * Ordered by how likely they are to actually work for the person reading the
 * list: the no-signup option first (fine for RSS, which is most people's use),
 * then the two that carry API keys once configured, then the development-only
 * one, then custom. Custom is last but is the one the copy steers anybody
 * serious toward.
 */
export const CORS_PROXY_CATALOG: readonly CorsProxyEntry[] = [
  {
    id: 'mawkingbird',
    label: 'Mawkingbird proxy',
    pitch: 'Run by this app, for this app. No signup, no key. Please see ToS below.',
    template: {
      // `{route}` names the policy the proxy should apply; `{url}` is the
      // target. Both are substituted by `buildProxiedUrl`.
      pattern: `${MAWKINGBIRD_PROXY}/?route={route}&url={url}`,
      encodeTarget: true,
      routed: true,
    },
    batch: {
      pattern: `${MAWKINGBIRD_PROXY}/batch?route={route}`,
      routes: ['feeds', 'article', 'twitterapi', 'getxapi'],
      maxItems: 6,
    },
    // It forwards exactly the headers each route declares — `x-api-key` for the
    // Twitter sources, `authorization` for Mataroa — and drops everything else.
    // That is more than AllOrigins can do and is the point of running our own.
    forwardsCustomHeaders: true,
    limits:
      `Feeds: ${PROXY_RATE_FREE_PER_MINUTE} requests per minute, 2 MB per response, cached 5 ` +
      'minutes. Webmentions and the ' +
      'API connectors are tighter. Only the destinations this app actually uses are reachable, ' +
      'and video and audio are refused outright — it is not a general-purpose proxy.',
    // The service's own terms page, not the source repository — the repo is
    // private, so linking it would send users to a 404 and imply the service is
    // open source when it is not.
    homepage: `${MAWKINGBIRD_PROXY}/`,
  },
  {
    id: 'mawkingbird-plus',
    label: 'Mawkingbird Plus',
    pitch:
      'The Mawkingbird proxy at a supporter rate limit. Needs a Mawkingbird account and a subscription.',
    template: {
      // Byte-for-byte the free entry's pattern, and that is the design rather
      // than a copy-paste. One deployment, one set of routes; the tier travels
      // in a header the app attaches per request. Two consequences worth
      // having: a lapsed subscriber silently degrades to free limits instead
      // of breaking, and there is no second hostname to keep in step.
      pattern: `${MAWKINGBIRD_PROXY}/?route={route}&url={url}`,
      encodeTarget: true,
      routed: true,
    },
    batch: {
      pattern: `${MAWKINGBIRD_PROXY}/batch?route={route}`,
      routes: ['feeds', 'article', 'twitterapi', 'getxapi'],
      maxItems: 6,
    },
    forwardsCustomHeaders: true,
    // No `keyHeader`: unlike every other paid proxy here, there is no key to
    // paste. The token is minted from the signed-in account by `PlusSession`
    // and refreshed automatically, so the settings page shows no key field.
    limits:
      `Feeds and every other route: ${PROXY_RATE_PLUS_PER_MINUTE} requests per minute, counted ` +
      'per account rather than per address. The same destinations, size caps and content-type rules as the free proxy — ' +
      'a subscription raises the ceiling, it does not widen what the proxy will reach.',
    homepage: `${MAWKINGBIRD_PROXY}/`,
  },
  {
    id: 'allorigins',
    label: 'AllOrigins',
    pitch: 'Free and open, no signup. The only free option that works from a deployed site.',
    template: {
      pattern: 'https://api.allorigins.win/raw?url={url}',
      encodeTarget: true,
    },
    // Measured 2026-07-31: drops custom request headers, so any API needing a
    // key header is unreachable through it. Also ~26s for a call that takes
    // ~1s through CORS.SH. Fine for public RSS, useless for authenticated APIs.
    forwardsCustomHeaders: false,
    limits:
      'Roughly 20 requests per minute, and frequently slow (26s in testing). No uptime guarantee. Cannot send API keys — it strips custom headers.',
    homepage: 'https://allorigins.win/',
  },
  {
    id: 'corssh',
    label: 'CORS.SH',
    pitch: 'A cors-anywhere replacement. Works from any origin once you bring a key.',
    template: {
      pattern: 'https://proxy.cors.sh/{url}',
      encodeTarget: false,
    },
    keyHeader: 'x-cors-api-key',
    keyRequired: true,
    keyNote: 'Free keys are available from the CORS.SH site; paid plans lift the limits.',
    // Measured 2026-07-31: forwarded X-API-Key to an authenticated API from a
    // deployed origin, ~1.3-1.8s, preflight answered
    // `access-control-allow-headers: x-api-key`.
    forwardsCustomHeaders: true,
    limits: 'Depends on your plan. The free key is rate-limited.',
    homepage: 'https://cors.sh/',
  },
  {
    id: 'corsfix',
    label: 'Corsfix',
    pitch: 'The fastest option tested, and it can carry API keys. Register your domain first.',
    template: {
      pattern: 'https://proxy.corsfix.com/?{url}',
      encodeTarget: false,
    },
    // Measured 2026-07-31: forwarded X-API-Key and returned real data in 0.77s
    // — the fastest of everything tested. Preflight answered
    // `Access-Control-Allow-Headers: x-api-key`.
    forwardsCustomHeaders: true,
    // NOT devOnly. The earlier `devOnly: true` was wrong: the free tier is not
    // localhost-*only*, it is allowlist-based. localhost is simply allowed
    // implicitly, while any other origin must be registered. A deployed site
    // whose domain is registered works fine, so hiding this in production was
    // hiding the best free option there is.
    originAllowlist: {
      dashboardUrl: 'https://app.corsfix.com',
      note: 'Corsfix answers localhost automatically. For a deployed site, add your domain in the Corsfix dashboard first — until you do it replies "domain_not_registered" (HTTP 403), which is a setup step, not a fault.',
    },
    keyHeader: 'x-corsfix-key',
    keyNote:
      'Optional. Domain registration is the usual route; a key is only needed if you would rather not allowlist an origin.',
    limits:
      '60 requests per minute on the free/trial tier — the binding constraint for bulk work, ' +
      'since it is far tighter than the data services behind it. 5 MB payload cap, 20s upstream timeout.',
    homepage: 'https://corsfix.com/',
  },
  {
    id: 'corslol',
    label: 'cors.lol',
    pitch: 'Free and no signup, when it is not rate-limited. Worth a try when the others are down.',
    template: {
      pattern: 'https://api.cors.lol/?url={url}',
      encodeTarget: true,
    },
    // Deliberately `undefined` rather than a measured value. The 2026-07-31 pass
    // could not establish it: the service 429'd before a header-carrying request
    // ever got through. Unproven is the honest state, and the Test button is what
    // settles it.
    forwardsCustomHeaders: undefined,
    // No keyHeader: the free tier authenticates nothing, so there is no header
    // to put a key in and the UI correctly shows no key field.
    limits:
      'Rate-limited on the free tier, with no published numbers, and a one-off paid plan that ' +
      'lifts the limit. In testing it answered HTTP 429 on nearly every request, including the ' +
      'first of a session — but free proxies run on a shared quota that resets, so it is worth ' +
      'retrying on another day rather than assuming it is broken for good.',
    homepage: 'https://cors.lol/',
  },
  {
    id: 'corsproxy-io',
    label: 'CorsProxy.io',
    pitch: 'Edge-hosted and quick, but the free tier only answers development origins.',
    template: {
      pattern: 'https://corsproxy.io/?url={url}',
      encodeTarget: true,
    },
    keyHeader: 'x-cors-api-key',
    keyNote: 'A key lifts it beyond localhost; there is a free account tier.',
    devOnly: true,
    limits: 'Free tier is localhost-only, with a 1 MB response cap.',
    homepage: 'https://corsproxy.io/',
  },
  // Proxies deliberately NOT listed, having been tested and found unusable
  // (2026-07-31). Recorded here so the next person to find them on a
  // "free CORS proxies" list does not spend the afternoon re-discovering this:
  //
  // - **WhateverOrigin** (whateverorigin.org). Defunct. `/get?url=…` returns the
  //   service's own marketing homepage as HTML for every target, including
  //   `https://example.com`. Not a header problem — it no longer proxies at all.
  //
  // (**cors.lol** was on this list after the same pass and has since been
  //   re-added above. The 429s were real, but the conclusion drawn from them —
  //   "permanently unusable" — did not survive contact with how these services
  //   actually work: a free proxy is one shared quota on somebody's small paid
  //   plan, so a day of blanket 429s is an exhausted bucket, not a property of
  //   the service. The listed proxies fail this way too, often. Offering it
  //   with honest copy costs nothing and gives the user another door to try
  //   when today's first choice is down.)
  //
  // - **CORS Anywhere** (cors-anywhere.herokuapp.com). HTTP 403 "See /corsdemo
  //   for more info": the public demo requires a human to click through an
  //   activation page, and that grant is temporary. Self-hosting it is a real
  //   option, but that is the `custom` entry below, not a distinct service.
  {
    id: 'custom',
    label: 'Your own proxy',
    pitch:
      'A CORS proxy you run and trust — a Cloudflare Worker, self-hosted CORS Anywhere, or a paid service. The only option nobody else can rate-limit or shut down.',
    template: { pattern: '', encodeTarget: true },
    keyHeader: '',
    keyNote: 'Optional. Set a header name and value if your proxy needs one.',
    // Deliberately left `undefined` rather than `true`. Whether a self-hosted
    // proxy forwards headers depends entirely on what the user deployed — a
    // stock CORS Anywhere does, a hand-rolled Worker that rebuilds the request
    // may not. Claiming `true` here would be guessing on the user's behalf
    // about the one property that silently breaks authenticated APIs.
    limits: 'Whatever you configure.',
    homepage: 'https://developers.cloudflare.com/workers/',
  },
];

/**
 * Proxies that can carry a request needing a custom header, such as an API key.
 *
 * `undefined` (unproven) is included rather than filtered: a self-hosted proxy
 * usually does forward headers, and excluding `custom` would remove the one
 * option nobody can rate-limit. The caller shows unproven entries with a
 * "not verified" note and lets the connector's Test button settle it.
 *
 * Only a measured `false` is excluded — currently AllOrigins, where the key
 * would be dropped and the target's "no key supplied" reply would look like the
 * user's key was wrong.
 */
export function headerCapableCorsProxies(
  hostname: string = location.hostname,
  isFlagEnabled: (flagId: string) => boolean = () => false,
): readonly CorsProxyEntry[] {
  return availableCorsProxies(hostname, isFlagEnabled).filter(
    (entry) => entry.forwardsCustomHeaders !== false,
  );
}

export function corsProxyEntry(id: CorsProxyId): CorsProxyEntry | undefined {
  return CORS_PROXY_CATALOG.find((entry) => entry.id === id);
}

/**
 * Whether this build is running somewhere a dev-only proxy would accept.
 *
 * Deliberately generous about what counts as local — the cost of a false
 * positive is one clear error message from the proxy, while a false negative
 * hides a working option from a developer.
 */
export function isDevelopmentOrigin(hostname: string = location.hostname): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  );
}

/**
 * The proxies worth showing here: everything, minus dev-only ones in production
 * and minus any whose feature flag is off.
 *
 * The flag check is a parameter rather than an injected service because this is
 * a pure catalog function called from several places, including one that runs
 * outside an injection context. Callers that have `FeatureFlags` pass
 * `(id) => flags.enabled(id)`; the default leaves every flagged proxy hidden,
 * which is the safe direction — a caller that forgets cannot accidentally offer
 * a proxy the user switched off.
 *
 * This is the single chokepoint for "may this proxy be used at all": the picker
 * renders from it, and {@link CorsProxySettings.dropUnavailableSelection}
 * deselects anything it no longer returns, so turning a flag off also unsticks a
 * proxy that was already selected.
 */
export function availableCorsProxies(
  hostname: string = location.hostname,
  isFlagEnabled: (flagId: string) => boolean = () => false,
): readonly CorsProxyEntry[] {
  const local = isDevelopmentOrigin(hostname);
  return CORS_PROXY_CATALOG.filter((entry) => {
    if (!local && entry.devOnly) {
      return false;
    }
    const flag = proxyFeatureFlag(entry.id);
    return flag === null || isFlagEnabled(flag);
  });
}
