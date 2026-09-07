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
 * Dub (dub.co).
 *
 * The most conventional of the three: ordinary REST, `Bearer` auth, `PATCH` for
 * updates, opaque link ids. Implemented first for exactly that reason — it is
 * the adapter the other two are read against.
 *
 * ## externalId
 *
 * Dub lets the integrator attach its own id to a link, unique per workspace.
 * That is the cleanest idempotency handle any of these providers offer, so every
 * link created here carries one: a create that times out can be resolved by
 * looking up the external id rather than by creating a second link and hoping.
 * When referring to a link by that id in a path, Dub wants it prefixed `ext_`.
 */

const BASE_URL = 'https://api.dub.co';

interface DubLink {
  id: string;
  domain: string;
  key: string;
  url: string;
  shortLink: string;
  title?: string | null;
  description?: string | null;
  tags?: { id: string; name: string }[] | null;
  externalId?: string | null;
  archived?: boolean;
  expiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Dub answers a taken slug with `409`, but also uses `422` for a body it
 * dislikes — including a malformed destination. The status table alone would
 * call both `VALIDATION_FAILED`, which loses the one distinction the UI acts on.
 */
function refine(status: number, body: unknown): LinkProviderErrorCode | undefined {
  const code = (body as { error?: { code?: string } } | null)?.error?.code;
  if (status === 409 || code === 'conflict') {
    return 'SLUG_CONFLICT';
  }
  if (code === 'exceeded_limit') {
    return 'PLAN_LIMIT';
  }
  return undefined;
}

@Injectable({ providedIn: 'root' })
export class DubProvider implements ShortenerProvider {
  private transport = inject(ShortenerTransport);
  private settings = inject(ShortenerSettings);

  readonly id = 'dub' as const;
  readonly label = 'Dub';

  capabilities(): ShortenerCapabilities {
    return {
      customSlug: true,
      customDomain: true,
      title: true,
      description: true,
      tags: true,
      expiry: true,
      password: true,
      archive: true,
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
      url: input.destinationUrl,
      // A locally-generated handle, so a timed-out create is recoverable.
      externalId: input.externalId ?? `mawking_${crypto.randomUUID()}`,
    };
    if (domain) {
      body['domain'] = domain;
    }
    if (input.slug) {
      body['key'] = input.slug;
    }
    if (input.title) {
      body['title'] = input.title;
    }
    if (input.description) {
      body['description'] = input.description;
    }
    if (input.tags?.length) {
      body['tagNames'] = input.tags;
    }
    if (input.expiresAt) {
      body['expiresAt'] = input.expiresAt;
    }
    if (input.password) {
      body['password'] = input.password;
    }

    return this.transport
      .request<DubLink>(this.id, {
        method: 'POST',
        url: `${BASE_URL}/links`,
        body,
        // Never retried: a repeated create can produce a second link.
        idempotent: false,
        hints: { refine },
      })
      .pipe(map((link) => this.normalize(link)));
  }

  updateLink(id: string, changes: UpdateLinkInput): Observable<ShortLink> {
    if (changes.destinationUrl) {
      assertValidDestination(changes.destinationUrl);
    }
    const body: Record<string, unknown> = {};
    if (changes.destinationUrl !== undefined) {
      body['url'] = changes.destinationUrl;
    }
    if (changes.slug !== undefined) {
      body['key'] = changes.slug;
    }
    if (changes.title !== undefined) {
      body['title'] = changes.title;
    }
    if (changes.description !== undefined) {
      body['description'] = changes.description;
    }
    if (changes.tags !== undefined) {
      body['tagNames'] = changes.tags;
    }
    // `null` is meaningful here — it clears an expiry or a password — so these
    // check for `undefined` rather than truthiness.
    if (changes.expiresAt !== undefined) {
      body['expiresAt'] = changes.expiresAt;
    }
    if (changes.password !== undefined) {
      body['password'] = changes.password;
    }
    if (changes.archived !== undefined) {
      body['archived'] = changes.archived;
    }

    return this.transport
      .request<DubLink>(this.id, {
        method: 'PATCH',
        url: `${BASE_URL}/links/${encodeURIComponent(id)}`,
        body,
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
      .request<DubLink>(this.id, {
        method: 'GET',
        url: `${BASE_URL}/links/info?linkId=${encodeURIComponent(id)}`,
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
    if (query.domain) {
      params.set('domain', query.domain);
    }
    if (query.tag) {
      params.set('tagNames', query.tag);
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    params.set('page', String(page));
    params.set('pageSize', String(limit));

    return this.transport
      .request<DubLink[]>(this.id, {
        method: 'GET',
        url: `${BASE_URL}/links?${params.toString()}`,
        idempotent: true,
        hints: { refine },
      })
      .pipe(
        map((links) => ({
          items: links.map((link) => this.normalize(link)),
          // Dub pages by number and does not report a total here, so a full page
          // is the only signal that another may exist.
          nextCursor: links.length === limit ? String(page + 1) : null,
        })),
      );
  }

  /**
   * The cheapest authenticated call: one link, which proves the key is valid and
   * the workspace is reachable without creating anything.
   */
  verify(): Observable<void> {
    return this.transport
      .request<DubLink[]>(this.id, {
        method: 'GET',
        url: `${BASE_URL}/links?pageSize=1`,
        idempotent: true,
        hints: { refine },
      })
      .pipe(map(() => undefined));
  }

  private normalize(link: DubLink): ShortLink {
    return {
      provider: this.id,
      providerId: link.id,
      shortUrl: link.shortLink,
      destinationUrl: link.url,
      slug: link.key,
      domain: link.domain,
      title: link.title ?? undefined,
      description: link.description ?? undefined,
      tags: link.tags?.map((tag) => tag.name),
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
      expiresAt: link.expiresAt ?? undefined,
      archived: link.archived,
      raw: link,
    };
  }
}
