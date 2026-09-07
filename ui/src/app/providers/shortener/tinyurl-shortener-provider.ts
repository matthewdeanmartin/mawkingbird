import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { externalFetch } from '../external-fetch';
import { toLinkProviderError, unsupported } from './shortener-errors';
import {
  CreateLinkInput,
  LinkQuery,
  Page,
  ShortenerCapabilities,
  ShortenerProvider,
  ShortLink,
  UpdateLinkInput,
  assertValidDestination,
} from './shortener-provider';
import { ShortenerSettings } from './shortener-settings';
import { ShortenerTransport } from './shortener-transport';

/**
 * TinyURL, as a *link shortener*.
 *
 * ## This is not the TinyURL you are thinking of
 *
 * There is a second TinyURL provider in this codebase — `providers/paste/
 * tinyurl-provider.ts` — and the two do completely different jobs through the
 * same service. The distinction is the one thing to keep straight here:
 *
 * - **That one** encodes a *message* into the redirect target. The destination
 *   is a `mawkingbird.com/message/message-status.…` URL carrying a post body; the short link
 *   *is* the content. It belongs to the Pastes feature.
 * - **This one** shortens a destination someone actually wants to visit. The
 *   target is a real page and the short link is a wrapper around it.
 *
 * Same API, opposite intent, and they must not be merged. See {@link LinkKind},
 * which records which of the two a stored link came from so the Links page never
 * offers to "re-point" a message at a different destination.
 *
 * ## Two modes, decided by whether a token is present
 *
 * TinyURL is the only provider here whose key is optional, and the difference is
 * stark enough that {@link capabilities} has to be computed rather than declared:
 *
 * - **No token.** The legacy `api-create.php` endpoint shortens anything, for
 *   anyone, with no account. It is CORS-open (unlike is.gd's), returns the short
 *   URL as plain text, and offers nothing else — no listing, no editing, no
 *   deleting, not even a custom alias. Links made this way are permanent.
 * - **With a token.** `api.tinyurl.com/v1` becomes available: create with a
 *   custom alias, list, update and delete.
 *
 * The zero-setup mode is the reason TinyURL leads the catalog. It is the only
 * entry someone can use ten seconds after opening the page.
 */

const LEGACY_CREATE_URL = 'https://tinyurl.com/api-create.php';
const API_BASE = 'https://api.tinyurl.com';

interface TinyurlApiLink {
  domain?: string;
  alias?: string;
  tiny_url: string;
  url: string;
  created_at?: string;
  expires_at?: string | null;
  tags?: string[] | null;
}

interface TinyurlApiEnvelope<T> {
  data: T;
  code?: number;
  errors?: string[];
}

/** The short code at the end of a TinyURL, e.g. "22qwvuhy". */
function slugOf(shortUrl: string): string {
  try {
    return new URL(shortUrl).pathname.replace(/^\/|\/$/g, '');
  } catch {
    return '';
  }
}

@Injectable({ providedIn: 'root' })
export class TinyurlShortenerProvider implements ShortenerProvider {
  private http = inject(HttpClient);
  private transport = inject(ShortenerTransport);
  private settings = inject(ShortenerSettings);

  readonly id = 'tinyurl' as const;
  readonly label = 'TinyURL';

  /** Whether a token is stored, which is what decides this provider's shape. */
  private get authenticated(): boolean {
    return this.settings.hasKey(this.id);
  }

  /**
   * Capabilities depend on whether a token is present.
   *
   * Without one, everything but create is false — and that is not a limitation
   * worth hiding: the Links page renders anonymous TinyURL links as read-only
   * rows rather than offering an Edit button that could only ever fail.
   */
  capabilities(): ShortenerCapabilities {
    const withToken = this.authenticated;
    return {
      customSlug: withToken,
      customDomain: withToken,
      title: false,
      description: false,
      tags: withToken,
      expiry: withToken,
      password: false,
      archive: false,
      update: withToken,
      delete: withToken,
      textSearch: false,
      list: withToken,
    };
  }

  createLink(input: CreateLinkInput): Observable<ShortLink> {
    assertValidDestination(input.destinationUrl);
    return this.authenticated ? this.createViaApi(input) : this.createAnonymously(input);
  }

  /**
   * The no-account path: `api-create.php`, which answers with bare text.
   *
   * Goes through `HttpClient` directly rather than through
   * {@link ShortenerTransport}, because the transport exists to attach
   * credentials and negotiate the consent flow, and there is neither a
   * credential nor a JSON response here. This endpoint is CORS-open, so it needs
   * no proxy either.
   */
  private createAnonymously(input: CreateLinkInput): Observable<ShortLink> {
    // Pre-encoded rather than handed to HttpParams, whose default codec leaves
    // `@ : $ , ; + = ? /` unescaped — fine for ordinary parameters, wrong for a
    // nested URL whose own `?` and `=` would blur into ours.
    const params = new HttpParams({
      fromString: `url=${encodeURIComponent(input.destinationUrl)}`,
    });
    return this.http
      .get(LEGACY_CREATE_URL, { params, responseType: 'text', context: externalFetch() })
      .pipe(
        map((body) => {
          const shortUrl = body.trim();
          if (!/^https?:\/\/tinyurl\.com\/\S+$/i.test(shortUrl)) {
            throw new Error(
              shortUrl ||
                'TinyURL rejected the request. It may be rate-limited — try again in a minute.',
            );
          }
          return {
            provider: this.id,
            // With no account there is no server-side id; the slug is the only
            // handle that exists, and nothing can be done with it anyway.
            providerId: slugOf(shortUrl),
            shortUrl,
            destinationUrl: input.destinationUrl,
            slug: slugOf(shortUrl),
            domain: 'tinyurl.com',
            raw: { shortUrl },
          } satisfies ShortLink;
        }),
        catchError((error: unknown) => throwError(() => toLinkProviderError(error, this.id))),
      );
  }

  private createViaApi(input: CreateLinkInput): Observable<ShortLink> {
    const body: Record<string, unknown> = { url: input.destinationUrl };
    const domain = input.domain || this.settings.domain(this.id);
    if (domain) {
      body['domain'] = domain;
    }
    if (input.slug) {
      body['alias'] = input.slug;
    }
    if (input.tags?.length) {
      body['tags'] = input.tags.join(',');
    }
    if (input.expiresAt) {
      body['expires_at'] = input.expiresAt;
    }

    return this.transport
      .request<TinyurlApiEnvelope<TinyurlApiLink>>(this.id, {
        method: 'POST',
        url: `${API_BASE}/create`,
        body,
        headers: { 'Content-Type': 'application/json' },
        idempotent: false,
      })
      .pipe(map((response) => this.normalize(response.data)));
  }

  /**
   * TinyURL identifies a link by `domain/alias`, not by an opaque id, so
   * {@link ShortLink.providerId} holds `tinyurl.com/abc123` for this provider.
   */
  updateLink(id: string, changes: UpdateLinkInput): Observable<ShortLink> {
    if (!this.authenticated) {
      return throwError(() =>
        unsupported(
          this.id,
          'TinyURL links made without an API token are permanent. Add a token on the Link shortener connector to manage links.',
        ),
      );
    }
    if (changes.destinationUrl) {
      assertValidDestination(changes.destinationUrl);
    }
    const { domain, alias } = splitRef(id);
    const body: Record<string, unknown> = { domain, alias };
    if (changes.destinationUrl !== undefined) {
      body['url'] = changes.destinationUrl;
    }
    if (changes.tags !== undefined) {
      body['tags'] = changes.tags?.join(',') ?? '';
    }
    if (changes.expiresAt !== undefined) {
      body['expires_at'] = changes.expiresAt;
    }

    return this.transport
      .request<TinyurlApiEnvelope<TinyurlApiLink>>(this.id, {
        method: 'PATCH',
        url: `${API_BASE}/change`,
        body,
        headers: { 'Content-Type': 'application/json' },
        idempotent: true,
      })
      .pipe(map((response) => this.normalize(response.data)));
  }

  deleteLink(id: string): Observable<void> {
    if (!this.authenticated) {
      return throwError(() =>
        unsupported(
          this.id,
          'TinyURL links made without an API token cannot be deleted — they are permanent.',
        ),
      );
    }
    const { domain, alias } = splitRef(id);
    return this.transport
      .request<unknown>(this.id, {
        method: 'DELETE',
        url: `${API_BASE}/alias/${encodeURIComponent(domain)}/${encodeURIComponent(alias)}`,
        idempotent: true,
      })
      .pipe(map(() => undefined));
  }

  getLink(id: string): Observable<ShortLink> {
    if (!this.authenticated) {
      return throwError(() =>
        unsupported(this.id, 'TinyURL needs an API token to look up a link.'),
      );
    }
    const { domain, alias } = splitRef(id);
    return this.transport
      .request<TinyurlApiEnvelope<TinyurlApiLink>>(this.id, {
        method: 'GET',
        url: `${API_BASE}/alias/${encodeURIComponent(domain)}/${encodeURIComponent(alias)}`,
        idempotent: true,
      })
      .pipe(map((response) => this.normalize(response.data)));
  }

  listLinks(query: LinkQuery = {}): Observable<Page<ShortLink>> {
    if (!this.authenticated) {
      // Not an error: an anonymous account genuinely has no server-side list.
      // The Links page falls back to local history, which is the only record
      // these links have ever had.
      return throwError(() =>
        unsupported(this.id, 'TinyURL needs an API token to list your links.'),
      );
    }
    const params = new URLSearchParams({
      page: String(query.page ?? 1),
      per_page: String(Math.min(query.limit ?? 50, 100)),
    });
    return this.transport
      .request<TinyurlApiEnvelope<TinyurlApiLink[]>>(this.id, {
        method: 'GET',
        url: `${API_BASE}/urls?${params.toString()}`,
        idempotent: true,
      })
      .pipe(
        map((response) => {
          const items = response.data ?? [];
          const page = query.page ?? 1;
          const limit = Math.min(query.limit ?? 50, 100);
          return {
            items: items.map((link) => this.normalize(link)),
            nextCursor: items.length === limit ? String(page + 1) : null,
          };
        }),
      );
  }

  /**
   * With no token there is nothing to verify — anonymous creation always works.
   *
   * Returning success rather than probing is deliberate: the connector page uses
   * `verify` to decide whether to mark a provider connected, and TinyURL without
   * a token *is* usable. Firing a real create just to prove it would litter the
   * user's account with a junk link every time they opened the page.
   */
  verify(): Observable<void> {
    if (!this.authenticated) {
      return new Observable<void>((subscriber) => {
        subscriber.next();
        subscriber.complete();
      });
    }
    return this.transport
      .request<TinyurlApiEnvelope<TinyurlApiLink[]>>(this.id, {
        method: 'GET',
        url: `${API_BASE}/urls?per_page=1`,
        idempotent: true,
      })
      .pipe(map(() => undefined));
  }

  private normalize(link: TinyurlApiLink): ShortLink {
    const domain = link.domain ?? 'tinyurl.com';
    const alias = link.alias ?? slugOf(link.tiny_url);
    return {
      provider: this.id,
      // `domain/alias` is what the update and delete endpoints address.
      providerId: `${domain}/${alias}`,
      shortUrl: link.tiny_url,
      destinationUrl: link.url,
      slug: alias,
      domain,
      tags: link.tags ?? undefined,
      createdAt: link.created_at,
      expiresAt: link.expires_at ?? undefined,
      raw: link,
    };
  }
}

/** Split a `domain/alias` reference, tolerating a bare alias from older records. */
function splitRef(ref: string): { domain: string; alias: string } {
  const slash = ref.indexOf('/');
  return slash === -1
    ? { domain: 'tinyurl.com', alias: ref }
    : { domain: ref.slice(0, slash), alias: ref.slice(slash + 1) };
}
