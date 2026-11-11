import { convertToParamMap } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { NO_REFINE, parseTagList, refineCount, refineFromQuery, refineToQuery } from './tag-refine';

describe('tag refine', () => {
  it('parses typed tags, dropping hashes, duplicates and the page tag', () => {
    expect(parseTagList('#Cats, dogs  #cats fediverse', 'fediverse')).toEqual(['Cats', 'dogs']);
  });

  it('keeps no more than the four tags Mastodon reads', () => {
    expect(parseTagList('a b c d e f', 'x')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('round-trips through the URL and drops empty lists', () => {
    const state = { any: ['a'], all: [], none: ['spoilers'], local: true };
    const query = refineToQuery(state);
    expect(query).toEqual({ any: 'a', all: null, none: 'spoilers', local: '1' });
    const params = convertToParamMap(
      Object.fromEntries(Object.entries(query).filter(([, v]) => v !== null)),
    );
    expect(refineFromQuery(params, 'main')).toEqual(state);
  });

  it('counts each kind of refinement once', () => {
    expect(refineCount(NO_REFINE)).toBe(0);
    expect(refineCount({ any: ['a', 'b'], all: [], none: ['c'], local: true })).toBe(3);
  });
});
