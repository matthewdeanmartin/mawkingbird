import { describe, expect, it } from 'vitest';
import { Status } from '../platform/api/models';
import { weeklyActivity } from './account-metrics';
import {
  REACH_MODEL,
  groupThreads,
  netReach,
  reachByPost,
  sampleReach,
  threadOf,
  threadReach,
} from './reach-model';

const AUTHOR = { id: 'me', username: 'me', acct: 'me', display_name: 'Me' } as never;

function post(id: string, overrides: Partial<Status> = {}): Status {
  return {
    id,
    created_at: '2026-11-01T00:00:00Z',
    edited_at: null,
    content: '',
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account: AUTHOR,
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    in_reply_to_account_id: null,
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

const selfReply = (id: string, parent: string, overrides: Partial<Status> = {}) =>
  post(id, { in_reply_to_id: parent, in_reply_to_account_id: 'me', ...overrides });

describe('groupThreads', () => {
  it('chains self-replies under their root and sums the counts', () => {
    // Newest first, as the API returns them.
    const sample = [
      selfReply('3', '2', { favourites_count: 1 }),
      selfReply('2', '1', { reblogs_count: 2 }),
      post('1', { favourites_count: 4, replies_count: 1, quotes_count: 1 }),
    ];
    const [thread] = groupThreads(sample);
    expect(groupThreads(sample)).toHaveLength(1);
    expect(thread.root.id).toBe('1');
    expect(thread.parts.map((p) => p.id)).toEqual(['1', '2', '3']);
    expect(thread).toMatchObject({ likes: 5, boosts: 2, replies: 1, quotes: 1 });
  });

  it('leaves out replies to other people and boosts', () => {
    const sample = [
      post('r', { in_reply_to_id: 'x', in_reply_to_account_id: 'someone', favourites_count: 9 }),
      post('b', { reblog: post('orig', { reblogs_count: 50 }) }),
      post('own'),
    ];
    expect(groupThreads(sample).map((t) => t.root.id)).toEqual(['own']);
  });

  it('starts a thread at a self-reply whose parent is outside the sample', () => {
    expect(groupThreads([selfReply('2', 'gone')]).map((t) => t.root.id)).toEqual(['2']);
  });

  it('returns threads newest first', () => {
    expect(groupThreads([post('new'), post('old')]).map((t) => t.root.id)).toEqual(['new', 'old']);
  });
});

describe('threadOf', () => {
  const someone = { id: 'them', username: 'them', acct: 'them' } as never;
  const at = (minute: number) => `2026-11-01T00:${String(minute).padStart(2, '0')}:00Z`;

  it("finds the author's chain above and below the post, ignoring other people", () => {
    const root = post('1', { created_at: at(1), reblogs_count: 1 });
    const middle = selfReply('2', '1', { created_at: at(2), favourites_count: 3 });
    const theirs = post('x', {
      created_at: at(3),
      account: someone,
      in_reply_to_id: '2',
      in_reply_to_account_id: 'me',
    });
    const last = selfReply('3', '2', { created_at: at(4) });
    const thread = threadOf(middle, { ancestors: [root], descendants: [theirs, last] });
    expect(thread.root.id).toBe('1');
    expect(thread.parts.map((p) => p.id)).toEqual(['1', '2', '3']);
    expect(thread).toMatchObject({ likes: 3, boosts: 1 });
  });

  it('treats a reply to someone else as a one-post thread', () => {
    const parent = post('p', { account: someone });
    const reply = post('r', {
      in_reply_to_id: 'p',
      in_reply_to_account_id: 'them',
      favourites_count: 2,
    });
    const thread = threadOf(reply, { ancestors: [parent], descendants: [] });
    expect(thread.parts.map((p) => p.id)).toEqual(['r']);
    expect(thread.likes).toBe(2);
  });
});

describe('netReach', () => {
  const none = { likes: 0, boosts: 0, replies: 0, quotes: 0 };

  it('is the base rate of the potential audience with no signals', () => {
    expect(netReach(10_000, none)).toBe(Math.round(10_000 * REACH_MODEL.baseRate));
  });

  it('grows with boosts and with interactions', () => {
    const base = netReach(10_000, none);
    expect(netReach(10_000, { ...none, boosts: 3 })).toBeGreaterThan(base);
    expect(netReach(10_000, { ...none, likes: 10 })).toBeGreaterThan(base);
  });

  it('never drops below the people who visibly reacted', () => {
    expect(netReach(20, { likes: 7, boosts: 2, replies: 0, quotes: 1 })).toBe(10);
  });

  it('never exceeds the potential audience', () => {
    expect(netReach(50, { likes: 500, boosts: 200, replies: 50, quotes: 0 })).toBe(50);
  });

  it('treats negative or missing counts as zero', () => {
    expect(netReach(-5, { likes: -1, boosts: -1, replies: -1, quotes: -1 })).toBe(0);
  });
});

describe('threadReach', () => {
  it('Quick reach values every boost at the typical booster audience', () => {
    const [thread] = groupThreads([post('1', { reblogs_count: 3 })]);
    const reach = threadReach(thread, 1000);
    expect(reach.potential).toBe(1000 + 3 * REACH_MODEL.typicalBoosterAudience);
    expect(reach.method).toBe('quick');
    expect(reach.attributedBoosts).toBe(0);
  });

  it('Full reach sums real boosters once across the thread', () => {
    const [thread] = groupThreads([
      selfReply('2', '1', { reblogs_count: 1 }),
      post('1', { reblogs_count: 2 }),
    ]);
    const boosters = {
      '1': [
        { id: 'a', followers_count: 100 },
        { id: 'b', followers_count: 50 },
      ],
      '2': [{ id: 'a', followers_count: 100 }],
    } as Record<string, { id: string; followers_count: number }[]>;
    const reach = threadReach(thread, 1000, (s) => boosters[s.id]);
    // a is counted once; the third boost is unattributed and uses the constant.
    expect(reach.potential).toBe(1000 + 150 + REACH_MODEL.typicalBoosterAudience);
    expect(reach.attributedBoosts).toBe(2);
    expect(reach.method).toBe('full');
  });

  it('is mixed when only some boosted parts were looked up', () => {
    const [thread] = groupThreads([
      selfReply('2', '1', { reblogs_count: 1 }),
      post('1', { reblogs_count: 1 }),
    ]);
    const reach = threadReach(thread, 10, (s) => (s.id === '1' ? [] : null));
    expect(reach.method).toBe('mixed');
  });

  it('needs no lookup for a thread nobody boosted', () => {
    const [thread] = groupThreads([post('1', { favourites_count: 2 })]);
    expect(threadReach(thread, 10).method).toBe('full');
  });
});

describe('sampleReach', () => {
  it('sums threads and reports per-thread reach', () => {
    const sample = [post('2', { reblogs_count: 1 }), post('1')];
    const reach = sampleReach(sample, 500);
    expect(reach.threads).toHaveLength(2);
    expect(reach.net).toBe(reach.threads[0].net + reach.threads[1].net);
    expect(reach.perThread).toBe(Math.round(reach.net / 2));
    expect(reach.method).toBe('quick');
  });

  it('is mixed when some boosted threads used real boosters', () => {
    const sample = [post('2', { reblogs_count: 1 }), post('1', { reblogs_count: 1 })];
    const reach = sampleReach(sample, 500, (s) =>
      s.id === '1' ? [{ id: 'x', followers_count: 1 }] : null,
    );
    expect(reach.method).toBe('mixed');
  });

  it('is zero for an empty sample', () => {
    expect(sampleReach([], 500)).toMatchObject({ net: 0, potential: 0, perThread: 0 });
  });

  it('credits reach to thread roots only, so time buckets do not double count', () => {
    const now = Date.now();
    const at = (days: number) => new Date(now - days * 86_400_000).toISOString();
    const sample = [
      selfReply('2', '1', { created_at: at(0) }),
      post('1', { created_at: at(80), reblogs_count: 1 }),
    ];
    const reach = sampleReach(sample, 500);
    const byPost = reachByPost(reach);
    const buckets = weeklyActivity(sample, (p) => byPost.get(p.id) ?? 0);
    expect(buckets.reduce((s, b) => s + b.reach, 0)).toBe(reach.net);
  });
});
