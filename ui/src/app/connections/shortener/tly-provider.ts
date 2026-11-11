import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { LinkProviderErrorCode } from './shortener-errors';
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
 * T.LY.
 *
 * The provider the spec warns about, for two reasons that are easy to get wrong
 * and hard to notice until something is deleted:
 *
 * 1. **A link's identity is its complete short URL.** Not a path id, not a
 *    slug — `https://t.ly/abc123`, in full, passed as a query parameter or in
 *    the body. {@link ShortLink.providerId} therefore holds the whole URL for
 *    this provider, which is exactly why the normalized model keeps
 *    `providerId` and `shortUrl` as separate fields rather than deriving one.
 * 2. **`DELETE` carries a JSON body.** Legal, and supported by `HttpClient`'s
 *    generic `request` overload, but unusual enough that plenty of HTTP stacks
 *    and proxies silently drop it. {@link ShortenerTransport} passes the body
 *    through for every method for this reason.
 *
 * Update is `PUT /api/v1/link` with the short URL in the body — no id in the
 * path at all.
 */

const BASE_URL = 'https://api.t.ly';

interface TlyLink {
  short_url: string;
  long_url: string;
  short_id?: string;
  domain?: string;
  description?: string | null;
  expire_at_datetime?: string | null;
  created_at?: string;
  updated_at?: string;
  tags?: { id: number; name: string }[] | null;
}

interface TlyListResponse {
  data?: TlyLink[];
  links?: TlyLink[];
  current_page?: number;
  last_page?: number;
}

/**
 * T.LY answers a taken back-half with `422`, the same status it uses for any
 * other body it dislikes. The distinction lives in the validation payload, which
 * keys errors by field name.
 */
function refine(status: number, body: unknown): LinkProviderErrorCode | undefined {
  if (status !== 422) {
    return undefined;
  }
  const errors = (body as { errors?: Record<string, unknown> } | null)?.errors;
  if (errors && ('short_id' in errors || 'short_url' in errors)) {
    return 'SLUG_CONFLICT';
  }
  if (errors && 'long_url' in errors) {
    return 'INVALID_DESTINATION';
  }
  return undefined;
}

@Injectable({ providedIn: 'root' })
export class TlyProvider implements ShortenerProvider {
  private transport = inject(ShortenerTransport);
  private settings = inject(ShortenerSettings);

  readonly id = 'tly' as const;
  readonly label = 'T.LY';

  capabilities(): ShortenerCapabilities {
    return {
      customSlug: true,
      // Only on paid plans, but the field is accepted and the provider decides.
      customDomain: true,
      // T.LY has a description but no separate title; the UI maps its title field
      // onto description rather than pretending both exist.
      title: false,
      description: true,
      tags: true,
      expiry: true,
      password: true,
      archive: false,
      update: true,
      delete: true,
      textSearch: true,
      list: true,
    };
  }

  createLink(input: CreateLinkInput): Observable<ShortLink> {
    assertValidDestination(input.destinationUrl);
    const domain = input.domain || this.settings.domain(this.id);
    const body: Record<string, unknown> = {
      long_url: input.destinationUrl,
      // Statistics stay private unless the user asks otherwise, per the spec's
      // security note.
      public_stats: false,
      include_qr_code: false,
    };
    if (input.slug) {
      body['short_id'] = input.slug;
    }
    if (domain) {
      body['domain'] = domain;
    }
    if (input.description || input.title) {
      body['description'] = input.description || input.title;
    }
    if (input.expiresAt) {
      body['expire_at_datetime'] = input.expiresAt;
    }
    if (input.password) {
      body['password'] = input.password;
    }

    return this.transport
      .request<TlyLink>(this.id, {
        method: 'POST',
        url: `${BASE_URL}/api/v1/link/shorten`,
        body,
        headers: { 'Content-Type': 'application/json' },
        idempotent: false,
        hints: { refine },
      })
      .pipe(map((link) => this.normalize(link)));
  }

  /** `id` is the complete short URL. See the class note. */
  updateLink(id: string, changes: UpdateLinkInput): Observable<ShortLink> {
    if (changes.destinationUrl) {
      assertValidDestination(changes.destinationUrl);
    }
    const body: Record<string, unknown> = { short_url: id };
    if (changes.destinationUrl !== undefined) {
      body['long_url'] = changes.destinationUrl;
    }
    if (changes.slug !== undefined) {
      body['short_id'] = changes.slug;
    }
    const description = changes.description ?? changes.title;
    if (description !== undefined) {
      body['description'] = description;
    }
    if (changes.expiresAt !== undefined) {
      // T.LY clears an expiry with an empty string rather than a null.
      body['expire_at_datetime'] = changes.expiresAt ?? '';
    }
    if (changes.password !== undefined) {
      body['password'] = changes.password ?? '';
    }

    return this.transport
      .request<TlyLink>(this.id, {
        method: 'PUT',
        url: `${BASE_URL}/api/v1/link`,
        body,
        headers: { 'Content-Type': 'application/json' },
        idempotent: true,
        hints: { refine },
      })
      .pipe(map((link) => this.normalize(link)));
  }

  /** DELETE with a JSON body, which is what T.LY documents. */
  deleteLink(id: string): Observable<void> {
    return this.transport
      .request<unknown>(this.id, {
        method: 'DELETE',
        url: `${BASE_URL}/api/v1/link`,
        body: { short_url: id },
        headers: { 'Content-Type': 'application/json' },
        idempotent: true,
        hints: { refine },
      })
      .pipe(map(() => undefined));
  }

  getLink(id: string): Observable<ShortLink> {
    return this.transport
      .request<TlyLink>(this.id, {
        method: 'GET',
        url: `${BASE_URL}/api/v1/link?short_url=${encodeURIComponent(id)}`,
        idempotent: true,
        hints: { refine },
      })
      .pipe(map((link) => this.normalize(link)));
  }

  listLinks(query: LinkQuery = {}): Observable<Page<ShortLink>> {
    const params = new URLSearchParams();
    if (query.search) {
      params.set('search', query.search);
    }
    const page = query.page ?? 1;
    params.set('page', String(page));
    // The documented maximum is 5,000; a page that large is never what a UI
    // wants and would be a slow request for everyone.
    params.set('limit', String(Math.min(query.limit ?? 50, 100)));

    return this.transport
      .request<TlyListResponse>(this.id, {
        method: 'GET',
        url: `${BASE_URL}/api/v1/link/list?${params.toString()}`,
        idempotent: true,
        hints: { refine },
      })
      .pipe(
        map((response) => {
          const items = response.data ?? response.links ?? [];
          const lastPage = response.last_page ?? page;
          return {
            items: items.map((link) => this.normalize(link)),
            nextCursor: page < lastPage ? String(page + 1) : null,
          };
        }),
      );
  }

  verify(): Observable<void> {
    return this.transport
      .request<TlyListResponse>(this.id, {
        method: 'GET',
        url: `${BASE_URL}/api/v1/link/list?limit=1`,
        idempotent: true,
        hints: { refine },
      })
      .pipe(map(() => undefined));
  }

  private normalize(link: TlyLink): ShortLink {
    return {
      provider: this.id,
      // The complete short URL *is* the identifier for this provider.
      providerId: link.short_url,
      shortUrl: link.short_url,
      destinationUrl: link.long_url,
      slug: link.short_id,
      domain: link.domain,
      description: link.description ?? undefined,
      tags: link.tags?.map((tag) => tag.name),
      createdAt: link.created_at,
      updatedAt: link.updated_at,
      expiresAt: link.expire_at_datetime ?? undefined,
      raw: link,
    };
  }
}
