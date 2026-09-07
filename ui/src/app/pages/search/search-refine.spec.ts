import { describe, expect, it } from 'vitest';
import { Status } from '../../models';
import {
  acctDomain,
  buildFacets,
  collapseRepeats,
  collapsedCount,
  contentFingerprint,
  excludeAuthors,
  filterLoaded,
  groupResults,
  plainText,
  statusMatchesFacet,
} from './search-refine';

/** Minimal Status fixture; override just the fields a test cares about. */
function makeStatus(over: Partial<Status> = {}): Status {
  return {
    id: Math.random().toString(36).slice(2),
    created_at: '2026-07-20T12:00:00Z',
    edited_at: null,
    content: '<p>hello</p>',
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account: {
      id: '1',
      username: 'alan',
      acct: 'alan',
      display_name: 'Alan',
    } as Status['account'],
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    language: null,
    media_attachments: [],
    ...over,
  };
}

describe('plainText', () => {
  it('strips tags and decodes basic entities', () => {
    expect(plainText('<p>hi &amp; <b>bye</b></p>')).toBe('hi & bye');
  });
  it('collapses whitespace', () => {
    expect(plainText('<p>a</p>\n<p>  b  </p>')).toBe('a b');
  });
});

describe('acctDomain', () => {
  it('extracts the host for a remote acct', () => {
    expect(acctDomain('bob@example.social')).toBe('example.social');
  });
  it('is empty for a local acct', () => {
    expect(acctDomain('alan')).toBe('');
  });
});

describe('filterLoaded', () => {
  const statuses = [
    makeStatus({ id: 'a', content: '<p>solar panels are great</p>' }),
    makeStatus({ id: 'b', content: '<p>lunar eclipse tonight</p>' }),
    makeStatus({
      id: 'c',
      content: '<p>nothing</p>',
      account: { acct: 'solaris', display_name: 'Sol' } as Status['account'],
    }),
    makeStatus({ id: 'd', content: '<p>hidden</p>', spoiler_text: 'SOLAR warning' }),
  ];

  it('returns everything for an empty filter', () => {
    expect(filterLoaded(statuses, '  ')).toHaveLength(4);
  });

  it('matches post body, handle, and content warning, case-insensitively', () => {
    const hits = filterLoaded(statuses, 'solar').map((s) => s.id);
    expect(hits).toEqual(['a', 'c', 'd']);
  });

  it('excludes non-matches', () => {
    expect(filterLoaded(statuses, 'lunar').map((s) => s.id)).toEqual(['b']);
  });
});

describe('buildFacets', () => {
  it('is empty when there are no statuses', () => {
    expect(buildFacets([])).toEqual([]);
  });

  it('counts languages and sorts by descending count', () => {
    const statuses = [
      makeStatus({ language: 'en' }),
      makeStatus({ language: 'en' }),
      makeStatus({ language: 'de' }),
    ];
    const lang = buildFacets(statuses).find((f) => f.kind === 'language');
    expect(lang?.values).toEqual([
      { value: 'en', labelKey: null, text: 'EN', count: 2 },
      { value: 'de', labelKey: null, text: 'DE', count: 1 },
    ]);
  });

  it('keeps a facet when all loaded posts share one value', () => {
    // A narrow result set still exposes its language and loaded count.
    const statuses = [makeStatus({ language: 'en' }), makeStatus({ language: 'en' })];
    expect(buildFacets(statuses).find((f) => f.kind === 'language')?.values).toEqual([
      { value: 'en', labelKey: null, text: 'EN', count: 2 },
    ]);
  });

  it('buckets media by first attachment type, else text-only', () => {
    const statuses = [
      makeStatus({ media_attachments: [{ type: 'image' } as Status['media_attachments'][0]] }),
      makeStatus({ media_attachments: [{ type: 'video' } as Status['media_attachments'][0]] }),
      makeStatus({ media_attachments: [] }),
    ];
    const media = buildFacets(statuses).find((f) => f.kind === 'media');
    expect(media?.values.map((v) => v.value).sort()).toEqual(['image', 'none', 'video']);
  });

  it('separates replies from original posts', () => {
    const statuses = [makeStatus({ in_reply_to_id: '99' }), makeStatus({ in_reply_to_id: null })];
    const replies = buildFacets(statuses).find((f) => f.kind === 'replies');
    expect(replies?.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'reply', count: 1 }),
        expect.objectContaining({ value: 'original', count: 1 }),
      ]),
    );
  });
});

describe('statusMatchesFacet', () => {
  it('matches the same buckets buildFacets produced', () => {
    const reply = makeStatus({ in_reply_to_id: '1', language: 'en' });
    expect(statusMatchesFacet(reply, 'replies', 'reply')).toBe(true);
    expect(statusMatchesFacet(reply, 'replies', 'original')).toBe(false);
    expect(statusMatchesFacet(reply, 'language', 'en')).toBe(true);
  });

  it('maps a local account to the "local" domain value', () => {
    const local = makeStatus({ account: { acct: 'alan' } as Status['account'] });
    expect(statusMatchesFacet(local, 'domain', 'local')).toBe(true);
  });
});

describe('groupResults', () => {
  it('returns a single unlabeled group for "none", preserving order', () => {
    const statuses = [makeStatus({ id: 'a' }), makeStatus({ id: 'b' })];
    const groups = groupResults(statuses, 'none');
    expect(groups).toHaveLength(1);
    expect(groups[0].statuses.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('groups by author in first-seen order, preserving within-group order', () => {
    const statuses = [
      makeStatus({
        id: 'a1',
        account: { acct: 'alan', display_name: 'Alan' } as Status['account'],
      }),
      makeStatus({ id: 'b1', account: { acct: 'bea', display_name: 'Bea' } as Status['account'] }),
      makeStatus({
        id: 'a2',
        account: { acct: 'alan', display_name: 'Alan' } as Status['account'],
      }),
    ];
    const groups = groupResults(statuses, 'author');
    expect(groups.map((g) => g.key)).toEqual(['alan', 'bea']);
    expect(groups[0].statuses.map((s) => s.id)).toEqual(['a1', 'a2']);
  });

  it('buckets by local calendar day with Today/Yesterday/Earlier ordering', () => {
    const now = new Date('2026-07-20T12:00:00').getTime();
    const statuses = [
      makeStatus({ id: 'today', created_at: '2026-07-20T09:00:00' }),
      makeStatus({ id: 'yest', created_at: '2026-07-19T09:00:00' }),
      makeStatus({ id: 'old', created_at: '2026-01-01T09:00:00' }),
    ];
    const groups = groupResults(statuses, 'date', now);
    expect(groups.map((g) => g.label)).toEqual([
      'pages.search.group.today',
      'pages.search.group.yesterday',
      'pages.search.group.earlier',
    ]);
    expect(groups.map((g) => g.labelIsKey)).toEqual([true, true, true]);
    expect(groups[2].statuses[0].id).toBe('old');
  });
});

describe('flood control', () => {
  /** A post by `acct` with `content` as its HTML body. */
  const post = (acct: string, content: string, over: Partial<Status> = {}) =>
    makeStatus({
      content,
      account: { id: acct, username: acct, acct, display_name: acct } as Status['account'],
      ...over,
    });

  describe('excludeAuthors', () => {
    it('drops every post by an excluded author', () => {
      const posts = [post('flooder', '<p>a</p>'), post('alice', '<p>b</p>')];
      const kept = excludeAuthors(posts, new Set(['flooder']));
      expect(kept.map((s) => s.account.acct)).toEqual(['alice']);
    });

    it('is a no-op with nothing excluded', () => {
      const posts = [post('alice', '<p>a</p>')];
      expect(excludeAuthors(posts, new Set())).toBe(posts);
    });

    it('excludes several authors at once', () => {
      const posts = [post('a', '<p>1</p>'), post('b', '<p>2</p>'), post('c', '<p>3</p>')];
      expect(excludeAuthors(posts, new Set(['a', 'c'])).map((s) => s.account.acct)).toEqual(['b']);
    });
  });

  describe('contentFingerprint', () => {
    it('ignores markup, case and punctuation', () => {
      const a = contentFingerprint(post('x', '<p>Buy My Thing!!!</p>'));
      const b = contentFingerprint(post('x', '<p>buy my thing</p>'));
      expect(a).toBe(b);
    });

    /** The rotating-hashtag trick is the whole reason this isn't a string compare. */
    it('ignores hashtags, mentions and links', () => {
      const a = contentFingerprint(post('x', '<p>buy my thing #rust https://a.example/1</p>'));
      const b = contentFingerprint(post('x', '<p>buy my thing #golang https://a.example/2</p>'));
      expect(a).toBe(b);
      expect(a).toBe('buy my thing');
    });

    it('keeps genuinely different text apart', () => {
      expect(contentFingerprint(post('x', '<p>question about rust</p>'))).not.toBe(
        contentFingerprint(post('x', '<p>answer about rust</p>')),
      );
    });

    it('is empty for a post that is only a link or tags', () => {
      expect(contentFingerprint(post('x', '<p>#rust https://a.example/1</p>'))).toBe('');
    });
  });

  describe('collapseRepeats', () => {
    it('folds an author repeating themselves into one row', () => {
      const posts = [
        post('flooder', '<p>buy my thing #a</p>'),
        post('flooder', '<p>buy my thing #b</p>'),
        post('flooder', '<p>buy my thing #c</p>'),
        post('alice', '<p>a real question</p>'),
      ];
      const rows = collapseRepeats(posts);
      expect(rows).toHaveLength(2);
      expect(rows[0].duplicates).toHaveLength(2);
      expect(rows[1].duplicates).toHaveLength(0);
      expect(collapsedCount(rows)).toBe(2);
    });

    /** Two people saying the same short thing is a coincidence, not a flood. */
    it('does not fold identical text from different authors', () => {
      const posts = [post('alice', '<p>congrats</p>'), post('bob', '<p>congrats</p>')];
      expect(collapseRepeats(posts)).toHaveLength(2);
    });

    it('keeps the first occurrence, so a sorted list keeps its best copy', () => {
      const first = post('flooder', '<p>same thing</p>', { id: 'best' });
      const later = post('flooder', '<p>same thing</p>', { id: 'worse' });
      const rows = collapseRepeats([first, later]);
      expect(rows[0].status.id).toBe('best');
      expect(rows[0].duplicates[0].id).toBe('worse');
    });

    it('leaves an author posting different things alone', () => {
      const posts = [post('alice', '<p>one</p>'), post('alice', '<p>two</p>')];
      expect(collapseRepeats(posts)).toHaveLength(2);
      expect(collapsedCount(collapseRepeats(posts))).toBe(0);
    });

    /** Otherwise every image-only post in the corpus folds into a single row. */
    it('never folds posts with no quotable text', () => {
      const posts = [
        post('alice', '<p>#rust https://a.example/1</p>'),
        post('alice', '<p>#rust https://a.example/2</p>'),
      ];
      expect(collapseRepeats(posts)).toHaveLength(2);
    });

    it('handles an empty list', () => {
      expect(collapseRepeats([])).toEqual([]);
      expect(collapsedCount([])).toBe(0);
    });
  });
});
