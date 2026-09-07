import { HttpContext, HttpContextToken } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { normalizeHostUrl } from './host-url';

const SEARCH_SERVER_KEY = 'mockingbird_search_server_v1';

/**
 * Marks a request as "this is the search call" so the server interceptor can send
 * it to the separately chosen search server instead of the primary one, and the
 * auth interceptor can strip the bearer token (the token belongs to the primary
 * server — sending it to a stranger both leaks it and gets rejected).
 *
 * Scope is deliberately narrow: only /api/v2/search is tagged. Everything reached
 * *from* a result (profiles, threads, timelines) stays on the primary server,
 * because IDs minted by the search server don't resolve there.
 */
export const SEARCH_SERVER_REQUEST = new HttpContextToken<boolean>(() => false);

/** Convenience: `http.get(url, { context: searchServerRequest() })`. */
export function searchServerRequest(): HttpContext {
  return new HttpContext().set(SEARCH_SERVER_REQUEST, true);
}

/**
 * The search server: an optional *second* instance used only for search.
 *
 * Many servers disable anonymous search entirely (`/api/v2/search` 401s or returns
 * nothing without a token), which leaves anonymous visitors on an otherwise fine
 * instance with a dead Search tab. Pointing search at a server that does allow it
 * fixes that without moving feeds, profiles, or the logged-in account.
 *
 * Empty base URL means "no separate search server" — search goes to the primary
 * server like it always did.
 */
@Injectable({ providedIn: 'root' })
export class SearchServer {
  /** Normalized base URL of the search server, or '' when using the primary server. */
  readonly baseUrl = signal<string>(
    normalizeHostUrl(localStorage.getItem(SEARCH_SERVER_KEY) ?? ''),
  );

  /** True when a distinct search server is configured. */
  readonly active = computed(() => !!this.baseUrl());

  /** Bare host for display ("mastodon.social"), or null when inactive. */
  readonly host = computed<string | null>(() => {
    const base = this.baseUrl();
    return base ? base.replace(/^https?:\/\//, '') : null;
  });

  /** The search server's /about page, where instances publish donation info. */
  readonly donateUrl = computed<string | null>(() => {
    const host = this.host();
    return host ? `https://${host}/about` : null;
  });

  /**
   * Bumped every time the search server actually changes.
   *
   * Anything holding results from a search — cards, snapshots, relationship maps —
   * is only valid for the instance that produced them, because account and status
   * ids are local to an instance. Stamping cached results with the epoch they were
   * fetched under makes "this is from the old server" checkable, instead of relying
   * on every call site remembering to clear. Getting that wrong sends a user to a
   * different person's profile, so it should not be a thing anyone has to remember.
   */
  readonly epoch = signal(0);

  setBaseUrl(value: string): void {
    const normalized = normalizeHostUrl(value);
    if (normalized === this.baseUrl()) {
      return;
    }
    localStorage.setItem(SEARCH_SERVER_KEY, normalized);
    this.baseUrl.set(normalized);
    this.epoch.update((n) => n + 1);
  }

  /** Go back to searching on the primary server. */
  clear(): void {
    localStorage.removeItem(SEARCH_SERVER_KEY);
    if (!this.baseUrl()) {
      return;
    }
    this.baseUrl.set('');
    this.epoch.update((n) => n + 1);
  }
}
