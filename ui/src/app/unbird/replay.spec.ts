import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Api } from '../platform/api/api';
import {
  defuseMentions,
  mastodonLength,
  planTimes,
  replayText,
  replayUnits,
  SCHEDULE_LEAD_MS,
  stripLeadingMentions,
  suggest,
  unitFits,
} from './replay-plan';
import type { UnbirdArchive, UnbirdTweet } from './unbird-archive';
import { UnbirdMatcher } from './unbird-matcher';
import { UnbirdReplay } from './unbird-replay';
import { ReplayEntry, UnbirdStore } from './unbird-store';

function tweet(
  id: string,
  at: string,
  text: string,
  extra: Partial<UnbirdTweet> = {},
): UnbirdTweet {
  return { id, at, text, likes: 0, retweets: 0, media: 0, ...extra };
}

const tweets: UnbirdTweet[] = [
  tweet('6', '2021-01-01T12:05:00.000Z', '@owner and the end', { replyTo: '5', selfReply: true }),
  tweet('5', '2021-01-01T12:01:00.000Z', 'part two', { replyTo: '4', selfReply: true }),
  tweet('4', '2021-01-01T12:00:00.000Z', 'A thread starts', { likes: 2 }),
  tweet('3', '2020-01-01T00:00:00.000Z', '@friend sure', { replyTo: '99', replyToOther: true }),
  tweet('2', '2019-01-01T00:00:00.000Z', 'RT @x: theirs', { retweet: true }),
  tweet('1', '2018-01-01T00:00:00.000Z', 'Hello @bob and @bob@hachyderm.io, mail me@x.example', {
    likes: 9,
    media: 1,
  }),
];

function archive(): UnbirdArchive {
  return {
    version: 1,
    id: 'a1',
    readAt: 0,
    owner: { accountId: '1', userName: 'owner', displayName: null },
    generatedAt: null,
    profile: null,
    counts: {},
    files: { total: 7, opened: [] },
    hasContacts: false,
    followingCount: 0,
    followerCount: 0,
    people: [],
    tweets,
    likes: [],
    savedSearches: [],
  };
}

describe('replay plan', () => {
  it('groups own posts and their threads, leaving replies to others and retweets behind', () => {
    const units = replayUnits(archive());
    expect(units.map((unit) => [unit.id, unit.tweets.map((item) => item.id)])).toEqual([
      ['4', ['4', '5', '6']],
      ['1', ['1']],
    ]);
    expect(units[0].likes).toBe(2);
  });

  it('defuses every mention, including fediverse handles, and leaves emails alone', () => {
    expect(defuseMentions('Hello @bob and @bob@hachyderm.io, mail me@x.example')).toBe(
      'Hello bob and bob@hachyderm.io, mail me@x.example',
    );
    expect(stripLeadingMentions('@owner @owner and the end')).toBe('and the end');
  });

  it('adds the date line to the first post only, and strips a reply prefix from later parts', () => {
    const [thread] = replayUnits(archive());
    expect(replayText(thread.tweets[0], 0, { dateLine: true })).toMatch(
      /^A thread starts\n\n\(From Twitter, .*2021\)$/,
    );
    expect(replayText(thread.tweets[2], 2, { dateLine: true })).toBe('and the end');
  });

  it('counts links as 23 characters, as Mastodon does', () => {
    expect(mastodonLength(`hi https://example.com/${'x'.repeat(200)}`)).toBe(3 + 23);
    const long = { ...replayUnits(archive())[1] };
    long.tweets = [tweet('9', '2018-01-01T00:00:00.000Z', 'x'.repeat(490))];
    expect(unitFits(long, 500, false)).toBe(true);
    expect(unitFits(long, 500, true)).toBe(false);
  });

  it('suggests the most liked, threads, or by date', () => {
    const units = replayUnits(archive());
    expect(suggest(units, 'best').map((unit) => unit.id)).toEqual(['1', '4']);
    expect(suggest(units, 'threads').map((unit) => unit.id)).toEqual(['4']);
    expect(suggest(units, 'media').map((unit) => unit.id)).toEqual(['1']);
    expect(suggest(units, 'oldest').map((unit) => unit.id)).toEqual(['1', '4']);
  });

  it('spreads posts across the day window, never sooner than the lead time', () => {
    const units = replayUnits(archive());
    const now = new Date(2026, 10, 18, 20, 0);
    const times = planTimes([...units, ...units, ...units], {
      perDay: 2,
      start: new Date(2026, 10, 18),
      fromHour: 9,
      toHour: 21,
      now,
    });
    expect(times).toHaveLength(6);
    expect(times[0].getTime()).toBeGreaterThanOrEqual(now.getTime() + SCHEDULE_LEAD_MS);
    // Two a day: 12:00 and 18:00, starting the next day because today's slots passed.
    expect(times.map((time) => [time.getDate(), time.getHours()])).toEqual([
      [19, 12],
      [19, 18],
      [20, 12],
      [20, 18],
      [21, 12],
      [21, 18],
    ]);
  });
});

describe('UnbirdReplay', () => {
  function setup(post = vi.fn()) {
    const saved: ReplayEntry[] = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Api,
          useValue: { postStatus: post, cancelScheduledStatus: vi.fn(() => of(undefined)) },
        },
        {
          provide: UnbirdStore,
          useValue: {
            loadReplay: async () => [],
            saveReplay: async (_: string, rows: ReplayEntry[]) => saved.push(...rows),
            deleteReplay: async () => undefined,
            loadMatches: async () => [],
            saveArchive: async () => true,
            listArchives: async () => [],
          },
        },
      ],
    });
    const matcher = TestBed.inject(UnbirdMatcher);
    matcher.archive.set(archive());
    const replay = TestBed.inject(UnbirdReplay);
    return { replay, saved, post };
  }

  // Far enough ahead that "not yet due" holds whenever the suite runs.
  const later = new Date('2099-01-01T12:00:00.000Z');
  const options = { visibility: 'unlisted' as const, dateLine: false, media: false };

  it('hands a single post to the server scheduler with an idempotency key', async () => {
    const post = vi.fn(() => of({ id: 's1' }));
    const { replay } = setup(post);
    await replay.load('me@example.social');
    await replay.queue([replayUnits(archive())[1]], [later], options);
    expect(post).toHaveBeenCalledWith(
      'Hello bob and bob@hachyderm.io, mail me@x.example',
      { visibility: 'unlisted', scheduledAt: later.toISOString(), mediaIds: [] },
      'unbird-me@example.social-1',
    );
    expect(replay.counts()).toMatchObject({ scheduled: 1, planned: 0 });
  });

  it('keeps a thread for the app, then posts it in order, each part replying to the last', async () => {
    let next = 0;
    const post = vi.fn(() => of({ id: `p${++next}` }));
    const { replay } = setup(post);
    await replay.load('me@example.social');
    const [thread] = replayUnits(archive());
    await replay.queue([thread], [later], options);
    expect(post).not.toHaveBeenCalled();
    expect(replay.counts().planned).toBe(3);

    await replay.run(new Date(later.getTime() + 1000));
    expect(post.mock.calls.map((call) => (call as unknown[])[1])).toEqual([
      { visibility: 'unlisted', inReplyToId: undefined, mediaIds: [] },
      { visibility: 'unlisted', inReplyToId: 'p1', mediaIds: [] },
      { visibility: 'unlisted', inReplyToId: 'p2', mediaIds: [] },
    ]);
    expect(replay.counts().posted).toBe(3);
  });

  it('leaves the rest planned when the server says slow down, and never double-posts', async () => {
    const post = vi
      .fn()
      .mockReturnValueOnce(of({ id: 'p1' }))
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 429 })))
      .mockReturnValue(of({ id: 'p9' }));
    const { replay } = setup(post);
    await replay.load('me@example.social');
    const [thread] = replayUnits(archive());
    await replay.queue([thread], [later], options);
    const due = new Date(later.getTime() + 1000);
    await replay.run(due);
    expect(replay.counts()).toMatchObject({ posted: 1, planned: 2, failed: 0 });
    expect(replay.lastError()).toContain('slow down');

    await replay.run(due);
    expect(replay.counts()).toMatchObject({ posted: 3, planned: 0 });
    // The first part was not sent again; the second continued the thread.
    expect(post).toHaveBeenCalledTimes(4);
    expect((post.mock.calls[2] as unknown[])[1]).toMatchObject({ inReplyToId: 'p1' });
  });

  it('cancels what is not yet posted, withdrawing scheduled posts', async () => {
    const post = vi.fn(() => of({ id: 's1' }));
    const { replay } = setup(post);
    await replay.load('me@example.social');
    await replay.queue([replayUnits(archive())[1]], [later], options);
    await replay.cancelAll();
    expect(TestBed.inject(Api).cancelScheduledStatus).toHaveBeenCalledWith('s1');
    expect(replay.entries()).toEqual([]);
  });
});

describe('UnbirdStore without IndexedDB', () => {
  it('degrades to nothing stored, never throwing', async () => {
    const original = globalThis.indexedDB;
    // A private window or blocked storage.
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true });
    try {
      const store = new UnbirdStore();
      expect(await store.saveArchive(archive())).toBe(false);
      expect(await store.loadArchive()).toBeNull();
      expect(await store.listArchives()).toEqual([]);
      expect(await store.loadReplay('a1')).toEqual([]);
      await expect(store.forget('a1')).resolves.toBeUndefined();
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { value: original, configurable: true });
    }
  });
});
