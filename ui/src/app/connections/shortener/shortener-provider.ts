import { Observable } from 'rxjs';

/**
 * The browser-facing contract for one URL-shortening service.
 *
 * ## Why this looks different from the spec it came from
 *
 * `spec/UI/links.md` specifies these providers for an app with a backend:
 * Angular talks to your server, your server holds the API key and talks to the
 * shortener. Every credential rule in its section 2 follows from that shape.
 *
 * Mawkingbird has no backend. It is a static bundle on GitHub Pages, and the
 * whole app is built on that constraint — every connector already stores its
 * secret in this origin's localStorage under the retention policy in
 * `credential-lifetime.ts`, because there is nowhere else for it to go. So the
 * spec's "credentials must never be delivered to the Angular application" is not
 * a rule this app can follow; it is a description of a different application.
 *
 * What survives from that section, and is implemented here or nearby:
 *
 * - Destination URLs are validated, and only `http:`/`https:` are accepted
 *   ({@link assertValidDestination}).
 * - Provider errors are normalized rather than shown raw, so an error body that
 *   quotes back an account id or a key fragment does not reach the UI
 *   (`shortener-errors.ts`).
 * - The provider's canonical id and full response are persisted, never the short
 *   URL as a stand-in identifier — see {@link ShortLink.providerId} and
 *   {@link ShortLink.raw}.
 * - Retries happen only for `429` and transient `5xx`, and never for creates.
 *
 * What cannot survive is the guarantee that the key is unreachable from the
 * browser. The user is told this plainly on the connector page instead. A key
 * that can create and delete short links is a real credential, and the honest
 * framing is "this is stored in your browser, scope the key accordingly", not a
 * security theatre that pretends otherwise.
 *
 * ## Capabilities, not simulation
 *
 * The spec is emphatic that adapters must omit what a provider does not support
 * rather than fake it. {@link ShortenerCapabilities} is how the UI knows: the
 * create form renders only the fields the active provider actually honours, so
 * nobody types a description into a service that will silently drop it.
 */

/** Every provider implemented here. Also the discriminant on {@link ShortLink}. */
export type ShortenerId = 'dub' | 'shortio' | 'tly' | 'tinyurl' | 'rebrandly' | 'isgd';

/**
 * What a short link is *for* — the distinction this feature keeps getting wrong.
 *
 * Two things in this app produce a short link, they use the same services, and
 * they mean entirely different things:
 *
 * - `shortened` — the ordinary case. Someone else's real page is the
 *   destination, and the short link is a convenience wrapper: shorter to type,
 *   countable, disposable. Editing it re-points it at a different page. This is
 *   what the Links page and the Invites toggle create.
 *
 * - `message` — the Pastes case, created by {@link TinyurlProvider} (the *paste*
 *   provider, not the shortener one). Here the redirect target is not a
 *   destination at all: it is a `mawkingbird.com/message/message-status.…` URL
 *   carrying the post body. Nobody visits it as a page; the short link
 *   *is* the message. There is nothing meaningful to "re-point" it at, and
 *   showing its destination in a UI would show the user a wall of
 *   percent-encoded text.
 *
 * Both end up in the same history because from the user's side both are "a short
 * link I made". Everything else about them differs, so the kind is recorded
 * rather than inferred — inferring it from the URL shape worked right up until
 * someone legitimately shortened a link to the message reader.
 */
export type LinkKind = 'shortened' | 'message';

export interface CreateLinkInput {
  destinationUrl: string;
  slug?: string;
  domain?: string;
  title?: string;
  description?: string;
  tags?: string[];
  expiresAt?: string;
  password?: string;
  externalId?: string;
}

export interface UpdateLinkInput {
  destinationUrl?: string;
  slug?: string;
  title?: string;
  description?: string;
  tags?: string[];
  /** `null` clears an expiry the link already has. */
  expiresAt?: string | null;
  /** `null` removes password protection. */
  password?: string | null;
  archived?: boolean;
}

/**
 * One short link, normalized across providers.
 *
 * `providerId` and `shortUrl` are deliberately separate fields even where a
 * provider's identifier looks like it could be derived from the URL. The spec
 * calls this out as its main integration trap and it is a real one: T.LY
 * genuinely identifies links by their complete short URL, Dub by an opaque id,
 * Short.io by a numeric-ish id that has nothing to do with the path. Code that
 * assumes any of those is the others breaks on the other two.
 */
export interface ShortLink {
  provider: ShortenerId;
  /** The provider's canonical identifier, in whatever form it hands back. */
  providerId: string;
  shortUrl: string;
  destinationUrl: string;
  slug?: string;
  domain?: string;
  title?: string;
  description?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  archived?: boolean;
  /** The provider's own response, kept whole. Never rendered; used for support. */
  raw: unknown;
}

export interface LinkQuery {
  search?: string;
  destinationUrl?: string;
  domain?: string;
  tag?: string;
  /** One-based, for providers that page by number. */
  page?: number;
  limit?: number;
  /** For providers that page by marker instead of by number. */
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  /** Pass back as {@link LinkQuery.cursor} for the next page, or null at the end. */
  nextCursor: string | null;
}

/**
 * What a provider can actually do, so the UI never offers what will be dropped.
 *
 * Every flag here is answered from the provider's documented behaviour, not from
 * optimism. When a capability is plan-dependent (Rebrandly expiry, T.LY custom
 * domains) the flag reflects the *baseline* account, because a disabled control
 * is a smaller disappointment than one that fails at submit.
 */
export interface ShortenerCapabilities {
  customSlug: boolean;
  customDomain: boolean;
  title: boolean;
  description: boolean;
  tags: boolean;
  expiry: boolean;
  password: boolean;
  archive: boolean;
  /** Whether {@link ShortenerProvider.update} does anything at all. */
  update: boolean;
  delete: boolean;
  /** Whether {@link LinkQuery.search} is honoured server-side. */
  textSearch: boolean;
  /** Whether the provider can list links it holds, as opposed to local history only. */
  list: boolean;
}

/** One shortening service, normalized. All methods may error — see `shortener-errors.ts`. */
export interface ShortenerProvider {
  readonly id: ShortenerId;
  /** Display name, as the service spells it. */
  readonly label: string;

  /**
   * What this provider can do *right now*.
   *
   * A method rather than a property because two providers change shape at
   * runtime. TinyURL creates links with no account at all, and gains list, edit
   * and delete only once an API token is present; is.gd never has an account and
   * never gains them. A fixed property would have to describe one of those
   * states and lie about the other, and the create form renders straight off
   * this — so a stale answer means offering a field the service will drop.
   */
  capabilities(): ShortenerCapabilities;

  createLink(input: CreateLinkInput): Observable<ShortLink>;
  updateLink(id: string, changes: UpdateLinkInput): Observable<ShortLink>;
  deleteLink(id: string): Observable<void>;
  getLink(id: string): Observable<ShortLink>;
  listLinks(query?: LinkQuery): Observable<Page<ShortLink>>;

  /**
   * A cheap authenticated call used to prove a key works before the connector is
   * marked connected.
   *
   * A dedicated method rather than "just call listLinks" because the point is to
   * be the smallest possible request: it runs on every connect attempt, and on
   * the retry after the user consents to a proxy.
   */
  verify(): Observable<void>;
}

/**
 * Reject a destination this app should not shorten.
 *
 * Kept from the spec's section 2 because it is the part that still applies
 * without a backend: scheme restriction is about what the *user* can be talked
 * into shortening, not about where the code runs. A `javascript:` destination
 * behind an innocuous short URL is the classic version of this.
 *
 * SSRF-flavoured checks (localhost, private ranges, metadata endpoints) are
 * deliberately *not* here. They exist to stop a server being tricked into
 * fetching its own network; nothing in this app fetches the destination, and the
 * shortener will apply its own policy. Blocking `http://localhost:3000` would
 * only stop a developer shortening their own dev server, which is a thing people
 * legitimately do.
 *
 * @throws Error when the destination is unusable.
 */
export function assertValidDestination(destinationUrl: string): void {
  let url: URL;
  try {
    url = new URL(destinationUrl);
  } catch {
    throw new Error('Enter a complete URL, including https://');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Only http:// and https:// links can be shortened, not ${url.protocol}`);
  }
}
