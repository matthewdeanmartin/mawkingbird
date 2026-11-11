import { Hashtag, TrendingTagHistory } from '../../platform/api/models';

export type HashtagSort = 'relevance' | 'activity' | 'alpha';

export const HASHTAG_SORTS: { value: HashtagSort; label: string }[] = [
  { value: 'relevance', label: 'pages.search.tagSort.relevance' },
  { value: 'activity', label: 'pages.search.tagSort.activity' },
  { value: 'alpha', label: 'pages.search.tagSort.alpha' },
];

/** Most hashtag rows a search will look up usage for, one request each. */
export const HASHTAG_STATS_LIMIT = 20;
/** Lookups in flight at once, so 20 rows never become 20 parallel requests. */
export const HASHTAG_STATS_CONCURRENCY = 4;

/**
 * Posts using a tag over the server's usage window (normally seven days), or
 * `null` when the server sent no history. Mastodon always sends a full window
 * of day buckets, zeros included, so an empty array means "not populated" rather
 * than "nobody used it".
 */
export function hashtagUses(history: TrendingTagHistory[] | undefined): number | null {
  if (!history?.length) return null;
  return history.reduce((sum, day) => sum + (Number(day.uses) || 0), 0);
}

/**
 * Order hashtag rows. Relevance is the server's order. Activity puts the busiest
 * first, then unknown counts, keeping server order within ties so the result is
 * stable. Alphabetical ignores case.
 */
export function sortHashtags<T extends Hashtag>(
  tags: readonly T[],
  sort: HashtagSort,
  uses: (tag: T) => number | null,
): T[] {
  if (sort === 'relevance') return [...tags];
  const indexed = tags.map((tag, index) => ({ tag, index }));
  if (sort === 'alpha') {
    indexed.sort(
      (a, b) =>
        a.tag.name.localeCompare(b.tag.name, undefined, { sensitivity: 'base' }) ||
        a.index - b.index,
    );
  } else {
    indexed.sort((a, b) => {
      const ua = uses(a.tag);
      const ub = uses(b.tag);
      if (ua === ub) return a.index - b.index;
      if (ua === null) return 1;
      if (ub === null) return -1;
      return ub - ua || a.index - b.index;
    });
  }
  return indexed.map((item) => item.tag);
}
