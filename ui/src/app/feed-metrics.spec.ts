import { describe, expect, it } from 'vitest';
import { Account, MediaAttachment, Status } from './models';
import {
  accountInstance,
  analyzeFeed,
  effectiveCategories,
  feedSubject,
  isLocalAccount,
  parseContent,
  pct,
  statusEngagement,
} from './feed-metrics';

const BASE_TIME = Date.parse('2026-03-10T12:00:00Z');

function makeAccount(acct: string, overrides: Partial<Account> = {}): Account {
  const [username, host] = acct.split('@');
  return {
    id: 'acct-' + acct,
    username,
    acct,
    display_name: username,
    note: '',
    url: `https://${host ?? 'local.example'}/@${username}`,
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: [],
    ...overrides,
  };
}

function makeStatus(id: string, overrides: Partial<Status> = {}): Status {
  return {
    id,
    created_at: new Date(BASE_TIME).toISOString(),
    edited_at: null,
    content: `<p>post ${id}</p>`,
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account: makeAccount('alice'),
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
    media_attachments: [],
    ...overrides,
  };
}

function media(overrides: Partial<MediaAttachment> = {}): MediaAttachment {
  return {
    id: 'm' + Math.random(),
    type: 'image',
    url: 'https://cdn.example/x.png',
    preview_url: 'https://cdn.example/x.png',
    description: null,
    ...overrides,
  };
}

const META = { feedType: 'hashtag', feedQuery: '#test', apiCalls: 3, collectedAt: 'now' };

function analyze(posts: Status[], following?: Set<string>) {
  return analyzeFeed(posts, META, following ? { followingIds: following } : {}, BASE_TIME);
}

describe('parseContent', () => {
  it('pulls hashtags out of Mastodon anchor markup', () => {
    const html =
      '<p>hi <a href="https://m.example/tags/Angular" class="mention hashtag" rel="tag">#<span>Angular</span></a></p>';
    expect(parseContent(html).hashtags).toEqual(['angular']);
  });

  it('falls back to bare #tags when nothing was linkified', () => {
    expect(parseContent('<p>about #rust and #zig</p>').hashtags).toEqual(['rust', 'zig']);
  });

  it('ignores bare #tags once real hashtag anchors are present', () => {
    const html = '<p><a href="https://m.example/tags/one" class="hashtag">#one</a> and #two</p>';
    expect(parseContent(html).hashtags).toEqual(['one']);
  });

  it('separates outbound links from mentions and fediverse links', () => {
    const html = [
      '<p>',
      '<a href="https://news.example/story" rel="noopener">story</a>',
      '<a href="https://m.example/@bob" class="u-url mention">@bob</a>',
      '<a href="https://other.example/@carol/12345">a post</a>',
      '</p>',
    ].join('');
    const parsed = parseContent(html);
    expect(parsed.links).toEqual(['https://news.example/story']);
    expect(parsed.internalLinks).toEqual(['https://other.example/@carol/12345']);
  });

  it('de-duplicates repeats within a single post', () => {
    const html = '<a href="https://a.example/x">x</a><a href="https://a.example/x">x again</a>';
    expect(parseContent(html).links).toHaveLength(1);
  });
});

describe('account helpers', () => {
  it('reads the instance off a remote acct', () => {
    expect(accountInstance(makeAccount('bob@remote.example'), 'local.example')).toBe(
      'remote.example',
    );
  });

  it('falls back to the profile URL host for local accounts', () => {
    expect(accountInstance(makeAccount('alice'), 'fallback.example')).toBe('local.example');
  });

  it('treats an acct without @ as local', () => {
    expect(isLocalAccount(makeAccount('alice'))).toBe(true);
    expect(isLocalAccount(makeAccount('bob@remote.example'))).toBe(false);
  });

  it('reads a boost through to the boosted post', () => {
    const original = makeStatus('orig');
    expect(feedSubject(makeStatus('boost', { reblog: original }))).toBe(original);
    expect(feedSubject(original)).toBe(original);
  });
});

describe('effectiveCategories', () => {
  it('equals the count when everything is even', () => {
    expect(effectiveCategories([5, 5, 5, 5])).toBe(4);
  });

  it('approaches 1 for a monoculture', () => {
    expect(effectiveCategories([97, 1, 1, 1])).toBe(1.1);
  });

  it('is 0 for nothing at all', () => {
    expect(effectiveCategories([])).toBe(0);
  });
});

describe('analyzeFeed — composition', () => {
  it('counts boosts, replies, media, links, polls and CWs', () => {
    const posts = [
      makeStatus('1', { media_attachments: [media()] }),
      makeStatus('2', { in_reply_to_id: '1' }),
      makeStatus('3', { reblog: makeStatus('orig', { spoiler_text: 'spoilers' }) }),
      makeStatus('4', { content: '<p><a href="https://news.example/a">a</a></p>' }),
      makeStatus('5', {
        poll: {
          id: 'p',
          expires_at: null,
          expired: false,
          multiple: false,
          votes_count: 1,
          voters_count: 1,
          voted: false,
          own_votes: [],
          options: [],
        },
      }),
    ];
    const c = analyze(posts).composition;
    expect(c.total).toBe(5);
    expect(c.boosts).toBe(1);
    expect(c.original).toBe(4);
    expect(c.replies).toBe(1);
    expect(c.standalone).toBe(4);
    expect(c.withMedia).toBe(1);
    expect(c.withLinks).toBe(1);
    expect(c.withPolls).toBe(1);
    expect(c.withContentWarning).toBe(1);
  });

  it('buckets undeclared languages under und', () => {
    const langs = analyze([
      makeStatus('1', { language: 'en' }),
      makeStatus('2', { language: 'EN' }),
      makeStatus('3', { language: null }),
    ]).composition.languages;
    expect(langs[0]).toMatchObject({ key: 'en', count: 2 });
    expect(langs[1]).toMatchObject({ key: 'und', count: 1 });
  });

  it('measures post length from text, not markup', () => {
    const c = analyze([makeStatus('1', { content: '<p>12345</p>' })]).composition;
    expect(c.avgLength).toBe(5);
    expect(c.medianLength).toBe(5);
  });
});

describe('analyzeFeed — accounts', () => {
  const posts = [
    ...Array.from({ length: 6 }, (_, i) => makeStatus('a' + i, { account: makeAccount('alice') })),
    ...Array.from({ length: 3 }, (_, i) => makeStatus('b' + i, { account: makeAccount('bob') })),
    makeStatus('c', { account: makeAccount('carol', { bot: true }) }),
  ];

  it('ranks authors by post count and shares', () => {
    const a = analyze(posts).accounts;
    expect(a.uniqueAuthors).toBe(3);
    expect(a.authors[0].account.acct).toBe('alice');
    expect(a.authors[0].count).toBe(6);
    expect(a.top5Share).toBe(1);
    expect(pct(a.singletonAuthorShare)).toBe(33);
  });

  it('counts bots separately from their posts', () => {
    const a = analyze(posts).accounts;
    expect(a.botAuthors).toBe(1);
    expect(a.humanAuthors).toBe(2);
    expect(a.postsFromBots).toBe(1);
  });

  it('attributes boosted content to the original author, and the booster separately', () => {
    const a = analyze([
      makeStatus('boost', {
        account: makeAccount('booster'),
        reblog: makeStatus('orig', { account: makeAccount('writer') }),
      }),
    ]).accounts;
    expect(a.authors.map((row) => row.account.acct)).toEqual(['writer']);
    expect(a.boosters.map((row) => row.account.acct)).toEqual(['booster']);
  });

  it('leaves follow counts null until relationships are supplied', () => {
    expect(analyze(posts).accounts.followedAuthors).toBeNull();
    const withFollows = analyze(posts, new Set(['acct-alice'])).accounts;
    expect(withFollows.followedAuthors).toBe(1);
    expect(withFollows.unfollowedAuthors).toBe(2);
  });

  it('counts muted and filtered posts', () => {
    const a = analyze([
      makeStatus('1', { muted: true }),
      makeStatus('2', {
        filtered: [
          {
            filter: {
              id: 'f',
              title: 'noise',
              context: [],
              expires_at: null,
              filter_action: 'warn',
            },
            keyword_matches: ['x'],
            status_matches: null,
          } as never,
        ],
      }),
      makeStatus('3'),
    ]).accounts;
    expect(a.mutedOrFilteredPosts).toBe(2);
  });
});

describe('analyzeFeed — instances', () => {
  it('splits local from remote and ranks hosts', () => {
    const i = analyze([
      makeStatus('1', { account: makeAccount('alice') }),
      makeStatus('2', { account: makeAccount('bob@remote.example') }),
      makeStatus('3', { account: makeAccount('carol@remote.example') }),
    ]).instances;
    expect(i.localPosts).toBe(1);
    expect(i.remotePosts).toBe(2);
    expect(i.uniqueInstances).toBe(2);
    expect(i.instances[0]).toMatchObject({ key: 'remote.example', count: 2 });
    expect(pct(i.largestShare)).toBe(67);
  });
});

describe('analyzeFeed — hashtags', () => {
  const tagged = (id: string, acct: string, tags: string[]) =>
    makeStatus(id, {
      account: makeAccount(acct),
      content: tags
        .map((t) => `<a href="https://m.example/tags/${t}" class="hashtag">#${t}</a>`)
        .join(' '),
    });

  it('counts tags, their authors, and posts carrying any tag', () => {
    const h = analyze([
      tagged('1', 'alice', ['angular', 'web']),
      tagged('2', 'bob', ['angular']),
      makeStatus('3'),
    ]).hashtags;
    expect(h.postsWithHashtags).toBe(2);
    expect(pct(h.hashtagShare)).toBe(67);
    expect(h.tags[0]).toMatchObject({ key: 'angular', count: 2, authors: 2 });
    expect(h.sharedTags.map((t) => t.key)).toEqual(['angular']);
  });

  it('flags a tag one author has to themselves', () => {
    const h = analyze([
      tagged('1', 'alice', ['mine']),
      tagged('2', 'alice', ['mine']),
      tagged('3', 'alice', ['mine']),
    ]).hashtags;
    expect(h.dominatedTags[0].dominatedBy?.acct).toBe('alice');
  });

  it('does not call a single-use tag dominated', () => {
    expect(analyze([tagged('1', 'alice', ['once'])]).hashtags.dominatedTags).toHaveLength(0);
  });

  it('records tag pairs that co-occur more than once', () => {
    const h = analyze([
      tagged('1', 'alice', ['a', 'b']),
      tagged('2', 'bob', ['a', 'b']),
      tagged('3', 'bob', ['a', 'c']),
    ]).hashtags;
    expect(h.pairs).toEqual([{ a: 'a', b: 'b', count: 2 }]);
  });
});

describe('analyzeFeed — links', () => {
  const linked = (id: string, acct: string, urls: string[]) =>
    makeStatus(id, {
      account: makeAccount(acct),
      content: urls.map((u) => `<a href="${u}">link</a>`).join(''),
    });

  it('ranks domains and counts the authors behind each', () => {
    const l = analyze([
      linked('1', 'alice', ['https://news.example/a']),
      linked('2', 'bob', ['https://news.example/b']),
      linked('3', 'bob', ['https://blog.example/c']),
    ]).links;
    expect(l.uniqueDomains).toBe(2);
    expect(l.domains[0]).toMatchObject({ key: 'news.example', count: 2, authors: 2 });
    expect(pct(l.linkShare)).toBe(100);
  });

  it('spots the same URL shared by different accounts', () => {
    const l = analyze([
      linked('1', 'alice', ['https://news.example/a']),
      linked('2', 'bob', ['https://news.example/a#frag']),
    ]).links;
    expect(l.repeatedUrls[0]).toMatchObject({ count: 2, authors: 2 });
    expect(l.crossAuthorUrls).toBe(1);
  });

  it('labels an account link-heavy only above the post and share floors', () => {
    const heavy = [
      linked('1', 'alice', ['https://a.example/1']),
      linked('2', 'alice', ['https://a.example/2']),
      linked('3', 'alice', ['https://a.example/3']),
      makeStatus('4', {
        account: makeAccount('bob'),
        content: '<a href="https://a.example/4">x</a>',
      }),
    ];
    const l = analyze(heavy).links;
    expect(l.linkHeavyAuthors.map((row) => row.account.acct)).toEqual(['alice']);
  });
});

describe('analyzeFeed — media', () => {
  it('counts attachments, types and missing descriptions', () => {
    const m = analyze([
      makeStatus('1', { media_attachments: [media({ description: 'alt' }), media()] }),
      makeStatus('2', { media_attachments: [media({ type: 'video', description: 'alt' })] }),
      makeStatus('3'),
    ]).media;
    expect(m.postsWithMedia).toBe(2);
    expect(m.attachments).toBe(3);
    expect(m.described).toBe(2);
    expect(m.undescribed).toBe(1);
    // Only post 2 described everything it attached.
    expect(pct(m.fullyDescribedShare)).toBe(50);
    expect(m.byType.map((t) => t.key)).toEqual(['image', 'video']);
  });
});

describe('analyzeFeed — engagement', () => {
  const engaged = (id: string, favs: number, extra: Partial<Status> = {}) =>
    makeStatus(id, { favourites_count: favs, ...extra });

  it('averages and medians each counter', () => {
    const e = analyze([engaged('1', 10), engaged('2', 2), engaged('3', 0)]).engagement;
    expect(e.avgFavourites).toBe(4);
    expect(e.medianFavourites).toBe(2);
    expect(pct(e.zeroEngagementShare)).toBe(33);
  });

  it('slices averages by media, links and CWs, dropping empty slices', () => {
    const e = analyze([
      engaged('1', 10, { media_attachments: [media()] }),
      engaged('2', 2),
    ]).engagement;
    const byLabel = Object.fromEntries(e.slices.map((s) => [s.label, s.avgEngagement]));
    expect(byLabel['With media']).toBe(10);
    expect(byLabel['Text only']).toBe(2);
    expect(e.slices.some((s) => s.label === 'Behind a CW')).toBe(false);
  });

  it('ranks top posts and omits posts nobody touched', () => {
    const e = analyze([engaged('1', 5), engaged('2', 0)]).engagement;
    expect(e.topPosts.map((s) => s.id)).toEqual(['1']);
  });

  it('scores engagement as favourites plus boosts plus replies', () => {
    expect(
      statusEngagement(
        makeStatus('1', { favourites_count: 1, reblogs_count: 2, replies_count: 3 }),
      ),
    ).toBe(6);
  });
});

describe('analyzeFeed — conversations', () => {
  it('joins replies to their in-sample parent', () => {
    const c = analyze([
      makeStatus('root'),
      makeStatus('r1', { in_reply_to_id: 'root' }),
      makeStatus('r2', { in_reply_to_id: 'r1' }),
      makeStatus('lonely'),
    ]).conversations;
    expect(c.distinctConversations).toBe(2);
    expect(c.multiPostConversations).toBe(1);
    expect(c.replies).toBe(2);
  });

  it('groups two replies to an unseen parent into one conversation', () => {
    const c = analyze([
      makeStatus('r1', { in_reply_to_id: 'absent' }),
      makeStatus('r2', { in_reply_to_id: 'absent' }),
    ]).conversations;
    expect(c.distinctConversations).toBe(1);
    expect(c.avgPostsPerConversation).toBe(2);
  });

  it('measures the share of the feed sitting in long chains', () => {
    const chain = Array.from({ length: 4 }, (_, i) =>
      makeStatus('c' + i, { in_reply_to_id: i ? 'c' + (i - 1) : null }),
    );
    const c = analyze([...chain, makeStatus('solo')]).conversations;
    expect(pct(c.longChainShare)).toBe(80);
  });
});

describe('analyzeFeed — recency', () => {
  const at = (id: string, isoOffsetHours: number, acct = 'alice') =>
    makeStatus(id, {
      account: makeAccount(acct),
      created_at: new Date(BASE_TIME - isoOffsetHours * 3_600_000).toISOString(),
    });

  it('reports the ages of the sample edges', () => {
    const r = analyze([at('1', 1), at('2', 5), at('3', 9)]).recency;
    expect(r.newestAgeHours).toBe(1);
    expect(r.oldestAgeHours).toBe(9);
    expect(r.medianAgeHours).toBe(5);
    expect(r.spanHours).toBe(8);
  });

  it('detects a burst of posts inside one window and who drove it', () => {
    const burst = Array.from({ length: 6 }, (_, i) => at('b' + i, 1 + i * 0.02));
    const r = analyze(burst).recency;
    expect(r.bursts).toBe(1);
    expect(r.burstAuthors[0].account.acct).toBe('alice');
  });

  it('does not call a slow trickle a burst', () => {
    expect(analyze([at('1', 1), at('2', 3), at('3', 5)]).recency.bursts).toBe(0);
  });

  it('omits the per-day chart when the sample spans under a day', () => {
    expect(analyze([at('1', 1), at('2', 2)]).recency.byDay).toEqual([]);
    expect(analyze([at('1', 1), at('2', 40)]).recency.byDay.length).toBeGreaterThan(1);
  });

  it('handles an empty sample without dividing by zero', () => {
    const r = analyze([]).recency;
    expect(r.byHour).toHaveLength(24);
    expect(r.busiestHourShare).toBe(0);
  });
});

describe('analyzeFeed — concentration and highlights', () => {
  it('names the largest category in each dimension', () => {
    const posts = [
      ...Array.from({ length: 8 }, (_, i) =>
        makeStatus('a' + i, { account: makeAccount('alice') }),
      ),
      makeStatus('b', { account: makeAccount('bob@remote.example') }),
    ];
    const authors = analyze(posts).concentration.find((row) => row.label === 'Authors');
    expect(authors).toMatchObject({ largest: 'alice', categories: 2 });
    expect(pct(authors!.largestShare)).toBe(89);
  });

  it('calls out a feed a handful of accounts dominate', () => {
    const posts = [
      ...Array.from({ length: 8 }, (_, i) =>
        makeStatus('a' + i, { account: makeAccount('alice') }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        makeStatus('z' + i, { account: makeAccount('u' + i) }),
      ),
    ];
    expect(analyze(posts).highlights.join(' ')).toContain('% of this feed');
  });

  it('says nothing at all about an empty sample', () => {
    expect(analyze([]).highlights).toEqual([]);
  });

  it('records the sample size it was actually given', () => {
    expect(analyze([makeStatus('1')]).meta).toMatchObject({
      sampleSize: 1,
      feedType: 'hashtag',
      feedQuery: '#test',
    });
  });
});
