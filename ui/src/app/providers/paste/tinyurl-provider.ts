import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, throwError } from 'rxjs';
import { Account, Status } from '../../models';
import { externalFetch } from '../external-fetch';
import { PasteCreateInput, PasteCreated, PasteProvider, PasteRecentItem } from './paste-provider';
import { buildMessageUrl } from './message-payload';

// TinyURL's legacy api-create.php is key-free and CORS-open (unlike is.gd/v.gd,
// whose create endpoint sends no Access-Control-Allow-Origin). It returns the
// short URL as plain text.
const BASE_URL = 'https://tinyurl.com';
const CREATE_URL = `${BASE_URL}/api-create.php`;

const TINYURL_ACCOUNT: Account = {
  id: 'paste:tinyurl',
  username: 'tinyurl',
  acct: 'shortener@tinyurl.com',
  display_name: 'TinyURL short link',
  note: 'A message stored inside a TinyURL short link. Anyone with the link can read it.',
  url: BASE_URL,
  avatar: `${BASE_URL}/favicon.ico`,
  avatar_static: `${BASE_URL}/favicon.ico`,
  header: '',
  followers_count: 0,
  following_count: 0,
  statuses_count: 0,
  bot: false,
  locked: false,
  discoverable: false,
  fields: [],
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** The short code at the end of a tinyurl.com URL (e.g. "22qwvuhy"). */
function slugOf(shortUrl: string): string {
  return new URL(shortUrl).pathname.replace(/^\/|\/$/g, '');
}

/**
 * A message published as a TinyURL short link.
 *
 * The shortener stores a redirect *target*, so we put the message inside that
 * target: a query-free mawkingbird.com/message/message-status.… URL carrying the post fields.
 * Opening the
 * short link 301-redirects straight back to that reader page, which rebuilds a
 * Mastodon status — no expand API needed. TinyURL links are permanent and
 * public, so this provider offers no edit, delete, expiry, or public feed.
 */
@Injectable({ providedIn: 'root' })
export class TinyurlProvider implements PasteProvider {
  private http = inject(HttpClient);

  readonly id = 'tinyurl';
  readonly label = 'TinyURL link';
  readonly immutable = true;
  readonly languages = [{ value: 'plaintext', label: 'Plain text' }] as const;
  readonly expiries = [
    { value: 'never', label: 'Permanent (TinyURL links never expire)' },
  ] as const;
  readonly visibilities = ['unlisted'] as const;

  create(input: PasteCreateInput): Observable<PasteCreated> {
    const target = buildMessageUrl(input);
    // The target is deliberately query-free, so Angular and TinyURL never have
    // to agree about how many times a nested `%20`, `+`, `&`, or `=` is decoded.
    const params = new HttpParams().set('url', target);
    return this.http
      .get(CREATE_URL, { params, responseType: 'text', context: externalFetch() })
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
            slug: slugOf(shortUrl),
            url: shortUrl,
            rawUrl: target,
            // TinyURL has no per-link edit credential; the link is immutable.
            editKey: '',
          };
        }),
      );
  }

  update(
    _slug: string,
    _editKey: string,
    _input: Pick<PasteCreateInput, 'title' | 'content' | 'language'>,
  ): Observable<void> {
    return throwError(
      () =>
        new Error('TinyURL links are permanent and cannot be edited. Create a new one instead.'),
    );
  }

  delete(_slug: string, _editKey: string): Observable<void> {
    return throwError(
      () => new Error('TinyURL links are permanent and cannot be deleted from the service.'),
    );
  }

  status(item: PasteRecentItem): Status {
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
      account: TINYURL_ACCOUNT,
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
      application: { name: this.label, website: BASE_URL },
    };
  }
}
