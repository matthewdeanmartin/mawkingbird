import { describe, expect, it } from 'vitest';
import { Account, Mention, Status } from '../platform/api/models';
import { Evidence, batches, behaviorOf, judge, rank } from './new-people';

const NOW = Date.parse('2026-11-23T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ago: number) => new Date(NOW - ago).toISOString();

function account(extra: Partial<Account> = {}): Account {
  return {
    id: 'x',
    acct: 'x@far.example',
    username: 'x',
    display_name: 'X',
    followers_count: 100,
    following_count: 100,
    statuses_count: 500,
    created_at: iso(400 * DAY),
    last_status_at: iso(2 * DAY),
    bot: false,
    fields: [],
    ...extra,
  } as unknown as Account;
}

let seq = 0;
function post(ago: number, extra: Partial<Status> = {}): Status {
  seq++;
  return {
    id: `s${seq}`,
    created_at: iso(ago),
    content: `<p>Something different about topic ${'abcdefghij'[seq % 10].repeat(3 + (seq % 7))}</p>`,
    account: { id: 'x' },
    reblog: null,
    in_reply_to_id: null,
    in_reply_to_account_id: null,
    replies_count: 0,
    mentions: [],
    ...extra,
  } as unknown as Status;
}

const replyTo = (person: string, ago: number, extra: Partial<Status> = {}) =>
  post(ago, { in_reply_to_id: `p-${person}`, in_reply_to_account_id: person, ...extra });

/** Someone who talks: replies to four people at uneven daytime hours, and is answered. */
const talker = () => [
  replyTo('a', 1 * DAY + 2 * HOUR, { replies_count: 2 }),
  replyTo('b', 3 * DAY + 5 * HOUR),
  replyTo('c', 4 * DAY + 1.3 * HOUR),
  replyTo('d', 8 * DAY + 3.7 * HOUR),
  post(9 * DAY + 4.1 * HOUR),
  post(13 * DAY + 2.6 * HOUR),
];

function evidence(extra: Partial<Evidence> = {}): Evidence {
  return {
    account: account(),
    familiar: [],
    repliedToYou: false,
    repliedBeforeFollowing: false,
    followedAt: null,
    behavior: null,
    behaviorFrom: null,
    arrivedTogether: 0,
    remote: true,
    ...extra,
  };
}

const friends = [account({ id: 'f1', display_name: 'Ana' }), account({ id: 'f2' })];
const keys = (r: { reasons: { key: string }[] }) => r.reasons.map((x) => x.key);

describe('behaviorOf', () => {
  it('counts the people they talk with and the replies others gave them', () => {
    const thread = post(2 * DAY, { id: 'root', replies_count: 3 });
    const own = post(2 * DAY - HOUR, { in_reply_to_id: 'root', in_reply_to_account_id: 'x' });
    const b = behaviorOf(
      [replyTo('a', DAY), replyTo('a', 2 * DAY), replyTo('b', 60 * DAY), thread, own],
      NOW,
    );
    expect(b.repliedTo).toBe(2);
    expect(b.repliedToRecent).toBe(1);
    // Their own thread reply is not someone answering them.
    expect(b.repliesReceived).toBe(2);
  });

  it('recognises self replies when a remote read namespaces ids', () => {
    const b = behaviorOf(
      [
        post(DAY, {
          account: { id: 'anonymous-mastodon:far.example:7' } as Account,
          in_reply_to_id: 'r',
          in_reply_to_account_id: '7',
        }),
      ],
      NOW,
    );
    expect(b.repliedTo).toBe(0);
  });

  it('finds repeated text despite different links, names and numbers', () => {
    const spam = [1, 2, 3, 4].map((i) =>
      post(i * DAY, { content: `<p>Earn money today with this trick ${i} https://a.b/${i}</p>` }),
    );
    expect(behaviorOf(spam, NOW).repeatedPct).toBe(100);
    expect(behaviorOf(talker(), NOW).repeatedPct).toBe(0);
  });

  it('splits own posts from boosts, and judges links on own posts alone', () => {
    const boost = () => post(DAY, { reblog: { id: 'b' } as Status });
    const b = behaviorOf([...talker(), ...Array.from({ length: 14 }, boost)], NOW);
    expect(b.ownPct).toBe(30);
    expect(b.linkOnlyPct).toBe(0);
    const shown = judge(evidence({ behavior: b }), NOW).human.reasons;
    expect(shown).toContainEqual({ key: 'ownVsBoosts', params: { own: 30, boosts: 70 } });
  });

  it('does not warn a frequent booster who comments on the links they post', () => {
    const commented = Array.from({ length: 6 }, (_, i) =>
      post(i * DAY, {
        content: `<p>My long thoughts on why the piece number ${'abcdef'[i].repeat(6)} matters so much https://news.example/${i}</p>`,
      }),
    );
    const boosts = Array.from({ length: 30 }, () => post(DAY, { reblog: { id: 'b' } as Status }));
    const behavior = behaviorOf([...commented, ...boosts], NOW);
    expect(behavior.mainLink).toBe('news.example');
    expect(judge(evidence({ behavior }), NOW).spam.verdict).toBe('clear');
  });

  it('names a main link only when it is a habit', () => {
    const linky = Array.from({ length: 6 }, (_, i) =>
      post(i * DAY, { content: `<p>https://www.shop.example/${i}</p>` }),
    );
    expect(behaviorOf(linky, NOW).mainLink).toBe('shop.example');
    expect(behaviorOf(linky.slice(0, 2), NOW).mainLink).toBeNull();
  });

  it('counts naming people only outside replies', () => {
    const mention = (id: string) => [{ id } as Mention];
    const cold = ['1', '2', '3', '4', '5'].map((id, i) => post(i * DAY, { mentions: mention(id) }));
    expect(behaviorOf(cold, NOW).mentionsPeople).toBe(5);
    const answers = ['1', '2', '3', '4', '5'].map((id, i) =>
      replyTo(id, i * DAY, { mentions: mention(id) }),
    );
    expect(behaviorOf(answers, NOW).mentionsPeople).toBe(0);
  });

  it('judges a daily quiet stretch only with enough posts over enough days', () => {
    const daytime = Array.from({ length: 20 }, (_, i) =>
      post(i * 0.5 * DAY - (i % 3) * HOUR + 4 * HOUR),
    );
    const roundTheClock = Array.from({ length: 40 }, (_, i) => post(i * 7 * HOUR));
    expect(behaviorOf(daytime, NOW).quietStretch).toBe(true);
    expect(behaviorOf(roundTheClock, NOW).quietStretch).toBe(false);
    expect(behaviorOf(daytime.slice(0, 4), NOW).quietStretch).toBeNull();
  });
});

describe('human', () => {
  it('is vouched for only with two vouches and real conversation', () => {
    const behavior = behaviorOf(talker(), NOW);
    expect(judge(evidence({ familiar: friends, behavior }), NOW).human.verdict).toBe('vouched');
    expect(judge(evidence({ familiar: friends }), NOW).human.verdict).toBe('likely');
    // Behavior alone can be faked, so it stops at likely.
    expect(judge(evidence({ behavior }), NOW).human.verdict).toBe('likely');
  });

  it('gives no credit for what the account says about itself', () => {
    const dressed = account({
      note: 'Real human! Parent, gardener',
      followers_count: 90_000,
      avatar: 'nice.png',
    });
    expect(judge(evidence({ account: dressed }), NOW).human.verdict).toBe('unclear');
  });

  it('believes the bot flag when on and ignores it when off', () => {
    const on = evidence({ account: account({ bot: true }), familiar: friends });
    expect(judge(on, NOW).human.verdict).toBe('automated');
    expect(keys(judge(evidence(), NOW).human)).toEqual(['postsNotChecked']);
  });

  it('withholds confidence from a clockwork poster, however well followed', () => {
    const clock = Array.from({ length: 12 }, (_, i) => post(i * 6 * HOUR, { replies_count: 1 }));
    const e = evidence({ familiar: friends, behavior: behaviorOf(clock, NOW) });
    expect(judge(e, NOW).human.verdict).toBe('unclear');
    expect(keys(judge(e, NOW).human)).toContain('clockwork');
  });

  it('says when they talked to you before following', () => {
    const e = evidence({ repliedToYou: true, repliedBeforeFollowing: true });
    expect(judge(e, NOW).human.verdict).toBe('likely');
    expect(keys(judge(e, NOW).human)).toEqual(['repliedBefore']);
  });
});

describe('lively', () => {
  it('is talking, not volume', () => {
    expect(judge(evidence({ behavior: behaviorOf(talker(), NOW) }), NOW).lively.verdict).toBe(
      'talking',
    );
    const feed = Array.from({ length: 40 }, (_, i) => post(i * HOUR));
    expect(judge(evidence({ behavior: behaviorOf(feed, NOW) }), NOW).lively.verdict).toBe(
      'posting',
    );
  });

  it('does not call a remote account quiet because the server has no copies', () => {
    const e = evidence({
      account: account({ last_status_at: null }),
      behavior: behaviorOf([], NOW),
    });
    expect(judge(e, NOW).lively.verdict).toBe('unknown');
    const unchecked = evidence({ account: account({ last_status_at: null }) });
    expect(judge(unchecked, NOW).lively.verdict).toBe('unknown');
  });

  it('is quiet with no posts at all, and says when that is secondhand', () => {
    const none = evidence({ account: account({ last_status_at: null, statuses_count: 0 }) });
    expect(judge(none, NOW).lively.verdict).toBe('quiet');
    const old = judge(evidence({ account: account({ last_status_at: iso(90 * DAY) }) }), NOW);
    expect(keys(old.lively)).toEqual(['postedDays', 'asServerKnows']);
  });
});

describe('spam', () => {
  it('warns about mass following, the thing follow spam cannot hide', () => {
    const e = evidence({
      account: account({ following_count: 4000, created_at: iso(10 * DAY), followers_count: 30 }),
    });
    expect(judge(e, NOW).spam.verdict).toBe('warning');
    expect(keys(judge(e, NOW).spam)).toEqual(['followRate', 'lopsided']);
    // Someone who has talked to you is not just collecting follows.
    expect(keys(judge({ ...e, repliedToYou: true }, NOW).spam)).toEqual(['followRate']);
  });

  it('is unknown until posts are checked, then clear', () => {
    expect(judge(evidence(), NOW).spam.verdict).toBe('unknown');
    const e = evidence({ behavior: behaviorOf(talker(), NOW) });
    expect(judge(e, NOW).spam.verdict).toBe('clear');
  });

  it('warns about bare links to one site, unless it is their verified site', () => {
    const linky = Array.from({ length: 6 }, (_, i) =>
      post(i * DAY, { content: `<p>https://shop.example/${i}</p>` }),
    );
    const behavior = behaviorOf(linky, NOW);
    expect(keys(judge(evidence({ behavior }), NOW).spam)).toEqual(['sameLink']);
    const owner = account({
      fields: [
        { name: 'Site', value: '<a href="https://shop.example">x</a>', verified_at: iso(0) },
      ],
    });
    expect(judge(evidence({ behavior, account: owner }), NOW).spam.verdict).toBe('clear');
  });

  it('treats arriving together as a caution only, since migrations look the same', () => {
    expect(judge(evidence({ arrivedTogether: 5 }), NOW).spam.verdict).toBe('caution');
  });

  it('never warns about a lurker', () => {
    const lurker = account({ statuses_count: 0, last_status_at: null, following_count: 300 });
    expect(judge(evidence({ account: lurker }), NOW).spam.verdict).toBe('unknown');
  });
});

describe('batches and rank', () => {
  it('finds four young accounts from one server, and leaves older ones out', () => {
    const young = [1, 2, 3, 4].map((i) =>
      account({ id: `n${i}`, acct: `n${i}@new.example`, created_at: iso(i * 12 * HOUR) }),
    );
    const old = account({ id: 'old', acct: 'old@new.example' });
    const found = batches([...young, old], NOW);
    expect([...found.keys()].sort()).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(batches(young.slice(0, 3), NOW).size).toBe(0);
  });

  it('puts vouched people first and warnings last', () => {
    const spammer = evidence({
      account: account({ id: 'spam', following_count: 4000, created_at: iso(5 * DAY) }),
      familiar: friends,
    });
    const plain = evidence({ account: account({ id: 'plain' }) });
    const known = evidence({ account: account({ id: 'known' }), familiar: friends });
    expect(rank([spammer, plain, known], NOW).map((e) => e.account.id)).toEqual([
      'known',
      'plain',
      'spam',
    ]);
  });
});
