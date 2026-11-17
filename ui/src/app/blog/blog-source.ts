import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Account, Context, Status } from '../platform/api/models';
import { BlogPost } from './blog-classifier';
import { Api } from '../platform/api/api';
import { Auth } from '../platform/session/auth';
import { AnonymousPublicApi } from '../accounts/anonymous/anonymous-public-api';
import { AnonymousProviderRef } from '../accounts/anonymous/anonymous-mastodon-provider';
import { AnonymousPublicRef } from '../accounts/anonymous/anonymous-route-ref';
import { qualifiedHandle } from '../accounts/account-handle';
import { NATIVE_PROFILES } from '../platform/session/platform-login';
import { NativeProfilesApi } from '../platform/session/native-profile-types';

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
  /** `archive`: Native's local archive, keyed by the reader's server (see {@link BlogPager}). */
  via: 'home' | 'local' | 'archive';
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

/**
 * Reads an author's posts a page at a time, newest first. An empty page means
 * the history is exhausted. `stepPages` is how many pages one "Look further
 * back" is worth: a few live requests, or many cheap archive reads.
 */
export interface BlogPager {
  readonly stepPages: number;
  /** Where the posts come from, for the coverage line. */
  readonly kind: 'live' | 'archive';
  next(): Promise<Status[]>;
}

/** Live pages from a server, by `max_id`. */
export const LIVE_STEP_PAGES = 5;
/** Archive pages are local reads: a thousand posts per step. */
export const ARCHIVE_STEP_PAGES = 25;

@Injectable({ providedIn: 'root' })
export class BlogSource {
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);
  private readonly publicApi = inject(AnonymousPublicApi);
  private readonly nativeProfiles = inject(NATIVE_PROFILES);

  /**
   * The Native archive's session handle, when this is the desktop app signed in
   * to Mastodon. Null on the web and for every other kind of session.
   */
  private archiveHandle(): string | null {
    const token = this.auth.token();
    return this.nativeProfiles && token?.startsWith('native-mastodon:') ? token : null;
  }

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
    // Native: the archive holds everything collected, keyed by the reader's
    // server, so resolve there first. A server that does not know the account
    // falls through to the public read like the web.
    if (this.archiveHandle() && !this.auth.lacksMastodonToken) {
      try {
        const account = await firstValueFrom(this.api.lookupAccount(qualified));
        return { handle: qualified, account, via: 'archive' };
      } catch {
        // Fall through.
      }
    }
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
      // `archive` and `local` both read through the reader's own server.
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
   * The id the reader's own server uses for `status`, which is what a reply
   * must name. Posts read through the reader's server already carry it; a post
   * read from the author's server is looked up by its address.
   */
  async localStatusId(author: BlogAuthor, status: Status): Promise<string | null> {
    if (author.via !== 'home') {
      return status.id;
    }
    const address = status.url ?? status.uri;
    if (!address) {
      return null;
    }
    const found = await firstValueFrom(
      this.api.search(address, 'statuses', { resolve: true, limit: 1 }),
    );
    return found.statuses[0]?.id ?? null;
  }

  /**
   * The last blog list read per handle, so a post page can offer the previous
   * and next post without reading the blog again. Memory only: a post opened
   * from a shared link simply has no neighbours to offer.
   */
  private readonly lists = signal<Readonly<Record<string, BlogPost[]>>>({});

  remember(handle: string, posts: BlogPost[]): void {
    this.lists.update((all) => ({ ...all, [handle.toLowerCase()]: posts }));
  }

  /** Every remembered blog post, with whose blog it is on. */
  readonly rememberedAll = computed(() =>
    Object.entries(this.lists()).flatMap(([handle, posts]) =>
      posts.map((post) => ({ handle, post })),
    ),
  );

  /** Reactive: a rail widget showing it updates as the list grows. */
  remembered(handle: string): BlogPost[] | null {
    return this.lists()[handle.toLowerCase()] ?? null;
  }

  /** A fresh reader of the author's posts, from the newest. */
  pager(author: BlogAuthor): BlogPager {
    const handle = this.archiveHandle();
    if (author.via === 'archive' && handle && this.nativeProfiles) {
      return archivePager(this.nativeProfiles, handle, author.account.id);
    }
    let maxId: string | undefined;
    return {
      stepPages: LIVE_STEP_PAGES,
      kind: 'live',
      next: async () => {
        const batch = await this.page(author, maxId);
        if (batch.length) {
          maxId = pagingId(batch[batch.length - 1]);
        }
        return batch;
      },
    };
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

/** Native archive pages are 40 posts. */
const ARCHIVE_PAGE = 40;

/**
 * The Native archive, newest first (spec/sprint/blog-2026-11.md, sprint 6).
 *
 * Starts by asking the server for the newest page, so a blog opened today
 * includes today. When the archive runs out it asks the server for an older
 * page and carries on, so "Look further back" also grows the archive. Both
 * fetches are best effort: an offline reader still gets what was collected.
 */
export function archivePager(
  profiles: NativeProfilesApi,
  handle: string,
  accountId: string,
): BlogPager {
  let offset = 0;
  let refreshed = false;
  let serverDone = false;
  const seen = new Set<string>();
  const read = async (): Promise<Status[]> => {
    const page = await profiles.accountPosts(handle, accountId, offset);
    offset += page.length;
    const fresh = page.map((post) => post.status).filter((status) => !seen.has(status.id));
    fresh.forEach((status) => seen.add(status.id));
    return fresh.length || page.length < ARCHIVE_PAGE ? fresh : read();
  };
  return {
    stepPages: ARCHIVE_STEP_PAGES,
    kind: 'archive',
    next: async () => {
      if (!refreshed) {
        refreshed = true;
        await profiles.fetchAccountPage(handle, accountId, false).catch(() => 0);
      }
      const batch = await read();
      if (batch.length || serverDone) {
        return batch;
      }
      const added = await profiles.fetchAccountPage(handle, accountId, true).catch(() => 0);
      if (!added) {
        serverDone = true;
        return [];
      }
      return read();
    },
  };
}
