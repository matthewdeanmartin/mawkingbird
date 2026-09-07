import { ShortenerId } from './shortener-provider';

/**
 * The catalog of URL shorteners, as inert data.
 *
 * Same discipline as `cors-proxy-catalog.ts` and `connection-catalog.ts`: enough
 * to choose a service and to be honest about what it costs, nothing about how
 * the choice is stored or used. Adding a fourth provider should be one entry
 * here, one adapter, and one line in the registry.
 *
 * ## Why every entry carries a privacy policy link
 *
 * Because of what happens when an API key has to travel through a CORS proxy.
 * The user is asked to accept a specific, concrete risk — a third party will see
 * a key that can create and delete links in their account — and that is not a
 * question anybody can answer without knowing *who* the third party is. The
 * consent dialog names the proxy operator and links these pages so the decision
 * is an informed one rather than a reflex click. The same fields serve the
 * connector page, where knowing what you are signing up for is just as useful.
 */

/** How a provider expects its key on the wire. */
export interface ShortenerAuth {
  /** The header name. */
  header: string;
  /**
   * Text placed before the key, if any.
   *
   * Short.io is the reason this is a field rather than an assumption: it wants
   * the raw secret key in `Authorization` with no `Bearer` prefix, which every
   * HTTP client in the world will try to add for you.
   */
  prefix: string;
}

/**
 * Whether a service needs an account, and what one buys.
 *
 * - `required` — no key, no service. Dub, Short.io, T.LY, Rebrandly.
 * - `optional` — works anonymously, and a key unlocks more. TinyURL creates
 *   links with no account at all; a token adds listing, editing and deleting.
 * - `none` — no accounts exist. is.gd shortens for anyone and offers nothing
 *   else, ever.
 *
 * This drives more than a form field. A key-less provider has no credential to
 * leak, so the CORS-proxy consent dialog discusses only disclosure of the
 * destination URL — see {@link ShortenerProxyConsent}.
 */
export type ShortenerKeyPolicy = 'required' | 'optional' | 'none';

export interface ShortenerCatalogEntry {
  id: ShortenerId;
  /** Display name, as the service spells it. */
  label: string;
  emoji: string;
  /** One sentence: what this service is, for someone who has never used it. */
  pitch: string;
  auth: ShortenerAuth;
  /** Whether an account is needed, optional, or does not exist. */
  keyPolicy: ShortenerKeyPolicy;
  /** Where the user gets a key. Deep-linked, because "go find it" is hostile. */
  keyUrl: string;
  /** What the key is called on the provider's own site, so the copy matches. */
  keyLabel: string;
  /** For `optional` keys: what adding one unlocks. Shown next to the field. */
  keyBenefit?: string;
  /** The service's front page. */
  homepage: string;
  /** The privacy policy, for the credential-consent dialog. */
  privacyUrl: string;
  /** What the free tier actually gives you. Shown as-is, no editorialising. */
  freeTier: string;
  /**
   * Whether a custom short domain is required for the API to work at all.
   *
   * Short.io's create endpoint needs a domain: there is no shared default one,
   * so a key alone is not a working configuration. Dub and T.LY both hand you a
   * default domain, and the field is optional there.
   */
  domainRequired: boolean;
  /** Copy for the domain field, which means something different per provider. */
  domainHint: string;
  /**
   * Whether this service answers browsers directly, so a `status: 0` from it is
   * *not* evidence that a CORS proxy would help.
   *
   * Exists because "the request failed opaquely" is a much weaker signal than
   * the transport used to treat it as. The browser reports CORS, DNS failure,
   * offline, an ad-blocker and a cancelled request identically, and the app's
   * response was to assume CORS and offer to relay through a proxy. For a host
   * that genuinely refuses browsers that is right. For one that does not, it
   * routes a user's traffic through a third party to work around a problem the
   * proxy cannot fix.
   *
   * is.gd is the case that proved it. Measured 2026-08-14 from a browser origin:
   * a successful create answers `Access-Control-Allow-Origin: *`, and so does
   * every documented JSON error (`{"errorcode": 1, ...}`). Only its undocumented
   * plain-text failure — `Error, database insert failed`, emitted while its
   * database was broken — omits the header. So the one time a proxy got offered
   * was the one time the service was down, where relaying changes nothing.
   *
   * This is a general trap rather than an is.gd quirk: CORS headers routinely
   * vary by endpoint and by status code within a single API, and a non-200 path
   * frequently drops them. A service being "CORS-open" is a statement about the
   * responses it means to send, not a guarantee about every byte it can emit.
   */
  corsOpen?: boolean;
}

/**
 * Every provider, in the order they appear.
 *
 * The two that need no account are first, because "works immediately" beats
 * every other property for someone opening this page for the first time. After
 * them, the account-based services in order of how conventional their API is:
 * Dub is ordinary REST, Short.io is REST with quirks, T.LY identifies links by
 * their full short URL and takes a body on DELETE, Rebrandly wants its key in a
 * bespoke header and scopes everything to a workspace.
 *
 * **Self-hosted shorteners are deliberately absent.** YOURLS was specified and
 * is not here. Its stock API cannot update or delete, so it would ship as the
 * one provider where half the Links page does nothing; and being self-hosted, it
 * cannot be tested against a real instance from here. An integration nobody can
 * verify, serving an audience that would have to run their own shortener to
 * benefit, is worse than no integration.
 */
export const SHORTENER_CATALOG: readonly ShortenerCatalogEntry[] = [
  {
    id: 'tinyurl',
    label: 'TinyURL',
    emoji: '🪄',
    pitch: 'The classic shortener. Works with no account at all; a token unlocks managing links.',
    auth: { header: 'Authorization', prefix: 'Bearer ' },
    // The only `optional` entry, and the reason that policy exists.
    keyPolicy: 'optional',
    keyUrl: 'https://tinyurl.com/app/settings/api',
    keyLabel: 'API token',
    keyBenefit:
      'Without a token TinyURL can only create links. Add one to list, edit and delete them.',
    homepage: 'https://tinyurl.com/',
    privacyUrl: 'https://tinyurl.com/app/privacy-policy',
    freeTier: 'Unlimited links with no account. Links are permanent and cannot be deleted.',
    domainRequired: false,
    domainHint: 'Optional, and only with a token on a paid plan. Leave blank for tinyurl.com.',
    // Measured 2026-08-14: `api.tinyurl.com` answers a preflight with an ACAO
    // and `Access-Control-Allow-Headers` naming `Authorization`, and the
    // anonymous `tinyurl.com/api-create.php` path sends an ACAO too. It needs no
    // relay, and the Mawkingbird proxy no longer carries it.
    corsOpen: true,
  },
  {
    id: 'isgd',
    label: 'is.gd',
    emoji: '🧷',
    pitch: 'A minimal, ad-free shortener with no accounts and nothing to sign up for.',
    // Nothing to authenticate with; the header is never sent.
    auth: { header: '', prefix: '' },
    keyPolicy: 'none',
    keyUrl: '',
    keyLabel: '',
    homepage: 'https://is.gd/',
    privacyUrl: 'https://is.gd/privacy.php',
    freeTier:
      'Free and unlimited, but anonymous: links cannot be listed, edited or deleted afterwards.',
    domainRequired: false,
    domainHint: '',
    // Verified from a browser origin: `ACAO: *` on both success and its
    // documented JSON errors. The proxy has no route here and needs none.
    corsOpen: true,
  },
  {
    id: 'dub',
    label: 'Dub',
    emoji: '🔗',
    pitch: 'An open-source link platform with analytics. The most conventional API of the three.',
    auth: { header: 'Authorization', prefix: 'Bearer ' },
    keyPolicy: 'required',
    keyUrl: 'https://app.dub.co/settings/tokens',
    keyLabel: 'API key',
    homepage: 'https://dub.co/',
    privacyUrl: 'https://dub.co/privacy',
    freeTier: '25 links a month on the free workspace, with a dub.sh short domain.',
    domainRequired: false,
    domainHint: 'Optional. A custom domain in your Dub workspace; leave blank for dub.sh.',
  },
  {
    id: 'shortio',
    label: 'Short.io',
    emoji: '✂️',
    pitch: 'Branded short links on your own domain, with a long-standing API.',
    auth: { header: 'Authorization', prefix: '' },
    keyPolicy: 'required',
    keyUrl: 'https://app.short.io/settings/integrations/api-key',
    keyLabel: 'secret API key',
    homepage: 'https://short.io/',
    privacyUrl: 'https://short.io/privacy-policy/',
    freeTier: '1,000 links a month, but you must bring your own domain.',
    // No shared default domain exists: /links rejects a create without one.
    domainRequired: true,
    domainHint: 'Required. The short domain from your Short.io account, e.g. go.example.com.',
  },
  {
    id: 'tly',
    label: 'T.LY',
    emoji: '⚡',
    pitch: 'A simple hosted shortener with tags, QR codes and statistics.',
    auth: { header: 'Authorization', prefix: 'Bearer ' },
    keyPolicy: 'required',
    keyUrl: 'https://t.ly/settings#/api',
    keyLabel: 'API token',
    homepage: 'https://t.ly/',
    privacyUrl: 'https://t.ly/privacy',
    freeTier: '10 links a month on the free plan, on the t.ly domain.',
    domainRequired: false,
    domainHint: 'Optional, and only on paid plans. Leave blank for t.ly.',
    // Measured 2026-08-14: preflight 204 with an ACAO and
    // `access-control-allow-headers: authorization`. Browser-reachable with its
    // key, so it needs no relay and no longer has a proxy route.
    corsOpen: true,
  },
  {
    id: 'rebrandly',
    label: 'Rebrandly',
    emoji: '🏷️',
    pitch: 'Branded links on your own domain, organised into workspaces.',
    // Not `Authorization` at all: Rebrandly reads a bespoke `apikey` header.
    auth: { header: 'apikey', prefix: '' },
    keyPolicy: 'required',
    keyUrl: 'https://app.rebrandly.com/account/api-keys',
    keyLabel: 'API key',
    homepage: 'https://www.rebrandly.com/',
    privacyUrl: 'https://www.rebrandly.com/privacy',
    freeTier: '500 branded links a month, with one custom domain.',
    // A workspace has no guaranteed default domain, but rebrand.ly is available
    // to free accounts, so this stays optional rather than blocking setup.
    domainRequired: false,
    domainHint: 'Optional. A verified domain on your account; leave blank for rebrand.ly.',
  },
];

export function shortenerEntry(
  id: ShortenerId | null | undefined,
): ShortenerCatalogEntry | undefined {
  return SHORTENER_CATALOG.find((entry) => entry.id === id);
}

/**
 * The API hosts of providers this app holds a key for.
 *
 * Exported because `cors-proxy.ts` needs them in its credential-host blocklist:
 * the ordinary proxy path must refuse them exactly as it refuses OpenRouter and
 * GitHub, leaving only the explicit, consented path.
 *
 * **is.gd is deliberately not here, and TinyURL is.** The blocklist is about
 * credentials, not consent. is.gd has no account credential, so after the user
 * approves disclosing the destination URL it can use the ordinary proxy path.
 * TinyURL is listed because it may carry a token and then needs the credentialed
 * path as well as consent.
 */
export const SHORTENER_API_HOSTS: readonly string[] = [
  'api.dub.co',
  'api.short.io',
  'api.t.ly',
  'api.rebrandly.com',
  'api.tinyurl.com',
];
