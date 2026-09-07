import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitterApi } from './twitter-api';
import { TwitterFollows } from './twitter-follows';
import { DEFAULT_INACTIVE_DAYS, parseHandles, toCandidate, TwitterImport } from './twitter-import';
import { TwitterApiError } from './twitter-errors';
import { FAST_DELAY_MS, TwitterPacer } from './twitter-pacer';
import { WireFollowing } from './twitterapi-io/wire-types';

/** A followings entry in the measured snake_case shape. */
function wire(overrides: Partial<WireFollowing> = {}): WireFollowing {
  return {
    id: '7005032',
    screen_name: 'simpsoka',
    name: 'Kath Korevec',
    statuses_count: 10996,
    protected: false,
    ...overrides,
  };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe('toCandidate', () => {
  it('reads the snake_case followings shape', () => {
    // Measured 2026-08-01: /twitter/user/followings returns snake_case
    // (`screen_name`, `statuses_count`) while /twitter/user/info returns
    // camelCase for the same concepts. A sixth envelope shape from one API.
    const candidate = toCandidate(wire());
    expect(candidate?.username).toBe('simpsoka');
    expect(candidate?.statusesCount).toBe(10996);
  });

  it('accepts userName too, since the API uses both spellings', () => {
    expect(toCandidate({ id: '1', userName: 'NASA' })?.username).toBe('NASA');
  });

  it('drops an entry with no id, which could never be checked or followed', () => {
    expect(toCandidate({ screen_name: 'ghost' })).toBeNull();
    expect(toCandidate({ id: '1' })).toBeNull();
  });
});

describe('TwitterImport', () => {
  let getFollowings: ReturnType<typeof vi.fn>;
  let getLastPostedAt: ReturnType<typeof vi.fn>;
  let importer: TwitterImport;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    getFollowings = vi.fn();
    getLastPostedAt = vi.fn();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: TwitterApi, useValue: { getFollowings, getLastPostedAt } }],
    });
    importer = TestBed.inject(TwitterImport);
  });

  afterEach(() => {
    // Fake timers are global. Leaving them installed makes the *next* spec file
    // hang on any real timeout — observed as a 30s failure in an unrelated
    // settings spec.
    vi.useRealTimers();
  });

  /** Run a promise to completion while fake timers drive the QPS delays. */
  async function run(work: Promise<void>): Promise<void> {
    await vi.runAllTimersAsync();
    await work;
  }

  it('stops after the requested number of accounts', async () => {
    getFollowings.mockReturnValue(
      of({
        users: Array.from({ length: 200 }, (_, i) => wire({ id: `${i}`, screen_name: `u${i}` })),
        cursor: 'next',
        hasMore: true,
      }),
    );
    await run(importer.list('mistersql', 25));
    expect(importer.candidates()).toHaveLength(25);
    // One page covered it, so only one request was spent.
    expect(getFollowings).toHaveBeenCalledTimes(1);
  });

  it('excludes never-posted and protected accounts for free', async () => {
    // Both are readable straight off the list, so they cost nothing to detect —
    // and removing them first means the expensive liveness pass has less to do.
    getFollowings.mockReturnValue(
      of({
        users: [
          wire({ id: '1', screen_name: 'alive' }),
          wire({ id: '2', screen_name: 'silent', statuses_count: 0 }),
          wire({ id: '3', screen_name: 'locked', protected: true }),
        ],
        cursor: null,
        hasMore: false,
      }),
    );
    await run(importer.list('mistersql', 100));

    expect(importer.keeping().map((c) => c.username)).toEqual(['alive']);
    expect(importer.excluded()).toHaveLength(2);
    expect(getLastPostedAt).not.toHaveBeenCalled();
  });

  it('excludes accounts silent longer than the cutoff', async () => {
    getFollowings.mockReturnValue(
      of({
        users: [
          wire({ id: '1', screen_name: 'active' }),
          wire({ id: '2', screen_name: 'dormant' }),
        ],
        cursor: null,
        hasMore: false,
      }),
    );
    await run(importer.list('mistersql', 100));

    getLastPostedAt.mockImplementation((id: string) => of(id === '1' ? daysAgo(10) : daysAgo(800)));
    await run(importer.checkLiveness(DEFAULT_INACTIVE_DAYS));

    expect(importer.keeping().map((c) => c.username)).toEqual(['active']);
    expect(importer.excluded()[0].excluded).toMatch(/No posts since/);
  });

  it('keeps an account whose check failed rather than dropping it', async () => {
    // Excluding someone because of a transient failure is the worse mistake:
    // the user can always untick them, but a silently dropped friend is
    // invisible.
    getFollowings.mockReturnValue(
      of({ users: [wire({ id: '1', screen_name: 'flaky' })], cursor: null, hasMore: false }),
    );
    await run(importer.list('mistersql', 10));
    getLastPostedAt.mockReturnValue(throwError(() => new Error('rate limited')));
    await run(importer.checkLiveness());

    expect(importer.keeping()).toHaveLength(1);
  });

  it('checks one account at a time rather than firing them together', async () => {
    // Sequential regardless of pace: parallel requests are what trip a limit,
    // and a refused request has already been billed.
    getFollowings.mockReturnValue(
      of({
        users: [wire({ id: '1', screen_name: 'a' }), wire({ id: '2', screen_name: 'b' })],
        cursor: null,
        hasMore: false,
      }),
    );
    await run(importer.list('mistersql', 10));
    getLastPostedAt.mockReturnValue(of(daysAgo(1)));

    const promise = importer.checkLiveness();
    await Promise.resolve();
    expect(getLastPostedAt).toHaveBeenCalledTimes(1);
    await run(promise);
    expect(getLastPostedAt).toHaveBeenCalledTimes(2);
  });

  it('slows down when the service says so, instead of assuming a fixed pace', async () => {
    // The pace used to be hardcoded to the free tier's five seconds. A paid
    // plan is far quicker, so it is discovered: fast until refused.
    const pacer = TestBed.inject(TwitterPacer);
    getFollowings.mockReturnValue(
      of({ users: [wire({ id: '1', screen_name: 'a' })], cursor: null, hasMore: false }),
    );
    await run(importer.list('mistersql', 10));
    expect(pacer.delayMs()).toBe(FAST_DELAY_MS);

    let call = 0;
    getLastPostedAt.mockImplementation(() => {
      call++;
      return call === 1
        ? throwError(() => new TwitterApiError('RATE_LIMITED', 'slow', 'twitterapi-io', 429))
        : of(daysAgo(1));
    });
    await run(importer.checkLiveness());

    expect(pacer.delayMs()).toBeGreaterThan(FAST_DELAY_MS);
    expect(importer.throttled()).toBe(true);
    // Retried rather than skipped: a refused request did no work, so moving on
    // would silently drop the account from the import.
    expect(importer.keeping()).toHaveLength(1);
    expect(importer.candidates()[0].lastPostedAt).toBeTruthy();
  });

  it('stops between accounts and keeps what was already decided', async () => {
    getFollowings.mockReturnValue(
      of({
        users: Array.from({ length: 5 }, (_, i) => wire({ id: `${i}`, screen_name: `u${i}` })),
        cursor: null,
        hasMore: false,
      }),
    );
    await run(importer.list('mistersql', 10));
    getLastPostedAt.mockReturnValue(of(daysAgo(1)));

    const promise = importer.checkLiveness();
    await vi.advanceTimersByTimeAsync(100);
    importer.stop();
    await run(promise);

    expect(importer.phase()).toBe('stopped');
    // Stopping leaves a shorter but correct result, not an empty one.
    expect(importer.candidates().filter((c) => c.checked).length).toBeGreaterThan(0);
    expect(getLastPostedAt).toHaveBeenCalledTimes(1);
  });

  it('follows only the kept accounts, and counts duplicates honestly', async () => {
    const follows = TestBed.inject(TwitterFollows);
    follows.add({ username: 'alive', displayName: 'alive' });

    getFollowings.mockReturnValue(
      of({
        users: [
          wire({ id: '1', screen_name: 'alive' }),
          wire({ id: '2', screen_name: 'fresh' }),
          wire({ id: '3', screen_name: 'silent', statuses_count: 0 }),
        ],
        cursor: null,
        hasMore: false,
      }),
    );
    await run(importer.list('mistersql', 10));

    const result = importer.apply();
    // `add` refuses duplicates by returning a message; counting those as
    // successes would claim an import that did not happen.
    expect(result).toEqual({ added: 1, already: 1, skipped: 1, capped: 0 });
    expect(follows.has('fresh')).toBe(true);
    expect(follows.has('silent')).toBe(false);
  });

  it('reports a failure instead of a half-built list', async () => {
    getFollowings.mockReturnValue(throwError(() => new Error('No such user')));
    await run(importer.list('nobody', 10));
    expect(importer.phase()).toBe('failed');
    expect(importer.error()).toMatch(/No such user/);
  });

  it('lets a candidate be put back by hand', async () => {
    getFollowings.mockReturnValue(
      of({
        users: [wire({ id: '1', screen_name: 'silent', statuses_count: 0 })],
        cursor: null,
        hasMore: false,
      }),
    );
    await run(importer.list('mistersql', 10));
    expect(importer.keeping()).toHaveLength(0);

    importer.toggle('1');
    expect(importer.keeping()).toHaveLength(1);
  });
});

describe('parseHandles', () => {
  it('accepts whatever separator the paste happened to use', () => {
    // The list comes from somewhere else - a note, a spreadsheet column, a
    // thread - so insisting on one separator would just make people edit it
    // before pasting.
    expect(parseHandles('@a, @b')).toEqual(['a', 'b']);
    expect(parseHandles(['a', 'b', 'c'].join('\n'))).toEqual(['a', 'b', 'c']);
    expect(parseHandles('a b;c,  d')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('takes the handle out of a pasted profile link', () => {
    // Copying a link is the most likely way someone collects these.
    expect(parseHandles('https://x.com/NASA')).toEqual(['NASA']);
    expect(parseHandles('https://twitter.com/NASA/status/123')).toEqual(['NASA']);
    expect(parseHandles('https://mobile.twitter.com/NASA?s=20')).toEqual(['NASA']);
  });

  it('drops duplicates case-insensitively, keeping the first spelling', () => {
    expect(parseHandles('@NASA nasa NASA')).toEqual(['NASA']);
  });

  it('ignores words that cannot be handles', () => {
    // A paste usually brings along display names and stray punctuation.
    // Twitter handles are 1-15 of [A-Za-z0-9_].
    // Parenthesised display names are dropped because of the brackets, which
    // is the common shape of a paste like "@NASA (National Aeronautics)".
    expect(parseHandles('@NASA (National Aeronautics) @ESA')).toEqual(['NASA', 'ESA']);
    // A bare word that *could* be a handle is kept — there is no way to tell
    // "Aeronautics" from a real handle, and following a wrong one is free and
    // one click to undo.
    expect(parseHandles('@NASA Aeronautics @ESA')).toEqual(['NASA', 'Aeronautics', 'ESA']);
    expect(parseHandles('waaaaaaytoolongforahandle')).toEqual([]);
    expect(parseHandles('bad-chars!')).toEqual([]);
  });

  it('returns nothing for empty or whitespace input', () => {
    expect(parseHandles('')).toEqual([]);
    expect(parseHandles([' ', '\t', ' '].join('\n'))).toEqual([]);
  });
});

describe('followPasted', () => {
  let importer: TwitterImport;
  let follows: TwitterFollows;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: TwitterApi, useValue: {} }],
    });
    importer = TestBed.inject(TwitterImport);
    follows = TestBed.inject(TwitterFollows);
  });

  it('follows everything valid without spending a request', () => {
    // A follow is a local subscription, so verifying spelling would make the
    // cheap path expensive to guard against a mistake the user can already see.
    const result = importer.followPasted(['@NASA', '@ESA'].join('\n'));
    expect(result.added).toBe(2);
    expect(follows.has('NASA')).toBe(true);
    expect(follows.has('ESA')).toBe(true);
  });

  it('does not blame a repeated handle on bad input', () => {
    // Comparing raw token count to parsed handle count counted a duplicate as
    // unusable, so one typo plus one repeat reported "2 ignored".
    const result = importer.followPasted('@NASA @NASA (nope!)');
    expect(result).toMatchObject({ added: 1, invalid: 1 });
  });

  it('counts duplicates and junk separately from successes', () => {
    follows.add({ username: 'NASA', displayName: 'NASA' });
    const result = importer.followPasted('@NASA, @ESA, (nope!)');
    expect(result).toMatchObject({ added: 1, already: 1, invalid: 1 });
  });
});
