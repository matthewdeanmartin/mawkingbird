import { describe, expect, it } from 'vitest';
import { Status } from './models';
import { matchesMedia, parseMediaQuery } from './media-query';
import { buildFacets, statusMatchesFacet } from './pages/search/search-refine';

describe('synthetic media queries', () => {
  it('extracts exact operators while preserving quoted phrases and other syntax', () => {
    expect(parseMediaQuery('from:alice "has:audio birds" +has:VIDEO #music has:audio')).toEqual({
      query: 'from:alice "has:audio birds" #music',
      types: ['video', 'audio'],
    });
    expect(parseMediaQuery('has:audiofile')).toEqual({ query: 'has:audiofile', types: [] });
    expect(parseMediaQuery('has:image has:image')).toEqual({
      query: 'has:media',
      types: ['image'],
    });
    expect(parseMediaQuery('"has:audio"')).toEqual({ query: '"has:audio"', types: [] });
  });

  it('matches every attachment, counts each type once, and follows boosts', () => {
    const post = {
      account: { acct: 'alice' },
      media_attachments: [{ type: 'image' }, { type: 'audio' }, { type: 'audio' }],
    } as Status;
    expect(matchesMedia(post, ['audio', 'image'])).toBe(true);
    expect(matchesMedia(post, ['video'])).toBe(false);
    expect(statusMatchesFacet(post, 'media', 'audio')).toBe(true);
    expect(statusMatchesFacet(post, 'media', 'none')).toBe(false);
    expect(buildFacets([post]).find((facet) => facet.kind === 'media')?.values).toEqual([
      { value: 'image', count: 1, labelKey: 'pages.search.mediaType.image' },
      { value: 'audio', count: 1, labelKey: 'pages.search.mediaType.audio' },
    ]);
    expect(matchesMedia({ reblog: post } as Status, ['audio'])).toBe(true);
    expect(matchesMedia({ media_attachments: [{ type: 'gifv' }] } as Status, ['video'])).toBe(
      false,
    );
  });
});
