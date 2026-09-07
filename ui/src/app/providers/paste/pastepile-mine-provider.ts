import { inject, Injectable } from '@angular/core';
import { map, Observable, throwError } from 'rxjs';
import { Account, Status } from '../../models';
import { PasteFeedFetch } from './paste-feed-fetch';
import { PasteFeedSubscriptions } from './paste-feed-subscriptions';
import { PastepileKey } from './pastepile-key';
import { PastepileProvider } from './pastepile-provider';
import { FeedPasteProvider, PasteRecentItem } from './paste-provider';

const SITE = 'https://www.pastepile.com';
const FEED_URL = `${SITE}/api/public/pastes?scope=mine`;

const MINE_ACCOUNT: Account = {
  id: 'paste:pastepile-mine',
  username: 'mine',
  acct: 'mine@pastepile.com',
  display_name: 'My Pastepile pastes',
  note: 'Pastes you created with your Pastepile API key, including unlisted ones.',
  url: `${SITE}/my-pastes`,
  avatar: `${SITE}/favicon.svg`,
  avatar_static: `${SITE}/favicon.svg`,
  header: '',
  followers_count: 0,
  following_count: 0,
  statuses_count: 0,
  bot: false,
  locked: false,
  discoverable: false,
  fields: [],
};

interface PastepileRecentResponse {
  items?: {
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

/**
 * Your own Pastepile pastes, as a subscribable feed.
 *
 * This is the feature that makes a paste feed worth having. A public feed you
 * can only read is a stream of strangers' content; the loop that matters is
 * post something, then see *your own* paste in your timeline. Pastepile
 * supports exactly that through `?scope=mine`, which lists everything created
 * with your API key — unlisted pastes included, which the public feed omits.
 *
 * Separate from {@link PastepileProvider} rather than a mode of it, because a
 * subscription is a single row the user turns on or off: "the public firehose"
 * and "my own pastes" are two different things to want, and several people want
 * only the second. Creating still happens through the main provider — this one
 * is read-only and never appears in the composer's destination list.
 *
 * Inert without a key, and honest about why: no key means nothing to scope by,
 * so it refuses rather than silently showing the public feed instead.
 */
@Injectable({ providedIn: 'root' })
export class PastepileMineProvider implements FeedPasteProvider {
  private feedFetch = inject(PasteFeedFetch);
  private subscriptions = inject(PasteFeedSubscriptions);
  private apiKey = inject(PastepileKey);
  private pastepile = inject(PastepileProvider);

  readonly id = 'pastepile-mine';
  readonly label = 'My Pastepile pastes';
  readonly feedUrl = FEED_URL;
  /** Read-only view; editing happens on the paste itself via its edit key. */
  readonly immutable = true;
  readonly visibilities = ['public', 'unlisted'] as const;
  readonly languages = this.pastepile.languages;
  get expiries() {
    return this.pastepile.expiries;
  }

  /** True when a key is set, so the UI can explain why the feed is inert. */
  hasKey(): boolean {
    return this.apiKey.key() !== null;
  }

  create(): Observable<never> {
    return throwError(
      () =>
        new Error('This is a view of your existing pastes. Create pastes with Pastepile itself.'),
    );
  }

  update(): Observable<void> {
    return throwError(() => new Error('Edit a paste from My Pastes, using its edit key.'));
  }

  delete(): Observable<void> {
    return throwError(() => new Error('Delete a paste from My Pastes, using its edit key.'));
  }

  recent(): Observable<PasteRecentItem[]> {
    const key = this.apiKey.key();
    if (!key) {
      return throwError(
        () =>
          new Error(
            'Your own pastes need a Pastepile API key — generate a free one on the Pastes page.',
          ),
      );
    }
    // Header auth only. `?key=` and `?api_key=` are accepted by the URL parser
    // and then ignored — the request succeeds with an empty list rather than
    // failing, so a query-parameter version of this would look like "you have
    // no pastes" forever. Verified against the live API.
    return this.feedFetch
      .json<PastepileRecentResponse>(
        `${FEED_URL}&limit=50`,
        this.subscriptions.usesProxy(this.id),
        this.label,
        { 'X-API-Key': key },
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
      providerRef: { providerId: 'pastepile', slug: item.slug },
      id: `paste:${this.id}:${item.slug}`,
      created_at: item.createdAt,
      edited_at: null,
      content,
      spoiler_text: '',
      visibility: 'public',
      url: item.url,
      account: MINE_ACCOUNT,
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
      application: { name: 'Pastepile', website: SITE },
    };
  }
}
