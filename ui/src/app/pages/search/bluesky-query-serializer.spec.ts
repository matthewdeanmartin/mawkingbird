import { describe, expect, it } from 'vitest';
import {
  hasBlueskyOperators,
  parseBlueskyQuery,
  serializeBlueskyQuery,
} from './bluesky-query-serializer';
import { emptyBlueskyPostSearch } from '../../providers/bluesky/bluesky-post-search';

describe('parseBlueskyQuery', () => {
  it('keeps bare words as the query text', () => {
    expect(parseBlueskyQuery('angular signals').text).toBe('angular signals');
  });

  it('reads the value operators into their criteria fields', () => {
    const criteria = parseBlueskyQuery(
      'rust from:pfrazee mentions:jay lang:en domain:github.com since:2026-01-01 until:2026-07-01',
    );
    expect(criteria).toMatchObject({
      text: 'rust',
      author: 'pfrazee',
      mentions: 'jay',
      language: 'en',
      domain: 'github.com',
      after: '2026-01-01',
      before: '2026-07-01',
    });
  });

  it('strips the leading @ from handles, which the endpoint rejects', () => {
    expect(parseBlueskyQuery('from:@pfrazee.com').author).toBe('pfrazee.com');
    expect(parseBlueskyQuery('mentions:@jay.bsky.team').mentions).toBe('jay.bsky.team');
  });

  it('collects #tags and tag: into the AND-matched tag list', () => {
    expect(parseBlueskyQuery('#angular tag:typescript rust').tags).toEqual([
      'angular',
      'typescript',
    ]);
  });

  it('does not repeat a tag given twice', () => {
    expect(parseBlueskyQuery('#angular #angular').tags).toEqual(['angular']);
  });

  it('keeps quoted phrases whole, quotes included', () => {
    // searchPosts honours the quotes as a phrase match, so dropping them here
    // would silently broaden the search.
    expect(parseBlueskyQuery('"borrow checker" rust').text).toBe('"borrow checker" rust');
  });

  it('treats an unknown operator as a search word, which is what the server does', () => {
    const criteria = parseBlueskyQuery('has:media rust');
    expect(criteria.text).toBe('has:media rust');
    expect(criteria.author).toBeUndefined();
  });

  it('accepts language: as a synonym for lang:, since the Mastodon box uses it', () => {
    expect(parseBlueskyQuery('language:fr').language).toBe('fr');
  });

  it('ignores an operator with no value', () => {
    const criteria = parseBlueskyQuery('from:');
    expect(criteria.author).toBeUndefined();
    expect(criteria.text).toBe('');
  });

  it('replaces rather than merges, so a stale filter cannot narrow a new search', () => {
    expect(parseBlueskyQuery('plain words')).toEqual({
      ...emptyBlueskyPostSearch(),
      text: 'plain words',
    });
  });
});

describe('serializeBlueskyQuery', () => {
  it('round-trips every field the parser reads', () => {
    const query =
      'rust from:pfrazee mentions:jay #angular lang:en domain:github.com since:2026-01-01 until:2026-07-01';
    expect(serializeBlueskyQuery(parseBlueskyQuery(query))).toBe(query);
  });

  it('leaves sort out — it is a ranking widget, not a typed operator', () => {
    expect(serializeBlueskyQuery({ text: 'rust', sort: 'top' })).toBe('rust');
  });

  it('renders an empty search as an empty string', () => {
    expect(serializeBlueskyQuery(emptyBlueskyPostSearch())).toBe('');
  });
});

describe('hasBlueskyOperators', () => {
  it('is true for a recognised operator or tag', () => {
    expect(hasBlueskyOperators('from:pfrazee')).toBe(true);
    expect(hasBlueskyOperators('#angular')).toBe(true);
  });

  it('is false for plain words and for operators we do not send', () => {
    expect(hasBlueskyOperators('angular signals')).toBe(false);
    expect(hasBlueskyOperators('has:media')).toBe(false);
  });
});
