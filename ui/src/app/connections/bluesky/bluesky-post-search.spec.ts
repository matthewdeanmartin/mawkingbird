import { describe, expect, it } from 'vitest';
import {
  describeBlueskyFilters,
  emptyBlueskyPostSearch,
  hasBlueskyFilters,
  parseTags,
} from './bluesky-post-search';

describe('parseTags', () => {
  it('strips hashes and splits on spaces or commas', () => {
    expect(parseTags('#angular, typescript  #rxjs')).toEqual(['angular', 'typescript', 'rxjs']);
  });

  it('dedupes and drops empties', () => {
    expect(parseTags('cats,  cats , ,#cats')).toEqual(['cats']);
    expect(parseTags('   ')).toEqual([]);
  });
});

describe('hasBlueskyFilters', () => {
  it('is false for a bare text search', () => {
    expect(hasBlueskyFilters({ text: 'angular' })).toBe(false);
    // 'latest' is the default ranking, so it is not a filter.
    expect(hasBlueskyFilters(emptyBlueskyPostSearch())).toBe(false);
  });

  it('is true for any structured field, including top-ranking', () => {
    expect(hasBlueskyFilters({ text: 'a', author: 'me.bsky.social' })).toBe(true);
    expect(hasBlueskyFilters({ text: 'a', tags: ['x'] })).toBe(true);
    expect(hasBlueskyFilters({ text: 'a', sort: 'top' })).toBe(true);
    expect(hasBlueskyFilters({ text: 'a', tags: [] })).toBe(false);
  });
});

describe('describeBlueskyFilters', () => {
  it('says "all of" for multiple tags, because the server ANDs them', () => {
    const described = describeBlueskyFilters({ text: 'a', tags: ['cats', 'dogs'] });
    expect(described).toEqual(['Tagged with all of: #cats, #dogs']);
  });

  it('uses the singular form for one tag', () => {
    expect(describeBlueskyFilters({ text: 'a', tags: ['cats'] })).toEqual(['Tagged #cats']);
  });

  it('normalizes a leading @ on handles', () => {
    expect(describeBlueskyFilters({ text: 'a', author: '@me.bsky.social' })).toEqual([
      'By @me.bsky.social',
    ]);
  });

  it('describes nothing for a bare text search', () => {
    expect(describeBlueskyFilters({ text: 'angular', sort: 'latest' })).toEqual([]);
  });
});
