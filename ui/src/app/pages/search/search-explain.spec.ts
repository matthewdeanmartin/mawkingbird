import { describe, expect, it } from 'vitest';
import { emptySearch, MawkingbirdSearch, PostSearchCriteria } from './mawkingbird-search';
import { explainPostSearch, postChips } from './search-explain';

function postSearch(post: PostSearchCriteria): MawkingbirdSearch {
  return { ...emptySearch('posts'), post };
}

describe('postChips', () => {
  const post: PostSearchCriteria = {
    words: 'angular signals',
    exactPhrase: 'change detection',
    excludeWords: 'react',
    author: '@alice@example.social',
    language: 'en',
    contentType: 'image',
    replies: 'exclude',
  };

  it('marks server-backed criteria as origin=server when authenticated', () => {
    const chips = postChips(post, true);
    const words = chips.find((c) => c.labelParams?.['word'] === 'angular');
    expect(words?.origin).toBe('server');
    const lang = chips.find((c) => c.labelParams?.['language'] === 'EN');
    expect(lang?.origin).toBe('server');
  });

  it('keeps finer media types as loaded even when authenticated', () => {
    const chips = postChips(post, true);
    const image = chips.find((c) => c.labelKey === 'pages.search.contentType.image');
    expect(image?.origin).toBe('loaded'); // image/video/audio are always loaded-result filters
  });

  it('marks EVERYTHING as origin=loaded when anonymous', () => {
    const chips = postChips(post, false);
    expect(chips.every((c) => c.origin === 'loaded')).toBe(true);
  });

  it('omits default/include-valued criteria', () => {
    const chips = postChips({ replies: 'include', sensitive: 'include', scope: 'all' }, true);
    expect(chips).toEqual([]);
  });
});

describe('explainPostSearch', () => {
  it('authenticated: hits /api/v2/search with the serialized query and no anon tags', () => {
    const search = postSearch({ words: 'angular', language: 'en', contentType: 'image' });
    const explain = explainPostSearch(search, true, null);
    expect(explain.endpoint).toBe('GET /api/v2/search');
    expect(explain.mastodonQuery).toBe('+angular language:en');
    expect(explain.serverCriteria).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ labelParams: { word: 'angular' } }),
        expect.objectContaining({ labelParams: { language: 'EN' } }),
      ]),
    );
    expect(explain.loadedCriteria).toContainEqual(
      expect.objectContaining({ labelKey: 'pages.search.contentType.image' }),
    ); // finer media stays loaded
    expect(explain.anonymousTags).toBeNull();
  });

  it('anonymous: uses tag timelines, emits no query, and surfaces the tag transform', () => {
    const search = postSearch({ words: 'cats dogs' });
    const explain = explainPostSearch(search, false, ['cats', 'dogs']);
    expect(explain.endpoint).toContain('timelines/tag');
    expect(explain.mastodonQuery).toBe('');
    expect(explain.anonymousTags).toEqual(['cats', 'dogs']);
    // Nothing may be claimed as server-side when anonymous.
    expect(explain.serverCriteria).toEqual([]);
    expect(explain.loadedCriteria).toContainEqual(
      expect.objectContaining({ labelParams: { word: 'cats' } }),
    );
  });

  it('defaults api usage to the search budget when not supplied', () => {
    const search = { ...postSearch({ words: 'x' }), apiCallBudget: 5 as const };
    expect(explainPostSearch(search, true, null).apiUsage).toEqual({
      maximum: 5,
      used: 0,
      tagsDropped: 0,
    });
  });

  it('carries provided api usage including budget-truncation count', () => {
    const search = postSearch({ words: 'a b c d' });
    const explain = explainPostSearch(search, false, ['a', 'b', 'c'], {
      maximum: 3,
      used: 3,
      tagsDropped: 1,
    });
    expect(explain.apiUsage).toEqual({ maximum: 3, used: 3, tagsDropped: 1 });
  });
});
