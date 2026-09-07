import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { Account, Status } from '../../models';
import { externalFetch } from '../external-fetch';
import { PasteCreateInput, PasteCreated, PasteProvider, PasteRecentItem } from './paste-provider';

const BASE_URL = 'https://rentry.co';

const RENTRY_ACCOUNT: Account = {
  id: 'paste:rentry',
  username: 'anonymous',
  acct: 'anonymous@rentry.co',
  display_name: 'Rentry',
  note: 'Anonymous Markdown pages published on Rentry.',
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

interface RentryResponse {
  status: string | number;
  content?: string;
}

interface RentryCreateResponse extends RentryResponse {
  url?: string;
  edit_code?: string;
}

function apiSucceeded(response: RentryResponse): boolean {
  return String(response.status) === '200';
}

function assertApiSucceeded(response: RentryResponse): void {
  if (!apiSucceeded(response)) {
    throw new Error(response.content || 'Rentry rejected the request.');
  }
}

function rentryText(input: Pick<PasteCreateInput, 'title' | 'content'>): string {
  const title = input.title.replace(/[\r\n]+/g, ' ').trim();
  return title ? `# ${title}\n\n${input.content}` : input.content;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function form(values: Record<string, string>): HttpParams {
  return Object.entries(values).reduce(
    (params, [name, value]) => params.set(name, value),
    new HttpParams(),
  );
}

/** Anonymous Markdown publishing through Rentry's browser-safe API. */
@Injectable({ providedIn: 'root' })
export class RentryProvider implements PasteProvider {
  private http = inject(HttpClient);

  readonly id = 'rentry';
  readonly label = 'Rentry';
  readonly languages = [{ value: 'markdown', label: 'Markdown' }] as const;
  readonly expiries = [{ value: 'never', label: 'Does not expire' }] as const;
  readonly visibilities = ['unlisted'] as const;

  create(input: PasteCreateInput): Observable<PasteCreated> {
    return this.http
      .post<RentryCreateResponse>(
        `${BASE_URL}/api/new`,
        form({ url: '', edit_code: '', text: rentryText(input) }),
        { context: externalFetch() },
      )
      .pipe(
        map((response) => {
          assertApiSucceeded(response);
          if (!response.url || !response.edit_code) {
            throw new Error('Rentry did not return an edit code.');
          }
          const url = response.url.startsWith('http')
            ? response.url
            : `${BASE_URL}/${response.url.replace(/^\/+/, '')}`;
          const slug = new URL(url).pathname.replace(/^\/|\/$/g, '');
          return {
            slug,
            url,
            rawUrl: `${BASE_URL}/${encodeURIComponent(slug)}/raw`,
            editKey: response.edit_code,
          };
        }),
      );
  }

  update(
    slug: string,
    editKey: string,
    input: Pick<PasteCreateInput, 'title' | 'content' | 'language'>,
  ): Observable<void> {
    return this.http
      .post<RentryResponse>(
        `${BASE_URL}/api/edit/${encodeURIComponent(slug)}`,
        form({ edit_code: editKey, text: rentryText(input) }),
        { context: externalFetch() },
      )
      .pipe(
        map((response) => {
          assertApiSucceeded(response);
        }),
      );
  }

  delete(slug: string, editKey: string): Observable<void> {
    return this.http
      .post<RentryResponse>(
        `${BASE_URL}/api/delete/${encodeURIComponent(slug)}`,
        form({ edit_code: editKey }),
        { context: externalFetch() },
      )
      .pipe(
        map((response) => {
          assertApiSucceeded(response);
        }),
      );
  }

  status(item: PasteRecentItem): Status {
    const title = item.title?.trim();
    const content = title
      ? `<strong>${escapeHtml(title)}</strong><br>${escapeHtml(item.preview)}`
      : escapeHtml(item.preview);
    return {
      provider: 'paste',
      providerRef: { providerId: this.id, slug: item.slug },
      id: `paste:${this.id}:${item.slug}`,
      created_at: item.createdAt,
      edited_at: null,
      content,
      spoiler_text: '',
      visibility: 'unlisted',
      url: item.url,
      account: RENTRY_ACCOUNT,
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
      language: 'markdown',
      media_attachments: [],
      application: { name: this.label, website: BASE_URL },
    };
  }
}
