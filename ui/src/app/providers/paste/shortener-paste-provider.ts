import { computed, inject, Injectable } from '@angular/core';
import { map, Observable, throwError } from 'rxjs';
import { Account, Status } from '../../models';
import { ShortenerRegistry } from '../shortener/shortener-registry';
import { ShortenerSettings } from '../shortener/shortener-settings';
import { shortenerEntry } from '../shortener/shortener-catalog';
import { PasteCreateInput, PasteCreated, PasteProvider, PasteRecentItem } from './paste-provider';
import { buildMessageUrl } from './message-payload';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** The short code at the end of a short URL, whatever the domain. */
function slugOf(shortUrl: string): string {
  try {
    return new URL(shortUrl).pathname.replace(/^\/|\/$/g, '');
  } catch {
    return shortUrl;
  }
}

/**
 * A message published through *the user's own* link shortener.
 *
 * Same trick as {@link TinyurlProvider}: a shortener stores a redirect target,
 * so the message goes inside that target as a query-free
 * `…/message/message-status.…` URL, and opening the short link redirects
 * straight back to a reader page that rebuilds a Mastodon status. Nothing is
 * stored on any Mastodon server — this is the "post without a server" path.
 *
 * What it adds over the TinyURL entry is *whose* link it is. TinyURL links are
 * anonymous and permanent: nobody can list, edit, or delete them, so a message
 * posted that way is gone from your control the moment it exists. Routed
 * through a shortener you have connected, the same message becomes a link on
 * your own account — one you can find on the Links page, retitle, and revoke.
 * For anyone using this feature as their posting mechanism rather than as a
 * novelty, that is the difference between publishing and littering.
 *
 * It appears in the composer's provider list only when a shortener is connected
 * *and* usable, because there is nothing to offer otherwise. TinyURL stays in
 * the list either way as the no-setup fallback.
 *
 * Edit and delete are deliberately not wired to the shortener's own update and
 * delete APIs. Both exist — this is exactly what {@link ShortenerRegistry}
 * does for ordinary links — but a paste's edit key is per-paste and the
 * shortener's authority is per-account, so routing one through the other would
 * let any draft in this browser rewrite any link on the account. The Links page
 * is where these are managed, under the account credential that actually owns
 * them.
 */
@Injectable({ providedIn: 'root' })
export class ShortenerPasteProvider implements PasteProvider {
  private registry = inject(ShortenerRegistry);
  private settings = inject(ShortenerSettings);

  readonly id = 'shortener';
  readonly immutable = true;
  readonly languages = [{ value: 'plaintext', label: 'Plain text' }] as const;
  readonly expiries = [{ value: 'never', label: 'Permanent' }] as const;
  readonly visibilities = ['unlisted'] as const;

  /**
   * True when a shortener is connected and complete enough to create a link.
   * The composer uses this to decide whether to offer the option at all.
   */
  readonly available = computed(() => this.registry.active() !== null);

  /** The connected service's name, so the option reads "Your Dub link". */
  readonly serviceLabel = computed(() => shortenerEntry(this.settings.activeId())?.label ?? null);

  /**
   * Named after the service when there is one, because "Short link" next to
   * "TinyURL link" says nothing about which is which.
   */
  get label(): string {
    const service = this.serviceLabel();
    return service ? `Your ${service} link` : 'Your link shortener';
  }

  create(input: PasteCreateInput): Observable<PasteCreated> {
    const provider = this.registry.active();
    if (!provider) {
      return throwError(
        () =>
          new Error(
            this.settings.blockedReason() ??
              'No link shortener is connected. Add one under Settings → Connections.',
          ),
      );
    }
    const target = buildMessageUrl(input);
    // Through the registry rather than the provider directly, so the link lands
    // in the same local history the Links page reads. A message-link that the
    // Links page cannot see is one the user cannot revoke.
    return this.registry
      .create({
        destinationUrl: target,
        // The spoiler doubles as the link title, which is what makes these
        // findable on the Links page later. Untitled messages stay untitled.
        title: input.title.trim() || undefined,
      })
      .pipe(
        map((link) => ({
          slug: link.slug || slugOf(link.shortUrl),
          url: link.shortUrl,
          rawUrl: target,
          // The account credential owns this link, not a per-paste key.
          editKey: '',
        })),
      );
  }

  update(
    _slug: string,
    _editKey: string,
    _input: Pick<PasteCreateInput, 'title' | 'content' | 'language'>,
  ): Observable<void> {
    return throwError(
      () =>
        new Error(
          'Message links are edited on the Links page, where your shortener account owns them.',
        ),
    );
  }

  delete(_slug: string, _editKey: string): Observable<void> {
    return throwError(
      () => new Error('Message links are deleted on the Links page, under your shortener account.'),
    );
  }

  status(item: PasteRecentItem): Status {
    const service = this.serviceLabel() ?? 'link shortener';
    const host = hostOf(item.url);
    return {
      provider: 'paste',
      providerRef: { providerId: this.id, slug: item.slug },
      id: `paste:${this.id}:${item.slug}`,
      created_at: item.createdAt,
      edited_at: null,
      content: escapeHtml(item.preview),
      spoiler_text: '',
      visibility: 'unlisted',
      url: item.url,
      account: shortenerAccount(service, host),
      reblog: null,
      quote: null,
      in_reply_to_id: null,
      replies_count: 0,
      reblogs_count: 0,
      favourites_count: 0,
      favourited: false,
      reblogged: false,
      bookmarked: false,
      muted: false,
      pinned: false,
      sensitive: false,
      poll: null,
      quote_approval_policy: null,
      language: 'plaintext',
      media_attachments: [],
      application: { name: this.label, website: host ? `https://${host}` : '' },
    };
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/** The pseudo-account these messages are attributed to, named for the service. */
function shortenerAccount(service: string, host: string): Account {
  const base = host ? `https://${host}` : '';
  return {
    id: 'paste:shortener',
    username: 'shortener',
    acct: host ? `shortener@${host}` : 'shortener',
    display_name: `${service} short link`,
    note: `A message stored inside a ${service} short link. Anyone with the link can read it.`,
    url: base,
    avatar: base ? `${base}/favicon.ico` : '',
    avatar_static: base ? `${base}/favicon.ico` : '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    discoverable: false,
    fields: [],
  };
}
