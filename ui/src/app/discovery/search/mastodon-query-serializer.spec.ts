import { describe, expect, it } from 'vitest';
import { PostSearchCriteria } from './mawkingbird-search';
import { serializeMastodonQuery } from './mastodon-query-serializer';

describe('serializeMastodonQuery', () => {
  it('reproduces the spec §8 worked example exactly', () => {
    const criteria: PostSearchCriteria = {
      words: 'angular signals',
      exactPhrase: 'change detection',
      excludeWords: 'react',
      author: '@alice@example.social',
      dates: { after: '2026-07-01' },
      language: 'en',
      contentType: 'media',
      replies: 'exclude',
      scope: 'public',
    };
    expect(serializeMastodonQuery(criteria)).toBe(
      '+angular +signals "change detection" -react from:@alice@example.social ' +
        'after:2026-07-01 language:en has:media -is:reply in:public',
    );
  });

  it('returns an empty string for empty criteria', () => {
    expect(serializeMastodonQuery({})).toBe('');
  });

  it('prefixes each all-words token with + and each exclude token with -', () => {
    expect(serializeMastodonQuery({ words: 'one two', excludeWords: 'three four' })).toBe(
      '+one +two -three -four',
    );
  });

  it('collapses extra whitespace in the words field', () => {
    expect(serializeMastodonQuery({ words: '  spaced   out  ' })).toBe('+spaced +out');
  });

  it('quotes an exact phrase and strips embedded quotes', () => {
    expect(serializeMastodonQuery({ exactPhrase: 'she said "hi" loudly' })).toBe(
      '"she said hi loudly"',
    );
  });

  it('omits an exact phrase that is only quotes/whitespace', () => {
    expect(serializeMastodonQuery({ exactPhrase: '  " "  ' })).toBe('');
  });

  it('adds a leading @ to a bare author handle', () => {
    expect(serializeMastodonQuery({ author: 'bob@server.example' })).toBe(
      'from:@bob@server.example',
    );
  });

  it('keeps an author handle that already has @', () => {
    expect(serializeMastodonQuery({ author: '@bob@server.example' })).toBe(
      'from:@bob@server.example',
    );
  });

  it('emits both after and before when a date range is given', () => {
    expect(serializeMastodonQuery({ dates: { after: '2026-01-01', before: '2026-02-01' } })).toBe(
      'after:2026-01-01 before:2026-02-01',
    );
  });

  it('emits has:poll for a poll content type', () => {
    expect(serializeMastodonQuery({ contentType: 'poll' })).toBe('has:poll');
  });

  it('does NOT emit finer media types (they are loaded-result filters)', () => {
    expect(serializeMastodonQuery({ contentType: 'image' })).toBe('');
    expect(serializeMastodonQuery({ contentType: 'video' })).toBe('');
    expect(serializeMastodonQuery({ contentType: 'text' })).toBe('');
    expect(serializeMastodonQuery({ contentType: 'link' })).toBe('');
  });

  it('maps replies tristate to is:reply operators, omitting "include"', () => {
    expect(serializeMastodonQuery({ replies: 'only' })).toBe('is:reply');
    expect(serializeMastodonQuery({ replies: 'exclude' })).toBe('-is:reply');
    expect(serializeMastodonQuery({ replies: 'include' })).toBe('');
  });

  it('maps sensitive tristate to is:sensitive operators, omitting "include"', () => {
    expect(serializeMastodonQuery({ sensitive: 'only' })).toBe('is:sensitive');
    expect(serializeMastodonQuery({ sensitive: 'exclude' })).toBe('-is:sensitive');
    expect(serializeMastodonQuery({ sensitive: 'include' })).toBe('');
  });

  it('maps scope, omitting the default "all"', () => {
    expect(serializeMastodonQuery({ scope: 'public' })).toBe('in:public');
    expect(serializeMastodonQuery({ scope: 'library' })).toBe('in:library');
    expect(serializeMastodonQuery({ scope: 'all' })).toBe('');
  });

  it('preserves unicode word characters', () => {
    expect(serializeMastodonQuery({ words: 'café niño' })).toBe('+café +niño');
  });

  it('is deterministic: same input yields identical output across calls', () => {
    const c: PostSearchCriteria = { words: 'a b', language: 'de', replies: 'exclude' };
    expect(serializeMastodonQuery(c)).toBe(serializeMastodonQuery(c));
    expect(serializeMastodonQuery(c)).toBe('+a +b language:de -is:reply');
  });
});
