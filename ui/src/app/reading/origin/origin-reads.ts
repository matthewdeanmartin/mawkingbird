import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, shareReplay, switchMap, timeout } from 'rxjs';
import { Api } from '../../platform/api/api';
import { accountScopeSuffix } from '../../platform/session/account-scope';
import { Account, Status } from '../../platform/api/models';
import { externalFetch } from '../../platform/http/external-fetch';
import { Server } from '../../platform/http/server';
import { Auth } from '../../platform/session/auth';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import { adaptAnonymousAccount } from '../../accounts/anonymous/anonymous-mastodon-provider';
import { PeopleMode, PeoplePage } from '../../accounts/people-browser/people-source';
import { LocalModeration } from '../../moderation/local-moderation';

/** Origin reads are a bonus, never a wait: give up quickly and keep the home data. */
const ORIGIN_TIMEOUT_MS = 5_000;

/** Where a post lives on its own server. */
export interface OriginRef {
  /** `https://host` */
  server: string;
  /** The id the origin server knows the post by. */
  id: string;
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.host.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

/**
 * The origin server and id of a Mastodon-shaped post, from its ActivityPub
 * `uri` (`https://host/users/name/statuses/123`) or its web `url`
 * (`https://host/@name/123`). Null for anything else: other software lays its
 * URLs out differently and its API would not answer a Mastodon context call.
 */
export function statusOrigin(status: Pick<Status, 'uri' | 'url'>): OriginRef | null {
  for (const candidate of [status.uri, status.url]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      const match =
        /^\/users\/[^/]+\/statuses\/([A-Za-z0-9]+)\/?$/.exec(url.pathname) ??
        /^\/@[^/]+\/([0-9]+)\/?$/.exec(url.pathname);
      if (match && (url.protocol === 'https:' || url.protocol === 'http:')) {
        return { server: url.origin, id: match[1] };
      }
    } catch {
      /* try the next one */
    }
  }
  return null;
}

/** The domain of an account, from its qualified handle or its profile URL. */
function accountDomain(account: Pick<Account, 'acct' | 'url'>): string | null {
  const at = account.acct.lastIndexOf('@');
  if (at > 0) return account.acct.slice(at + 1).toLowerCase();
  return hostOf(account.url);
}

/**
 * Put origin-only replies into the home thread.
 *
 * Replies are matched by ActivityPub `uri`, the one id both servers share:
 * anything the home server already returned is kept as it is (it can be acted
 * on directly). The rest are placed under their parent (by `in_reply_to_id`,
 * translated through the origin's own ids) after that parent's existing
 * replies, and carry `originServer` so the page can label them and actions can
 * resolve them through the home server first.
 *
 * @param rootUri the `uri` of the post whose context this is
 * @param rootOriginId the id the origin knows that post by
 */
export function mergeOriginReplies(
  home: Status[],
  origin: Status[],
  rootUri: string | undefined,
  rootOriginId: string,
  server: string,
  hidden: (status: Status) => boolean = () => false,
): Status[] {
  const homeUris = new Set(home.map((status) => status.uri).filter(Boolean));
  // Origin id (namespaced or raw) -> uri, so in_reply_to_id can be followed.
  const uriByOriginId = new Map<string, string>();
  if (rootUri) {
    uriByOriginId.set(rootOriginId, rootUri);
    uriByOriginId.set(`anonymous-mastodon:${hostOf(server)}:${rootOriginId}`, rootUri);
  }
  for (const status of origin) if (status.uri) uriByOriginId.set(status.id, status.uri);

  const merged = [...home];
  // uri -> parent uri, for finding the end of a parent's subtree.
  const parentOf = new Map<string, string | null>();
  const homeIdToUri = new Map(home.map((status) => [status.id, status.uri ?? '']));
  for (const status of home) {
    if (status.uri) {
      parentOf.set(status.uri, homeIdToUri.get(status.in_reply_to_id ?? '') || rootUri || null);
    }
  }
  const isUnder = (uri: string | undefined, ancestor: string): boolean => {
    let current = uri ? parentOf.get(uri) : null;
    for (let guard = 0; current && guard < 500; guard++) {
      if (current === ancestor) return true;
      current = parentOf.get(current) ?? null;
    }
    return false;
  };

  for (const status of origin) {
    if (!status.uri || homeUris.has(status.uri) || hidden(status)) continue;
    const parentUri = uriByOriginId.get(status.in_reply_to_id ?? '') ?? rootUri ?? null;
    parentOf.set(status.uri, parentUri);
    let at = merged.length;
    if (parentUri && parentUri !== rootUri) {
      const parentIndex = merged.findIndex((item) => item.uri === parentUri);
      if (parentIndex >= 0) {
        at = parentIndex + 1;
        while (at < merged.length && isUnder(merged[at].uri, parentUri)) at++;
      }
    }
    merged.splice(at, 0, { ...status, originServer: hostOf(server) ?? server });
    homeUris.add(status.uri);
  }
  return merged;
}

/**
 * Reads from a post's or account's own server, anonymously (parity item 8).
 *
 * Off unless the reader turned on Settings → Privacy → "Fetch from the original
 * server": each read is a direct request from this device to a server the
 * reader did not choose, which learns their IP address and what they opened.
 *
 * Every request goes through `externalFetch()`, which strips the bearer token,
 * and every failure (refusal, 401/403 from a signed-fetch server, timeout,
 * CORS) quietly yields null so callers keep the home server's data. Native
 * builds route `externalFetch` through the Rust public-Mastodon transport.
 */
@Injectable({ providedIn: 'root' })
export class OriginReads {
  private http = inject(HttpClient);
  private prefs = inject(ClientPrefs);
  private auth = inject(Auth);
  private server = inject(Server);
  private publicApi = inject(AnonymousPublicApi);
  private moderation = inject(LocalModeration);

  /**
   * On only when the reader asked, and only for a signed-in Mastodon session:
   * the anonymous reader already reads every server directly.
   */
  get enabled(): boolean {
    return this.prefs.fetchFromOrigin() && !this.auth.isAnonymous && !this.auth.lacksMastodonToken;
  }

  /** The host of the server the reader is signed in to. */
  private homeHost(): string | null {
    return hostOf(
      this.server.baseUrl() || (typeof location === 'undefined' ? '' : location.origin),
    );
  }

  /** The origin of a post on another server; null for local posts or when off. */
  originOfStatus(status: Pick<Status, 'uri' | 'url'>): OriginRef | null {
    if (!this.enabled) return null;
    const ref = statusOrigin(status);
    return ref && hostOf(ref.server) !== this.homeHost() ? ref : null;
  }

  /** The origin server of an account on another server; null for local accounts or when off. */
  originOfAccount(account: Pick<Account, 'acct' | 'url' | 'username'>): string | null {
    if (!this.enabled || !account.acct.includes('@')) return null;
    const host = hostOf(account.url);
    if (!host || host === this.homeHost()) return null;
    try {
      return new URL(account.url).origin;
    } catch {
      return null;
    }
  }

  /**
   * Whether a reply from the origin must stay hidden: the home server refused
   * to show it for a reason the origin does not know about. Blocked and muted
   * authors and domains (as far as this device knows) stay out.
   */
  hidden(status: Status, blockedDomains: ReadonlySet<string> = new Set()): boolean {
    const domain = accountDomain(status.account);
    return (
      (!!domain && blockedDomains.has(domain)) ||
      this.moderation.isSuppressed(status.account) ||
      !!(status.account as Account & { suspended?: boolean }).suspended
    );
  }

  private api = inject(Api);
  private blocked: { scope: string; domains: Observable<ReadonlySet<string>> } | null = null;

  /**
   * The domains this account blocked, read once per account and cached for the
   * session. A failed read means "none known": the home server already left
   * those posts out of what it returned, so only origin extras depend on this.
   */
  blockedDomains(): Observable<ReadonlySet<string>> {
    const scope = accountScopeSuffix();
    if (this.blocked?.scope !== scope) {
      this.blocked = {
        scope,
        domains: this.api.domainBlocksPage(undefined, 200).pipe(
          map(
            (page) =>
              new Set(page.domains.map((domain) => domain.toLowerCase())) as ReadonlySet<string>,
          ),
          catchError(() => of(new Set<string>() as ReadonlySet<string>)),
          shareReplay(1),
        ),
      };
    }
    return this.blocked.domains;
  }

  /** The origin's context for a remote post, or null (off, local, or any failure). */
  context(status: Status): Observable<{ ref: OriginRef; descendants: Status[] } | null> {
    const ref = this.originOfStatus(status);
    if (!ref) return of(null);
    return this.publicApi.getContext(ref).pipe(
      timeout(ORIGIN_TIMEOUT_MS),
      map((context) => ({ ref, descendants: context.descendants })),
      catchError(() => of(null)),
    );
  }

  /** Who favourited or boosted a remote post, as its own server knows it; null on any failure. */
  statusAccounts(
    status: Pick<Status, 'uri' | 'url'>,
    mode: 'favourited_by' | 'reblogged_by',
  ): Observable<{ server: string; accounts: Account[] } | null> {
    const ref = this.originOfStatus(status);
    if (!ref) return of(null);
    return this.http
      .get<Account[]>(`${ref.server}/api/v1/statuses/${encodeURIComponent(ref.id)}/${mode}`, {
        params: { limit: '80' },
        context: externalFetch(),
      })
      .pipe(
        timeout(ORIGIN_TIMEOUT_MS),
        map((accounts) => ({
          server: hostOf(ref.server) ?? ref.server,
          accounts: accounts.map((account) => adaptAnonymousAccount(account, ref.server)),
        })),
        catchError(() => of(null)),
      );
  }

  /**
   * One page of a remote account's followers or following from its own server.
   * The account is looked up there by username (ids are per server). Null on
   * any failure, including a profile that hides its lists.
   */
  peoplePage(
    account: Pick<Account, 'acct' | 'url' | 'username'>,
    mode: PeopleMode,
    cursor: string | null,
    originAccountId: string | null,
  ): Observable<(PeoplePage & { originAccountId: string; server: string }) | null> {
    const server = this.originOfAccount(account);
    if (!server) return of(null);
    const id$: Observable<string> = originAccountId
      ? of(originAccountId)
      : this.publicApi.lookupAccount(server, account.username).pipe(map((found) => found.id));
    return id$.pipe(
      timeout(ORIGIN_TIMEOUT_MS),
      switchMap((id) =>
        (mode === 'followers'
          ? this.publicApi.getAccountFollowersPage({ server, id }, cursor ?? undefined)
          : this.publicApi.getAccountFollowingPage({ server, id }, cursor ?? undefined)
        ).pipe(
          timeout(ORIGIN_TIMEOUT_MS),
          map(({ accounts, nextMaxId, source }) => ({
            accounts,
            cursor: nextMaxId,
            approximate: source === 'account-id-fallback',
            originAccountId: id,
            server: hostOf(server) ?? server,
          })),
        ),
      ),
      catchError(() => of(null)),
    );
  }
}
