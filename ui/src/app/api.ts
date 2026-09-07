import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { SearchServer, searchServerRequest } from './search-server';
import { SERVER_ROLE, serverRole } from './server-role';
import {
  Account,
  Announcement,
  Collection,
  CollectionItem,
  CollectionWithAccounts,
  ComposeOptions,
  ContentFilter,
  Context,
  Conversation,
  CustomEmoji,
  FeaturedTag,
  FilterAction,
  FilterContext,
  FilterKeyword,
  FilterKeywordDraft,
  InstanceInfo,
  InstanceRule,
  TrendLink,
  MastodonNotification,
  MediaAttachment,
  OAuthApp,
  OAuthTokenResponse,
  Poll,
  Preferences,
  Relationship,
  ScheduledStatus,
  SearchResults,
  Status,
  StatusEdit,
  StatusSource,
  Tag,
  TermsOfService,
  Translation,
  UserList,
} from './models';
import { TrendLanguageFilter } from './trend-language-filter';
import { PeopleCursorSource, nextMaxIdFrom, peopleCursorFrom } from './people-cursor';

// Re-exported: it lived here first and several specs and callers import it from
// this module. Its home is now `people-cursor.ts`, beside the fallback that uses it.
export { nextMaxIdFrom } from './people-cursor';

/** Filters/paging for an account's statuses (Mastodon query params). */
export interface AccountStatusesOptions {
  excludeReplies?: boolean;
  excludeReblogs?: boolean;
  pinned?: boolean;
  /**
   * Only posts carrying attachments (`only_media=true`).
   *
   * Server-side, so the profile's media wall fills from one or two requests
   * instead of paging through a text-heavy account hunting for pictures. The
   * non-Mastodon providers have no equivalent and scrape their own bodies
   * instead — see `pages/profile/media/profile-media-item.ts`.
   */
  onlyMedia?: boolean;
  maxId?: string;
  limit?: number;
}

/**
 * Thin wrapper over the Mastodon REST API.
 *
 * Every endpoint here is public Mastodon, so this class works against any
 * compliant instance as well as the bundled mock server. Mock-server-only
 * endpoints (`/api/v1/_mock/*`) live on {@link MockApi}, which is file-replaced
 * in the standalone Mocking Bird build so those URLs never ship.
 */
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  private trendLangFilter = inject(TrendLanguageFilter);
  private searchServer = inject(SearchServer);

  // --- auth / account ---
  verifyCredentials(): Observable<Account> {
    return this.http.get<Account>('/api/v1/accounts/verify_credentials');
  }

  getAccount(id: string): Observable<Account> {
    return this.http.get<Account>(`/api/v1/accounts/${id}`);
  }

  /**
   * Resolve a `username@host` handle to an account.
   *
   * Exact match, no webfinger — this server answers for accounts it already knows, and
   * 404s for anyone it doesn't. That is the right shape for client lists, which store
   * handles and need to know which of them this instance can actually show.
   */
  lookupAccount(acct: string): Observable<Account> {
    return this.http.get<Account>('/api/v1/accounts/lookup', {
      params: new HttpParams().set('acct', acct),
    });
  }

  getAccountStatuses(id: string, opts: AccountStatusesOptions = {}): Observable<Status[]> {
    let params = new HttpParams();
    if (opts.excludeReplies) {
      params = params.set('exclude_replies', 'true');
    }
    if (opts.excludeReblogs) {
      params = params.set('exclude_reblogs', 'true');
    }
    if (opts.pinned) {
      params = params.set('pinned', 'true');
    }
    if (opts.onlyMedia) {
      params = params.set('only_media', 'true');
    }
    if (opts.maxId) {
      params = params.set('max_id', opts.maxId);
    }
    if (opts.limit) {
      params = params.set('limit', String(opts.limit));
    }
    return this.http.get<Status[]>(`/api/v1/accounts/${id}/statuses`, { params });
  }

  /**
   * Fetch many accounts in one call (Mastodon 4.3+ `GET /api/v1/accounts`).
   *
   * The full account entity, which the thin ones returned by some providers are
   * missing — `last_status_at` above all, the field "when did this person last
   * post" needs. Verified against mastodon.social: 200 with both a local and a
   * remote id, each carrying `last_status_at` as a plain date ("2026-08-07").
   *
   * Ids the server doesn't know are simply absent from the response rather than
   * erroring the batch, so callers must match on what came back, not on order.
   */
  getAccounts(ids: string[]): Observable<Account[]> {
    let params = new HttpParams();
    for (const id of ids) {
      params = params.append('id[]', id);
    }
    return this.http.get<Account[]>('/api/v1/accounts', { params });
  }

  relationships(ids: string[]): Observable<Relationship[]> {
    let params = new HttpParams();
    for (const id of ids) {
      params = params.append('id[]', id);
    }
    return this.http.get<Relationship[]>('/api/v1/accounts/relationships', { params });
  }

  follow(id: string, options?: { reblogs?: boolean }): Observable<Relationship> {
    return this.http.post<Relationship>(`/api/v1/accounts/${id}/follow`, options ?? {});
  }

  /** Accounts this account features on its profile ("collections"; Mastodon 4.4+). */
  accountEndorsements(id: string): Observable<Account[]> {
    return this.http.get<Account[]>(`/api/v1/accounts/${id}/endorsements`);
  }

  /** One page of an account's followers (Mastodon caps limit at 80). */
  accountFollowers(id: string, maxId?: string, limit = 80): Observable<Account[]> {
    let params = new HttpParams().set('limit', String(limit));
    if (maxId) {
      params = params.set('max_id', maxId);
    }
    return this.http.get<Account[]>(`/api/v1/accounts/${id}/followers`, { params });
  }

  /** One page of the accounts this account follows (Mastodon caps limit at 80). */
  accountFollowing(id: string, maxId?: string, limit = 80): Observable<Account[]> {
    let params = new HttpParams().set('limit', String(limit));
    if (maxId) {
      params = params.set('max_id', maxId);
    }
    return this.http.get<Account[]>(`/api/v1/accounts/${id}/following`, { params });
  }

  /**
   * One followers page with Mastodon's opaque next cursor from the Link header.
   *
   * The followers counterpart of {@link accountFollowingPage}, and required for
   * the same reason: `/followers` paginates by an internal *relationship* id
   * that appears nowhere in the account objects it returns. Walking it with the
   * last account's `id` re-reads page one forever — a 3,000-follower account
   * happily yields 9,000 "accounts" that way.
   *
   * When the `Link` header does not reach us at all — anything that drops
   * `Access-Control-Expose-Headers: Link` hides it from the browser — the walk
   * falls back to that imperfect account-id cursor rather than stopping at one
   * page. {@link peopleCursorFrom} explains why that trade is the right one and
   * how it is fenced; `source` reports which cursor is in play.
   */
  accountFollowersPage(
    id: string,
    maxId?: string,
    limit = 80,
  ): Observable<{
    accounts: Account[];
    nextMaxId: string | null;
    source: PeopleCursorSource;
  }> {
    let params = new HttpParams().set('limit', String(limit));
    if (maxId) {
      params = params.set('max_id', maxId);
    }
    return this.http
      .get<Account[]>(`/api/v1/accounts/${id}/followers`, { params, observe: 'response' })
      .pipe(
        map((response) => {
          const accounts = response.body ?? [];
          return {
            accounts,
            ...peopleCursorFrom(response.headers.get('Link'), accounts, limit),
          };
        }),
      );
  }

  /**
   * One following page with Mastodon's opaque next cursor from the Link header.
   * Account ids are not pagination cursors on every server, so bulk walkers must
   * use this instead of guessing `max_id` from the last account in the body —
   * except when the header never arrives, where {@link peopleCursorFrom} prefers
   * the imperfect guess to a list that stops at 80. `source` says which happened.
   */
  accountFollowingPage(
    id: string,
    maxId?: string,
    limit = 80,
  ): Observable<{
    accounts: Account[];
    nextMaxId: string | null;
    source: PeopleCursorSource;
  }> {
    let params = new HttpParams().set('limit', String(limit));
    if (maxId) {
      params = params.set('max_id', maxId);
    }
    return this.http
      .get<Account[]>(`/api/v1/accounts/${id}/following`, {
        params,
        observe: 'response',
      })
      .pipe(
        map((response) => {
          const accounts = response.body ?? [];
          return {
            accounts,
            ...peopleCursorFrom(response.headers.get('Link'), accounts, limit),
          };
        }),
      );
  }

  unfollow(id: string): Observable<Relationship> {
    return this.http.post<Relationship>(`/api/v1/accounts/${id}/unfollow`, {});
  }

  removeFollower(id: string): Observable<Relationship> {
    return this.http.post<Relationship>(`/api/v1/accounts/${id}/remove_from_followers`, {});
  }

  // --- directory ---
  /**
   * The instance's profile directory: accounts that opted in to discovery.
   *
   * Offset-paged rather than cursor-paged (it is the one listing endpoint that
   * is), and capped at 80 per page server-side. `local=false` lets remote
   * accounts the server knows about appear too. Public — no token required —
   * though some instances disable the directory entirely, which surfaces as an
   * error rather than an empty page (see the directory page's probe).
   */
  directory(options: {
    order: 'active' | 'new';
    local: boolean;
    limit?: number;
    offset?: number;
  }): Observable<Account[]> {
    let params = new HttpParams()
      .set('order', options.order)
      .set('local', String(options.local))
      .set('limit', String(options.limit ?? 80));
    if (options.offset) {
      params = params.set('offset', String(options.offset));
    }
    return this.http.get<Account[]>('/api/v1/directory', { params });
  }

  // --- timelines ---
  homeTimeline(maxId?: string): Observable<Status[]> {
    return this.http.get<Status[]>('/api/v1/timelines/home', { params: this.pageParams(maxId) });
  }

  publicTimeline(local: boolean, maxId?: string): Observable<Status[]> {
    let params = this.pageParams(maxId);
    if (local) {
      params = params.set('local', 'true');
    }
    return this.http.get<Status[]>('/api/v1/timelines/public', { params });
  }

  /** `limit` is capped at 40 by Mastodon; analytics pages at the cap to halve calls. */
  tagTimeline(tag: string, maxId?: string, limit?: number): Observable<Status[]> {
    let params = this.pageParams(maxId);
    if (limit) {
      params = params.set('limit', String(limit));
    }
    return this.http.get<Status[]>(`/api/v1/timelines/tag/${encodeURIComponent(tag)}`, {
      params,
      context: serverRole('tag'),
    });
  }

  // --- statuses ---
  getStatus(id: string): Observable<Status> {
    return this.http.get<Status>(`/api/v1/statuses/${id}`);
  }

  getContext(id: string): Observable<Context> {
    return this.http.get<Context>(`/api/v1/statuses/${id}/context`);
  }

  postStatus(
    status: string,
    options: ComposeOptions = {},
    idempotencyKey?: string,
  ): Observable<Status> {
    // The backend accepts JSON for statuses, including a nested poll object and a
    // media_ids array, so a plain JSON body suffices (no `key[]` form encoding).
    const body: Record<string, unknown> = { status };
    if (options.inReplyToId) {
      body['in_reply_to_id'] = options.inReplyToId;
    }
    if (options.quotedStatusId) {
      body['quoted_status_id'] = options.quotedStatusId;
    }
    if (options.visibility) {
      body['visibility'] = options.visibility;
    }
    if (options.spoilerText) {
      body['spoiler_text'] = options.spoilerText;
    }
    if (options.sensitive) {
      body['sensitive'] = true;
    }
    if (options.mediaIds?.length) {
      body['media_ids'] = options.mediaIds;
    }
    if (options.poll) {
      body['poll'] = {
        options: options.poll.options,
        expires_in: options.poll.expiresIn,
        multiple: options.poll.multiple,
      };
    }
    if (options.scheduledAt) {
      // With a far-enough scheduled_at the server returns a ScheduledStatus,
      // not a Status — callers that schedule must not treat the result as one.
      body['scheduled_at'] = options.scheduledAt;
    }
    if (options.language) {
      body['language'] = options.language;
    }
    const headers = idempotencyKey
      ? new HttpHeaders().set('Idempotency-Key', idempotencyKey)
      : undefined;
    return this.http.post<Status>('/api/v1/statuses', body, { headers });
  }

  // --- scheduled statuses ---
  scheduledStatuses(): Observable<ScheduledStatus[]> {
    return this.http.get<ScheduledStatus[]>('/api/v1/scheduled_statuses');
  }

  cancelScheduledStatus(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/scheduled_statuses/${id}`);
  }

  // --- media ---
  uploadMedia(file: File, description?: string): Observable<MediaAttachment> {
    const form = new FormData();
    form.append('file', file);
    if (description?.trim()) {
      form.append('description', description.trim());
    }
    return this.http.post<MediaAttachment>('/api/v2/media', form);
  }

  updateMedia(id: string, description: string): Observable<MediaAttachment> {
    return this.http.put<MediaAttachment>(`/api/v1/media/${id}`, { description });
  }

  // --- polls ---
  votePoll(pollId: string, choices: number[]): Observable<Poll> {
    return this.http.post<Poll>(`/api/v1/polls/${pollId}/votes`, { choices });
  }

  deleteStatus(id: string): Observable<Status> {
    return this.http.delete<Status>(`/api/v1/statuses/${id}`);
  }

  getStatusSource(id: string): Observable<StatusSource> {
    return this.http.get<StatusSource>(`/api/v1/statuses/${id}/source`);
  }

  editStatus(id: string, status: string, spoilerText?: string): Observable<Status> {
    const body: Record<string, string> = { status };
    if (spoilerText !== undefined) {
      body['spoiler_text'] = spoilerText;
    }
    return this.http.put<Status>(`/api/v1/statuses/${id}`, body);
  }

  favourite(id: string): Observable<Status> {
    return this.http.post<Status>(`/api/v1/statuses/${id}/favourite`, {});
  }

  unfavourite(id: string): Observable<Status> {
    return this.http.post<Status>(`/api/v1/statuses/${id}/unfavourite`, {});
  }

  reblog(id: string): Observable<Status> {
    return this.http.post<Status>(`/api/v1/statuses/${id}/reblog`, {});
  }

  unreblog(id: string): Observable<Status> {
    return this.http.post<Status>(`/api/v1/statuses/${id}/unreblog`, {});
  }

  bookmark(id: string): Observable<Status> {
    return this.http.post<Status>(`/api/v1/statuses/${id}/bookmark`, {});
  }

  unbookmark(id: string): Observable<Status> {
    return this.http.post<Status>(`/api/v1/statuses/${id}/unbookmark`, {});
  }

  pin(id: string): Observable<Status> {
    return this.http.post<Status>(`/api/v1/statuses/${id}/pin`, {});
  }

  unpin(id: string): Observable<Status> {
    return this.http.post<Status>(`/api/v1/statuses/${id}/unpin`, {});
  }

  muteStatus(id: string): Observable<Status> {
    return this.http.post<Status>(`/api/v1/statuses/${id}/mute`, {});
  }

  unmuteStatus(id: string): Observable<Status> {
    return this.http.post<Status>(`/api/v1/statuses/${id}/unmute`, {});
  }

  translate(id: string): Observable<Translation> {
    return this.http.post<Translation>(`/api/v1/statuses/${id}/translate`, {});
  }

  statusHistory(id: string): Observable<StatusEdit[]> {
    return this.http.get<StatusEdit[]>(`/api/v1/statuses/${id}/history`);
  }

  favouritedBy(id: string): Observable<Account[]> {
    return this.http.get<Account[]>(`/api/v1/statuses/${id}/favourited_by`);
  }

  rebloggedBy(id: string): Observable<Account[]> {
    return this.http.get<Account[]>(`/api/v1/statuses/${id}/reblogged_by`);
  }

  setInteractionPolicy(id: string, policy: string): Observable<Status> {
    return this.http.put<Status>(`/api/v1/statuses/${id}/interaction_policy`, {
      quote_approval_policy: policy,
    });
  }

  revokeQuote(quotedId: string, quotingId: string): Observable<Status> {
    return this.http.post<Status>(`/api/v1/statuses/${quotedId}/quotes/${quotingId}/revoke`, {});
  }

  // --- notifications ---
  notifications(maxId?: string): Observable<MastodonNotification[]> {
    let params = new HttpParams();
    if (maxId) {
      params = params.set('max_id', maxId);
    }
    return this.http.get<MastodonNotification[]>('/api/v1/notifications', { params });
  }

  // --- favourites / bookmarks ---
  favourites(): Observable<Status[]> {
    return this.http.get<Status[]>('/api/v1/favourites');
  }

  /**
   * One page of favourites, plus where the next page starts.
   *
   * Favourites paginate by *favourite* id, which — like mutes and blocks above —
   * appears nowhere in the statuses returned, so the cursor is only ever in the
   * `Link` header. The plain `favourites()` above reads the first page and is
   * what the Favourites screen wants; this is for walking the whole list.
   */
  favouritesPage(
    maxId?: string,
    limit = 40,
  ): Observable<{ statuses: Status[]; nextMaxId: string | null }> {
    let params = new HttpParams().set('limit', String(limit));
    if (maxId) {
      params = params.set('max_id', maxId);
    }
    return this.http.get<Status[]>('/api/v1/favourites', { params, observe: 'response' }).pipe(
      map((response) => ({
        statuses: response.body ?? [],
        nextMaxId: nextMaxIdFrom(response.headers.get('Link')),
      })),
    );
  }

  bookmarks(maxId?: string, limit?: number): Observable<Status[]> {
    let params = new HttpParams();
    if (maxId) {
      params = params.set('max_id', maxId);
    }
    if (limit) {
      params = params.set('limit', String(limit));
    }
    return this.http.get<Status[]>('/api/v1/bookmarks', { params });
  }

  // --- search ---
  search(
    q: string,
    type?: 'accounts' | 'statuses' | 'hashtags',
    opts?: { resolve?: boolean; limit?: number; offset?: number },
  ): Observable<SearchResults> {
    let params = new HttpParams().set('q', q);
    if (type) {
      params = params.set('type', type);
    }
    if (opts?.resolve && !this.searchServer.active()) {
      // Asks the server to webfinger accounts it hasn't seen yet (needs auth) —
      // pointless against a search server, where we're anonymous by design.
      params = params.set('resolve', 'true');
    }
    if (opts?.limit) {
      params = params.set('limit', String(opts.limit));
    }
    if (opts?.offset) {
      // Mastodon's /api/v2/search paginates by offset (not max_id) — how "load
      // more" pulls the next page of results for the same query.
      params = params.set('offset', String(opts.offset));
    }
    // Tagged so the server/auth interceptors can divert this one call to a
    // separately chosen search server (see search-server.ts). No-op when none is set.
    return this.http.get<SearchResults>('/api/v2/search', {
      params,
      // The role rides on the *same* context as the diversion flag: search may
      // already be talking to a different host, which is exactly why its failures
      // must not be read as the home server being down.
      context: searchServerRequest().set(SERVER_ROLE, 'search'),
    });
  }

  // --- lists ---
  lists(): Observable<UserList[]> {
    return this.http.get<UserList[]>('/api/v1/lists');
  }

  getList(id: string): Observable<UserList> {
    return this.http.get<UserList>(`/api/v1/lists/${id}`);
  }

  /** `limit` is capped at 40 by Mastodon; analytics pages at the cap to halve calls. */
  listTimeline(id: string, maxId?: string, limit?: number): Observable<Status[]> {
    let params = this.pageParams(maxId);
    if (limit) {
      params = params.set('limit', String(limit));
    }
    return this.http.get<Status[]>(`/api/v1/timelines/list/${id}`, { params });
  }

  // create_list / update_list take form-encoded params, not JSON.
  createList(title: string): Observable<UserList> {
    const body = new HttpParams().set('title', title);
    return this.http.post<UserList>('/api/v1/lists', body);
  }

  deleteList(id: string): Observable<unknown> {
    return this.http.delete(`/api/v1/lists/${id}`);
  }

  listAccounts(id: string): Observable<Account[]> {
    return this.http.get<Account[]>(`/api/v1/lists/${id}/accounts`);
  }

  /**
   * One page of a list's members, plus where the next page starts.
   *
   * {@link listAccounts} takes whatever the server gives in one response, which
   * is fine for rendering the Members tab. Anything that acts on *every* member
   * needs the whole list, and Mastodon caps this endpoint at 80 per page with
   * the cursor in the `Link` header — see {@link accountListPage} for why the
   * header is the only place to get it.
   */
  listAccountsPage(
    id: string,
    maxId?: string,
    limit = 80,
  ): Observable<{ accounts: Account[]; nextMaxId: string | null }> {
    let params = new HttpParams().set('limit', String(limit));
    if (maxId) {
      params = params.set('max_id', maxId);
    }
    return this.http
      .get<Account[]>(`/api/v1/lists/${id}/accounts`, { params, observe: 'response' })
      .pipe(
        map((response) => ({
          accounts: response.body ?? [],
          nextMaxId: nextMaxIdFrom(response.headers.get('Link')),
        })),
      );
  }

  // --- collections (Mastodon 4.6+) ---
  // Note: the local mock's collection endpoints are stateless stubs (empty
  // lists / 404s), so these are mainly exercised against a real server.
  // The account-scoped lists live under /accounts/{id}/... (verified against
  // mastodon.social) and wrap their payload in `{collections: [...]}`.

  /** Collections curated by the given account. */
  accountCollections(accountId: string): Observable<Collection[]> {
    return this.http
      .get<{ collections: Collection[] }>(`/api/v1/accounts/${accountId}/collections`)
      .pipe(map((r) => r.collections ?? []));
  }

  /** Collections the given account is featured in ("who has me in a collection"). */
  accountInCollections(accountId: string): Observable<Collection[]> {
    return this.http
      .get<{ collections: Collection[] }>(`/api/v1/accounts/${accountId}/in_collections`)
      .pipe(map((r) => r.collections ?? []));
  }

  getCollection(id: string): Observable<CollectionWithAccounts> {
    return this.http.get<CollectionWithAccounts>(`/api/v1/collections/${id}`);
  }

  createCollection(name: string, description?: string): Observable<{ collection: Collection }> {
    // mastodon.social rejects the create (422) unless `sensitive` and
    // `discoverable` are present, so send explicit defaults (verified live).
    const body: Record<string, unknown> = { name, sensitive: false, discoverable: false };
    if (description?.trim()) {
      body['description'] = description.trim();
    }
    return this.http.post<{ collection: Collection }>('/api/v1/collections', body);
  }

  updateCollection(
    id: string,
    changes: { name?: string; description?: string; discoverable?: boolean },
  ): Observable<{ collection: Collection }> {
    return this.http.patch<{ collection: Collection }>(`/api/v1/collections/${id}`, changes);
  }

  deleteCollection(id: string): Observable<unknown> {
    return this.http.delete(`/api/v1/collections/${id}`);
  }

  addCollectionAccount(
    collectionId: string,
    accountId: string,
  ): Observable<{ collection_item: CollectionItem }> {
    return this.http.post<{ collection_item: CollectionItem }>(
      `/api/v1/collections/${collectionId}/items`,
      { account_id: accountId },
    );
  }

  /** Owner removes an item (a member) from their collection. */
  removeCollectionItem(collectionId: string, itemId: string): Observable<unknown> {
    return this.http.delete(`/api/v1/collections/${collectionId}/items/${itemId}`);
  }

  /** The featured user removes *themselves* from someone else's collection. */
  revokeCollectionItem(collectionId: string, itemId: string): Observable<unknown> {
    return this.http.post(`/api/v1/collections/${collectionId}/items/${itemId}/revoke`, {});
  }

  addToList(id: string, accountId: string): Observable<unknown> {
    return this.http.post(`/api/v1/lists/${id}/accounts`, { account_ids: [accountId] });
  }

  /** Add several accounts in one Mastodon list-membership request. */
  addManyToList(id: string, accountIds: string[]): Observable<unknown> {
    return this.http.post(`/api/v1/lists/${id}/accounts`, { account_ids: accountIds });
  }

  removeFromList(id: string, accountId: string): Observable<unknown> {
    return this.http.request('delete', `/api/v1/lists/${id}/accounts`, {
      body: { account_ids: [accountId] },
    });
  }

  /** Remove several accounts in one Mastodon list-membership request. */
  removeManyFromList(id: string, accountIds: string[]): Observable<unknown> {
    return this.http.request('delete', `/api/v1/lists/${id}/accounts`, {
      body: { account_ids: accountIds },
    });
  }

  // --- reports ---
  report(
    accountId: string,
    category: string,
    comment: string,
    statusIds?: string[],
  ): Observable<unknown> {
    const body: Record<string, unknown> = { account_id: accountId, category };
    if (comment.trim()) {
      body['comment'] = comment.trim();
    }
    if (statusIds?.length) {
      body['status_ids'] = statusIds;
    }
    return this.http.post('/api/v1/reports', body);
  }

  // --- announcements ---
  announcements(): Observable<Announcement[]> {
    return this.http.get<Announcement[]>('/api/v1/announcements');
  }

  dismissAnnouncement(id: string): Observable<unknown> {
    return this.http.post(`/api/v1/announcements/${id}/dismiss`, {});
  }

  addAnnouncementReaction(id: string, name: string): Observable<unknown> {
    return this.http.put(`/api/v1/announcements/${id}/reactions/${encodeURIComponent(name)}`, {});
  }

  removeAnnouncementReaction(id: string, name: string): Observable<unknown> {
    return this.http.delete(`/api/v1/announcements/${id}/reactions/${encodeURIComponent(name)}`);
  }

  // --- conversations (DMs) ---
  conversations(maxId?: string): Observable<Conversation[]> {
    return this.http.get<Conversation[]>('/api/v1/conversations', {
      params: this.pageParams(maxId),
    });
  }

  markConversationRead(id: string): Observable<Conversation> {
    return this.http.post<Conversation>(`/api/v1/conversations/${id}/read`, {});
  }

  // --- profile / settings ---
  updateCredentials(form: FormData): Observable<Account> {
    return this.http.patch<Account>('/api/v1/accounts/update_credentials', form);
  }

  mutes(): Observable<Account[]> {
    return this.http.get<Account[]>('/api/v1/mutes');
  }

  blocks(): Observable<Account[]> {
    return this.http.get<Account[]>('/api/v1/blocks');
  }

  /**
   * One page of the mute or block list, plus where the next page starts.
   *
   * These two lists are the app's only `Link`-paginated reads. Everywhere else
   * pages by the last item's own id, which cannot work here: Mastodon paginates
   * mutes and blocks by *relationship* id, a value that appears nowhere in the
   * account objects it returns. The cursor is only ever in the `Link` header, so
   * reading the whole list means reading that header.
   *
   * A server that returns no `Link` (our mock, which answers with the entire
   * list at once) simply yields `nextMaxId: null` and the caller stops.
   */
  accountListPage(
    kind: 'mutes' | 'blocks',
    maxId?: string,
    limit = 80,
  ): Observable<{ accounts: Account[]; nextMaxId: string | null }> {
    let params = new HttpParams().set('limit', String(limit));
    if (maxId) {
      params = params.set('max_id', maxId);
    }
    return this.http.get<Account[]>(`/api/v1/${kind}`, { params, observe: 'response' }).pipe(
      map((response) => ({
        accounts: response.body ?? [],
        nextMaxId: nextMaxIdFrom(response.headers.get('Link')),
      })),
    );
  }

  /**
   * One page of the domains the user has blocked (`GET /api/v1/domain_blocks`).
   *
   * Returns bare strings, not entities — `AccountDomainBlock` ids are never
   * exposed, so as with {@link accountListPage} the only cursor is the `Link`
   * header. Mastodon defaults to 100 and caps at 200.
   */
  domainBlocksPage(
    maxId?: string,
    limit = 100,
  ): Observable<{ domains: string[]; nextMaxId: string | null }> {
    let params = new HttpParams().set('limit', String(limit));
    if (maxId) {
      params = params.set('max_id', maxId);
    }
    return this.http.get<string[]>('/api/v1/domain_blocks', { params, observe: 'response' }).pipe(
      map((response) => ({
        domains: response.body ?? [],
        nextMaxId: nextMaxIdFrom(response.headers.get('Link')),
      })),
    );
  }

  /**
   * Block a domain: hides its public posts and notifications, drops its
   * followers, and stops new follows from it.
   *
   * Sent as `FormData` rather than JSON because the documented parameter is
   * form data, and our mock declares it as `Form()` — FormData is the one
   * encoding both it and real Mastodon accept. Succeeds even when the domain is
   * already blocked or doesn't exist; only a blank or malformed domain 422s.
   */
  blockDomain(domain: string): Observable<unknown> {
    const form = new FormData();
    form.append('domain', domain);
    return this.http.post('/api/v1/domain_blocks', form);
  }

  /**
   * Unblock a domain (`DELETE /api/v1/domain_blocks`).
   *
   * The parameter rides in the query string: `HttpClient.delete` has no body
   * overload that survives every proxy, and the mock reads the query first for
   * exactly this reason. Idempotent — unblocking something that was never
   * blocked is a 200.
   */
  unblockDomain(domain: string): Observable<unknown> {
    return this.http.delete('/api/v1/domain_blocks', {
      params: new HttpParams().set('domain', domain),
    });
  }

  /** Mute an account, optionally auto-expiring after `duration` seconds. */
  muteAccount(id: string, duration?: number): Observable<Relationship> {
    return this.http.post<Relationship>(
      `/api/v1/accounts/${id}/mute`,
      duration ? { duration } : {},
    );
  }

  unmuteAccount(id: string): Observable<Relationship> {
    return this.http.post<Relationship>(`/api/v1/accounts/${id}/unmute`, {});
  }

  block(id: string): Observable<Relationship> {
    return this.http.post<Relationship>(`/api/v1/accounts/${id}/block`, {});
  }

  unblockAccount(id: string): Observable<Relationship> {
    return this.http.post<Relationship>(`/api/v1/accounts/${id}/unblock`, {});
  }

  followRequests(): Observable<Account[]> {
    return this.http.get<Account[]>('/api/v1/follow_requests');
  }

  authorizeFollowRequest(id: string): Observable<Relationship> {
    return this.http.post<Relationship>(`/api/v1/follow_requests/${id}/authorize`, {});
  }

  rejectFollowRequest(id: string): Observable<Relationship> {
    return this.http.post<Relationship>(`/api/v1/follow_requests/${id}/reject`, {});
  }

  // --- tags ---
  getTag(name: string): Observable<Tag> {
    return this.http.get<Tag>(`/api/v1/tags/${encodeURIComponent(name)}`);
  }

  followTag(name: string): Observable<Tag> {
    return this.http.post<Tag>(`/api/v1/tags/${encodeURIComponent(name)}/follow`, {});
  }

  unfollowTag(name: string): Observable<Tag> {
    return this.http.post<Tag>(`/api/v1/tags/${encodeURIComponent(name)}/unfollow`, {});
  }

  featureTag(name: string): Observable<Tag> {
    return this.http.post<Tag>(`/api/v1/tags/${encodeURIComponent(name)}/feature`, {});
  }

  unfeatureTag(name: string): Observable<Tag> {
    return this.http.post<Tag>(`/api/v1/tags/${encodeURIComponent(name)}/unfeature`, {});
  }

  followedTags(): Observable<Tag[]> {
    return this.http.get<Tag[]>('/api/v1/followed_tags');
  }

  /**
   * One page of followed hashtags, plus where the next page starts.
   *
   * Followed tags paginate by the *tag-follow* id, which — like favourites and
   * the mute/block lists — appears nowhere in the `Tag` objects returned, so the
   * cursor is only ever in the `Link` header. The plain `followedTags()` above
   * reads the first page and is what the Feeds screen wants; this is for
   * walking the whole list, which exporting has to do.
   */
  followedTagsPage(
    maxId?: string,
    limit = 100,
  ): Observable<{ tags: Tag[]; nextMaxId: string | null }> {
    let params = new HttpParams().set('limit', String(limit));
    if (maxId) {
      params = params.set('max_id', maxId);
    }
    return this.http.get<Tag[]>('/api/v1/followed_tags', { params, observe: 'response' }).pipe(
      map((response) => ({
        tags: response.body ?? [],
        nextMaxId: nextMaxIdFrom(response.headers.get('Link')),
      })),
    );
  }

  featuredTags(): Observable<FeaturedTag[]> {
    return this.http.get<FeaturedTag[]>('/api/v1/featured_tags', {
      context: serverRole('background'),
    });
  }

  // --- explore / discovery (anonymous-friendly) ---
  instanceInfo(): Observable<InstanceInfo> {
    return this.http.get<InstanceInfo>('/api/v2/instance', { context: serverRole('background') });
  }

  trendingStatuses(): Observable<Status[]> {
    return this.http.get<Status[]>('/api/v1/trends/statuses', {
      context: serverRole('background'),
    });
  }

  /**
   * Trending hashtags. Applies the client-side {@link TrendLanguageFilter}
   * centrally so every trending-tag surface (left rail, Explore, Search)
   * respects the "exclude languages I don't know" setting without its own wiring.
   */
  trendingTags(): Observable<Tag[]> {
    return this.http
      .get<Tag[]>('/api/v1/trends/tags', { context: serverRole('background') })
      .pipe(map((tags) => this.trendLangFilter.apply(tags)));
  }

  trendingLinks(): Observable<TrendLink[]> {
    return this.http.get<TrendLink[]>('/api/v1/trends/links', {
      context: serverRole('background'),
    });
  }

  // --- instance "about" info ---
  instanceRules(): Observable<InstanceRule[]> {
    return this.http.get<InstanceRule[]>('/api/v1/instance/rules', {
      context: serverRole('background'),
    });
  }

  // The endpoint 404s when no ToS is configured; callers treat that as "none".
  termsOfService(): Observable<TermsOfService> {
    return this.http.get<TermsOfService>('/api/v1/instance/terms_of_service', {
      context: serverRole('background'),
    });
  }

  customEmojis(): Observable<CustomEmoji[]> {
    return this.http.get<CustomEmoji[]>('/api/v1/custom_emojis', {
      context: serverRole('background'),
    });
  }

  /**
   * Self-service signup. Needs an app token (client_credentials) so the call is
   * authenticated the way a real client would be; returns the new account's token.
   */
  register(
    appToken: string,
    body: { username: string; email: string; password: string; agreement: boolean },
  ): Observable<OAuthTokenResponse> {
    const form = new HttpParams()
      .set('username', body.username)
      .set('email', body.email)
      .set('password', body.password)
      .set('agreement', String(body.agreement));
    // Bypass the global interceptor's active token: registration uses the app token.
    return this.http.post<OAuthTokenResponse>('/api/v1/accounts', form, {
      headers: { Authorization: `Bearer ${appToken}` },
    });
  }

  /** Acquire an app-scoped token via the client_credentials grant. */
  clientCredentialsToken(clientId: string, clientSecret: string): Observable<OAuthTokenResponse> {
    const body = new HttpParams()
      .set('grant_type', 'client_credentials')
      .set('client_id', clientId)
      .set('client_secret', clientSecret)
      .set('scope', 'read write follow');
    return this.http.post<OAuthTokenResponse>('/oauth/token', body);
  }

  /** Exercise the email-confirmation endpoint (the mock accepts and no-ops). */
  confirmEmail(): Observable<unknown> {
    return this.http.post('/api/v1/emails/confirmations', {});
  }

  // --- full OAuth flow (alternative to dev-login) ---
  registerApp(
    clientName: string,
    redirectUri: string,
    scopes = 'read write follow',
  ): Observable<OAuthApp> {
    return this.http.post<OAuthApp>('/api/v1/apps', {
      client_name: clientName,
      redirect_uris: redirectUri,
      scopes,
    });
  }

  /**
   * Redeem an authorization code. `codeVerifier` is the PKCE secret that was
   * hashed into the `code_challenge` on the authorize request; instances that
   * support PKCE (Mastodon 4.3+) bind the code to it, and instances that don't
   * ignore the extra parameter — so it is always sent.
   */
  exchangeCode(params: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
    codeVerifier?: string;
  }): Observable<OAuthTokenResponse> {
    let body = new HttpParams()
      .set('grant_type', 'authorization_code')
      .set('client_id', params.clientId)
      .set('client_secret', params.clientSecret)
      .set('redirect_uri', params.redirectUri)
      .set('code', params.code);
    if (params.codeVerifier) {
      body = body.set('code_verifier', params.codeVerifier);
    }
    return this.http.post<OAuthTokenResponse>('/oauth/token', body);
  }

  // --- preferences ---
  preferences(): Observable<Preferences> {
    return this.http.get<Preferences>('/api/v1/preferences');
  }

  // --- filters (v2) ---
  filters(): Observable<ContentFilter[]> {
    return this.http.get<ContentFilter[]>('/api/v2/filters');
  }

  getFilter(id: string): Observable<ContentFilter> {
    return this.http.get<ContentFilter>(`/api/v2/filters/${id}`);
  }

  createFilter(draft: {
    title: string;
    context: FilterContext[];
    filter_action: FilterAction;
    expires_in?: number | null;
    keywords_attributes?: FilterKeywordDraft[];
  }): Observable<ContentFilter> {
    return this.http.post<ContentFilter>('/api/v2/filters', draft);
  }

  updateFilter(
    id: string,
    changes: {
      title?: string;
      context?: FilterContext[];
      filter_action?: FilterAction;
      expires_in?: number | null;
    },
  ): Observable<ContentFilter> {
    return this.http.put<ContentFilter>(`/api/v2/filters/${id}`, changes);
  }

  deleteFilter(id: string): Observable<unknown> {
    return this.http.delete(`/api/v2/filters/${id}`);
  }

  addFilterKeyword(
    filterId: string,
    keyword: string,
    wholeWord: boolean,
  ): Observable<FilterKeyword> {
    return this.http.post<FilterKeyword>(`/api/v2/filters/${filterId}/keywords`, {
      keyword,
      whole_word: wholeWord,
    });
  }

  deleteFilterKeyword(keywordId: string): Observable<unknown> {
    return this.http.delete(`/api/v2/filters/keywords/${keywordId}`);
  }

  private pageParams(maxId?: string): HttpParams {
    let params = new HttpParams().set('limit', '20');
    if (maxId) {
      params = params.set('max_id', maxId);
    }
    return params;
  }
}
