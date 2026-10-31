import { Injectable, inject } from '@angular/core';
import { Observable, catchError, firstValueFrom, map, of } from 'rxjs';
import { AccountStatusesOptions, Api } from '../../api';
import { Auth } from '../../auth';
import { Account, Status } from '../../models';
import { AnonymousPublicApi } from '../../providers/anonymous/anonymous-public-api';
import { AnonymousProviderRef } from '../../providers/anonymous/anonymous-mastodon-provider';

/** What the visitor typed, once understood. */
export type AccountInput =
  { kind: 'handle'; username: string; host: string } | { kind: 'query'; query: string };

/**
 * Read a pasted account: `@user@host`, `user@host`, a profile URL
 * (`https://host/@user`, `https://host/users/user`), or anything else as a
 * search. Returns null for blank input.
 */
export function parseAccountInput(raw: string): AccountInput | null {
  const text = raw.trim();
  if (!text) return null;
  const handle = /^@?([a-z0-9_.-]+)@([a-z0-9.-]+\.[a-z]{2,})$/i.exec(text);
  if (handle) return { kind: 'handle', username: handle[1], host: handle[2].toLowerCase() };
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    const path = /^\/(?:@|users\/)([a-z0-9_.-]+)\/?$/i.exec(url.pathname);
    if (path && url.hostname.includes('.')) {
      return { kind: 'handle', username: path[1], host: url.hostname.toLowerCase() };
    }
  } catch {
    // Not a URL; search for it.
  }
  return { kind: 'query', query: text.replace(/^@/, '') };
}

/** Where a signed-out visitor's searches go: the biggest server knows the most accounts. */
export const ANONYMOUS_SEARCH_SERVER = 'https://mastodon.social';

/** One account, and how to page its posts. */
export interface AccountSource {
  account: Account;
  /** The server the posts are read from, for the visitor to see; null for the visitor's own. */
  server: string | null;
  page: (opts: AccountStatusesOptions) => Observable<Status[]>;
}

/**
 * Finds accounts and the best place to read their posts.
 *
 * Posts are read from the account's **own** server through its public API:
 * another server only holds the part of a remote account's history that
 * federated to it. When the home server won't answer (it may require sign-in,
 * or not speak Mastodon's API), the posts come from the server the account was
 * found on instead, the visitor's own when signed in.
 */
@Injectable({ providedIn: 'root' })
export class AccountSources {
  private api = inject(Api);
  private auth = inject(Auth);
  private anonymous = inject(AnonymousPublicApi);

  private signedIn(): boolean {
    return this.auth.kind() === 'mastodon' && !!this.auth.token();
  }

  /** Candidate accounts for what the visitor typed. Empty when nothing matched. */
  async find(input: AccountInput): Promise<Account[]> {
    if (input.kind === 'handle') {
      const home = await firstValueFrom(
        this.anonymous
          .lookupAccount(`https://${input.host}`, input.username)
          .pipe(catchError(() => of(null))),
      );
      if (home) return [home];
    }
    const query = input.kind === 'handle' ? `${input.username}@${input.host}` : input.query;
    const search: Observable<Account[]> = this.signedIn()
      ? this.api
          .search(query, 'accounts', { resolve: true, limit: 10 })
          .pipe(map((r) => r.accounts))
      : this.anonymous
          .search(ANONYMOUS_SEARCH_SERVER, query, 'accounts', { limit: 10 })
          .pipe(map((r) => r.accounts));
    return firstValueFrom(search.pipe(catchError(() => of([]))));
  }

  /** Where to read this account's posts, trying its home server first. */
  async open(account: Account): Promise<AccountSource> {
    const origin = originOf(account.url);
    if (origin) {
      const home = await firstValueFrom(
        this.anonymous.lookupAccount(origin, account.username).pipe(catchError(() => of(null))),
      );
      if (home) {
        const ref = { server: origin, id: home.id };
        return {
          account: home,
          server: new URL(origin).host,
          page: (opts) => this.anonymous.getAccountStatuses(ref, opts),
        };
      }
    }
    if (this.signedIn()) {
      return {
        account,
        server: null,
        page: (opts) => this.api.getAccountStatuses(account.id, opts),
      };
    }
    const ref = { server: ANONYMOUS_SEARCH_SERVER, id: account.id };
    return {
      account,
      server: new URL(ANONYMOUS_SEARCH_SERVER).host,
      page: (opts) => this.anonymous.getAccountStatuses(ref, opts),
    };
  }
}

/** The id to page from: anonymously read posts carry a namespaced one. */
export function pagingId(status: Status): string {
  const ref = status.providerRef as Partial<AnonymousProviderRef> | undefined;
  return status.provider === 'anonymous-mastodon' && typeof ref?.statusId === 'string'
    ? ref.statusId
    : status.id;
}

function originOf(url: string | undefined): string | null {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}
