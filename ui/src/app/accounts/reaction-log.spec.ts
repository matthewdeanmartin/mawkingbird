import { describe, expect, it } from 'vitest';
import { Account, MastodonNotification, Status } from '../platform/api/models';
import { ReactionLogBuilder, computeDiscovery, topBoosters } from './reaction-log';

const T = Date.parse('2026-11-01T00:00:00Z');
const HOUR = 3_600_000;

function n(
  type: string,
  person: string,
  at: number,
  status: Partial<Status> | null = { id: 'p1' },
  account: Partial<Account> = {},
): MastodonNotification {
  return {
    id: `${type}-${person}-${at}`,
    type,
    created_at: new Date(at).toISOString(),
    account: {
      id: person,
      acct: `${person}@${person}.example`,
      followers_count: 10,
      ...account,
    } as Account,
    status: status ? ({ content: '', tags: [], ...status } as Status) : undefined,
  } as MastodonNotification;
}

function logOf(...notifications: MastodonNotification[]) {
  const builder = new ReactionLogBuilder('me');
  // Newest first, as the server sends them.
  [...notifications]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .forEach((x) => builder.add(x));
  return builder.build();
}

describe('ReactionLogBuilder', () => {
  it('keeps likes, boosts and replies to you, and the earliest follow', () => {
    const log = logOf(
      n('favourite', 'a', T, { id: 'p1', tags: [{ name: 'Art', url: '' }] }),
      n('reblog', 'b', T + 1),
      n('mention', 'c', T + 2, { id: 'r', in_reply_to_id: 'p1', in_reply_to_account_id: 'me' }),
      n('mention', 'd', T + 3, { id: 'r2', in_reply_to_id: 'x', in_reply_to_account_id: 'other' }),
      n('mention', 'e', T + 4, { id: 'r3', in_reply_to_id: null }),
      n('follow', 'a', T + 9, null),
      n('follow', 'a', T + 5, null),
      n('favourite', 'me', T + 6),
    );
    expect(log.reactions.map((r) => `${r.kind}:${r.personId}:${r.postId}`).sort()).toEqual([
      'boosts:b:p1',
      'likes:a:p1',
      'replies:c:p1',
    ]);
    expect(log.firstFollow.get('a')).toBe(T + 5);
  });

  it('keeps hashtags in lowercase, once each', () => {
    const tags = [
      { name: 'Art', url: '' },
      { name: 'art', url: '' },
    ];
    expect(logOf(n('favourite', 'a', T, { id: 'p1', tags })).posts.get('p1')?.tags).toEqual([
      'art',
    ]);
  });
});

describe('computeDiscovery', () => {
  it('counts people who do not follow, and reactions made before a follow', () => {
    const log = logOf(
      n('favourite', 'stranger', T),
      n('favourite', 'fan', T),
      n('favourite', 'convert', T),
      n('follow', 'convert', T + HOUR, null),
      n('favourite', 'convert', T + 2 * HOUR, { id: 'p2' }),
      n('reblog', 'mystery', T),
    );
    const d = computeDiscovery(
      log,
      new Map([
        ['stranger', false],
        ['fan', true],
        ['convert', true],
      ]),
    );
    expect(d.overall).toEqual({ reactions: 4, discovered: 2, pct: 50 });
    expect(d.newPeople).toBe(2);
    expect(d.followedAfter).toBe(1);
    expect(d.people).toBe(3);
    expect(d.unknownPeople).toBe(1);
    expect(d.byKind.boosts.pct).toBeNull();
  });

  it('ranks posts with 5 reactions, and hashtags with 2 posts, by new people', () => {
    const tags = [{ name: 'art', url: '' }];
    const once = [{ name: 'once', url: '' }];
    const big = ['a', 'b', 'c', 'd', 'e'].map((p, i) =>
      n('favourite', p, T + i, { id: 'p1', tags: [...tags, ...once] }),
    );
    const small = ['a', 'b'].map((p, i) => n('reblog', p, T + 10 + i, { id: 'p2', tags }));
    const follows = new Map(['a', 'b', 'c', 'd', 'e'].map((p) => [p, p === 'e']));
    const d = computeDiscovery(logOf(...big, ...small), follows);
    expect(d.posts.map((r) => [r.key, r.newPeople, r.pct])).toEqual([['p1', 4, 80]]);
    expect(d.tags.map((r) => [r.key, r.newPeople, r.reactions])).toEqual([['art', 4, 7]]);
  });

  it('has no rate with nothing known', () => {
    expect(computeDiscovery(logOf(n('favourite', 'a', T)), new Map()).overall.pct).toBeNull();
  });
});

describe('topBoosters', () => {
  it('ranks by audience or by different posts boosted', () => {
    const log = logOf(
      n('reblog', 'big', T, { id: 'p1' }, { followers_count: 9000 }),
      n('reblog', 'loyal', T + 1, { id: 'p1' }, { followers_count: 50 }),
      n('reblog', 'loyal', T + 2, { id: 'p2' }, { followers_count: 60 }),
      // Boosting the same post again is not a second post.
      n('reblog', 'loyal', T + 3, { id: 'p2' }, { followers_count: 60 }),
      n('favourite', 'liker', T + 4, { id: 'p1' }, { followers_count: 99_999 }),
    );
    expect(topBoosters(log, 'audience').map((b) => b.account.id)).toEqual(['big', 'loyal']);
    const [first] = topBoosters(log, 'posts');
    expect(first).toMatchObject({
      posts: 2,
      followers: 60,
      last: T + 3,
      host: 'loyal.example',
    });
  });
});
