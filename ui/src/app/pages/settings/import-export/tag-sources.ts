import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../../api';
import { Status } from '../../../models';
import { BlueskyApi } from '../../../providers/bluesky/bluesky-api';
import { BlueskySession } from '../../../providers/bluesky/bluesky-session';
import { BskyFeedItem } from '../../../providers/bluesky/bluesky-types';

/** One suggested hashtag and the evidence for suggesting it. */
export interface TagSuggestion {
  tag: string;
  /** How many sampled posts carried it. */
  count: number;
  /** Ticked rows are the ones "Follow selected" imports. */
  selected: boolean;
}

/** How many posts each live source reads before it stops. */
export const SAMPLE_SIZE = 100;
/** How many suggestions are pre-ticked; the rest start unchecked. */
export const PRESELECTED = 10;

/**
 * Rank hashtags by how often they appear, most-used first, ties alphabetical.
 *
 * A tag used exactly once is noise — one conference, one reply, years ago — and
 * following it buys an empty column, so single-use tags are dropped whenever
 * the sample is big enough for "used twice" to mean anything. When it isn't
 * (a small archive, a thin favourites list), the filter would leave nothing at
 * all, so it is skipped and the caller sees the short raw list instead.
 */
export function rankTags(counts: Map<string, number>): TagSuggestion[] {
  const all = [...counts.entries()].map(([tag, count]) => ({ tag, count }));
  const repeated = all.filter((entry) => entry.count > 1);
  const kept = repeated.length ? repeated : all;
  return kept
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .map((entry, index) => ({ ...entry, selected: index < PRESELECTED }));
}

/** Tally Mastodon-legal tags from a bag of already-extracted tag names. */
export function tallyTags(names: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const raw of names) {
    const tag = raw.trim().replace(/^#/, '').toLowerCase();
    if (!tag || !/^[\p{L}\p{N}_]+$/u.test(tag) || /^\p{N}+$/u.test(tag)) {
      continue;
    }
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return counts;
}

/** Hashtag names carried by a Mastodon status, from `tags` or the body text. */
export function statusTagNames(status: Status): string[] {
  // Mastodon and the mock both send `tags`; a status relayed from elsewhere may
  // not, and its hashtags then live only in the rendered HTML. Reading both
  // costs nothing and stops a bridged timeline from looking tagless.
  if (status.tags?.length) {
    return status.tags.map((tag) => tag.name);
  }
  return [...(status.content ?? '').matchAll(/#([\p{L}\p{N}_]+)/gu)].map((match) => match[1]);
}

/** Hashtag names carried by a Bluesky post's facets, plus bare `#tags` in the text. */
export function bskyPostTagNames(item: BskyFeedItem): string[] {
  // A repost is someone else's post; its tags say nothing about this account.
  if (item.reason) {
    return [];
  }
  const record = item.post?.record;
  const faceted = (record?.facets ?? []).flatMap((facet) =>
    facet.features.map((feature) => feature.tag).filter((tag): tag is string => !!tag),
  );
  if (faceted.length) {
    return faceted;
  }
  // Older posts and some clients write hashtags as plain text with no facet.
  return [...(record?.text ?? '').matchAll(/#([\p{L}\p{N}_]+)/gu)].map((match) => match[1]);
}

/**
 * Suggests hashtags to follow by reading what you already engage with.
 *
 * Three sources, each sampling roughly {@link SAMPLE_SIZE} posts: a Twitter
 * archive's own tweets, your Bluesky posts, and the Mastodon posts you have
 * favourited. All three answer the same question — what are you actually
 * reading about — from whichever history a given person happens to have.
 */
@Injectable({ providedIn: 'root' })
export class TagSources {
  private api = inject(Api);
  private blueskyApi = inject(BlueskyApi);
  private blueskySession = inject(BlueskySession);

  readonly suggestions = signal<TagSuggestion[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** Which source filled `suggestions`, for the "sampled N posts" line. */
  readonly sampled = signal(0);

  reset(): void {
    this.suggestions.set([]);
    this.error.set(null);
    this.sampled.set(0);
  }

  toggle(tag: string): void {
    this.suggestions.update((rows) =>
      rows.map((row) => (row.tag === tag ? { ...row, selected: !row.selected } : row)),
    );
  }

  setAllSelected(selected: boolean): void {
    this.suggestions.update((rows) => rows.map((row) => ({ ...row, selected })));
  }

  selectedTags(): string[] {
    return this.suggestions()
      .filter((row) => row.selected)
      .map((row) => row.tag);
  }

  /** Load a pre-counted ranking, as the Twitter archive produces synchronously. */
  loadCounts(counts: Map<string, number>, sampled: number): void {
    this.sampled.set(sampled);
    this.suggestions.set(rankTags(counts));
    this.error.set(this.suggestions().length ? null : 'No hashtags found in what was read.');
  }

  /** Sample your own Bluesky posts and rank the hashtags in them. */
  async loadFromBluesky(): Promise<void> {
    const did = this.blueskySession.session()?.did;
    if (!did) {
      this.error.set('Link a Bluesky account in Settings → Connections first.');
      return;
    }
    await this.collect(async (names) => {
      let cursor: string | null = null;
      let seen = 0;
      while (seen < SAMPLE_SIZE) {
        const page: { feed: BskyFeedItem[]; cursor?: string } = await firstValueFrom(
          this.blueskyApi.getAuthorFeed(did, cursor, 'posts_with_replies'),
        );
        for (const item of page.feed) {
          names.push(...bskyPostTagNames(item));
        }
        seen += page.feed.length;
        // No cursor, or a page that did not advance, means the history ended.
        if (!page.cursor || page.cursor === cursor || !page.feed.length) {
          break;
        }
        cursor = page.cursor;
      }
      return seen;
    }, 'Could not read your Bluesky posts.');
  }

  /** Sample the Mastodon posts you have favourited and rank the hashtags in them. */
  async loadFromFavourites(): Promise<void> {
    await this.collect(async (names) => {
      let maxId: string | undefined;
      let seen = 0;
      while (seen < SAMPLE_SIZE) {
        const page = await firstValueFrom(this.api.favouritesPage(maxId, 40));
        for (const status of page.statuses) {
          names.push(...statusTagNames(status));
        }
        seen += page.statuses.length;
        // The mock answers with the whole list and no Link header, so a missing
        // cursor is the end rather than an error.
        if (!page.nextMaxId || page.nextMaxId === maxId || !page.statuses.length) {
          break;
        }
        maxId = page.nextMaxId;
      }
      return seen;
    }, 'Could not read your favourites.');
  }

  private async collect(
    read: (names: string[]) => Promise<number>,
    failureMessage: string,
  ): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.suggestions.set([]);
    this.sampled.set(0);
    const names: string[] = [];
    try {
      const seen = await read(names);
      this.loadCounts(tallyTags(names), seen);
    } catch {
      this.error.set(failureMessage);
    } finally {
      this.loading.set(false);
    }
  }
}
