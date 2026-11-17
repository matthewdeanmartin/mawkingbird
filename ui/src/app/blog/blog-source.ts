import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Account, Context, Status } from '../platform/api/models';
import { BlogPost } from './blog-classifier';
import { Api } from '../platform/api/api';
import { Auth } from '../platform/session/auth';
import { AnonymousPublicApi } from '../accounts/anonymous/anonymous-public-api';
import { AnonymousProviderRef } from '../accounts/anonymous/anonymous-mastodon-provider';
import { AnonymousPublicRef } from '../accounts/anonymous/anonymous-route-ref';
import { qualifiedHandle } from '../accounts/account-handle';

/** Mastodon's largest page of account statuses. */
export const BLOG_PAGE_SIZE = 40;

/**
 * Whose blog this is, and where its posts are read from.
 *
 * - `home`: the author's own server, through its public API. The complete
 *   history, no session needed, and no ambiguity about which account an id
 *   names — the reason a blog link carries a handle rather than an id.
 * - `local`: the reader's own server, when the author's refuses unauthenticated
 *   reads. Only what that server has federated, so possibly less.
 */
export interface BlogAuthor {
  handle: string;
  account: Account;
  via: 'home' | 'local';
  /** Set for `home`: the address of the account on its own server. */
  ref?: AnonymousPublicRef;
}

/** A qualified `user@host`, without a leading `@`, or null if it is not one. */
export function parseBlogHandle(raw: string): { user: string; host: string } | null {
  const handle = raw.trim().replace(/^@/, '');
  const match = /^([^@\s/]+)@([^@\s/]+\.[^@\s/]+)$/.exec(handle);
  return match ? { user: match[1], host: match[2].toLowerCase() } : null;
}

/** The id to page from: the server's own id, not the namespaced feed id. */
export function pagingId(status: Status): string {
  if (status.provider === 'anonymous-mastodon') {
    const ref = status.providerRef as AnonymousProviderRef | undefined;
    if (ref?.statusId) {
      return ref.statusId;
    }
  }
  return status.id;
}

@Injectable({ providedIn: 'root' })
export class BlogSource {
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);
  private readonly publicApi = inject(AnonymousPublicApi);

  /** The signed-in Mastodon user's own handle, or null without one. */
  ownHandle(): string | null {
    if (this.auth.lacksMastodonToken) {
      return null;
    }
    const account = this.auth.account();
    return account ? qualifiedHandle(account) : null;
  }

  async resolve(handle: string): Promise<BlogAuthor> {
    const parsed = parseBlogHandle(handle);
    if (!parsed) {
      throw new Error('not-a-handle');
    }
    const qualified = `${parsed.user}@${parsed.host}`;
    const server = `https://${parsed.host}`;
    try {
      const account = await firstValueFrom(this.publicApi.lookupAccount(server, parsed.user));
      return {
        handle: qualified,
        account,
        via: 'home',
        ref: { server, id: account.id, ...(account.url ? { originalUrl: account.url } : {}) },
      };
    } catch (homeError) {
      if (this.auth.lacksMastodonToken) {
        throw homeError;
      }
      const account = await firstValueFrom(this.api.lookupAccount(qualified));
      return { handle: qualified, account, via: 'local' };
    }
  }

  /**
   * One post and its whole conversation: everything before it, then it, then
   * every reply, in thread order. `id` is the post's id on the author's own
   * server ({@link blogPostId}), whichever way the author was resolved.
   */
  async thread(author: BlogAuthor, id: string): Promise<{ status: Status; thread: Status[] }> {
    let status: Status;
    let context: Context;
    if (author.via === 'home' && author.ref) {
      const ref = { server: author.ref.server, id };
      [status, context] = await Promise.all([
        firstValueFrom(this.publicApi.getStatus(ref)),
        firstValueFrom(this.publicApi.getContext(ref)),
      ]);
    } else {
      // The reader's server knows the post by its own id; find it by address.
      const url = `${author.account.url.replace(/\/$/, '')}/${id}`;
      const found = await firstValueFrom(
        this.api.search(url, 'statuses', { resolve: true, limit: 1 }),
      );
      const local = found.statuses[0];
      if (!local) {
        throw new Error('not-found');
      }
      status = local;
      context = await firstValueFrom(this.api.getContext(local.id));
    }
    return { status, thread: [...context.ancestors, status, ...context.descendants] };
  }

  /**
   * The last blog list read per handle, so a post page can offer the previous
   * and next post without reading the blog again. Memory only: a post opened
   * from a shared link simply has no neighbours to offer.
   */
  private readonly lists = new Map<string, BlogPost[]>();

  remember(handle: string, posts: BlogPost[]): void {
    this.lists.set(handle.toLowerCase(), posts);
  }

  remembered(handle: string): BlogPost[] | null {
    return this.lists.get(handle.toLowerCase()) ?? null;
  }

  /** One page of the author's posts, newest first, reblogs excluded. */
  page(author: BlogAuthor, maxId?: string): Promise<Status[]> {
    const options = { excludeReblogs: true, limit: BLOG_PAGE_SIZE, ...(maxId ? { maxId } : {}) };
    return firstValueFrom(
      author.via === 'home' && author.ref
        ? this.publicApi.getAccountStatuses(author.ref, options)
        : this.api.getAccountStatuses(author.account.id, options),
    );
  }
}
