import { isWebEngine, serializeWebQuery, webSearchUrl, WEB_ENGINES } from './web-query-serializer';

describe('serializeWebQuery', () => {
  it('scopes to the host and ANDs free text without the Mastodon + prefix', () => {
    const { query } = serializeWebQuery({ words: 'rust borrow checker' }, 'mastodon.social');
    expect(query).toBe('site:mastodon.social rust borrow checker');
  });

  it('strips a scheme and trailing slash from the host', () => {
    const { query } = serializeWebQuery({ words: 'hi' }, 'https://kolektiva.social/');
    expect(query).toBe('site:kolektiva.social hi');
  });

  it('omits site: entirely when no host is given', () => {
    const { query } = serializeWebQuery({ words: 'hi' });
    expect(query).toBe('hi');
  });

  it('quotes an exact phrase and negates excluded words', () => {
    const { query } = serializeWebQuery(
      { words: 'rust', exactPhrase: 'borrow checker', excludeWords: 'crypto nft' },
      'mastodon.social',
    );
    expect(query).toBe('site:mastodon.social rust "borrow checker" -crypto -nft');
  });

  it('turns an author into a bare handle term, never a from: operator', () => {
    // from: means "this site" to several web engines — emitting it would quietly
    // search for something else entirely.
    const { query } = serializeWebQuery({ author: '@alice@example.org' }, 'mastodon.social');
    expect(query).toBe('site:mastodon.social "@alice"');
    expect(query).not.toContain('from:');
  });

  it('accepts an author with no leading @', () => {
    const { query } = serializeWebQuery({ author: 'bob' });
    expect(query).toBe('"@bob"');
  });

  it('reports dropped criteria instead of approximating them', () => {
    const { query, dropped } = serializeWebQuery(
      {
        words: 'angular',
        replies: 'exclude',
        contentType: 'media',
        language: 'en',
        dates: { after: '2026-01-01', before: '2026-02-01' },
        sensitive: 'exclude',
      },
      'mastodon.social',
    );
    // None of the untranslatable criteria leak into the query.
    expect(query).toBe('site:mastodon.social angular');
    expect(dropped).toEqual([
      { code: 'after', value: '2026-01-01' },
      { code: 'before', value: '2026-02-01' },
      { code: 'language', value: 'en' },
      { code: 'contentType', value: 'media' },
      { code: 'noReplies' },
      { code: 'noSensitivePosts' },
    ]);
  });

  it('reports nothing dropped for a losslessly translatable search', () => {
    const { dropped } = serializeWebQuery(
      { words: 'angular', excludeWords: 'vue', exactPhrase: 'signals api' },
      'mastodon.social',
    );
    expect(dropped).toEqual([]);
  });

  it('treats contentType any and include tristates as nothing to drop', () => {
    const { dropped } = serializeWebQuery({
      words: 'x',
      contentType: 'any',
      replies: 'include',
      sensitive: 'include',
    });
    expect(dropped).toEqual([]);
  });

  it('yields an empty query for empty criteria so callers can skip the hand-off', () => {
    expect(serializeWebQuery({}).query).toBe('');
  });
});

describe('webSearchUrl', () => {
  it('percent-encodes the query into each engine URL', () => {
    expect(webSearchUrl('google', 'site:mastodon.social "a b"')).toBe(
      'https://www.google.com/search?q=site%3Amastodon.social%20%22a%20b%22',
    );
  });

  it('builds a URL for every offered engine', () => {
    for (const engine of WEB_ENGINES) {
      expect(webSearchUrl(engine.id, 'hi')).toContain('q=hi');
    }
  });
});

describe('isWebEngine', () => {
  it('recognises engine ids and rejects the real search types', () => {
    expect(isWebEngine('google')).toBe(true);
    expect(isWebEngine('kagi')).toBe(true);
    expect(isWebEngine('accounts')).toBe(false);
    expect(isWebEngine('statuses')).toBe(false);
    expect(isWebEngine('hashtags')).toBe(false);
  });
});
