import { defaultServer } from '../platform/http/home-server';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Context, Status } from '../platform/api/models';
import { Api } from '../platform/api/api';
import { Auth } from '../platform/session/auth';
import { Server } from '../platform/http/server';
import { AnonymousPublicApi } from '../accounts/anonymous/anonymous-public-api';
import { AnonymousProviderRef } from '../accounts/anonymous/anonymous-mastodon-provider';
import { readerChain } from '../reading/read/reader-document';
import { BlogPost, BlogThresholds, blogReason, blogTitle } from './blog-classifier';
import { BlogSource } from './blog-source';

/** What a search hit is, as a blog post. */
export type BlogHitKind = 'storm' | 'long' | 'marked' | 'part';

export interface BlogHit {
  status: Status;
  kind: BlogHitKind;
  title: string;
}

/** How many short posts with replies may cost a thread read to check for a storm. */
export const STORM_CHECKS = 8;

function isPublic(status: Status): boolean {
  return status.visibility === 'public' || status.visibility === 'unlisted';
}

/**
 * Decide a hit without fetching anything: long or marked on its own, or a
 * part of its author's storm (a reply to themselves). `null` means "maybe the
 * start of a storm — only its thread can say", or not a blog post at all.
 */
export function quickKind(status: Status, thresholds: BlogThresholds): BlogHitKind | null {
  const reason = blogReason([status], thresholds);
  if (reason === 'marked' || reason === 'long') {
    return reason;
  }
  if (status.in_reply_to_id && status.in_reply_to_account_id === status.account.id) {
    return 'part';
  }
  return null;
}

/** Whether a hit could start a storm: a top-level post somebody answered. */
export function mightStartStorm(status: Status): boolean {
  return !status.in_reply_to_id && (status.replies_count ?? 0) > 0;
}

/** Remembered blog posts whose title or excerpt contains every word of `query`. */
export function matchRemembered<T extends { post: BlogPost }>(entries: T[], query: string): T[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [];
  }
  return entries.filter(({ post }) => {
    const text = `${post.title} ${post.excerpt}`.toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/**
 * Searching for long-form posts (spec/sprint/blog-2026-11.md, sprint 8).
 *
 * There is no full-text search over everyone's posts on Mastodon, and the
 * Native archive has no search command yet, so this asks the reader's server
 * — which searches what it lets the reader search — and keeps the hits that
 * are blog posts. A visitor without an account gets the hashtag search their
 * server allows.
 */
@Injectable({ providedIn: 'root' })
export class BlogSearch {
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);
  private readonly server = inject(Server);
  private readonly publicApi = inject(AnonymousPublicApi);
  private readonly source = inject(BlogSource);

  /** Whether the server search is a real text search (signed in) or hashtags. */
  get byText(): boolean {
    return !this.auth.lacksMastodonToken;
  }

  remembered(query: string): { handle: string; post: BlogPost }[] {
    return matchRemembered(this.source.rememberedAll(), query);
  }

  async search(query: string, thresholds: BlogThresholds): Promise<BlogHit[]> {
    const q = query.trim();
    if (!q) {
      return [];
    }
    const found = this.byText
      ? await firstValueFrom(this.api.search(q, 'statuses', { limit: 40 }))
      : await firstValueFrom(
          this.publicApi.searchPostsByHashtags(this.server.baseUrl() || defaultServer(), q),
        );
    const seen = new Set<string>();
    const statuses = found.statuses.filter((status) => {
      if (status.reblog || !isPublic(status) || seen.has(status.id)) {
        return false;
      }
      seen.add(status.id);
      return true;
    });

    let checks = 0;
    const hits = await Promise.all(
      statuses.map(async (status): Promise<BlogHit | null> => {
        let kind = quickKind(status, thresholds);
        if (!kind && mightStartStorm(status) && checks < STORM_CHECKS) {
          checks++;
          kind = await this.stormKind(status, thresholds);
        }
        return kind ? { status, kind, title: blogTitle(status) } : null;
      }),
    );
    return hits.filter((hit): hit is BlogHit => hit !== null);
  }

  /** Read a hit's thread to see whether it starts a storm. Failures say no. */
  private async stormKind(status: Status, thresholds: BlogThresholds): Promise<BlogHitKind | null> {
    try {
      const ref = status.providerRef as AnonymousProviderRef | undefined;
      const context: Context =
        status.provider === 'anonymous-mastodon' && ref?.server && ref.statusId
          ? await firstValueFrom(
              this.publicApi.getContext({ server: ref.server, id: ref.statusId }),
            )
          : await firstValueFrom(this.api.getContext(status.id));
      const chain = readerChain([status, ...context.descendants], status.id);
      return blogReason(chain, thresholds) ? 'storm' : null;
    } catch {
      return null;
    }
  }
}
