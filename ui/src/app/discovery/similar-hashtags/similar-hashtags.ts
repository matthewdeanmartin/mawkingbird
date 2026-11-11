import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Api } from '../../platform/api/api';
import { Auth } from '../../platform/session/auth';
import { Server } from '../../platform/http/server';
import { normalizeHashtag } from '../hashtag';
import { Status } from '../../platform/api/models';
import { AnonymousAccount } from '../../accounts/anonymous/anonymous-account';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import { AnonymousProviderRef } from '../../accounts/anonymous/anonymous-mastodon-provider';

/**
 * "Similar hashtags": which other hashtags turn up on recent posts that carry
 * the ones you asked about, ranked by how many of those posts they share.
 *
 * Several hashtags are sampled as one union, newest first, through Mastodon's
 * `any[]` on the tag timeline: `/timelines/tag/dog?any[]=dogs` is every recent
 * post tagged #dog or #dogs, in one paged stream. Checked against
 * mastodon.social on 2026-10-31, signed out: public, CORS-open, and six extra
 * tags all contributed posts, so the UI's cap of eight is a courtesy, not a limit.
 */

/** Most hashtags one union samples. */
export const MAX_SIMILAR_SEEDS = 8;
/** Posts per request; Mastodon's maximum. */
export const SAMPLE_PAGE = 40;
/** Posts per "sample" press, and the most a run will read. */
export const SAMPLE_STEP = 200;
export const SAMPLE_MAX = 1000;

export interface SimilarHashtag {
  /** As it was first written in the sample. */
  name: string;
  /** Sampled posts carrying it. */
  count: number;
}

/**
 * Hashtags from free text: `#dog #Dogs, cats` → `['dog', 'Dogs', 'cats']`.
 * Invalid words are dropped, duplicates (ignoring case) kept once, and the list
 * is capped at {@link MAX_SIMILAR_SEEDS}.
 */
export function parseHashtags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const word of text.split(/[\s,]+/)) {
    const tag = normalizeHashtag(word);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
  }
  return tags.slice(0, MAX_SIMILAR_SEEDS);
}

/** The `?similar=` value for a list of hashtags, and back. */
export function similarParam(tags: readonly string[]): string | null {
  return tags.length ? tags.join(',') : null;
}
export function parseSimilarParam(value: string | null): string[] {
  return value ? parseHashtags(value) : [];
}

/**
 * Rank the hashtags these posts carry, leaving out the ones searched for.
 * Each post counts once per tag, however often it repeats it.
 */
export function rankSimilar(
  statuses: readonly Status[],
  seeds: readonly string[],
): SimilarHashtag[] {
  const skip = new Set(seeds.map((tag) => tag.toLowerCase()));
  const posts = new Set<string>();
  const counts = new Map<string, SimilarHashtag>();
  for (const status of statuses) {
    const post = status.reblog ?? status;
    const key = post.uri ?? post.url ?? post.id;
    if (posts.has(key)) continue;
    posts.add(key);
    const tags = new Map<string, string>();
    for (const tag of post.tags ?? []) {
      const name = normalizeHashtag(tag.name);
      if (name && !skip.has(name.toLowerCase())) tags.set(name.toLowerCase(), name);
    }
    for (const [key, name] of tags) {
      const entry = counts.get(key);
      if (entry) entry.count++;
      else counts.set(key, { name, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Distinct posts in a sample (a boost and its original are one post). */
export function sampledPosts(statuses: readonly Status[]): number {
  return new Set(statuses.map((s) => (s.reblog ?? s).uri ?? (s.reblog ?? s).url ?? s.id)).size;
}

/**
 * Pages of recent posts for a union of hashtags: your own server when signed
 * in to Mastodon, otherwise the anonymous reading server (mastodon.social
 * unless the reader picked another).
 */
@Injectable({ providedIn: 'root' })
export class HashtagSamples {
  private api = inject(Api);
  private auth = inject(Auth);
  private server = inject(Server);
  private anonymous = inject(AnonymousAccount);
  private publicApi = inject(AnonymousPublicApi);

  private signedIn(): boolean {
    return this.auth.kind() === 'mastodon' && !!this.auth.token();
  }

  /** The server being sampled, for the reader to see. */
  host(): string {
    const base = this.signedIn() ? this.server.baseUrl() : this.anonymous.server();
    try {
      return new URL(base).host;
    } catch {
      return base;
    }
  }

  /** One page, newest first, older than `after`. */
  page(tags: readonly string[], after?: Status): Observable<Status[]> {
    const [first, ...rest] = tags;
    const maxId = after ? pagingId(after) : undefined;
    return this.signedIn()
      ? this.api.tagTimeline(first, maxId, SAMPLE_PAGE, false, rest)
      : this.publicApi.getTagTimeline(
          this.anonymous.server(),
          first,
          maxId,
          SAMPLE_PAGE,
          false,
          rest,
        );
  }
}

/** Anonymously read posts carry a namespaced id; paging needs the server's own. */
function pagingId(status: Status): string {
  const ref = status.providerRef as Partial<AnonymousProviderRef> | undefined;
  return status.provider === 'anonymous-mastodon' && typeof ref?.statusId === 'string'
    ? ref.statusId
    : status.id;
}
