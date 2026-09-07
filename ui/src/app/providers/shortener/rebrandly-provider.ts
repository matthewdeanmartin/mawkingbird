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
 * Rebrandly.
 *
 * Two departures from the others:
 *
 * 1. **The key is not in `Authorization`.** Rebrandly reads a bespoke `apikey`
 *    header, which is why {@link ShortenerAuth.header} is a field rather than an
 *    assumption. Sending `Authorization: Bearer …` here authenticates nothing.
 * 2. **Updates are `POST`, not `PATCH`** — the same quirk as Short.io.
 *
 * ## Workspaces
 *
 * Links can belong to a workspace, selected by a `workspace` header. This
 * adapter sends it only when the user has configured one: an account with a
 * single default workspace works without it, and sending an empty or wrong
 * workspace is worse than sending none — it silently addresses a different set
 * of links, so a delete could hit something the user cannot see.
 *
 * The workspace id is stored in the domain slot of {@link ShortenerSettings},
 * which is a small abuse of that field and the alternative was a second
 * per-provider settings key used by exactly one provider. It is documented on
 * the connector page as "workspace", not "domain".
 *
 * ## Search
 *
 * Rebrandly filters rather than full-text searches, so {@link capabilities}
 * reports `textSearch: false` and the registry filters locally within the
 * bounded page it fetched — never by downloading the whole account.
 */

const BASE_URL = 'https://api.rebrandly.com/v1';

interface RebrandlyLink {
  id: string;
  title?: string | null;
  slashtag: string;
  destination: string;
  shortUrl: string;
  createdAt?: string;
  updatedAt?: string;
  domain?: { id?: string; fullName?: string };
}

/**
 * Rebrandly answers a taken slashtag with `403` — the same status it uses for a
 * plan limit — so the body's own code is the only way to tell them apart.
 */
function refine(status: number, body: unknown): LinkProviderErrorCode | undefined {
  const code = (body as { code?: string; message?: string } | null)?.code;
  if (code === 'AlreadyExists') {
    return 'SLUG_CONFLICT';
  }
  if (status === 403) {
    return code === 'InvalidFormat' ? 'VALIDATION_FAILED' : 'PLAN_LIMIT';
  }
  return undefined;
}

@Injectable({ providedIn: 'root' })
export class RebrandlyProvider implements ShortenerProvider {
  private transport = inject(ShortenerTransport);
  private settings = inject(ShortenerSettings);

  readonly id = 'rebrandly' as const;
  readonly label = 'Rebrandly';

  capabilities(): ShortenerCapabilities {
    return {
      customSlug: true,
      customDomain: true,
      title: true,
      // Present on paid tiers only; omitted rather than silently dropped.
      description: false,
      tags: false,
      expiry: false,
      password: false,
      archive: false,
      update: true,
      delete: true,
      textSearch: false,
      list: true,
    };
  }

  /** The `workspace` header, when one is configured. See the class note. */
  private workspaceHeaders(): Record<string, string> {
    const workspace = this.settings.domain(this.id).trim();
    return workspace ? { workspace } : {};
  }

  createLink(input: CreateLinkInput): Observable<ShortLink> {
    assertValidDestination(input.destinationUrl);
    const body: Record<string, unknown> = { destination: input.destinationUrl };
    if (input.slug) {
      body['slashtag'] = input.slug;
    }
    if (input.title) {
      body['title'] = input.title;
    }
    // The domain travels in the body for Rebrandly, not as a header. A workspace
    // has no guaranteed branded domain, so omitting it falls back to rebrand.ly.
    if (input.domain) {
      body['domain'] = { fullName: input.domain };
    }

    return this.transport
      .request<RebrandlyLink>(this.id, {
        method: 'POST',
        url: `${BASE_URL}/links`,
        body,
        headers: { 'Content-Type': 'application/json', ...this.workspaceHeaders() },
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
      body['destination'] = changes.destinationUrl;
    }
    if (changes.slug !== undefined) {
      body['slashtag'] = changes.slug;
    }
    if (changes.title !== undefined) {
      body['title'] = changes.title;
    }

    // POST, not PATCH. See the class note.
    return this.transport
      .request<RebrandlyLink>(this.id, {
        method: 'POST',
        url: `${BASE_URL}/links/${encodeURIComponent(id)}`,
        body,
        headers: { 'Content-Type': 'application/json', ...this.workspaceHeaders() },
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
        headers: this.workspaceHeaders(),
        idempotent: true,
        hints: { refine },
      })
      .pipe(map(() => undefined));
  }

  getLink(id: string): Observable<ShortLink> {
    return this.transport
      .request<RebrandlyLink>(this.id, {
        method: 'GET',
        url: `${BASE_URL}/links/${encodeURIComponent(id)}`,
        headers: this.workspaceHeaders(),
        idempotent: true,
        hints: { refine },
      })
      .pipe(map((link) => this.normalize(link)));
  }

  listLinks(query: LinkQuery = {}): Observable<Page<ShortLink>> {
    const limit = Math.min(query.limit ?? 25, 100);
    const params = new URLSearchParams({
      limit: String(limit),
      orderBy: 'createdAt',
      orderDir: 'desc',
    });
    // Rebrandly pages by marker: `last` is the id of the final link you saw.
    if (query.cursor) {
      params.set('last', query.cursor);
    }
    if (query.domain) {
      params.set('domain.fullName', query.domain);
    }

    return this.transport
      .request<RebrandlyLink[]>(this.id, {
        method: 'GET',
        url: `${BASE_URL}/links?${params.toString()}`,
        headers: this.workspaceHeaders(),
        idempotent: true,
        hints: { refine },
      })
      .pipe(
        map((links) => ({
          items: links.map((link) => this.normalize(link)),
          nextCursor: links.length === limit ? (links[links.length - 1]?.id ?? null) : null,
        })),
      );
  }

  verify(): Observable<void> {
    return this.transport
      .request<RebrandlyLink[]>(this.id, {
        method: 'GET',
        url: `${BASE_URL}/links?limit=1`,
        headers: this.workspaceHeaders(),
        idempotent: true,
        hints: { refine },
      })
      .pipe(map(() => undefined));
  }

  private normalize(link: RebrandlyLink): ShortLink {
    return {
      provider: this.id,
      providerId: link.id,
      // Rebrandly returns `shortUrl` without a scheme (`rebrand.ly/abc`).
      shortUrl: /^https?:\/\//i.test(link.shortUrl) ? link.shortUrl : `https://${link.shortUrl}`,
      destinationUrl: link.destination,
      slug: link.slashtag,
      domain: link.domain?.fullName,
      title: link.title ?? undefined,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
      raw: link,
    };
  }
}
