import { describe, expect, it } from 'vitest';
import { Account, Status } from '../platform/api/models';
import {
  AUTOMATED_MIN_POSTS,
  automatedAuthors,
  diagnoseAutomated,
  diagnoseFeed,
  diagnoseFollowing,
  diagnoseTags,
  sampleSpanHours,
} from './feed-doctor';

/**
 * Explore's Feed tab (spec/sprint/explore-2026-11.md, Sprint 2): is Home built
 * from enough people and tags, and how much of it do machines write?
 */

const NOW = Date.parse('2026-11-26T12:00:00Z');
const HOUR = 3_600_000;

function account(id: string, extra: Partial<Account> = {}): Account {
  return { id, username: id, acct: `${id}@example.social`, fields: [], ...extra } as Account;
}

function post(id: string, author: Account, extra: Partial<Status> = {}): Status {
  return {
    id,
    account: author,
    content: '<p>hello</p>',
    created_at: new Date(NOW).toISOString(),
    favourites_count: 0,
    reblogs_count: 0,
    replies_count: 0,
    tags: [],
    media_attachments: [],
    mentions: [],
    ...extra,
  } as unknown as Status;
}

/** `n` posts by distinct people, spread evenly over `hours`. */
function spread(n: number, hours: number): Status[] {
  return Array.from({ length: n }, (_, i) =>
    post(`p${i}`, account(`person${i}`), {
      created_at: new Date(NOW - (i * hours * HOUR) / Math.max(1, n - 1)).toISOString(),
    }),
  );
}

const LINK = '<p>New article <a href="https://news.example/story">news.example/story</a></p>';

/** Posts by one author at irregular times, so no schedule shows. */
function byAuthor(author: Account, n: number, extra: (i: number) => Partial<Status> = () => ({})) {
  return Array.from({ length: n }, (_, i) =>
    post(`${author.id}-${i}`, author, {
      created_at: new Date(NOW - i * i * 7 * 60_000).toISOString(),
      ...extra(i),
    }),
  );
}

describe('sampleSpanHours', () => {
  it('measures newest to oldest, and says nothing for under two posts', () => {
    expect(sampleSpanHours(spread(10, 6))).toBeCloseTo(6);
    expect(sampleSpanHours(spread(1, 6))).toBeNull();
  });
});

describe('diagnoseFollowing', () => {
  it('stays calm about a well-fed Home, stating both facts', () => {
    const verdict = diagnoseFollowing(spread(140, 3), 240);
    expect(verdict.severity).toBe('ok');
    expect(verdict.headline).toContain('240 accounts');
    expect(verdict.headline).toContain('3 hours');
    expect(verdict.actions).toEqual([]);
  });

  it('warns about very few follows and points at kits and people', () => {
    const verdict = diagnoseFollowing(spread(140, 3), 20);
    expect(verdict.severity).toBe('warn');
    expect(verdict.actions.map((a) => a.kind)).toEqual(['find-kits', 'find-people']);
  });

  it('calls a slow Home thin even with plenty of follows', () => {
    const verdict = diagnoseFollowing(spread(140, 72), 300);
    expect(verdict.severity).toBe('warn');
    expect(verdict.headline).toBe('Your Home is thin.');
    expect(verdict.detail.join(' ')).toContain('3 days');
  });

  it('notices a sample that ran out of posts', () => {
    const verdict = diagnoseFollowing(spread(25, 1), 150);
    expect(verdict.severity).toBe('notice');
    expect(verdict.detail.join(' ')).toContain('Only 25 posts');
  });

  it('judges on the sample alone when the follow count is unknown', () => {
    expect(diagnoseFollowing(spread(140, 2), null).severity).toBe('ok');
    expect(diagnoseFollowing([], null).severity).toBe('warn');
  });
});

describe('diagnoseTags', () => {
  it('says nothing where hashtags cannot be followed', () => {
    expect(diagnoseTags(null)).toBeNull();
  });

  it('warns at none, notices a few, and is quiet at five', () => {
    expect(diagnoseTags(0)?.severity).toBe('warn');
    expect(diagnoseTags(0)?.actions.map((a) => a.kind)).toEqual(['find-tags']);
    expect(diagnoseTags(3)?.severity).toBe('notice');
    expect(diagnoseTags(5)).toMatchObject({ severity: 'ok', actions: [] });
  });
});

describe('automatedAuthors', () => {
  it('takes an account at its word when it says it is a bot', () => {
    const bot = account('weather', { bot: true });
    expect(automatedAuthors([post('w', bot)])).toMatchObject([
      { account: { id: 'weather' }, reasons: ['botFlag'] },
    ]);
  });

  it('spots a fixed schedule', () => {
    const clock = account('clock');
    const posts = Array.from({ length: 10 }, (_, i) =>
      post(`c${i}`, clock, { created_at: new Date(NOW - i * HOUR).toISOString() }),
    );
    expect(automatedAuthors(posts)[0].reasons).toContain('schedule');
  });

  it('spots an RSS relay: never replies, mostly links', () => {
    const relay = account('relay');
    const found = automatedAuthors(byAuthor(relay, 10, () => ({ content: LINK })));
    expect(found[0].reasons).toEqual(['neverReplies']);
  });

  it('counts a link card as a link', () => {
    const relay = account('relay');
    const card = { url: 'https://news.example/x' } as Status['card'];
    expect(automatedAuthors(byAuthor(relay, 10, () => ({ card })))[0].reasons).toEqual([
      'neverReplies',
    ]);
  });

  it('clears a link sharer who replies to someone once', () => {
    const person = account('person');
    const posts = byAuthor(person, 10, (i) => ({
      content: LINK,
      in_reply_to_account_id: i === 3 ? 'someone-else' : null,
    }));
    expect(automatedAuthors(posts)).toEqual([]);
  });

  it('does not count a self-reply thread as replying to others', () => {
    const relay = account('relay');
    const posts = byAuthor(relay, 10, (i) => ({
      content: LINK,
      in_reply_to_account_id: i % 2 ? 'relay' : null,
    }));
    expect(automatedAuthors(posts)[0].reasons).toEqual(['neverReplies']);
  });

  it('never judges replying on too few posts', () => {
    const relay = account('relay');
    const few = byAuthor(relay, AUTOMATED_MIN_POSTS - 1, () => ({ content: LINK }));
    expect(automatedAuthors(few)).toEqual([]);
  });

  it('counts a boosted post for the bot that wrote it, not the booster', () => {
    const bot = account('bot', { bot: true });
    const friend = account('friend');
    const boost = post('b', friend, { reblog: post('orig', bot) });
    expect(automatedAuthors([boost]).map((a) => a.account.id)).toEqual(['bot']);
  });
});

describe('diagnoseAutomated', () => {
  const relay = account('relay');
  const relayPosts = byAuthor(relay, 12, () => ({ content: LINK }));

  it('warns when machines write a large share, one account and one click per fix', () => {
    const verdict = diagnoseAutomated([...relayPosts, ...spread(20, 2)]);
    expect(verdict.severity).toBe('warn');
    expect(verdict.headline).toBe('Automated accounts wrote 38% of this sample.');
    expect(verdict.detail[0]).toContain('never replies, mostly links');
    expect(verdict.actions.map((a) => [a.kind, a.account?.id])).toEqual([
      ['mute', 'relay'],
      ['unfollow', 'relay'],
    ]);
    // Labels name the account, so several automated accounts never collide.
    expect(verdict.actions.map((a) => a.label)).toEqual([
      'Mute @relay@example.social for 8 hours',
      'Unfollow @relay@example.social',
    ]);
  });

  it('stays quiet about a stray bot in a busy feed', () => {
    const verdict = diagnoseAutomated([post('w', account('w', { bot: true })), ...spread(40, 2)]);
    expect(verdict).toMatchObject({ severity: 'ok', actions: [] });
  });

  it('says so when nothing stands out', () => {
    expect(diagnoseAutomated(spread(30, 2)).headline).toBe('No automated accounts stand out.');
  });
});

describe('diagnoseFeed with crafting facts', () => {
  it('adds the crafting checks and puts problems first', () => {
    const diagnosis = diagnoseFeed({
      posts: spread(140, 3),
      outcomes: [],
      bySource: { Follows: 140 },
      crafting: { following: 240, followedTags: 0 },
    });
    const ids = diagnosis.verdicts.map((v) => v.id);
    expect(ids).toEqual(expect.arrayContaining(['following', 'tags', 'automated']));
    expect(ids[0]).toBe('tags');
    expect(diagnosis.verdicts.at(-1)?.severity).toBe('ok');
  });

  it('leaves out the tags check where hashtags cannot be followed', () => {
    const diagnosis = diagnoseFeed({
      posts: spread(140, 3),
      outcomes: [],
      bySource: {},
      crafting: { following: 240, followedTags: null },
    });
    expect(diagnosis.verdicts.map((v) => v.id)).not.toContain('tags');
  });

  it('keeps the classic checks, in their order, without crafting facts', () => {
    const diagnosis = diagnoseFeed({ posts: spread(20, 1), outcomes: [], bySource: {} });
    expect(diagnosis.verdicts.map((v) => v.id)).toEqual(['flooding', 'mixing']);
  });
});
