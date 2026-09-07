import { describe, expect, it } from 'vitest';
import { Account, MastodonNotification, Relationship, Status } from '../models';
import { categorizePeople, recordPeopleEvidence } from './people-categories';

const now = Date.parse('2026-09-07T00:00:00Z');
const account = (id: string, overrides: Partial<Account> = {}): Account =>
  ({
    id,
    bot: false,
    followers_count: 50,
    last_status_at: '2026-07-01',
    ...overrides,
  }) as Account;
const relationship = (id: string, followed_by = false): Relationship =>
  ({ id, following: true, followed_by }) as Relationship;

describe('Mimb people categories', () => {
  it('uses current mutuals, the strict celebrity threshold, and allows overlapping views', () => {
    const people = [
      account('mutual', { followers_count: 20_000 }),
      account('celebrity', { followers_count: 10_001 }),
      account('boundary', { followers_count: 10_000 }),
    ];
    const categories = categorizePeople(
      people,
      [relationship('mutual', true), relationship('celebrity'), relationship('boundary')],
      { mutual: { boosted: true, interaction: true } },
      now,
    );
    expect(categories.mutuals).toEqual(['mutual']);
    expect(categories.top_friends).toEqual(['mutual']);
    expect(categories.readers).toEqual(['mutual']);
    expect(categories.parasocials).toEqual(['celebrity']);
    expect(categories.other).toEqual(['boundary']);
    expect(
      categorizePeople(
        people,
        people.map((person) => relationship(person.id)),
        {},
        now,
      ).mutuals,
    ).toEqual([]);
  });

  it('matches Python reply ratios, without Lite’s mention shortcut or lifetime-post threshold', () => {
    const people = ['chatty', 'broadcaster', 'few', 'half', 'fifth'].map((id) => account(id));
    const posts = (replies: number, total: number) =>
      Object.fromEntries(Array.from({ length: total }, (_, i) => [`post${i}`, i < replies]));
    const categories = categorizePeople(
      people,
      people.map((person) => relationship(person.id)),
      {
        chatty: { posts: posts(3, 5) },
        broadcaster: { posts: posts(0, 5) },
        few: { posts: posts(4, 4), interaction: true },
        half: { posts: posts(3, 6) },
        fifth: { posts: posts(1, 5) },
      },
      now,
    );
    expect(categories.chatty).toEqual(['chatty']);
    expect(categories.broadcasters).toEqual(['broadcaster']);
  });

  it('distinguishes no posts from missing metadata and preserves the 30/90-day boundaries', () => {
    const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();
    const people = [
      account('lively', { last_status_at: ago(30) }),
      account('boundary', { last_status_at: ago(90) }),
      account('zombie', { last_status_at: ago(91) }),
      account('never', { last_status_at: null }),
      account('unknown', { last_status_at: undefined }),
      account('invalid', { last_status_at: 'invalid' }),
    ];
    const categories = categorizePeople(
      people,
      people.map((person) => relationship(person.id)),
      {},
      now,
    );
    expect(categories.lively).toEqual(['lively']);
    expect(categories.graveyard).toEqual(['zombie', 'never']);
    expect(categories.other).toEqual(['boundary', 'unknown', 'invalid']);
  });

  it('requires outbound replies and no inbound notifications for idols; never includes unfollowed readers', () => {
    const people = [account('idol'), account('responded'), account('unfollowed')];
    const categories = categorizePeople(
      people,
      [
        relationship('idol'),
        relationship('responded'),
        { ...relationship('unfollowed'), following: false },
      ],
      {
        idol: { repliedTo: true },
        responded: { repliedTo: true, inbound: true },
        unfollowed: { boosted: true },
      },
      now,
    );
    expect(categories.idols).toEqual(['idol']);
    expect(categories.readers).toEqual([]);
    expect(() => categorizePeople(people, [], {})).toThrow(/every relationship/);
  });

  it('retains bounded, deduplicated evidence only for current follows across refreshes', () => {
    const friend = account('friend');
    const notification = { id: 'n', type: 'reblog', account: friend } as MastodonNotification;
    const home = Array.from(
      { length: 120 },
      (_, i) =>
        ({ id: `post${i}`, account: friend, in_reply_to_id: i % 2 ? 'reply' : null }) as Status,
    );
    const own = [
      { id: 'own', account: account('me'), in_reply_to_account_id: 'friend' },
    ] as Status[];
    const first = recordPeopleEvidence(
      [friend],
      { stranger: { boosted: true } },
      [notification],
      own,
      home,
      'me',
    );
    const second = recordPeopleEvidence([friend], first, [], [], home, 'me');
    expect(second['friend'].boosted).toBe(true);
    expect(second['friend'].repliedTo).toBe(true);
    expect(second['stranger']).toBeUndefined();
    expect(Object.keys(second['friend'].posts!)).toHaveLength(100);
    expect(Object.keys(second['friend'].posts!)).toContain('post0');
    expect(first['friend'].posts).not.toBe(second['friend'].posts);
  });
});
