import { computed, inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { PasteHistory } from '../paste/paste-history';
import { DubProvider } from './dub-provider';
import { IsgdProvider } from './isgd-provider';
import { RebrandlyProvider } from './rebrandly-provider';
import { ShortenerHistory, ShortLinkRecord, mergeLinks } from './shortener-history';
import {
  CreateLinkInput,
  LinkQuery,
  ShortenerProvider,
  ShortenerId,
  ShortLink,
  UpdateLinkInput,
} from './shortener-provider';
import { ShortenerSettings } from './shortener-settings';
import { ShortioProvider } from './shortio-provider';
import { TinyurlShortenerProvider } from './tinyurl-shortener-provider';
import { TlyProvider } from './tly-provider';

/**
 * The shortening services this app can use, and which one is live.
 *
 * Mirrors {@link PasteProviderRegistry} in shape, with one deliberate
 * difference: the paste providers are all live at once, while exactly one
 * shortener is active. That is the spec's rule and it is the right one here —
 * "shorten this URL" has to have a single answer, whereas "post this paste"
 * sensibly asks where.
 */
@Injectable({ providedIn: 'root' })
export class ShortenerRegistry {
  private tinyurl = inject(TinyurlShortenerProvider);
  private isgd = inject(IsgdProvider);
  private dub = inject(DubProvider);
  private shortio = inject(ShortioProvider);
  private tly = inject(TlyProvider);
  private rebrandly = inject(RebrandlyProvider);
  private settings = inject(ShortenerSettings);
  private history = inject(ShortenerHistory);
  private pastes = inject(PasteHistory);

  /** In catalog order: the two that need no account first. */
  readonly all: readonly ShortenerProvider[] = [
    this.tinyurl,
    this.isgd,
    this.dub,
    this.shortio,
    this.tly,
    this.rebrandly,
  ];

  /** The provider in use, or null when none is configured well enough. */
  readonly active = computed<ShortenerProvider | null>(() => {
    const id = this.settings.activeId();
    return id && this.settings.usable() ? (this.get(id) ?? null) : null;
  });

  get(id: ShortenerId): ShortenerProvider | undefined {
    return this.all.find((provider) => provider.id === id);
  }

  /** Shorten a URL with the active provider, recording it locally. */
  create(input: CreateLinkInput): Observable<ShortLink> {
    const provider = this.require();
    // Captured at creation time, not read back later: a link made anonymously
    // stays unmanageable even if the user adds a token afterwards, because the
    // token carries no authority over links it did not create.
    const caps = provider.capabilities();
    const readOnly = !caps.update && !caps.delete;
    return provider.createLink(input).pipe(
      map((link) => {
        this.history.add(link, { readOnly });
        return link;
      }),
    );
  }

  update(providerId: string, changes: UpdateLinkInput): Observable<ShortLink> {
    const provider = this.require();
    return provider.updateLink(providerId, changes).pipe(
      map((link) => {
        const { raw, ...rest } = link;
        void raw;
        this.history.update(provider.id, providerId, rest);
        return link;
      }),
    );
  }

  delete(providerId: string): Observable<void> {
    const provider = this.require();
    return provider.deleteLink(providerId).pipe(
      map(() => {
        this.history.remove(provider.id, providerId);
      }),
    );
  }

  /**
   * Every link worth showing on the Links page.
   *
   * Three sources, merged: the active provider's list API, this browser's
   * history for that provider, and the message-links created through the Pastes
   * feature. The last two are why this returns records rather than
   * {@link ShortLink} — plenty of these links have no provider-side identity at
   * all and exist only as local history.
   *
   * A provider that cannot list is the normal case here, not an error: is.gd has
   * no accounts, and TinyURL has none until a token is added. Those fall back to
   * local history, which is the only record those links have ever had.
   */
  list(query: LinkQuery = {}): Observable<ShortLinkRecord[]> {
    const provider = this.active();
    if (!provider?.capabilities().list) {
      return of(this.localOnly(query));
    }

    const local = this.history.forProvider(provider.id);
    return provider.listLinks(query).pipe(
      map((page) => {
        const merged = mergeLinks(page.items, local);
        // Providers without server-side text search get it applied here, over
        // the bounded page they returned. The spec is explicit that this must
        // never mean downloading the whole account to search it.
        const filtered = provider.capabilities().textSearch
          ? merged
          : filterLocally(merged, query.search);
        return this.withMessageLinks(filtered, query.search);
      }),
      // A provider that says it can list and then fails is still no reason to
      // show an empty page: the local history is intact and is what the user
      // actually made from here.
      catchError(() => of(this.localOnly(query))),
    );
  }

  /** The view when the provider cannot (or did not) list: local records only. */
  private localOnly(query: LinkQuery): ShortLinkRecord[] {
    return this.withMessageLinks(filterLocally(this.history.records(), query.search), query.search);
  }

  /** Append the Pastes-feature message links and sort the whole set. */
  private withMessageLinks(records: ShortLinkRecord[], search?: string): ShortLinkRecord[] {
    return [...records, ...this.messageLinkRecords(search)].sort((a, b) =>
      b.recordedAt.localeCompare(a.recordedAt),
    );
  }

  /**
   * Message-links from the Pastes feature, adapted into link records.
   *
   * These come from `providers/paste/tinyurl-provider.ts`, which is *not* the
   * TinyURL shortener in this folder — see {@link LinkKind}. The redirect target
   * is a `mawkingbird.com/message/message-status.…` URL carrying a post body, so the "link"
   * and the "content" are the same object. They are shown here because from the
   * user's side they are short links they made and may want to find again, and
   * marked `kind: 'message'` so the page never offers to re-point one at a
   * different destination — there is no destination, only a payload.
   *
   * Read-only regardless of the active provider: they were made anonymously and
   * TinyURL cannot delete an anonymous link even with a token.
   */
  private messageLinkRecords(search?: string): ShortLinkRecord[] {
    const records = this.pastes
      .records()
      .filter((paste) => paste.providerId === 'tinyurl')
      .map<ShortLinkRecord>((paste) => ({
        provider: 'tinyurl',
        kind: 'message',
        providerId: paste.slug,
        shortUrl: paste.url,
        // The "destination" is the message payload URL, not a page anyone
        // meant to visit. Kept so the link still resolves, never shown raw.
        destinationUrl: paste.rawUrl,
        slug: paste.slug,
        title: paste.title || undefined,
        recordedAt: paste.createdAt,
        // Anonymous TinyURL links are permanent: no edit, no delete.
        readOnly: true,
      }));
    return filterLocally(records, search);
  }

  private require(): ShortenerProvider {
    const provider = this.active();
    if (!provider) {
      throw new Error(this.settings.blockedReason() ?? 'No link shortener is configured.');
    }
    return provider;
  }
}

/** Case-insensitive match across the fields a user would search by. */
function filterLocally(records: readonly ShortLinkRecord[], search?: string): ShortLinkRecord[] {
  const needle = search?.trim().toLowerCase();
  if (!needle) {
    return [...records];
  }
  return records.filter((record) =>
    [record.shortUrl, record.destinationUrl, record.slug, record.title, record.description]
      .filter((value): value is string => typeof value === 'string')
      .some((value) => value.toLowerCase().includes(needle)),
  );
}
