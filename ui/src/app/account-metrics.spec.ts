import { describe, expect, it } from 'vitest';
import { Status } from './models';
import {
  MIN_MONTHS_FOR_MONTHLY,
  MIN_WEEKS_FOR_WEEKLY,
  REACH_MODEL,
  computeLiveliness,
  estimatePostReach,
  estimateTotalReach,
  hasMonthlyRange,
  hasWeeklyRange,
  hourHistogram,
  monthlyActivity,
  postHeatmap,
  postLengthRange,
  postTextLength,
  repliesGiven,
  replyRatio,
  sampleSpanDays,
  topConversationPartners,
  topHashtags,
  topLinkDomains,
  weekdayHistogram,
  weeklyActivity,
} from './account-metrics';

const DAY_MS = 86_400_000;

/** Minimal Status with a given created_at and engagement counts. */
function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    id: Math.random().toString(36).slice(2),
    created_at: '2026-01-01T00:00:00Z',
    edited_at: null,
    content: '',
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account: { id: 'a', username: 'a', acct: 'a', display_name: 'A' } as never,
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

/** A post `daysAgo` before `now`, newest-first sample building. */
function postDaysAgo(daysAgo: number, now = Date.now(), overrides: Partial<Status> = {}): Status {
  return makeStatus({ created_at: new Date(now - daysAgo * DAY_MS).toISOString(), ...overrides });
}

describe('estimatePostReach', () => {
  it('reaches a baseline fraction of followers with no engagement', () => {
    const post = makeStatus();
    expect(estimatePostReach(post, 1000)).toBe(Math.round(1000 * REACH_MODEL.organicReachFraction));
  });

  it('adds boost audience on top of own audience', () => {
    const noBoost = estimatePostReach(makeStatus(), 1000);
    const withBoost = estimatePostReach(makeStatus({ reblogs_count: 4 }), 1000);
    expect(withBoost - noBoost).toBe(4 * REACH_MODEL.avgBoosterAudience);
  });

  it('caps own-audience reach at the full follower count', () => {
    // Enough favourites to blow past 100% of followers — still capped.
    const post = makeStatus({ favourites_count: 100_000 });
    expect(estimatePostReach(post, 500)).toBe(500);
  });

  it('uses the boost target for a reblogged status', () => {
    const inner = makeStatus({ reblogs_count: 2, favourites_count: 0 });
    const boost = makeStatus({ reblog: inner });
    expect(estimatePostReach(boost, 1000)).toBe(estimatePostReach(inner, 1000));
  });
});

describe('estimateTotalReach', () => {
  it('sums per-post reach', () => {
    const posts = [makeStatus({ reblogs_count: 1 }), makeStatus({ reblogs_count: 1 })];
    expect(estimateTotalReach(posts, 100)).toBe(
      estimatePostReach(posts[0], 100) + estimatePostReach(posts[1], 100),
    );
  });

  it('is zero for an empty sample', () => {
    expect(estimateTotalReach([], 1000)).toBe(0);
  });
});

describe('sampleSpanDays', () => {
  it('is zero for fewer than two posts', () => {
    expect(sampleSpanDays([])).toBe(0);
    expect(sampleSpanDays([makeStatus()])).toBe(0);
  });

  it('measures oldest-to-newest span of a newest-first sample', () => {
    const posts = [postDaysAgo(0), postDaysAgo(10)];
    expect(Math.round(sampleSpanDays(posts))).toBe(10);
  });
});

describe('computeLiveliness', () => {
  const now = new Date('2026-07-25T12:00:00Z');

  it('treats a busy-but-old account as dormant', () => {
    // 1000-post-equivalent burst, all in 2023, nothing since: the classic ghost.
    const posts = Array.from({ length: 100 }, (_, i) => postDaysAgo(900 + i, now.getTime()));
    const live = computeLiveliness(posts, now);
    expect(live.label).toBe('Dormant');
    expect(live.score).toBeLessThan(10);
    expect(live.postsLast30Days).toBe(0);
    expect(live.postsLast90Days).toBe(0);
  });

  it('scores a recently-active account high', () => {
    const posts = Array.from({ length: 30 }, (_, i) => postDaysAgo(i, now.getTime()));
    const live = computeLiveliness(posts, now);
    expect(live.label).toBe('Active');
    expect(live.postsLast30Days).toBe(30);
    expect(live.recentPostsPerDay).toBe(1);
  });

  it('flags a slowing account between the two', () => {
    // Last post ~3 weeks ago, a handful recently.
    const posts = [postDaysAgo(20, now.getTime()), postDaysAgo(35, now.getTime())];
    const live = computeLiveliness(posts, now);
    expect(live.label).toBe('Slowing');
  });

  it('handles an empty sample', () => {
    const live = computeLiveliness([], now);
    expect(live.daysSinceLastPost).toBe(Infinity);
    expect(live.score).toBe(0);
    expect(live.label).toBe('Dormant');
  });
});

describe('range gating', () => {
  const now = Date.now();

  it('suppresses weekly below the minimum span', () => {
    const posts = [postDaysAgo(0, now), postDaysAgo(MIN_WEEKS_FOR_WEEKLY * 7 - 5, now)];
    expect(hasWeeklyRange(posts)).toBe(false);
    expect(weeklyActivity(posts, 100)).toEqual([]);
  });

  it('enables weekly at the minimum span', () => {
    const posts = [postDaysAgo(0, now), postDaysAgo(MIN_WEEKS_FOR_WEEKLY * 7 + 2, now)];
    expect(hasWeeklyRange(posts)).toBe(true);
    expect(weeklyActivity(posts, 100).length).toBeGreaterThanOrEqual(MIN_WEEKS_FOR_WEEKLY);
  });

  it('suppresses monthly below the minimum span', () => {
    const posts = [postDaysAgo(0, now), postDaysAgo(MIN_MONTHS_FOR_MONTHLY * 30 - 10, now)];
    expect(hasMonthlyRange(posts)).toBe(false);
    expect(monthlyActivity(posts, 100)).toEqual([]);
  });

  it('enables monthly at the minimum span', () => {
    const posts = [postDaysAgo(0, now), postDaysAgo(MIN_MONTHS_FOR_MONTHLY * 30 + 5, now)];
    expect(hasMonthlyRange(posts)).toBe(true);
    expect(monthlyActivity(posts, 100).length).toBeGreaterThanOrEqual(2);
  });
});

describe('activity bucketing', () => {
  const now = Date.now();

  it('assigns every post to a weekly bucket and preserves total counts', () => {
    const posts = Array.from({ length: 40 }, (_, i) => postDaysAgo(i * 2, now));
    const buckets = weeklyActivity(posts, 100);
    const totalPosts = buckets.reduce((s, b) => s + b.posts, 0);
    expect(totalPosts).toBe(posts.length);
  });

  it('buckets monthly in chronological order', () => {
    const posts = Array.from({ length: 40 }, (_, i) => postDaysAgo(i * 6, now));
    const buckets = monthlyActivity(posts, 100);
    const starts = buckets.map((b) => new Date(b.startIso).getTime());
    const sorted = [...starts].sort((a, b) => a - b);
    expect(starts).toEqual(sorted);
    expect(buckets.reduce((s, b) => s + b.posts, 0)).toBe(posts.length);
  });
});

describe('histograms', () => {
  it('weekday histogram has 7 labelled buckets summing to the sample size', () => {
    const posts = Array.from({ length: 14 }, (_, i) => postDaysAgo(i));
    const hist = weekdayHistogram(posts);
    expect(hist).toHaveLength(7);
    expect(hist.reduce((s, b) => s + b.posts, 0)).toBe(14);
  });

  it('hour histogram has 24 buckets summing to the sample size', () => {
    const posts = Array.from({ length: 10 }, (_, i) => postDaysAgo(i));
    const hist = hourHistogram(posts);
    expect(hist).toHaveLength(24);
    expect(hist.reduce((s, b) => s + b.posts, 0)).toBe(10);
  });
});

/** A post made at local noon on the given local date, so no TZ edge cases. */
function postOn(year: number, month: number, day: number): Status {
  return makeStatus({ created_at: new Date(year, month - 1, day, 12, 0, 0).toISOString() });
}

describe('postHeatmap', () => {
  it('is empty for an empty sample', () => {
    expect(postHeatmap([])).toEqual({ weeks: [], months: [], peak: 0, days: 0, activeDays: 0 });
  });

  it('pads the range out to whole Sunday-to-Saturday weeks', () => {
    // 2026-03-11 is a Wednesday; a single post still yields one full week.
    const map = postHeatmap([postOn(2026, 3, 11)]);
    expect(map.weeks).toHaveLength(1);
    expect(map.weeks[0]).toHaveLength(7);
    expect(map.days).toBe(7);
    expect(new Date(map.weeks[0][0].dayIso).getDay()).toBe(0);
    expect(new Date(map.weeks[0][6].dayIso).getDay()).toBe(6);
  });

  it('covers only the span the sample spans, not a fixed year', () => {
    const map = postHeatmap([postOn(2026, 3, 11), postOn(2026, 3, 25)]);
    expect(map.weeks).toHaveLength(3);
    expect(map.activeDays).toBe(2);
  });

  it('counts posts per day and shades relative to the busiest one', () => {
    const map = postHeatmap([
      postOn(2026, 3, 11),
      postOn(2026, 3, 11),
      postOn(2026, 3, 11),
      postOn(2026, 3, 11),
      postOn(2026, 3, 13),
    ]);
    const days = map.weeks.flat();
    expect(map.peak).toBe(4);
    expect(days.find((d) => d.posts === 4)?.level).toBe(4);
    expect(days.find((d) => d.posts === 1)?.level).toBe(1);
    expect(days.filter((d) => d.posts === 0).every((d) => d.level === 0)).toBe(true);
  });

  it('never washes a day with activity down to level 0', () => {
    const many = Array.from({ length: 40 }, () => postOn(2026, 3, 11));
    const map = postHeatmap([...many, postOn(2026, 3, 13)]);
    expect(map.weeks.flat().find((d) => d.posts === 1)?.level).toBe(1);
  });

  it('labels months in column order', () => {
    const map = postHeatmap([postOn(2026, 2, 20), postOn(2026, 4, 10)]);
    expect(map.months.length).toBeGreaterThanOrEqual(3);
    expect(map.months[0].weekIndex).toBe(0);
    const indexes = map.months.map((m) => m.weekIndex);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });
});

describe('replyRatio and repliesGiven', () => {
  const reply = () => makeStatus({ in_reply_to_id: '1' });

  it('reports the share of the sample that is replies', () => {
    const posts = [reply(), reply(), makeStatus(), makeStatus()];

    expect(replyRatio(posts)).toBe(50);
    expect(repliesGiven(posts)).toBe(2);
  });

  it('reports 0 for an account that never replies to anyone', () => {
    // The case the metric exists for: a plausible-looking account that is
    // nobody's correspondent. Must be 0, never null.
    const posts = [makeStatus(), makeStatus(), makeStatus()];

    expect(replyRatio(posts)).toBe(0);
    expect(repliesGiven(posts)).toBe(0);
  });

  it('ignores boosts on both sides of the ratio', () => {
    // Passing along someone else's post is neither replying nor declining to.
    const boost = makeStatus({ reblog: makeStatus({ in_reply_to_id: '9' }) as never });
    const posts = [reply(), makeStatus(), boost, boost];

    expect(replyRatio(posts)).toBe(50);
    expect(repliesGiven(posts)).toBe(1);
  });

  it('has no ratio to report when the sample holds no original posts', () => {
    const boost = makeStatus({ reblog: makeStatus() as never });

    expect(replyRatio([])).toBeNull();
    expect(replyRatio([boost])).toBeNull();
  });
});

describe('postTextLength', () => {
  it('counts what is on screen, not the markup around it', () => {
    const post = makeStatus({ content: '<p>hello <a href="https://example.test/x">there</a></p>' });

    // "hello there" — the href does not count toward how much there is to read.
    expect(postTextLength(post)).toBe('hello there'.length);
  });

  it('counts the content warning, which a reader has to read first', () => {
    const post = makeStatus({ content: '<p>body</p>', spoiler_text: 'cw' });

    expect(postTextLength(post)).toBe('body'.length + 'cw'.length);
  });

  it('decodes entities so an escaped character counts once', () => {
    const post = makeStatus({ content: '<p>a &amp; b</p>' });

    expect(postTextLength(post)).toBe('a & b'.length);
  });
});

describe('postLengthRange', () => {
  it('reports the shortest and longest original post', () => {
    const posts = [
      makeStatus({ content: '<p>hi</p>' }),
      makeStatus({ content: `<p>${'x'.repeat(500)}</p>` }),
      makeStatus({ content: '<p>medium length</p>' }),
    ];

    expect(postLengthRange(posts)).toEqual({ shortest: 2, longest: 500 });
  });

  it('skips image-only posts rather than pinning the shortest at zero', () => {
    const posts = [makeStatus({ content: '' }), makeStatus({ content: '<p>words here</p>' })];

    expect(postLengthRange(posts)?.shortest).toBe('words here'.length);
  });

  it('measures this account, not the people it boosts', () => {
    const boost = makeStatus({
      reblog: makeStatus({ content: `<p>${'x'.repeat(900)}</p>` }) as never,
    });
    const posts = [makeStatus({ content: '<p>short</p>' }), boost];

    expect(postLengthRange(posts)).toEqual({ shortest: 5, longest: 5 });
  });

  it('has nothing to report when no post in the sample has text', () => {
    expect(postLengthRange([])).toBeNull();
    expect(postLengthRange([makeStatus({ content: '' })])).toBeNull();
  });
});

describe('topConversationPartners', () => {
  const mention = (id: string, acct: string) => ({ id, acct, username: acct, url: '' });

  it('ranks the accounts replied to most, naming them from mentions', () => {
    const posts = [
      makeStatus({ in_reply_to_account_id: 'b', mentions: [mention('b', 'bob')] }),
      makeStatus({ in_reply_to_account_id: 'b', mentions: [mention('b', 'bob')] }),
      makeStatus({ in_reply_to_account_id: 'c', mentions: [mention('c', 'cara')] }),
    ];
    const top = topConversationPartners(posts, 'me');
    expect(top).toHaveLength(2);
    expect(top[0]).toMatchObject({ key: 'b', label: '@bob', count: 2 });
    expect(top[1]).toMatchObject({ key: 'c', label: '@cara', count: 1 });
  });

  /** A thread is not a conversation — otherwise every long-form poster tops their own list. */
  it('ignores self-replies', () => {
    const posts = [
      makeStatus({ in_reply_to_account_id: 'me' }),
      makeStatus({ in_reply_to_account_id: 'me' }),
    ];
    expect(topConversationPartners(posts, 'me')).toEqual([]);
  });

  it('ignores non-replies and boosts', () => {
    const posts = [
      makeStatus({ in_reply_to_account_id: null }),
      makeStatus({ in_reply_to_account_id: 'b', reblog: makeStatus() }),
    ];
    expect(topConversationPartners(posts, 'me')).toEqual([]);
  });

  it('falls back to the id when no mention names the partner', () => {
    const posts = [makeStatus({ in_reply_to_account_id: 'ghost', mentions: [] })];
    expect(topConversationPartners(posts, 'me')[0]).toMatchObject({ key: 'ghost', label: 'ghost' });
  });

  it('prefers a handle seen on any post over a bare id', () => {
    const posts = [
      makeStatus({ in_reply_to_account_id: 'b', mentions: [] }),
      makeStatus({ in_reply_to_account_id: 'b', mentions: [mention('b', 'bob')] }),
    ];
    expect(topConversationPartners(posts, 'me')[0]).toMatchObject({ label: '@bob', count: 2 });
  });

  it('caps the list at the requested size', () => {
    const posts = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) =>
      makeStatus({ in_reply_to_account_id: id }),
    );
    expect(topConversationPartners(posts, 'me')).toHaveLength(5);
    expect(topConversationPartners(posts, 'me', 2)).toHaveLength(2);
  });
});

describe('topHashtags', () => {
  const tag = (name: string) => ({ name, url: `https://x/tags/${name}` });

  it('counts tags across posts, most-used first', () => {
    const posts = [
      makeStatus({ tags: [tag('rust'), tag('gamedev')] }),
      makeStatus({ tags: [tag('rust')] }),
    ];
    const top = topHashtags(posts);
    expect(top[0]).toMatchObject({ label: '#rust', count: 2 });
    expect(top[1]).toMatchObject({ label: '#gamedev', count: 1 });
  });

  /** One post about Rust is one post, however many times it says so. */
  it('counts a repeated tag once per post', () => {
    const posts = [makeStatus({ tags: [tag('rust'), tag('rust'), tag('Rust')] })];
    expect(topHashtags(posts)[0]).toMatchObject({ count: 1 });
  });

  it('groups case-insensitively but shows the first casing seen', () => {
    const posts = [makeStatus({ tags: [tag('Rust')] }), makeStatus({ tags: [tag('rust')] })];
    const top = topHashtags(posts);
    expect(top).toHaveLength(1);
    expect(top[0]).toMatchObject({ label: '#Rust', count: 2 });
  });

  it('is empty when the provider sends no tags', () => {
    expect(topHashtags([makeStatus({ tags: undefined })])).toEqual([]);
  });
});

describe('topLinkDomains', () => {
  const card = (url: string) => ({ url }) as NonNullable<Status['card']>;

  it('counts preview-card domains, most-linked first', () => {
    const posts = [
      makeStatus({ card: card('https://bbc.co.uk/news/1') }),
      makeStatus({ card: card('https://bbc.co.uk/news/2') }),
      makeStatus({ card: card('https://example.org/a') }),
    ];
    const top = topLinkDomains(posts);
    expect(top[0]).toMatchObject({ label: 'bbc.co.uk', count: 2 });
    expect(top[1]).toMatchObject({ label: 'example.org', count: 1 });
  });

  it('folds www. into the bare domain', () => {
    const posts = [
      makeStatus({ card: card('https://www.bbc.co.uk/a') }),
      makeStatus({ card: card('https://bbc.co.uk/b') }),
    ];
    expect(topLinkDomains(posts)).toEqual([{ key: 'bbc.co.uk', label: 'bbc.co.uk', count: 2 }]);
  });

  it('skips posts with no card and unparseable urls', () => {
    const posts = [makeStatus({ card: null }), makeStatus({ card: card('not a url') })];
    expect(topLinkDomains(posts)).toEqual([]);
  });
});
