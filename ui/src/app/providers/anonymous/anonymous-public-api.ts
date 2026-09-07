import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, timeout } from 'rxjs';
import { AccountStatusesOptions } from '../../api';
import { PeopleCursorSource, peopleCursorFrom } from '../../people-cursor';
import { Account, Collection, Context, SearchResults, Status, StatusEdit, Tag } from '../../models';
import { externalFetch } from '../external-fetch';
import { adaptAnonymousAccount, adaptAnonymousStatus } from './anonymous-mastodon-provider';
import { AnonymousPublicRef } from './anonymous-route-ref';

const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Followers/following page size. Named because {@link peopleCursorFrom} needs
 * the same number to tell a full page from the short one that ends a walk.
 */
const PEOPLE_PAGE_LIMIT = 80;
const ANONYMOUS_POST_SEARCH_TAG_LIMIT = 10;

/**
 * Operators the Mastodon query serializer emits, with an optional `-` prefix.
 *
 * Stripped before the query becomes hashtags. Anonymous post search is a
 * hashtag transform — it cannot honour an operator — but it used to *shred*
 * them instead of ignoring them: `from:@jcrabapple@dmv.community` became the
 * tags `from`, `jcrabapple`, `dmv` and `community`, so the reader got posts
 * tagged #from and #dmv and no sign that the operator had been dropped. A word
 * that only ever appeared inside an operator is not a topic anyone searched
 * for.
 */
const OPERATOR_TOKEN = /(^|\s)-?(?:from|after|before|during|language|lang|has|is|in):\S*/giu;

function searchTags(query: string): string[] {
  const words = query.replace(OPERATOR_TOKEN, ' ');
  return [
    ...new Set((words.match(/[\p{L}\p{N}_]+/gu) ?? []).map((word) => word.toLocaleLowerCase())),
  ].slice(0, ANONYMOUS_POST_SEARCH_TAG_LIMIT);
}

/** Read-only public Mastodon API calls used by Anonymous profile and thread routes. */
@Injectable({ providedIn: 'root' })
export class AnonymousPublicApi {
  private http = inject(HttpClient);

  getAccount(ref: AnonymousPublicRef): Observable<Account> {
    return this.http
      .get<Account>(`${ref.server}/api/v1/accounts/${encodeURIComponent(ref.id)}`, {
        context: externalFetch(),
      })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((account) => adaptAnonymousAccount(account, ref.server)),
      );
  }

  /**
   * Resolve a handle into the account as its **own** server sees it.
   *
   * Account ids are local to an instance, and so are relationships: asking server X
   * about a remote account's followers or follows returns only the part of that
   * graph X happens to have federated. The account's home server is the only place
   * the list is complete, and `/api/v1/accounts/lookup` is public, so this is how
   * we get there — the same route `AnonymousMastodonProvider` already uses to read
   * a canonical timeline.
   *
   * `acct` must be the bare username for accounts local to `server`.
   */
  lookupAccount(server: string, acct: string): Observable<Account> {
    return this.http
      .get<Account>(`${server}/api/v1/accounts/lookup`, {
        params: new HttpParams().set('acct', acct),
        context: externalFetch(),
      })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((account) => adaptAnonymousAccount(account, server)),
      );
  }

  getAccountFollowers(ref: AnonymousPublicRef, maxId?: string): Observable<Account[]> {
    return this.getAccountPeople(ref, 'followers', maxId).pipe(map((page) => page.accounts));
  }

  getAccountFollowing(ref: AnonymousPublicRef, maxId?: string): Observable<Account[]> {
    return this.getAccountPeople(ref, 'following', maxId).pipe(map((page) => page.accounts));
  }

  /**
   * The same lists, with the cursor that actually walks them.
   *
   * `/followers` and `/following` paginate by internal *relationship* id, which
   * is published only in the `Link` header and is not the id of any account in
   * the body. A caller that walks by `accounts.at(-1).id` stops early at a point
   * that varies by account — often on page one, which is indistinguishable from
   * the account hiding its social graph. See {@link Api.accountFollowersPage},
   * which is the authenticated twin of this.
   */
  getAccountFollowersPage(
    ref: AnonymousPublicRef,
    maxId?: string,
  ): Observable<{
    accounts: Account[];
    nextMaxId: string | null;
    source: PeopleCursorSource;
  }> {
    return this.getAccountPeople(ref, 'followers', maxId);
  }

  getAccountFollowingPage(
    ref: AnonymousPublicRef,
    maxId?: string,
  ): Observable<{
    accounts: Account[];
    nextMaxId: string | null;
    source: PeopleCursorSource;
  }> {
    return this.getAccountPeople(ref, 'following', maxId);
  }

  /** Discoverable Collections curated by a public account (Mastodon 4.6+). */
  getAccountCollections(ref: AnonymousPublicRef): Observable<Collection[]> {
    return this.http
      .get<{
        collections: Collection[];
      }>(`${ref.server}/api/v1/accounts/${encodeURIComponent(ref.id)}/collections`, {
        context: externalFetch(),
      })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((response) => response.collections ?? []),
      );
  }

  /**
   * The accounts inside one collection.
   *
   * Readable with no token (verified against mastodon.social, 2026-08-04), and the
   * `accounts` come back as full entities carrying `statuses_count` and
   * `last_status_at` — so "Copy account" can quality-gate members without a single
   * extra request. `ref.id` is the *collection* id here, in `ref.server`'s namespace.
   */
  getCollectionAccounts(ref: AnonymousPublicRef): Observable<Account[]> {
    return this.http
      .get<{
        accounts: Account[];
      }>(`${ref.server}/api/v1/collections/${encodeURIComponent(ref.id)}`, {
        context: externalFetch(),
      })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((response) =>
          (response.accounts ?? []).map((account) => adaptAnonymousAccount(account, ref.server)),
        ),
      );
  }

  getAccountStatuses(
    ref: AnonymousPublicRef,
    opts: AccountStatusesOptions = {},
  ): Observable<Status[]> {
    let params = new HttpParams();
    if (opts.excludeReplies) params = params.set('exclude_replies', 'true');
    if (opts.excludeReblogs) params = params.set('exclude_reblogs', 'true');
    if (opts.pinned) params = params.set('pinned', 'true');
    if (opts.onlyMedia) params = params.set('only_media', 'true');
    if (opts.maxId) params = params.set('max_id', opts.maxId);
    if (opts.limit) params = params.set('limit', String(opts.limit));
    return this.http
      .get<Status[]>(`${ref.server}/api/v1/accounts/${encodeURIComponent(ref.id)}/statuses`, {
        params,
        context: externalFetch(),
      })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((statuses) => statuses.map((status) => adaptAnonymousStatus(status, ref.server))),
      );
  }

  getStatus(ref: AnonymousPublicRef): Observable<Status> {
    return this.http
      .get<Status>(`${ref.server}/api/v1/statuses/${encodeURIComponent(ref.id)}`, {
        context: externalFetch(),
      })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((status) => adaptAnonymousStatus(status, ref.server)),
      );
  }

  getContext(ref: AnonymousPublicRef): Observable<Context> {
    return this.http
      .get<Context>(`${ref.server}/api/v1/statuses/${encodeURIComponent(ref.id)}/context`, {
        context: externalFetch(),
      })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((context) => ({
          ancestors: context.ancestors.map((status) => adaptAnonymousStatus(status, ref.server)),
          descendants: context.descendants.map((status) =>
            adaptAnonymousStatus(status, ref.server),
          ),
        })),
      );
  }

  /** Edit history is public for public statuses. */
  getStatusHistory(ref: AnonymousPublicRef): Observable<StatusEdit[]> {
    return this.http
      .get<StatusEdit[]>(`${ref.server}/api/v1/statuses/${encodeURIComponent(ref.id)}/history`, {
        context: externalFetch(),
      })
      .pipe(timeout(REQUEST_TIMEOUT_MS));
  }

  getTag(server: string, name: string): Observable<Tag> {
    return this.http
      .get<Tag>(`${server}/api/v1/tags/${encodeURIComponent(name)}`, {
        context: externalFetch(),
      })
      .pipe(timeout(REQUEST_TIMEOUT_MS));
  }

  /** `limit` is capped at 40 by Mastodon; analytics pages at the cap to halve calls. */
  getTagTimeline(server: string, name: string, maxId?: string, limit = 20): Observable<Status[]> {
    let params = new HttpParams().set('limit', String(limit));
    if (maxId) params = params.set('max_id', maxId);
    return this.http
      .get<Status[]>(`${server}/api/v1/timelines/tag/${encodeURIComponent(name)}`, {
        params,
        context: externalFetch(),
      })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((statuses) => statuses.map((status) => adaptAnonymousStatus(status, server))),
      );
  }

  /** The distinct hashtags an anonymous post query maps to, capped so the caller
   *  can bound fan-out to its API-call budget (`maxTags`). Exposed so the search
   *  page can size its budget and explain the transform before fetching. */
  hashtagsForQuery(query: string, maxTags = ANONYMOUS_POST_SEARCH_TAG_LIMIT): string[] {
    return searchTags(query).slice(0, Math.max(0, maxTags));
  }

  /**
   * Approximate anonymous post search by merging one public hashtag timeline per
   * query word. Costs one API call per tag (see {@link hashtagsForQuery}); the
   * caller caps `maxTags` to stay within its budget. `maxIds` supplies a per-tag
   * `max_id` so "load more" fetches the next page of each timeline.
   */
  searchPostsByHashtags(
    server: string,
    query: string,
    opts: { maxTags?: number; maxIds?: Record<string, string> } = {},
  ): Observable<SearchResults> {
    const tags = this.hashtagsForQuery(query, opts.maxTags ?? ANONYMOUS_POST_SEARCH_TAG_LIMIT);
    if (!tags.length) {
      return of({ accounts: [], statuses: [], hashtags: [] });
    }
    return forkJoin(
      tags.map((tag) =>
        this.getTagTimeline(server, tag, opts.maxIds?.[tag]).pipe(
          catchError(() => of<Status[]>([])),
        ),
      ),
    ).pipe(
      map((pages) => {
        const byUrl = new Map<string, Status>();
        for (const status of pages.flat()) {
          const key = status.url || status.id;
          if (!byUrl.has(key)) byUrl.set(key, status);
        }
        return {
          accounts: [],
          statuses: [...byUrl.values()].sort(
            (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
          ),
          hashtags: tags.map((name) => ({
            name,
            url: `${server}/tags/${encodeURIComponent(name)}`,
          })),
        };
      }),
    );
  }

  search(
    server: string,
    query: string,
    type: 'accounts' | 'statuses' | 'hashtags',
    opts: { offset?: number; limit?: number } = {},
  ): Observable<SearchResults> {
    // Real mastodon.social paginates account search by offset/limit; thread them
    // through so "load more" can page past the first batch (the endpoint returns
    // a small unranked page otherwise).
    let params = new HttpParams().set('q', query).set('type', type);
    if (opts.offset) {
      params = params.set('offset', String(opts.offset));
    }
    if (opts.limit) {
      params = params.set('limit', String(opts.limit));
    }
    return this.http
      .get<SearchResults>(`${server}/api/v2/search`, { params, context: externalFetch() })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((results) => ({
          accounts: results.accounts.map((account) => adaptAnonymousAccount(account, server)),
          statuses: results.statuses.map((status) => adaptAnonymousStatus(status, server)),
          hashtags: results.hashtags,
        })),
      );
  }

  private getAccountPeople(
    ref: AnonymousPublicRef,
    kind: 'followers' | 'following',
    maxId?: string,
  ): Observable<{
    accounts: Account[];
    nextMaxId: string | null;
    source: PeopleCursorSource;
  }> {
    let params = new HttpParams().set('limit', String(PEOPLE_PAGE_LIMIT));
    if (maxId) params = params.set('max_id', maxId);
    return this.http
      .get<
        Account[]
      >(`${ref.server}/api/v1/accounts/${encodeURIComponent(ref.id)}/${kind}`, { params, context: externalFetch(), observe: 'response' })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((response) => {
          const accounts = (response.body ?? []).map((account) =>
            adaptAnonymousAccount(account, ref.server),
          );
          // A cross-origin read only exposes headers the server allows, and
          // `Link` is not CORS-safelisted — so anything that drops
          // `Access-Control-Expose-Headers` makes the cursor unreadable here.
          // Degrading to "one page" hides thousands of rows behind what looks
          // like a privacy setting, so a missing header falls back to the
          // account-id cursor instead — see `peopleCursorFrom` for the fences.
          return {
            accounts,
            ...peopleCursorFrom(response.headers.get('Link'), accounts, PEOPLE_PAGE_LIMIT),
          };
        }),
      );
  }
}
