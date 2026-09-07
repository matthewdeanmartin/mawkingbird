import { describe, expect, it } from 'vitest';
import { Account, Status } from '../../models';
import { BskyRef } from '../../providers/bluesky/bluesky-types';
import {
  accountMeetsBounds,
  blueskyAccountMatchesFacet,
  blueskyPostMatchesFacet,
  buildBlueskyAccountFacets,
  buildBlueskyPostFacets,
  handleDomain,
  isDefaultHandle,
  linkDomain,
  statusMeetsEngagement,
  threadPosition,
} from './bluesky-refine';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'bsky:did:plc:alice',
    username: 'alice.bsky.social',
    acct: 'alice.bsky.social',
    display_name: 'Alice',
    note: '',
    url: 'https://bsky.app/profile/alice.bsky.social',
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 10,
    following_count: 10,
    statuses_count: 10,
    bot: false,
    locked: false,
    fields: [],
    ...overrides,
  } as Account;
}

function ref(overrides: Partial<BskyRef> = {}): BskyRef {
  return {
    uri: 'at://did:plc:alice/app.bsky.feed.post/1',
    cid: 'cid-1',
    likeUri: null,
    repostUri: null,
    replyRoot: { uri: 'at://did:plc:alice/app.bsky.feed.post/1', cid: 'cid-1' },
    replyParentUri: null,
    externalUri: null,
    ...overrides,
  };
}

function status(overrides: Partial<Status> = {}, refOverrides: Partial<BskyRef> = {}): Status {
  return {
    provider: 'bluesky',
    providerRef: ref(refOverrides),
    id: 'bsky:1',
    created_at: '2026-08-01T00:00:00Z',
    edited_at: null,
    content: '<p>hi</p>',
    spoiler_text: '',
    visibility: 'public',
    url: 'https://bsky.app/profile/alice.bsky.social/post/1',
    account: account(),
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
    ...overrides,
  } as Status;
}

describe('handleDomain', () => {
  it('drops the name label from a subdomain handle', () => {
    expect(handleDomain('alice.bsky.social')).toBe('bsky.social');
    expect(handleDomain('dev.alice.example.com')).toBe('alice.example.com');
  });

  it('keeps a bare two-label handle whole, since the handle is the domain', () => {
    // Slicing off the first label here would leave 'org', which groups every
    // unrelated .org account together and names none of them.
    expect(handleDomain('mozilla.org')).toBe('mozilla.org');
  });

  it('normalises case and a leading @', () => {
    expect(handleDomain('@Alice.BSky.Social')).toBe('bsky.social');
  });

  it('returns empty for a blank handle rather than throwing', () => {
    expect(handleDomain('   ')).toBe('');
  });
});

describe('isDefaultHandle', () => {
  it('recognises bsky.social handles', () => {
    expect(isDefaultHandle('alice.bsky.social')).toBe(true);
  });

  it('treats a custom domain as not default', () => {
    expect(isDefaultHandle('mozilla.org')).toBe(false);
    expect(isDefaultHandle('alice.example.com')).toBe(false);
  });

  it('is not fooled by a lookalike domain', () => {
    // 'notbsky.social' must not match; only the domain itself or a subdomain of it.
    expect(isDefaultHandle('alice.notbsky.social')).toBe(false);
  });
});

describe('buildBlueskyAccountFacets', () => {
  const mixed = [
    account({ acct: 'alice.bsky.social', followers_count: 50, statuses_count: 20 }),
    account({ acct: 'bob.bsky.social', followers_count: 5_000, statuses_count: 2_000 }),
    account({ acct: 'mozilla.org', followers_count: 50_000, statuses_count: 300 }),
  ];

  it('splits default handles from custom domains', () => {
    const facet = buildBlueskyAccountFacets(mixed).find((f) => f.kind === 'handleType');
    expect(facet?.values).toEqual([
      { value: 'default', labelKey: 'pages.search.facet.defaultHandle', count: 2 },
      { value: 'custom', labelKey: 'pages.search.facet.customDomain', count: 1 },
    ]);
  });

  it('breaks handles down by domain', () => {
    const facet = buildBlueskyAccountFacets(mixed).find((f) => f.kind === 'handleDomain');
    expect(facet?.values).toEqual([
      { value: 'bsky.social', labelKey: null, text: 'bsky.social', count: 2 },
      { value: 'mozilla.org', labelKey: null, text: 'mozilla.org', count: 1 },
    ]);
  });

  it('buckets followers and posts on the shared ladder, in size order', () => {
    const facets = buildBlueskyAccountFacets(mixed);
    expect(facets.find((f) => f.kind === 'followers')?.values.map((v) => v.value)).toEqual([
      '0-99',
      '1000-9999',
      '10000+',
    ]);
    expect(facets.find((f) => f.kind === 'statuses')?.values.map((v) => v.labelKey)).toEqual([
      'pages.search.count.under100',
      'pages.search.count.100to1k',
      'pages.search.count.1kTo10k',
    ]);
  });

  it('retains handle facets for accounts sharing a domain', () => {
    // The shared domain remains visible with its loaded count.
    const same = [
      account({ acct: 'a.bsky.social' }),
      account({ acct: 'b.bsky.social' }),
      account({ acct: 'c.bsky.social' }),
    ];
    const kinds = buildBlueskyAccountFacets(same).map((f) => f.kind);
    expect(kinds).toContain('handleType');
    expect(kinds).toContain('handleDomain');
  });

  it('never offers bot or locked facets, which AT Protocol has no concept of', () => {
    const kinds = buildBlueskyAccountFacets(mixed).map((f) => String(f.kind));
    expect(kinds).not.toContain('bot');
    expect(kinds).not.toContain('locked');
  });

  it('hides the activity facet until at least one date is known', () => {
    const kinds = buildBlueskyAccountFacets(mixed).map((f) => f.kind);
    expect(kinds).not.toContain('activity');
  });

  it('shows the activity ladder once the scan has filled some dates', () => {
    const now = Date.parse('2026-08-14T12:00:00Z');
    const scanned = [
      account({ acct: 'a.bsky.social', last_status_at: '2026-08-14T09:00:00Z' }),
      account({ acct: 'b.bsky.social', last_status_at: '2026-06-01T00:00:00Z' }),
      // Never reached by the scan: stays honestly unknown rather than dropped.
      account({ acct: 'c.bsky.social' }),
    ];
    const facet = buildBlueskyAccountFacets(scanned, now).find((f) => f.kind === 'activity');
    expect(facet?.showAll).toBe(true);
    expect(facet?.values).toEqual([
      { value: 'd1', labelKey: 'pages.search.activity.today', count: 1 },
      { value: 'd90', labelKey: 'pages.search.activity.last3Months', count: 1 },
      { value: 'unknown', labelKey: 'pages.search.activity.notChecked', count: 1 },
    ]);
  });

  it('returns nothing for an empty result set', () => {
    expect(buildBlueskyAccountFacets([])).toEqual([]);
  });
});

describe('blueskyAccountMatchesFacet', () => {
  it('matches handle type and domain', () => {
    const custom = account({ acct: 'mozilla.org' });
    expect(blueskyAccountMatchesFacet(custom, 'handleType', 'custom')).toBe(true);
    expect(blueskyAccountMatchesFacet(custom, 'handleType', 'default')).toBe(false);
    expect(blueskyAccountMatchesFacet(custom, 'handleDomain', 'mozilla.org')).toBe(true);
  });

  it('matches the same buckets the builder counted', () => {
    const a = account({ followers_count: 5_000, statuses_count: 12 });
    expect(blueskyAccountMatchesFacet(a, 'followers', '1000-9999')).toBe(true);
    expect(blueskyAccountMatchesFacet(a, 'statuses', '0-99')).toBe(true);
    expect(blueskyAccountMatchesFacet(a, 'statuses', '10000+')).toBe(false);
  });

  it('puts an account with no known date in the unknown bin', () => {
    expect(blueskyAccountMatchesFacet(account(), 'activity', 'unknown')).toBe(true);
  });
});

describe('threadPosition', () => {
  it('calls a post with no reply block top-level', () => {
    expect(threadPosition(status())).toBe('top');
  });

  it('calls a reply to the thread root a direct reply', () => {
    const s = status(
      { in_reply_to_id: 'bsky:at://root' },
      { replyRoot: { uri: 'at://root', cid: 'c' }, replyParentUri: 'at://root' },
    );
    expect(threadPosition(s)).toBe('direct');
  });

  it('calls a reply to something below the root deep', () => {
    const s = status(
      { in_reply_to_id: 'bsky:at://mid' },
      { replyRoot: { uri: 'at://root', cid: 'c' }, replyParentUri: 'at://mid' },
    );
    expect(threadPosition(s)).toBe('deep');
  });

  it('falls back to reply-or-not when the raw refs are missing', () => {
    const s = { ...status(), provider: 'mastodon', in_reply_to_id: '99' } as Status;
    expect(threadPosition(s)).toBe('direct');
  });
});

describe('linkDomain', () => {
  it('extracts the host and drops www.', () => {
    expect(linkDomain('https://www.GitHub.com/a/b')).toBe('github.com');
  });

  it('returns null for absent or unparseable urls', () => {
    expect(linkDomain(null)).toBeNull();
    expect(linkDomain('not a url')).toBeNull();
  });
});

describe('buildBlueskyPostFacets', () => {
  const posts = [
    status({ favourites_count: 0, reblogs_count: 0, replies_count: 0 }),
    status({ favourites_count: 5, reblogs_count: 2, replies_count: 1 }),
    status({ favourites_count: 250, reblogs_count: 40, replies_count: 12 }),
  ];

  it('buckets likes with an explicit "None" row, in ladder order', () => {
    const facet = buildBlueskyPostFacets(posts).find((f) => f.kind === 'likes');
    expect(facet?.values).toEqual([
      { value: '0', labelKey: 'pages.search.count.none', count: 1 },
      { value: '1-9', labelKey: 'pages.search.count.1to9', count: 1 },
      { value: '100-999', labelKey: 'pages.search.count.100to999', count: 1 },
    ]);
  });

  it('separates top-level, direct and deep posts', () => {
    const threaded = [
      status(),
      status(
        { in_reply_to_id: 'x' },
        { replyRoot: { uri: 'at://r', cid: 'c' }, replyParentUri: 'at://r' },
      ),
      status(
        { in_reply_to_id: 'y' },
        { replyRoot: { uri: 'at://r', cid: 'c' }, replyParentUri: 'at://m' },
      ),
    ];
    const facet = buildBlueskyPostFacets(threaded).find((f) => f.kind === 'threadPosition');
    expect(facet?.values.map((v) => v.value).sort()).toEqual(['deep', 'direct', 'top']);
  });

  it('counts alt text only over posts that have images', () => {
    const withMedia = [
      status({
        media_attachments: [
          { id: '1', type: 'image', url: '', preview_url: '', description: 'a bird' },
        ],
      }),
      status({
        media_attachments: [
          { id: '2', type: 'image', url: '', preview_url: '', description: null },
        ],
      }),
      // Text-only: must not be counted as "missing".
      status(),
    ] as Status[];
    const facet = buildBlueskyPostFacets(withMedia).find((f) => f.kind === 'altText');
    expect(facet?.values).toEqual([
      { value: 'yes', labelKey: 'pages.search.facet.hasAltText', count: 1 },
      { value: 'no', labelKey: 'pages.search.facet.missingAltText', count: 1 },
    ]);
    expect(facet?.hint).toBe('pages.search.facet.altTextHint');
  });

  it('treats a partly-described post as missing alt text', () => {
    const partial = [
      status({
        media_attachments: [
          { id: '1', type: 'image', url: '', preview_url: '', description: 'described' },
          { id: '2', type: 'image', url: '', preview_url: '', description: null },
        ],
      }),
      status({
        media_attachments: [
          { id: '3', type: 'image', url: '', preview_url: '', description: 'ok' },
        ],
      }),
    ] as Status[];
    const facet = buildBlueskyPostFacets(partial).find((f) => f.kind === 'altText');
    expect(facet?.values).toContainEqual({
      value: 'no',
      labelKey: 'pages.search.facet.missingAltText',
      count: 1,
    });
  });

  it('facets the linked domain from the embed, not the rendered html', () => {
    const linked = [
      status({}, { externalUri: 'https://github.com/x/y' }),
      status({}, { externalUri: 'https://github.com/z' }),
      status({}, { externalUri: 'https://youtube.com/watch' }),
      status(),
    ];
    const facet = buildBlueskyPostFacets(linked).find((f) => f.kind === 'linkDomain');
    expect(facet?.values).toEqual([
      { value: 'github.com', labelKey: null, text: 'github.com', count: 2 },
      { value: 'youtube.com', labelKey: null, text: 'youtube.com', count: 1 },
    ]);
  });

  it('splits quote posts from plain ones', () => {
    const quotes = [
      status({ quote: { state: 'accepted', quoted_status: null } }),
      status(),
    ] as Status[];
    const facet = buildBlueskyPostFacets(quotes).find((f) => f.kind === 'quote');
    expect(facet?.values.map((v) => v.value).sort()).toEqual(['no', 'yes']);
  });

  it('keeps populated post facets and returns nothing when empty', () => {
    expect(buildBlueskyPostFacets([])).toEqual([]);
    // Two identical posts: every facet is single-valued.
    const facets = buildBlueskyPostFacets([status(), status()]);
    expect(facets.length).toBeGreaterThan(0);
    for (const facet of facets) {
      expect(facet.values).toHaveLength(1);
      expect(facet.values[0].count).toBe(2);
    }
  });
});

describe('blueskyPostMatchesFacet', () => {
  it('matches the engagement bucket the builder counted', () => {
    const s = status({ favourites_count: 250, reblogs_count: 0, replies_count: 3 });
    expect(blueskyPostMatchesFacet(s, 'likes', '100-999')).toBe(true);
    expect(blueskyPostMatchesFacet(s, 'reposts', '0')).toBe(true);
    expect(blueskyPostMatchesFacet(s, 'replyCount', '1-9')).toBe(true);
  });

  it('matches thread position, quotes and link domain', () => {
    const s = status({ quote: { state: 'accepted', quoted_status: null } } as Partial<Status>, {
      externalUri: 'https://example.com/a',
    });
    expect(blueskyPostMatchesFacet(s, 'quote', 'yes')).toBe(true);
    expect(blueskyPostMatchesFacet(s, 'threadPosition', 'top')).toBe(true);
    expect(blueskyPostMatchesFacet(s, 'linkDomain', 'example.com')).toBe(true);
  });

  it('never matches an alt-text value for a text-only post', () => {
    const s = status();
    expect(blueskyPostMatchesFacet(s, 'altText', 'yes')).toBe(false);
    expect(blueskyPostMatchesFacet(s, 'altText', 'no')).toBe(false);
  });
});

describe('statusMeetsEngagement', () => {
  const s = status({ favourites_count: 10, reblogs_count: 4, replies_count: 2 });

  it('passes everything when no minimum is set', () => {
    expect(statusMeetsEngagement(s, {})).toBe(true);
  });

  it('applies each minimum inclusively', () => {
    expect(statusMeetsEngagement(s, { minLikes: 10 })).toBe(true);
    expect(statusMeetsEngagement(s, { minLikes: 11 })).toBe(false);
  });

  it('ANDs the minimums together', () => {
    expect(statusMeetsEngagement(s, { minLikes: 5, minReposts: 99 })).toBe(false);
    expect(statusMeetsEngagement(s, { minLikes: 5, minReposts: 4, minReplies: 1 })).toBe(true);
  });
});

describe('accountMeetsBounds', () => {
  const a = account({ followers_count: 500, following_count: 100, statuses_count: 2_000 });

  it('passes when no bound is set', () => {
    expect(accountMeetsBounds(a, {})).toBe(true);
  });

  it('applies open-ended and closed ranges', () => {
    expect(accountMeetsBounds(a, { followers: { min: 100 } })).toBe(true);
    expect(accountMeetsBounds(a, { followers: { max: 100 } })).toBe(false);
    expect(accountMeetsBounds(a, { posts: { min: 1_000, max: 3_000 } })).toBe(true);
  });

  it('ANDs the gates together', () => {
    expect(accountMeetsBounds(a, { followers: { min: 100 }, following: { max: 50 } })).toBe(false);
  });
});
