/**
 * Every host Mawkingbird might need to reach, and a cheap way to ask each one
 * "are you reachable from this network?".
 *
 * ## Why this page exists
 *
 * Setting up a connector costs real effort: make an account, generate a key,
 * sometimes pay for credits, paste it in — and only then discover that this
 * network drops the host entirely and none of it was ever going to work.
 * Repeat per connector. The doctor turns that into one sweep you can run
 * before spending anything, on a fresh install, with no credentials at all.
 *
 * Which is why every probe here is **unauthenticated by construction**. Not as
 * a convenience: a doctor that needed keys could not answer the question it
 * exists to answer, since the whole point is to run it *before* you have them.
 *
 * ## What a browser can actually observe
 *
 * Very little, and this file is careful not to claim more. A cross-origin
 * request that fails reports `status: 0` and nothing else — deliberately, since
 * the detail is itself cross-origin information. Corporate DNS blackholing, a
 * firewall drop, being offline, an extension cancelling the request and a
 * genuinely dead service are indistinguishable from JavaScript.
 *
 * So the probes run with `mode: 'no-cors'`, which discards the response body
 * but keeps the one bit that matters: an opaque response means DNS resolved,
 * TCP connected and TLS completed. That is *reachability*, which is the only
 * question this page asks. It deliberately does not use the app's real
 * transports (unlike {@link TwitterReachability}, which is a "will this feature
 * work?" check and must exercise the exact path a real request takes).
 *
 * The second half of the answer comes from the user: a top-level navigation is
 * not subject to CORS, so opening the host in a tab shows the browser's own
 * error page — a corporate block page, a certificate warning, `DNS_PROBE_
 * FINISHED_NXDOMAIN`. Those pages are privileged and unreadable from script, so
 * the user reports what they saw and {@link interpret} combines the two.
 *
 * The tab also reveals things that are not error pages at all. A Cloudflare
 * "verify you are human" interstitial is the important one, and it is why
 * `bot-check` is a first-class outcome: it exonerates the network completely
 * while still meaning the connector cannot work, which is a combination none of
 * the other answers can express.
 */

import { corsProxyOrigin } from '../../../../build-flavor';
import { CorsProxyRoute } from '../../../../providers/cors-proxy/cors-proxy-catalog';

/**
 * A translate function shaped like `TranslocoService.translate`, passed in
 * rather than injected: every function below is a free function called from
 * a computed signal, not a component, and `UiLocale` (which sits under
 * `TranslocoService`) must stay out of unrelated DI graphs — see the
 * migrate-i18n skill's traps. The caller (`connection-doctor-page.ts`) is a
 * component and injects the real service.
 */
export type Translate = (key: string, params?: Record<string, unknown>) => string;

// i18n settings.connections.doctor.category.core: Your server
// i18n settings.connections.doctor.category.connector: Connections
// i18n settings.connections.doctor.category.proxy: CORS proxies
// i18n settings.connections.doctor.category.shortener: Link shorteners
// i18n settings.connections.doctor.category.control: Control

/** Groups the probe list so a blocked *category* is visible at a glance. */
export type ProbeCategory = 'core' | 'connector' | 'proxy' | 'shortener' | 'control';

export interface ProbeTarget {
  /** Stable identity, and the key results are stored under. */
  id: string;
  /** The host, as the user would type it. Shown as the row's title. */
  host: string;
  /** Which connector or feature this host belongs to, in the user's terms. */
  label: string;
  category: ProbeCategory;
  /**
   * The URL the JS probe fetches. Always an unauthenticated, side-effect-free
   * path — usually a public discovery or health endpoint. In `no-cors` mode the
   * response is unreadable, so this only ever proves the host answered.
   */
  probeUrl: string;
  /**
   * Which proxy route reaches this host, for proxies that restrict destinations.
   *
   * Only the Mawkingbird proxy reads it; the third-party proxies fetch whatever
   * they are given and ignore it. `undefined` means *no route reaches this
   * host* — the honest answer for the hosts the app talks to directly, such as
   * Bluesky, GitHub, OpenRouter and Dropbox, which are CORS-open and never need
   * a relay.
   *
   * The distinction matters to this page specifically: without it every such
   * probe sends `route=feeds`, our proxy correctly answers 403, and the doctor
   * reports "the target refused the proxy" — blaming the target for our own
   * policy. See {@link ConnectionDoctor.probeViaProxy}.
   */
  proxyRoute?: CorsProxyRoute;
  /**
   * Where "Open in a tab" sends the user. Deliberately a *human* page rather
   * than {@link probeUrl}: an API endpoint renders as raw JSON or a 404, which
   * looks alarming and teaches nothing, while the service's own homepage is
   * unmistakably either itself or a block page.
   */
  openUrl: string;
  /** One clause: what stops working if this host is unreachable. */
  matters: string;
  /**
   * Where to find out whether the *service* is having an outage, as opposed to
   * whether your network can reach it.
   *
   * The third question this page can ask, and the one it cannot answer itself:
   * a probe that fails proves only that the bytes did not arrive here. Whether
   * that is your network or their bad afternoon is a fact about the vendor, and
   * the vendor is the one publishing it.
   *
   * Null where no page of either kind was found, which is the honest state for
   * the small free services — better to say "no status page" than to send
   * someone to an outage aggregator whose data for a tiny host is frequently
   * just wrong.
   */
  status: StatusPage | null;
}

export interface StatusPage {
  url: string;
  /** How the page names itself, so the link reads as what it is. */
  label: string;
  /**
   * Whether the vendor runs this page themselves.
   *
   * Worth distinguishing in the UI rather than treating every link alike.
   * An official page is the vendor stating its own incidents and is
   * authoritative about them; a third-party aggregator is inference from
   * outside, and for small services it is regularly stale or flatly wrong.
   * Presenting the two as equivalent would launder a guess into a fact.
   */
  official: boolean;
}

/**
 * The untranslated shape the table below is written in: `labelKey`/`mattersKey`
 * (and a status page's `labelKey`) name an `// i18n` declaration rather than
 * carrying English directly, and {@link buildTarget} resolves them through the
 * caller's `translate`. Kept as a separate literal table (instead of calling
 * `translate` inline in the array) so the 2026-08 measurement comments stay
 * attached to plain data.
 */
interface ProbeTargetSpec {
  id: string;
  host: string;
  labelKey: string;
  category: ProbeCategory;
  probeUrl: string;
  proxyRoute?: CorsProxyRoute;
  openUrl: string;
  mattersKey: string;
  status: { url: string; labelKey: string; official: boolean } | null;
}

function buildTarget(spec: ProbeTargetSpec, translate: Translate): ProbeTarget {
  return {
    id: spec.id,
    host: spec.host,
    label: translate(spec.labelKey),
    category: spec.category,
    probeUrl: spec.probeUrl,
    proxyRoute: spec.proxyRoute,
    openUrl: spec.openUrl,
    matters: translate(spec.mattersKey),
    status: spec.status
      ? {
          url: spec.status.url,
          label: translate(spec.status.labelKey),
          official: spec.status.official,
        }
      : null,
  };
}

/**
 * The Mastodon instance you are signed into, which is not catalog data — it is
 * whatever server the user picked, so the caller supplies it.
 *
 * Returns null for the built-in mock (an empty base URL means same-origin, and
 * probing your own origin proves nothing).
 */
export function homeServerTarget(baseUrl: string, translate: Translate): ProbeTarget | null {
  if (!baseUrl) {
    return null;
  }
  let host: string;
  try {
    host = new URL(baseUrl).host;
  } catch {
    return null;
  }
  return buildTarget(
    {
      id: 'home',
      host,
      labelKey: 'settings.connections.doctor.target.home.label',
      category: 'core',
      // Public, unauthenticated, and the one endpoint every Mastodon server has.
      probeUrl: `${baseUrl}/api/v1/instance`,
      openUrl: `${baseUrl}/about`,
      mattersKey: 'settings.connections.doctor.target.home.matters',
      // Every Mastodon instance is run by someone different, so there is no page
      // this file could name. The instance's own /about is the closest thing and
      // is already the openUrl.
      status: null,
    },
    translate,
  );
}

// i18n settings.connections.doctor.target.home.label: Your Mastodon server
// i18n settings.connections.doctor.target.home.matters: Everything. Without this there is no timeline to read.

/**
 * Hosts that do not depend on which server you are on.
 *
 * Ordered by category rather than alphabetically, so the summary reads as
 * "connectors fine, proxies blocked" rather than as a flat list of fifteen
 * hostnames.
 */
const PROBE_TARGET_SPECS: readonly ProbeTargetSpec[] = [
  {
    id: 'bsky-social',
    host: 'bsky.social',
    labelKey: 'settings.connections.doctor.target.bskySocial.label',
    category: 'connector',
    // describeServer is the AT Protocol's unauthenticated "who are you" call.
    probeUrl: 'https://bsky.social/xrpc/com.atproto.server.describeServer',
    openUrl: 'https://bsky.social',
    mattersKey: 'settings.connections.doctor.target.bskySocial.matters',
    status: {
      url: 'https://status.bsky.app/',
      labelKey: 'settings.connections.doctor.status.blueskyStatus',
      official: true,
    },
  },
  {
    id: 'bsky-appview',
    host: 'public.api.bsky.app',
    labelKey: 'settings.connections.doctor.target.bskyAppview.label',
    category: 'connector',
    // The public AppView answers this without a token; it is how anonymous
    // Bluesky reading works here at all.
    probeUrl: 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=bsky.app',
    openUrl: 'https://bsky.app',
    mattersKey: 'settings.connections.doctor.target.bskyAppview.matters',
    // Same page as sign-in: Bluesky publishes one status for the service rather
    // than splitting the AppView out, so a reading-only outage may not show here.
    status: {
      url: 'https://status.bsky.app/',
      labelKey: 'settings.connections.doctor.status.blueskyStatus',
      official: true,
    },
  },
  {
    id: 'openrouter',
    host: 'openrouter.ai',
    labelKey: 'settings.connections.doctor.target.openrouter.label',
    category: 'connector',
    // The model list is public and needs no key — exactly the property this
    // page depends on.
    probeUrl: 'https://openrouter.ai/api/v1/models',
    openUrl: 'https://openrouter.ai',
    mattersKey: 'settings.connections.doctor.target.openrouter.matters',
    // Unusually granular — chat completions, the Data API and account login are
    // separate components, so "login is broken but the API is fine" is visible.
    status: {
      url: 'https://status.openrouter.ai/',
      labelKey: 'settings.connections.doctor.status.openrouterStatus',
      official: true,
    },
  },
  {
    id: 'twitterapi',
    host: 'api.twitterapi.io',
    labelKey: 'settings.connections.doctor.target.twitterapi.label',
    category: 'connector',
    // A real API path rather than the bare root. Measured 2026-08-14: this
    // answers 403 (no API key), which is the expected reply to an
    // unauthenticated probe and proves the request reached the endpoint the
    // connector actually uses — a root's service banner proves only that
    // something is listening. The account named is @twitter, the platform's own
    // and the least surprising handle to see in a diagnostic; the probe is
    // rejected before the name is ever looked up, so it only has to parse.
    probeUrl: 'https://api.twitterapi.io/twitter/user/info?userName=twitter',
    proxyRoute: 'twitterapi',
    openUrl: 'https://twitterapi.io',
    mattersKey: 'settings.connections.doctor.target.twitterapi.matters',
    // Also reports upstream X/Twitter impact, which is the usual cause here.
    status: {
      url: 'https://twitterapi.io/status',
      labelKey: 'settings.connections.doctor.status.twitterapiStatus',
      official: true,
    },
  },
  {
    id: 'raindrop',
    host: 'api.raindrop.io',
    labelKey: 'settings.connections.doctor.target.raindrop.label',
    category: 'connector',
    // A real endpoint, not the bare API root. `api.raindrop.io/` answers 301,
    // and a redirect carries no `Access-Control-Allow-Origin` — so probing it
    // reported "this host needs a CORS proxy" about a service that is entirely
    // CORS-open on every path the app actually calls. Measured 2026-08-13:
    // `/rest/v1/collections` answers 401 *with* an ACAO echoing our origin, and
    // its preflight explicitly allows `Authorization`.
    probeUrl: 'https://api.raindrop.io/rest/v1/collections',
    openUrl: 'https://raindrop.io',
    mattersKey: 'settings.connections.doctor.target.raindrop.matters',
    // Has an explicit API component, separate from the website and apps.
    status: {
      url: 'https://status.raindrop.io/',
      labelKey: 'settings.connections.doctor.status.raindropStatus',
      official: true,
    },
  },
  {
    id: 'github',
    host: 'api.github.com',
    labelKey: 'settings.connections.doctor.target.github.label',
    category: 'connector',
    // The API root is unauthenticated and returns a link index.
    probeUrl: 'https://api.github.com/',
    openUrl: 'https://github.com',
    mattersKey: 'settings.connections.doctor.target.github.matters',
    // API-specific components, with history.
    status: {
      url: 'https://www.githubstatus.com/',
      labelKey: 'settings.connections.doctor.status.githubStatus',
      official: true,
    },
  },
  {
    id: 'dropbox',
    host: 'api.dropboxapi.com',
    labelKey: 'settings.connections.doctor.target.dropbox.label',
    category: 'connector',
    // A real endpoint rather than the bare root, for the same reason as
    // Raindrop: `api.dropboxapi.com/` answers 404 with no CORS headers, so
    // probing it reported "needs a proxy" about an API the app talks to
    // directly and successfully. Measured 2026-08-13: a GET here answers 400
    // (the endpoint wants POST) *with* an ACAO echoing our origin — and a
    // readable 400 is exactly what this probe is asking about, since the
    // question is whether the browser may see the reply, not whether the reply
    // is a success.
    probeUrl: 'https://api.dropboxapi.com/2/users/get_current_account',
    openUrl: 'https://www.dropbox.com',
    mattersKey: 'settings.connections.doctor.target.dropbox.matters',
    status: {
      url: 'https://status.dropbox.com/',
      labelKey: 'settings.connections.doctor.status.dropboxStatus',
      official: true,
    },
  },
  {
    id: 'mawkingbird-proxy',
    // Follows the deployment: /test/ probes the sandbox Worker, so the doctor
    // answers "is the proxy *this build uses* reachable" rather than the
    // reachability of a Worker this build never calls.
    host: new URL(corsProxyOrigin()).host,
    labelKey: 'settings.connections.doctor.target.mawkingbirdProxy.label',
    category: 'proxy',
    // `/health` rather than a real proxied fetch: it is the one endpoint that
    // needs no Origin, no route and no target, so it answers "is this service
    // up and reachable from here?" without spending an upstream request or
    // consuming the rate limit. A proxied probe would conflate the proxy being
    // down with the *target* refusing it, which is the exact confusion the
    // separate proxy leg of this page exists to resolve.
    probeUrl: `${corsProxyOrigin()}/health`,
    // Deliberately no `proxyRoute`. This host is the proxy itself; routing a
    // probe of it *through* it would be a loop, and the reachability check above
    // already answers the only question worth asking.
    openUrl: `${corsProxyOrigin()}/`,
    mattersKey: 'settings.connections.doctor.target.mawkingbirdProxy.matters',
    // No status page, and honestly so: it is one Cloudflare Worker run by one
    // person. The probe above is the only signal, which is why it points at an
    // endpoint that cannot fail for a reason other than the service being down.
    status: null,
  },
  {
    id: 'allorigins',
    host: 'api.allorigins.win',
    labelKey: 'settings.connections.doctor.target.allorigins.label',
    category: 'proxy',
    probeUrl: 'https://api.allorigins.win/raw?url=https%3A%2F%2Fexample.com',
    openUrl: 'https://allorigins.win/',
    mattersKey: 'settings.connections.doctor.target.allorigins.matters',
    // No status page of either kind. It is a free service with no incident
    // reporting, so the probe above is the only signal there is — and the
    // repeated timeouts recorded in cors-proxy-catalog.ts are the reason the
    // catalog no longer treats it as dependable.
    status: null,
  },
  {
    id: 'corssh',
    host: 'proxy.cors.sh',
    labelKey: 'settings.connections.doctor.target.corssh.label',
    category: 'proxy',
    probeUrl: 'https://proxy.cors.sh/https://example.com',
    openUrl: 'https://cors.sh/',
    mattersKey: 'settings.connections.doctor.target.corssh.matters',
    // No status page found. Active service and repository, no published incidents.
    status: null,
  },
  {
    id: 'corsfix',
    host: 'proxy.corsfix.com',
    labelKey: 'settings.connections.doctor.target.corsfix.label',
    category: 'proxy',
    probeUrl: 'https://proxy.corsfix.com/?https://example.com',
    openUrl: 'https://corsfix.com/',
    mattersKey: 'settings.connections.doctor.target.corsfix.matters',
    // Monitors the proxy itself and publishes uptime history.
    status: {
      url: 'https://status.corsfix.com/',
      labelKey: 'settings.connections.doctor.status.corsfixStatus',
      official: true,
    },
  },
  {
    id: 'corsproxy-io',
    host: 'corsproxy.io',
    labelKey: 'settings.connections.doctor.target.corsproxyIo.label',
    category: 'proxy',
    probeUrl: 'https://corsproxy.io/?url=https%3A%2F%2Fexample.com',
    openUrl: 'https://corsproxy.io/',
    mattersKey: 'settings.connections.doctor.target.corsproxyIo.matters',
    // Separate components for the proxy, dashboard and API.
    status: {
      url: 'https://status.corsproxy.io/',
      labelKey: 'settings.connections.doctor.status.corsproxyStatus',
      official: true,
    },
  },
  {
    id: 'dub',
    host: 'api.dub.co',
    labelKey: 'settings.connections.doctor.target.dub.label',
    category: 'shortener',
    // `/links` rather than the bare root: the root answers 200 with a service
    // banner, which says nothing about the API. Measured 2026-08-14: this answers
    // JSON 401, the expected reply to an unauthenticated probe of the endpoint
    // the connector actually calls.
    probeUrl: 'https://api.dub.co/links',
    proxyRoute: 'shortener',
    openUrl: 'https://dub.co',
    mattersKey: 'settings.connections.doctor.target.dub.matters',
    // Separates App, API and Link Redirects; the API component is this row.
    status: {
      url: 'https://status.dub.co/',
      labelKey: 'settings.connections.doctor.status.dubStatus',
      official: true,
    },
  },
  {
    id: 'shortio',
    host: 'api.short.io',
    labelKey: 'settings.connections.doctor.target.shortio.label',
    category: 'shortener',
    // A real API path rather than the bare root, for the same reason as Raindrop
    // and T.LY above: a root that answers with a service banner proves the host
    // is up but exercises none of the API surface the connector uses, and its
    // CORS behaviour need not match. Measured 2026-08-14: this answers a clean
    // JSON 401 — the expected reply to an unauthenticated probe, and evidence the
    // request was received and understood.
    probeUrl: 'https://api.short.io/api/links',
    proxyRoute: 'shortener',
    openUrl: 'https://short.io',
    mattersKey: 'settings.connections.doctor.target.shortio.matters',
    status: {
      url: 'https://shortiostatus.com/',
      labelKey: 'settings.connections.doctor.status.shortioStatus',
      official: true,
    },
  },
  {
    id: 'tly',
    host: 'api.t.ly',
    labelKey: 'settings.connections.doctor.target.tly.label',
    category: 'shortener',
    // Not the bare root: `api.t.ly/` answers 301 to `t.ly/docs`, and a redirect
    // carries no CORS headers. This endpoint answers 401 with an ACAO, which is
    // the readable "you are unauthenticated" this probe wants.
    probeUrl: 'https://api.t.ly/api/v1/link/list',
    proxyRoute: 'shortener',
    openUrl: 'https://t.ly',
    mattersKey: 'settings.connections.doctor.target.tly.matters',
    // No official page found, so this is an aggregator — supporting evidence,
    // not a verdict.
    status: {
      url: 'https://statusgator.com/services/tly',
      labelKey: 'settings.connections.doctor.status.tlyStatus',
      official: false,
    },
  },
  {
    id: 'isgd',
    host: 'is.gd',
    labelKey: 'settings.connections.doctor.target.isgd.label',
    category: 'shortener',
    // The *API*, not the homepage. `https://is.gd/` answers 403 behind a
    // bot-detection challenge, so probing it reported "blocked or unreachable"
    // about a service that works perfectly — the doctor was testing a front door
    // the app never knocks on.
    //
    // `forward.php` (look up where a short link points) rather than the
    // `create.php` the app actually calls, because a probe must not have side
    // effects: create is a GET that mints a real link, and a diagnostic anyone
    // can re-run should not litter a third party's database. Both live on the
    // same host behind the same API and answer identically for this purpose.
    // Measured 2026-08-14: 200 with `Access-Control-Allow-Origin: *`, which is
    // both a real reachability answer and a correct CORS one.
    probeUrl: 'https://is.gd/forward.php?format=json&shorturl=is.gd',
    openUrl: 'https://is.gd',
    mattersKey: 'settings.connections.doctor.target.isgd.matters',
    // Deliberately no link. No official page exists, and the outage aggregators
    // that cover is.gd were observed reporting it down while it was demonstrably
    // serving requests. A confidently wrong answer is worse than none.
    status: null,
  },
  {
    id: 'control',
    host: 'example.com',
    labelKey: 'settings.connections.doctor.target.control.label',
    category: 'control',
    // The whole point of a control: a host nobody blocks on purpose. If this
    // one fails, the network or the browser is the problem and no individual
    // verdict below it means anything.
    probeUrl: 'https://example.com/',
    // An ordinary public page, so the open `feeds` route reaches it. This is
    // also the only probe that meaningfully exercises our own proxy end to end.
    proxyRoute: 'feeds',
    openUrl: 'https://example.com',
    mattersKey: 'settings.connections.doctor.target.control.matters',
    // Not applicable: a control host is only ever asked whether the test itself
    // works, never diagnosed.
    status: null,
  },
];

/**
 * Hosts that do not depend on which server you are on.
 *
 * Ordered by category rather than alphabetically, so the summary reads as
 * "connectors fine, proxies blocked" rather than as a flat list of fifteen
 * hostnames.
 */
export function probeTargets(translate: Translate): readonly ProbeTarget[] {
  return PROBE_TARGET_SPECS.map((spec) => buildTarget(spec, translate));
}

// i18n settings.connections.doctor.target.bskySocial.label: Bluesky (sign-in)
// i18n settings.connections.doctor.target.bskySocial.matters: Signing in to Bluesky, and posting.
// i18n settings.connections.doctor.status.blueskyStatus: Bluesky Status
// i18n settings.connections.doctor.target.bskyAppview.label: Bluesky (reading)
// i18n settings.connections.doctor.target.bskyAppview.matters: Reading Bluesky posts and profiles.
// i18n settings.connections.doctor.target.openrouter.label: OpenRouter (AI)
// i18n settings.connections.doctor.target.openrouter.matters: Plain-English search, hashtag suggestions and translation.
// i18n settings.connections.doctor.status.openrouterStatus: OpenRouter Status
// i18n settings.connections.doctor.target.twitterapi.label: Twitter data service
// i18n settings.connections.doctor.target.twitterapi.matters: Reading public tweets. Also needs a CORS proxy.
// i18n settings.connections.doctor.status.twitterapiStatus: TwitterAPI.io Service Status
// i18n settings.connections.doctor.target.raindrop.label: Raindrop.io
// i18n settings.connections.doctor.target.raindrop.matters: Saving bookmarks to Raindrop.
// i18n settings.connections.doctor.status.raindropStatus: Raindrop.io Status
// i18n settings.connections.doctor.target.github.label: GitHub
// i18n settings.connections.doctor.target.github.matters: Finding the people you follow on GitHub.
// i18n settings.connections.doctor.status.githubStatus: GitHub Status
// i18n settings.connections.doctor.target.dropbox.label: Dropbox
// i18n settings.connections.doctor.target.dropbox.matters: Browsing your Dropbox app folder.
// i18n settings.connections.doctor.status.dropboxStatus: Dropbox Status
// i18n settings.connections.doctor.target.mawkingbirdProxy.label: Mawkingbird proxy
// i18n settings.connections.doctor.target.mawkingbirdProxy.matters: The proxy this app runs itself: RSS feeds, pastes, link shorteners and the Twitter data services.
// i18n settings.connections.doctor.target.allorigins.label: AllOrigins proxy
// i18n settings.connections.doctor.target.allorigins.matters: The no-signup CORS proxy, used for RSS feeds that block browsers.
// i18n settings.connections.doctor.target.corssh.label: CORS.SH proxy
// i18n settings.connections.doctor.target.corssh.matters: A CORS proxy that can carry API keys.
// i18n settings.connections.doctor.target.corsfix.label: Corsfix proxy
// i18n settings.connections.doctor.target.corsfix.matters: The fastest CORS proxy tested, and it can carry API keys.
// i18n settings.connections.doctor.status.corsfixStatus: Corsfix Status
// i18n settings.connections.doctor.target.corsproxyIo.label: CorsProxy.io
// i18n settings.connections.doctor.target.corsproxyIo.matters: A CORS proxy whose free tier only answers development origins.
// i18n settings.connections.doctor.status.corsproxyStatus: CORSProxy Status
// i18n settings.connections.doctor.target.dub.label: Dub (shortener)
// i18n settings.connections.doctor.target.dub.matters: Shortening links with Dub.
// i18n settings.connections.doctor.status.dubStatus: Dub Status
// i18n settings.connections.doctor.target.shortio.label: Short.io
// i18n settings.connections.doctor.target.shortio.matters: Shortening links with Short.io.
// i18n settings.connections.doctor.status.shortioStatus: Short.io Status
// i18n settings.connections.doctor.target.tly.label: T.LY (shortener)
// i18n settings.connections.doctor.target.tly.matters: Shortening links with T.LY.
// i18n settings.connections.doctor.status.tlyStatus: T.LY on StatusGator
// i18n settings.connections.doctor.target.isgd.label: is.gd (shortener)
// i18n settings.connections.doctor.target.isgd.matters: Shortening links without an account.
// i18n settings.connections.doctor.target.control.label: Control
// i18n settings.connections.doctor.target.control.matters: Nothing — this one is only here to prove the test itself works.

const CATEGORY_LABEL_KEYS: Record<ProbeCategory, string> = {
  core: 'settings.connections.doctor.category.core',
  connector: 'settings.connections.doctor.category.connector',
  proxy: 'settings.connections.doctor.category.proxy',
  shortener: 'settings.connections.doctor.category.shortener',
  control: 'settings.connections.doctor.category.control',
};

export function categoryLabel(category: ProbeCategory, translate: Translate): string {
  return translate(CATEGORY_LABEL_KEYS[category]);
}

/** What the JS probe concluded. Never a cause — only what was observed. */
export type ProbeVerdict =
  /** Not run yet. */
  | 'idle'
  /** In flight. */
  | 'checking'
  /** The host answered. DNS, TCP and TLS all worked. */
  | 'reachable'
  /** The request failed. Blocked, offline, dead, or refused — indistinguishable. */
  | 'failed'
  /** The request ran out of time without an answer. */
  | 'timeout';

/**
 * Whether this origin may *read* the host's replies, as opposed to merely
 * reaching it.
 *
 * A distinct axis from {@link ProbeVerdict}, and keeping them apart is the
 * point: "the bytes never arrived" and "the bytes arrived but the browser will
 * not let me look at them" have completely different remedies, and only the
 * second is what a CORS proxy is for. `unknown` is the honest answer whenever
 * the host was never reached, since a CORS result would be meaningless there.
 */
export type CorsReadable = 'unknown' | 'readable' | 'blocked';

/**
 * How the configured CORS proxy fared against this host.
 *
 * The third leg, and the one that separates two failures which look identical
 * from the connector's own error message:
 *
 * - `works` — the proxy fetched it. If the feature still fails after this, the
 *   problem is downstream of connectivity: an API key, a plan limit, a consent
 *   not given. That is a genuinely different place to look.
 * - `proxy-unreachable` — the proxy host itself is blocked or down. Nothing to
 *   do with the target.
 * - `target-refused` — the proxy is fine and answered, but the target refused
 *   *it*. Datacentre IP ranges get blocked far more aggressively than home
 *   ones, so a proxy can be perfectly healthy and still useless for one host.
 * - `none` — no proxy configured, so there was nothing to test.
 * - `not-needed` — the host is directly readable; a proxy would add latency
 *   and a middleman for no benefit.
 * - `not-routable` — the configured proxy restricts destinations and has no
 *   route to this host. A policy decision, not a failure: the Mawkingbird proxy
 *   deliberately cannot reach the credential-bearing hosts. Distinguished from
 *   `target-refused` because reporting our own allowlist as the *target*
 *   refusing us would send the user off debugging someone else's service.
 */
export type ProxyVerdict =
  | 'unknown'
  | 'none'
  | 'not-needed'
  | 'not-routable'
  | 'works'
  | 'proxy-unreachable'
  | 'target-refused';

export interface ProbeResult {
  verdict: ProbeVerdict;
  cors: CorsReadable;
  /** How the configured proxy fared, when one was worth trying. */
  proxy: ProxyVerdict;
  /** How long the proxied attempt took, when it was made. */
  proxyMs: number | null;
  /**
   * How long the reachability probe took, in milliseconds. Null before a run.
   *
   * Kept because the *shape* of a failure is itself evidence: a refusal comes
   * back in milliseconds, while a firewall silently discarding packets takes
   * seconds to give up. See {@link timingHint}.
   */
  ms: number | null;
}

/** What the user says the browser showed them in the new tab. */
export type ReportedOutcome =
  | 'loaded'
  /**
   * A Cloudflare "verify you are human" interstitial, or any equivalent bot
   * check. Deliberately its own outcome rather than a flavour of `loaded`:
   * the host is reachable and answering, so the *network* is exonerated, but
   * the connector still cannot work and will keep breaking after it appears to
   * be fixed. Neither "it loaded" nor "I was blocked" describes that.
   */
  | 'bot-check'
  | 'block-page'
  | 'cert-warning'
  | 'dns-error'
  | 'timed-out'
  | 'other';

export interface ReportedOption {
  value: ReportedOutcome;
  label: string;
}

const REPORTED_OPTION_KEYS: readonly { value: ReportedOutcome; key: string }[] = [
  { value: 'loaded', key: 'settings.connections.doctor.reported.loaded' },
  { value: 'bot-check', key: 'settings.connections.doctor.reported.botCheck' },
  { value: 'block-page', key: 'settings.connections.doctor.reported.blockPage' },
  { value: 'cert-warning', key: 'settings.connections.doctor.reported.certWarning' },
  { value: 'dns-error', key: 'settings.connections.doctor.reported.dnsError' },
  { value: 'timed-out', key: 'settings.connections.doctor.reported.timedOut' },
  { value: 'other', key: 'settings.connections.doctor.reported.other' },
];

// i18n settings.connections.doctor.reported.loaded: The site loaded normally
// i18n settings.connections.doctor.reported.botCheck: A "verify you are human" or CAPTCHA check
// i18n settings.connections.doctor.reported.blockPage: A block page from my network or workplace
// i18n settings.connections.doctor.reported.certWarning: A certificate or security warning
// i18n settings.connections.doctor.reported.dnsError: The browser couldn't find the server
// i18n settings.connections.doctor.reported.timedOut: It spun and then gave up
// i18n settings.connections.doctor.reported.other: Something else

/**
 * The self-report choices, worded as what a person actually sees rather than
 * as network terminology — nobody reads `ERR_NAME_NOT_RESOLVED` and thinks
 * "DNS failure".
 */
export function reportedOptions(translate: Translate): readonly ReportedOption[] {
  return REPORTED_OPTION_KEYS.map(({ value, key }) => ({ value, label: translate(key) }));
}

/**
 * Combine the two halves into one sentence.
 *
 * This is the only place in the doctor that names a *likely cause*, and it can
 * only do so because the pairing carries information neither half has alone:
 * the classic result is a JS failure against a page that loads perfectly, which
 * rules the network out and points at CORS or an extension. Every string below
 * hedges, because none of this is provable from a web page.
 */
export function interpret(
  verdict: ProbeVerdict,
  reported: ReportedOutcome,
  translate: Translate,
): string {
  const jsWorked = verdict === 'reachable';
  switch (reported) {
    case 'loaded':
      return translate(
        jsWorked
          ? 'settings.connections.doctor.interpret.loaded.worked'
          : 'settings.connections.doctor.interpret.loaded.jsFailed',
      );
    case 'bot-check':
      return translate(
        jsWorked
          ? 'settings.connections.doctor.interpret.botCheck.worked'
          : 'settings.connections.doctor.interpret.botCheck.jsFailed',
      );
    case 'block-page':
      return translate('settings.connections.doctor.interpret.blockPage');
    case 'cert-warning':
      return translate('settings.connections.doctor.interpret.certWarning');
    case 'dns-error':
      return translate('settings.connections.doctor.interpret.dnsError');
    case 'timed-out':
      return translate('settings.connections.doctor.interpret.timedOut');
    case 'other':
      return translate(
        jsWorked
          ? 'settings.connections.doctor.interpret.other.worked'
          : 'settings.connections.doctor.interpret.other.jsFailed',
      );
  }
}

// i18n settings.connections.doctor.interpret.loaded.worked: Both worked. This host is fine on this network.
// i18n settings.connections.doctor.interpret.loaded.jsFailed: The page loads but the background request does not. That points at CORS, a browser extension or an ad blocker rather than a network block — the host itself is reachable from here.
// i18n settings.connections.doctor.interpret.botCheck.worked: The service is putting a bot check in front of its website, but the background request still went through — so this is about their front door, not about your connection. Nothing to do.
// i18n settings.connections.doctor.interpret.botCheck.jsFailed: Good news and bad news: your network is fine — the host answered, it just refused to trust the visitor. A bot check cannot be passed by a background request, because there is nobody there to click it, so the connector will keep failing even after you clear the challenge in that tab. This is the service deciding it does not want browser traffic it cannot identify. A CORS proxy sometimes gets past it, and often gets the same check pointed at the proxy instead.
// i18n settings.connections.doctor.interpret.blockPage: Your network or workplace is filtering this host on purpose. Nothing in the app can work around that; it needs to be allowed by whoever runs the network.
// i18n settings.connections.doctor.interpret.certWarning: Something is intercepting the connection — usually corporate TLS inspection, sometimes a captive portal. Background requests fail even when you can click through the warning, because scripts get no such choice.
// i18n settings.connections.doctor.interpret.dnsError: The name does not resolve here. That is typically DNS-level filtering, though it also looks like this when a host has genuinely gone away.
// i18n settings.connections.doctor.interpret.timedOut: The connection is being dropped rather than refused, which usually means a firewall is discarding the traffic silently. A slow or overloaded host looks the same from here.
// i18n settings.connections.doctor.interpret.other.worked: The background request succeeded, so the host is reachable — whatever the tab showed is about that page, not about connectivity.
// i18n settings.connections.doctor.interpret.other.jsFailed: The background request failed too. Worth a second run: if the control row at the bottom also failed, the problem is the whole network rather than this host.

/**
 * What the *duration* of a failure suggests, for the cases in between.
 *
 * How long a request takes to fail is one of the few extra signals a browser
 * still gets, because the timing is a property of the connection attempt rather
 * than of the response, and so escapes the cross-origin blackout. The shapes
 * are genuinely distinguishable:
 *
 * - **Instant failure (under ~20ms)**: nothing was ever sent over the network.
 *   A DNS answer already cached as NXDOMAIN, or — most often on a managed
 *   machine — an extension or policy cancelling the request before it leaves
 *   the browser.
 * - **Roughly one round trip (~20ms to 1.5s)**: it reached something, which
 *   refused it. A host declining browser traffic and a filtering proxy that
 *   answers rather than drops both look like this.
 * - **Slow failure short of the timeout**: something along the path deliberated
 *   before giving up, which is more typical of a filter than of a dead host.
 * - **Ran to the timeout**: nothing answered at all. Silent packet discard,
 *   which is what most corporate firewalls do to a host on a blocklist.
 *
 * The cutoffs are measured rather than guessed — real refusals from nearby
 * hosts came back in 50-350ms, so an earlier 100ms "this must be local"
 * threshold was misreading ordinary refusals as extension blocks.
 *
 * Returns null when the timing adds nothing to what the verdict already says —
 * a hint on every row would be noise, and noise is how a diagnostic stops being
 * read.
 */
export function timingHint(result: ProbeResult, translate: Translate): string | null {
  const { verdict, ms } = result;
  if (ms === null) {
    return null;
  }
  if (verdict === 'timeout') {
    return translate('settings.connections.doctor.timing.timedOut');
  }
  if (verdict !== 'failed') {
    // A slow success is worth flagging: it works, but it is the kind of slow
    // that makes a feature feel broken, and AllOrigins is exactly this.
    return ms >= 5000
      ? translate('settings.connections.doctor.timing.slow', { ms: formatMs(ms) })
      : null;
  }
  // Thresholds measured against real hosts rather than guessed: a genuine
  // round trip to a nearby server lands around 50-350ms, so the earlier
  // "instant means local" cutoff of 100ms was calling ordinary refusals
  // extension blocks. Only single-digit milliseconds is fast enough to prove
  // nothing went out on the wire.
  if (ms < 20) {
    return translate('settings.connections.doctor.timing.instant', { ms: formatMs(ms) });
  }
  if (ms < 1500) {
    return translate('settings.connections.doctor.timing.roundTrip', { ms: formatMs(ms) });
  }
  return translate('settings.connections.doctor.timing.slowFailure', { ms: formatMs(ms) });
}

// i18n settings.connections.doctor.timing.timedOut: Nothing answered before the deadline. Traffic to this host is most likely being discarded silently rather than refused — the usual signature of a firewall blocklist.
// i18n settings.connections.doctor.timing.slow: Reachable, but slow — {{ms}}. Features using this host will feel sluggish even though nothing is blocked.
// i18n settings.connections.doctor.timing.instant: Failed instantly ({{ms}}) — too fast for anything to have gone out over the network. That points at something inside the browser: an extension, an ad blocker, or a DNS failure already cached.
// i18n settings.connections.doctor.timing.roundTrip: Failed after {{ms}}, which is about one round trip — so it reached something that refused it, rather than being ignored. A host declining browser traffic looks like this, as does a filter that answers rather than drops.
// i18n settings.connections.doctor.timing.slowFailure: Failed after {{ms}}, without running out the clock. Something along the path took its time before giving up, which is more typical of a filtering proxy than of a host that is simply down.

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/**
 * The single question a reader actually has about a row: **can I use this?**
 *
 * Added because the page had three independently-coloured signals and no
 * overall one, so a host that works perfectly *through a configured proxy* read
 * as amber (CORS blocked) next to green (proxy works) — two true statements
 * that together scan as "something is wrong here", when the answer is simply
 * yes. Amber next to green is a question; the reader has to stop and work out
 * which half wins.
 *
 * The rule is that **the outcome is about the destination, not the journey**.
 * How the bytes get there — directly, or via a relay — is implementation
 * detail the row can still explain underneath. If they arrive, it is `usable`.
 *
 * - `usable` — the app can talk to this host today. Directly readable, or
 *   readable through the configured proxy; both are working setups.
 * - `needs-setup` — reachable, unreadable, and fixable by the user. No proxy
 *   configured, or one that has no route here. Amber: nothing is broken, but
 *   something must be done.
 * - `unusable` — reachable but nothing can read it (the proxy tried and the
 *   target refused), or not reachable at all. Red.
 * - `untested` — idle or in flight.
 */
export type RowOutcome = 'untested' | 'usable' | 'needs-setup' | 'unusable';

export function rowOutcome(result: ProbeResult): RowOutcome {
  if (result.verdict === 'idle' || result.verdict === 'checking') {
    return 'untested';
  }
  if (result.verdict !== 'reachable') {
    // Not reachable *directly* — but the proxy leg now runs even here, and if it
    // got through then the connector works. Reported as unusable, this was the
    // page's most misleading answer: api.short.io was called "blocked or
    // unreachable" while shortening links through the proxy worked fine.
    return result.proxy === 'works' ? 'usable' : 'unusable';
  }
  // Reachable. Whether it is *usable* is now entirely about readability.
  if (result.cors === 'readable') {
    return 'usable';
  }
  switch (result.proxy) {
    case 'works':
      // The case this whole type exists for. Reached through a relay is still
      // reached: the feature works, so the row is green.
      return 'usable';
    case 'none':
    case 'not-routable':
      // Fixable from here — configure a proxy, or one that reaches this host.
      return 'needs-setup';
    case 'target-refused':
    case 'proxy-unreachable':
      return 'unusable';
    default:
      // Reachable but unreadable with no proxy verdict at all: nothing has
      // established a way in, so it cannot be called usable.
      return 'needs-setup';
  }
}

/**
 * The headline for a row, replacing the bare reachability verdict.
 *
 * "Reachable" was answering a question nobody asked. What a reader wants to
 * know is whether the connector will work, and on a proxied host the honest
 * answer is yes — with the route named, because "works via the proxy" and
 * "works directly" have different failure modes later.
 */
export function outcomeLabel(
  outcome: RowOutcome,
  result: ProbeResult,
  translate: Translate,
): string {
  switch (outcome) {
    case 'untested':
      return translate(
        result.verdict === 'checking'
          ? 'settings.connections.doctor.outcome.checking'
          : 'settings.connections.doctor.outcome.notChecked',
      );
    case 'usable':
      // `cors: 'readable'` only happens on a host reached directly, so anything
      // else that got here did so through the relay — including a host the
      // browser could not reach at all.
      return translate(
        result.cors === 'readable'
          ? 'settings.connections.doctor.outcome.working'
          : 'settings.connections.doctor.outcome.workingViaProxy',
      );
    case 'needs-setup':
      return translate('settings.connections.doctor.outcome.needsProxy');
    case 'unusable':
      return translate(
        result.verdict === 'timeout'
          ? 'settings.connections.doctor.outcome.timedOut'
          : result.verdict === 'failed'
            ? 'settings.connections.doctor.outcome.blockedOrUnreachable'
            : 'settings.connections.doctor.outcome.notUsable',
      );
  }
}

// i18n settings.connections.doctor.outcome.checking: Checking…
// i18n settings.connections.doctor.outcome.notChecked: Not checked
// i18n settings.connections.doctor.outcome.working: Working
// i18n settings.connections.doctor.outcome.workingViaProxy: Working (via proxy)
// i18n settings.connections.doctor.outcome.needsProxy: Needs a proxy
// i18n settings.connections.doctor.outcome.timedOut: Timed out
// i18n settings.connections.doctor.outcome.blockedOrUnreachable: Blocked or unreachable
// i18n settings.connections.doctor.outcome.notUsable: Not usable

/**
 * What the CORS leg means, for a host already proven reachable.
 *
 * This is the answer to "which domains do I need to whitelist?" — and the
 * answer is that whitelisting is the wrong tool. A blocked reply is the *host*
 * choosing not to send `Access-Control-Allow-Origin`, so nothing installed on
 * this side changes their decision. An extension that strips CORS locally makes
 * this one page work while disabling a protection that applies to every site in
 * the browser, which is a genuinely bad trade for reading a timeline.
 *
 * Returns null when the host was never reached, where a CORS verdict would be
 * meaningless and stating one would invite exactly the wrong fix.
 */
export function corsHint(result: ProbeResult, translate: Translate): string | null {
  if (result.verdict !== 'reachable') {
    return null;
  }
  if (result.cors === 'readable') {
    return translate('settings.connections.doctor.cors.readable');
  }
  if (result.cors === 'blocked') {
    // When the proxy already got through, this leg is no longer a finding — it
    // is the reason the row says "via proxy". Stating the full "no ACAO came
    // back" diagnosis there made a solved problem read like an open one.
    if (result.proxy === 'works') {
      return translate('settings.connections.doctor.cors.blockedViaProxy');
    }
    return translate('settings.connections.doctor.cors.blocked');
  }
  return null;
}

// i18n settings.connections.doctor.cors.readable: This app can read its replies directly — no proxy needed.
// i18n settings.connections.doctor.cors.blockedViaProxy: This host does not answer browsers directly, which is why the request goes through your proxy.
// i18n settings.connections.doctor.cors.blocked: Reachable, but this one URL did not let the app read its reply — no `Access-Control-Allow-Origin` came back. That is the host's policy, not a fault on your network, and no browser setting can grant it. Mawkingbird routes these through a CORS proxy instead. One caveat worth knowing: this tests a single URL, and an API can answer differently per path — if the connector itself works, believe the connector, not this row.

/**
 * What the proxied attempt means — including the case where everything works
 * and the connector still doesn't.
 *
 * That last one is the reason this leg exists. "Could not reach the service" is
 * what a connector reports for a network block, a proxy problem, a missing
 * consent and a rejected API key alike, and the user has no way to tell which.
 * Proving the bytes can make the round trip eliminates the first three at once
 * and says so, which turns an unbounded problem into "check your key".
 *
 * @param proxyLabel the configured proxy's display name, so the copy can name it.
 */
export function proxyHint(
  result: ProbeResult,
  proxyLabel: string | null,
  translate: Translate,
): string | null {
  const via = proxyLabel ?? translate('settings.connections.doctor.yourCorsProxy');
  const took = result.proxyMs !== null ? ` (${formatMs(result.proxyMs)})` : '';
  switch (result.proxy) {
    case 'works':
      // Two different good-news stories, and conflating them misleads. When the
      // direct leg never arrived, "everything between you and this service is
      // fine" would be false — the direct path is genuinely broken here, and the
      // proxy is the reason the feature works anyway.
      if (result.verdict !== 'reachable') {
        return translate('settings.connections.doctor.proxy.worksIndirect', { via, took });
      }
      return translate('settings.connections.doctor.proxy.worksDirect', { via, took });
    case 'target-refused':
      return translate('settings.connections.doctor.proxy.targetRefused', { via });
    case 'proxy-unreachable':
      return translate('settings.connections.doctor.proxy.proxyUnreachable', { via });
    case 'none':
      return translate('settings.connections.doctor.proxy.none');
    case 'not-routable':
      return translate('settings.connections.doctor.proxy.notRoutable', { via });
    case 'not-needed':
    case 'unknown':
      return null;
  }
}

// i18n settings.connections.doctor.yourCorsProxy: your CORS proxy
// i18n settings.connections.doctor.proxy.worksIndirect: Your browser could not reach this host directly, but {{via}} did{{took}}. The connector will work — every request to this service goes through the proxy, so it depends on the proxy staying available.
// i18n settings.connections.doctor.proxy.worksDirect: Confirmed working through {{via}}{{took}}. Everything between you and this service is fine — so if the feature still fails, the cause is past connectivity: an API key, a plan or credit limit, or a consent not yet given.
// i18n settings.connections.doctor.proxy.targetRefused: {{via}} is reachable and answered, but this service refused the request coming from it. Proxies run in datacentres, and plenty of services block those ranges outright while allowing home connections — so the proxy is healthy and still cannot help here. A different proxy, or one you run yourself, may work where this one does not.
// i18n settings.connections.doctor.proxy.proxyUnreachable: {{via}} could not be reached at all, so this host could not be tested through it. Fix the proxy first — the row above is about the proxy, not about this service.
// i18n settings.connections.doctor.proxy.none: This host needs a CORS proxy and none is configured, so it cannot work yet. Setting one up is what makes it reachable.
// i18n settings.connections.doctor.proxy.notRoutable: {{via}} only reaches the specific services it was built for, and this is not one of them — it was not tried. That is deliberate: a proxy sees everything it relays, so the ones carrying your accounts and keys are kept off it. Choose a general-purpose proxy if you need this host proxied.
