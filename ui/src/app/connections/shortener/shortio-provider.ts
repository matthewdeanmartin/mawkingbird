import { inject, Injectable } from '@angular/core';
import { map, Observable, throwError } from 'rxjs';
import { LinkProviderError, LinkProviderErrorCode } from './shortener-errors';
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
 * Short.io.
 *
 * Three departures from the conventional shape, each of which has bitten someone:
 *
 * 1. **Auth has no `Bearer` prefix.** The secret key goes into `Authorization`
 *    raw. Handled in the catalog's {@link ShortenerAuth.prefix}, which is empty
 *    for this provider.
 * 2. **Update is `POST /links/{id}`, not `PATCH`.**
 * 3. **A domain is mandatory.** There is no shared default short domain, so a
 *    key on its own is not a working configuration — {@link ShortenerSettings}
 *    refuses to resolve without one rather than letting the provider return a
 *    confusing validation error.
 *
 * ## Duplicate handling
 *
 * Short.io's create is not a plain insert. Given the same destination and no
 * custom path it may hand back the *existing* link; given an existing path with
 * a different destination it returns `409`. Both behaviours are the provider's
 * and are left alone — the first is harmless (the user wanted a short link for
 * that URL and now has one) and the second is surfaced as `SLUG_CONFLICT`, which
 * is exactly what it is.
 */

const BASE_URL = 'https://api.short.io';

interface ShortioLink {
  id?: string;
  idString?: string;
  path: string;
  shortURL: string;
  originalURL: string;
  title?: string | null;
  tags?: string[] | null;
  archived?: boolean;
  expiresAt?: string | number | null;
  createdAt?: string;
  updatedAt?: string;
  DomainId?: number;
  domain?: string;
}

interface ShortioListResponse {
  links: ShortioLink[];
  nextPageToken?: string | null;
}

/** Short.io says `409` for a taken path, and uses it for little else. */
function refine(status: number): LinkProviderErrorCode | undefined {
  return status === 409 ? 'SLUG_CONFLICT' : undefined;
}

/** Short.io returns the id under either key depending on the endpoint. */
function idOf(link: ShortioLink): string {
  return String(link.idString ?? link.id ?? '');
}

@Injectable({ providedIn: 'root' })
export class ShortioProvider implements ShortenerProvider {
  private transport = inject(ShortenerTransport);
  private settings = inject(ShortenerSettings);

  readonly id = 'shortio' as const;
  readonly label = 'Short.io';

  capabilities(): ShortenerCapabilities {
    return {
      customSlug: true,
      customDomain: true,
      title: true,
      // Short.io has no separate description field on a link.
      description: false,
      tags: true,
      expiry: true,
      password: true,
      archive: true,
      update: true,
      delete: true,
      // Its list endpoint filters rather than full-text searches; the registry
      // filters locally within a bounded page instead.
      textSearch: false,
      list: true,
    };
  }

  createLink(input: CreateLinkInput): Observable<ShortLink> {
    assertValidDestination(input.destinationUrl);
    const domain = input.domain || this.settings.domain(this.id);
    if (!domain) {
      return throwError(
        () =>
          new LinkProviderError(
            'VALIDATION_FAILED',
            'Short.io needs the short domain from your account before it can create a link.',
            this.id,
          ),
      );
    }

    const body: Record<string, unknown> = { originalURL: input.destinationUrl, domain };
    if (input.slug) {
      body['path'] = input.slug;
    }
    if (input.title) {
      body['title'] = input.title;
    }
    if (input.tags?.length) {
      body['tags'] = input.tags;
    }
    if (input.expiresAt) {
      body['expiresAt'] = input.expiresAt;
    }
    if (input.password) {
      body['password'] = input.password;
    }

    return this.transport
      .request<ShortioLink>(this.id, {
        method: 'POST',
        url: `${BASE_URL}/links`,
        body,
        headers: { 'Content-Type': 'application/json' },
        idempotent: false,
        hints: { refine },
      })
      .pipe(map((link) => this.normalize(link, domain)));
  }

  updateLink(id: string, changes: UpdateLinkInput): Observable<ShortLink> {
    if (changes.destinationUrl) {
      assertValidDestination(changes.destinationUrl);
    }
    const body: Record<string, unknown> = {};
    if (changes.destinationUrl !== undefined) {
      body['originalURL'] = changes.destinationUrl;
    }
    if (changes.slug !== undefined) {
      body['path'] = changes.slug;
    }
    if (changes.title !== undefined) {
      body['title'] = changes.title;
    }
    if (changes.tags !== undefined) {
      body['tags'] = changes.tags;
    }
    if (changes.expiresAt !== undefined) {
      body['expiresAt'] = changes.expiresAt;
    }
    if (changes.password !== undefined) {
      body['password'] = changes.password;
    }
    if (changes.archived !== undefined) {
      body['archived'] = changes.archived;
    }

    // POST, not PATCH. See the class note.
    return this.transport
      .request<ShortioLink>(this.id, {
        method: 'POST',
        url: `${BASE_URL}/links/${encodeURIComponent(id)}`,
        body,
        headers: { 'Content-Type': 'application/json' },
        idempotent: true,
        hints: { refine },
      })
      .pipe(map((link) => this.normalize(link)));
  }

  deleteLink(id: string): Observable<void> {
    return this.transport
      .request<unknown>(this.id, {
        method: 'DELETE',
        url: `${BASE_URL}/links/${encodeURIComponent(id)}`,
        idempotent: true,
        hints: { refine },
      })
      .pipe(map(() => undefined));
  }

  getLink(id: string): Observable<ShortLink> {
    return this.transport
      .request<ShortioLink>(this.id, {
        method: 'GET',
        url: `${BASE_URL}/links/${encodeURIComponent(id)}`,
        idempotent: true,
        hints: { refine },
      })
      .pipe(map((link) => this.normalize(link)));
  }

  listLinks(query: LinkQuery = {}): Observable<Page<ShortLink>> {
    const domain = query.domain || this.settings.domain(this.id);
    // Short.io identifies the domain by hostname here; `domain_id` is the
    // alternative and the two are not sent together.
    const params = new URLSearchParams({ domain, limit: String(query.limit ?? 50) });
    if (query.cursor) {
      params.set('pageToken', query.cursor);
    }

    return this.transport
      .request<ShortioListResponse>(this.id, {
        method: 'GET',
        url: `${BASE_URL}/api/links?${params.toString()}`,
        idempotent: true,
        hints: { refine },
      })
      .pipe(
        map((response) => ({
          items: (response.links ?? []).map((link) => this.normalize(link, domain)),
          nextCursor: response.nextPageToken ?? null,
        })),
      );
  }

  verify(): Observable<void> {
    const domain = this.settings.domain(this.id);
    return this.transport
      .request<ShortioListResponse>(this.id, {
        method: 'GET',
        url: `${BASE_URL}/api/links?domain=${encodeURIComponent(domain)}&limit=1`,
        idempotent: true,
        hints: { refine },
      })
      .pipe(map(() => undefined));
  }

  private normalize(link: ShortioLink, fallbackDomain = ''): ShortLink {
    // `expiresAt` comes back as an ISO string or epoch milliseconds depending on
    // what was sent in; normalize to ISO so the UI has one shape to render.
    const expiresAt =
      typeof link.expiresAt === 'number'
        ? new Date(link.expiresAt).toISOString()
        : (link.expiresAt ?? undefined);

    return {
      provider: this.id,
      providerId: idOf(link),
      shortUrl: link.shortURL,
      destinationUrl: link.originalURL,
      slug: link.path,
      domain: link.domain ?? fallbackDomain,
      title: link.title ?? undefined,
      tags: link.tags ?? undefined,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
      expiresAt,
      archived: link.archived,
      raw: link,
    };
  }
}
