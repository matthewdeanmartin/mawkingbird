import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { Account, Status } from '../../models';
import { externalFetch } from '../external-fetch';
import { PasteFeedFetch } from './paste-feed-fetch';
import { PasteFeedSubscriptions } from './paste-feed-subscriptions';
import { PastepileKey } from './pastepile-key';
import {
  PasteCreateInput,
  PasteCreated,
  PasteExpiry,
  PasteProvider,
  PasteRecentItem,
} from './paste-provider';

/**
 * The `www` host, deliberately — and this is the whole fix for "Pastepile broke
 * CORS", which it turns out never did.
 *
 * `pastepile.com` 308s to `www.pastepile.com`, and the redirect response itself
 * carries no `Access-Control-Allow-Origin`. A browser will not follow a
 * cross-origin redirect that fails CORS, so the request died at the 308 without
 * ever reaching the real endpoint — which serves a textbook header set
 * (`Allow-Origin: *`, and `X-Edit-Key` in `Expose-Headers`). The preflight
 * 308s too, which is why creating and deleting broke as well as reading.
 *
 * Naming the post-redirect host skips the problem entirely and needs no proxy.
 */
const SITE = 'https://www.pastepile.com';
const API_URL = `${SITE}/api/public/pastes`;

const PASTEPILE_ACCOUNT: Account = {
  id: 'paste:pastepile',
  username: 'recent',
  acct: 'recent@pastepile.com',
  display_name: 'Pastepile public feed',
  note: 'Recent public anonymous pastes from Pastepile.',
  // `www` here too: the avatar is fetched by the browser like any other image,
  // so the apex host would cost every card an extra redirect hop. `acct` keeps
  // the bare domain — it is an identity label, not a URL.
  url: `${SITE}/archive`,
  avatar: `${SITE}/favicon.svg`,
  avatar_static: `${SITE}/favicon.svg`,
  header: '',
  followers_count: 0,
  following_count: 0,
  statuses_count: 0,
  bot: false,
  locked: false,
  discoverable: true,
  fields: [],
};

interface PastepileCreateResponse {
  slug: string;
  url: string;
  raw_url: string;
  edit_key: string;
}

interface PastepileRecentResponse {
  items: {
    slug: string;
    title: string | null;
    language: string;
    preview: string;
    created_at: string;
    url: string;
    raw_url: string;
  }[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

@Injectable({ providedIn: 'root' })
export class PastepileProvider implements PasteProvider {
  private http = inject(HttpClient);
  private feedFetch = inject(PasteFeedFetch);
  private subscriptions = inject(PasteFeedSubscriptions);
  private apiKey = inject(PastepileKey);

  readonly id = 'pastepile';
  readonly label = 'Pastepile';
  readonly feedUrl = API_URL;
  readonly visibilities = ['public', 'unlisted'] as const;
  readonly languages = [
    { value: 'plaintext', label: 'Plain text' },
    { value: 'markdown', label: 'Markdown' },
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'python', label: 'Python' },
    { value: 'java', label: 'Java' },
    { value: 'c', label: 'C' },
    { value: 'cpp', label: 'C++' },
    { value: 'csharp', label: 'C#' },
    { value: 'go', label: 'Go' },
    { value: 'rust', label: 'Rust' },
    { value: 'ruby', label: 'Ruby' },
    { value: 'php', label: 'PHP' },
    { value: 'html', label: 'HTML' },
    { value: 'css', label: 'CSS' },
    { value: 'sql', label: 'SQL' },
    { value: 'json', label: 'JSON' },
    { value: 'yaml', label: 'YAML' },
    { value: 'bash', label: 'Bash' },
  ] as const;
  /**
   * Expiry options, which depend on whether a key is attached — the one place
   * where adding a key *removes* a capability.
   *
   * Keyless anonymous requests may create no-expiry pastes; a **free** key
   * rejects `expiry: "never"` with `expiry_not_allowed` (verified against the
   * live API, and documented under "Limits (per key plan)"). Recomputing the
   * list means the composer never offers an option that is about to 400, rather
   * than letting someone discover it by losing a paste they just wrote.
   */
  get expiries(): readonly { value: PasteExpiry; label: string }[] {
    const timed: { value: PasteExpiry; label: string }[] = [
      { value: '10m', label: '10 minutes' },
      { value: '1h', label: '1 hour' },
      { value: '1d', label: '1 day' },
      { value: '1w', label: '1 week' },
      { value: '1mo', label: '1 month' },
      { value: 'burn', label: 'Burn after reading' },
    ];
    // Never-expiring is available keyless, or on a paid key — but not on the
    // free key this app mints, which is the trap being avoided.
    const neverAllowed = !this.apiKey.connected() || this.apiKey.allowsNeverExpiry();
    return neverAllowed ? [...timed, { value: 'never', label: 'Never' }] : timed;
  }

  create(input: PasteCreateInput): Observable<PasteCreated> {
    const key = this.apiKey.key();
    return this.http
      .post<PastepileCreateResponse>(
        API_URL,
        {
          title: input.title || undefined,
          content: input.content,
          language: input.language,
          expiry: input.expiry,
          visibility: input.visibility,
        },
        {
          context: externalFetch(),
          // The key is what makes this paste show up under `scope=mine` later.
          // Absent it, the create still works — just anonymously.
          ...(key ? { headers: new HttpHeaders({ 'X-API-Key': key }) } : {}),
        },
      )
      .pipe(
        map((created) => ({
          slug: created.slug,
          url: created.url,
          rawUrl: created.raw_url,
          editKey: created.edit_key,
        })),
      );
  }

  update(
    slug: string,
    editKey: string,
    input: Pick<PasteCreateInput, 'title' | 'content' | 'language'>,
  ): Observable<void> {
    return this.http
      .patch(
        `${API_URL}/${encodeURIComponent(slug)}`,
        {
          title: input.title || null,
          content: input.content,
          language: input.language,
          edit_key: editKey,
        },
        { context: externalFetch() },
      )
      .pipe(map(() => undefined));
  }

  delete(slug: string, editKey: string): Observable<void> {
    return this.http
      .delete(`${API_URL}/${encodeURIComponent(slug)}`, {
        context: externalFetch(),
        headers: new HttpHeaders({ 'X-Edit-Key': editKey }),
      })
      .pipe(map(() => undefined));
  }

  /**
   * Recent public pastes.
   *
   * Goes through {@link PasteFeedFetch} like the other feed providers, so the
   * user's per-feed proxy opt-in is honoured here too. Pastepile does not
   * *need* a proxy now that the host is right — it sends `Allow-Origin: *` —
   * but the switch exists for the day it breaks again, and for readers behind a
   * network that blocks the host outright. Off by default, as everywhere else.
   */
  recent(): Observable<PasteRecentItem[]> {
    return this.feedFetch
      .json<PastepileRecentResponse>(
        `${API_URL}?limit=50`,
        this.subscriptions.usesProxy(this.id),
        this.label,
      )
      .pipe(
        map((response) =>
          (response?.items ?? []).map((item) => ({
            slug: item.slug,
            title: item.title,
            language: item.language,
            preview: item.preview,
            createdAt: item.created_at,
            url: item.url,
            rawUrl: item.raw_url,
          })),
        ),
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
      visibility: 'public',
      url: item.url,
      account: PASTEPILE_ACCOUNT,
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
      language: item.language,
      media_attachments: [],
      application: { name: this.label, website: SITE },
    };
  }
}
