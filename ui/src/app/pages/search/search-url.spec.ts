import { describe, expect, it } from 'vitest';
import { emptySearch, MawkingbirdSearch } from './mawkingbird-search';
import { decodeSearchFromParams, encodeSearchToParams } from './search-url';

/** Build a getter over a plain param record, as decodeSearchFromParams expects. */
function getter(params: Record<string, string>): (k: string) => string | null {
  return (k) => params[k] ?? null;
}

/** Round-trip a search through encode → decode. */
function roundTrip(search: MawkingbirdSearch): MawkingbirdSearch {
  return decodeSearchFromParams(getter(encodeSearchToParams(search)));
}

describe('encodeSearchToParams', () => {
  it('uses readable flat params for a simple post search', () => {
    const s = emptySearch('posts');
    s.post = {
      words: 'angular',
      language: 'en',
      dates: { after: '2026-07-01' },
      contentType: 'media',
    };
    s.apiCallBudget = 3;
    const params = encodeSearchToParams(s);
    expect(params).toEqual({
      type: 'posts',
      calls: '3',
      q: 'angular',
      language: 'en',
      after: '2026-07-01',
      media: 'media',
    });
    expect(params['s']).toBeUndefined(); // no blob for simple searches
  });

  it('falls back to a compact blob when the search has rich criteria', () => {
    const s = emptySearch('posts');
    s.post = { words: 'angular', exactPhrase: 'change detection', author: '@a@b.social' };
    const params = encodeSearchToParams(s);
    expect(Object.keys(params)).toEqual(['s']);
    expect(typeof params['s']).toBe('string');
  });

  it('encodes account text as q', () => {
    const s = emptySearch('accounts');
    s.account = { text: 'gargron' };
    expect(encodeSearchToParams(s)).toMatchObject({ type: 'accounts', q: 'gargron' });
  });
});

describe('decodeSearchFromParams', () => {
  it('round-trips a simple post search', () => {
    const s = emptySearch('posts');
    s.post = {
      words: 'angular',
      language: 'en',
      dates: { after: '2026-07-01' },
      contentType: 'media',
    };
    s.apiCallBudget = 5;
    const back = roundTrip(s);
    expect(back.target).toBe('posts');
    expect(back.apiCallBudget).toBe(5);
    expect(back.post).toMatchObject({
      words: 'angular',
      language: 'en',
      dates: { after: '2026-07-01' },
      contentType: 'media',
    });
  });

  it('round-trips a rich post search through the blob', () => {
    const s = emptySearch('posts');
    s.post = {
      words: 'angular signals',
      exactPhrase: 'change detection',
      excludeWords: 'react',
      author: '@alice@example.social',
      dates: { after: '2026-07-01', before: '2026-08-01' },
      replies: 'exclude',
      sensitive: 'only',
      scope: 'public',
    };
    const back = roundTrip(s);
    expect(back.post).toEqual(s.post);
  });

  it('defaults to an accounts search when type is missing/invalid', () => {
    expect(decodeSearchFromParams(getter({}))).toMatchObject({ target: 'accounts' });
    expect(decodeSearchFromParams(getter({ type: 'bogus' }))).toMatchObject({ target: 'accounts' });
  });

  it('ignores an out-of-range budget', () => {
    const s = decodeSearchFromParams(getter({ type: 'posts', calls: '999' }));
    expect(s.apiCallBudget).toBe(3); // emptySearch default, not 999
  });

  it('rejects a malformed date rather than storing it', () => {
    const s = decodeSearchFromParams(getter({ type: 'posts', after: 'not-a-date' }));
    expect(s.post?.dates).toBeUndefined();
  });

  it('ignores an unknown content type', () => {
    const s = decodeSearchFromParams(getter({ type: 'posts', media: 'hologram' }));
    expect(s.post?.contentType).toBeUndefined();
  });

  it('falls back to a safe empty search for a malformed blob', () => {
    const s = decodeSearchFromParams(getter({ s: 'not!valid!base64!' }));
    expect(s.target).toBe('posts');
    expect(s.post).toEqual({});
  });

  it('never carries a token or numeric account id through the URL', () => {
    // Sanity: encoding only emits known query keys.
    const s = emptySearch('posts');
    s.post = { words: 'x' };
    const params = encodeSearchToParams(s);
    const allowed = new Set(['type', 'q', 'calls', 'language', 'after', 'media', 'scope', 's']);
    for (const key of Object.keys(params)) {
      expect(allowed.has(key)).toBe(true);
    }
  });
});
