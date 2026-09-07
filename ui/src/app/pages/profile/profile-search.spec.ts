import { describe, expect, it } from 'vitest';
import { Status } from '../../models';
import {
  filterStatuses,
  isEmptyCriteria,
  emptyProfileSearch,
  mergeResults,
  queryTerms,
  searchableText,
  serverQuery,
} from './profile-search';

function status(id: string, over: Partial<Status> = {}): Status {
  return {
    id,
    content: '<p>hello world</p>',
    created_at: '2026-06-15T12:00:00Z',
    spoiler_text: '',
    in_reply_to_id: null,
    media_attachments: [],
    poll: null,
    language: 'en',
    ...over,
  } as Status;
}

describe('searchableText', () => {
  it('reads what the reader sees, not the markup', () => {
    const text = searchableText(
      status('1', { content: '<p class="foo">Hello <a href="https://x">World</a></p>' }),
    );

    // Searching raw HTML would match "class" and "https" in every post.
    expect(text).toContain('hello world');
    expect(text).not.toContain('class');
    expect(text).not.toContain('href');
  });

  it('treats block boundaries as spaces so words do not fuse', () => {
    expect(searchableText(status('1', { content: '<p>one<br>two</p>' }))).toContain('one two');
  });

  it('decodes entities and includes alt text, spoilers and poll options', () => {
    const text = searchableText(
      status('1', {
        content: '<p>caf&eacute;</p>',
        spoiler_text: 'spoilery',
        media_attachments: [{ description: 'a red bicycle' }] as Status['media_attachments'],
        poll: { options: [{ title: 'option one' }] } as Status['poll'],
      }),
    );

    expect(text).toContain('café');
    expect(text).toContain('spoilery');
    expect(text).toContain('a red bicycle');
    expect(text).toContain('option one');
  });
});

describe('queryTerms', () => {
  it('splits on whitespace and keeps quoted phrases whole', () => {
    expect(queryTerms('angular "reactive forms" signals')).toEqual([
      'angular',
      'reactive forms',
      'signals',
    ]);
    expect(queryTerms('   ')).toEqual([]);
  });
});

describe('filterStatuses', () => {
  const posts = [
    status('1', { content: '<p>angular signals are good</p>' }),
    status('2', { content: '<p>angular alone</p>' }),
    status('3', {
      content: '<p>a photo</p>',
      media_attachments: [{ description: '' }] as Status['media_attachments'],
    }),
    status('4', { content: '<p>a reply</p>', in_reply_to_id: '1' }),
    status('5', { content: '<p>en francais</p>', language: 'fr' }),
    status('6', { content: '<p>old news</p>', created_at: '2025-01-01T00:00:00Z' }),
  ];

  it('requires every term, not any of them', () => {
    // An OR here would return the account's whole history of saying "angular".
    expect(filterStatuses(posts, { words: 'angular signals' }).map((s) => s.id)).toEqual(['1']);
  });

  it('returns everything when the query is empty but a filter is set', () => {
    expect(filterStatuses(posts, { words: '', hasMedia: true }).map((s) => s.id)).toEqual(['3']);
  });

  it('filters replies, language and dates', () => {
    expect(
      filterStatuses(posts, { words: '', excludeReplies: true }).map((s) => s.id),
    ).not.toContain('4');
    expect(filterStatuses(posts, { words: '', language: 'fr' }).map((s) => s.id)).toEqual(['5']);
    expect(
      filterStatuses(posts, { words: '', after: '2026-01-01' }).map((s) => s.id),
    ).not.toContain('6');
    expect(filterStatuses(posts, { words: '', before: '2025-06-01' }).map((s) => s.id)).toEqual([
      '6',
    ]);
  });

  it('does not count hashtag and mention anchors as links', () => {
    const tagged = status('7', {
      content: '<p>see <a href="https://h/tags/x" class="mention hashtag">#x</a></p>',
    });
    const linked = status('8', { content: '<p><a href="https://example.com">read</a></p>' });

    // A "has a link" filter matching every tagged post would be useless.
    expect(filterStatuses([tagged, linked], { words: '', hasLink: true }).map((s) => s.id)).toEqual(
      ['8'],
    );
  });
});

describe('serverQuery', () => {
  it('asks the server only when there are words to search for', () => {
    // A bare `from:` would ask for the whole history the timeline already shows.
    expect(serverQuery('a@b.social', { words: '   ' })).toBeNull();
    expect(serverQuery('a@b.social', { words: 'rust' })).toBe('from:@a@b.social rust');
  });

  it('carries the filters the server understands', () => {
    expect(
      serverQuery('@a@b.social', {
        words: 'rust',
        after: '2026-01-01',
        hasMedia: true,
        excludeReplies: true,
      }),
    ).toBe('from:@a@b.social rust after:2026-01-01 has:media -is:reply');
  });
});

describe('mergeResults', () => {
  it('dedupes by id and orders newest first', () => {
    const older = status('1', { created_at: '2026-01-01T00:00:00Z' });
    const newer = status('2', { created_at: '2026-06-01T00:00:00Z' });

    expect(mergeResults([older], [newer, older]).map((s) => s.id)).toEqual(['2', '1']);
  });
});

describe('isEmptyCriteria', () => {
  it('is the point at which the profile shows its timeline again', () => {
    expect(isEmptyCriteria(emptyProfileSearch())).toBe(true);
    expect(isEmptyCriteria({ words: '', hasMedia: true })).toBe(false);
    expect(isEmptyCriteria({ words: 'x' })).toBe(false);
  });
});
