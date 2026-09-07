import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../../models';
import { TwitterApi, TwitterPage } from './twitter-api';
import { CachedTimelineRecord, TwitterCache } from './twitter-cache';
import { TwitterFeed, TIMELINE_TTL_MS } from './twitter-feed';
import { TwitterFollow, TwitterFollows } from './twitter-follows';

const FOLLOW: TwitterFollow = {
  username: 'NASA',
  displayName: 'NASA',
  addedAt: 0,
  enabled: true,
};

function status(id: string, username = 'NASA'): Status {
  return {
    provider: 'twitter',
    providerRef: { tweetId: id, authorId: '11348282' },
    id: `twitter:${id}`,
    created_at: '2026-07-31T00:00:00.000Z',
    account: { username, display_name: username, avatar: 'a.png' },
  } as unknown as Status;
}

const page = (statuses: Status[]): TwitterPage => ({
  statuses,
  cursor: null,
  hasMore: false,
  skipped: 0,
});

describe('TwitterFeed', () => {
  let feed: TwitterFeed;
  let follows: TwitterFollows;
  let getUserPosts: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    getUserPosts = vi.fn().mockReturnValue(of(page([status('1')])));
    TestBed.configureTestingModule({
      providers: [{ provide: TwitterApi, useValue: { getUserPosts } }],
    });
    feed = TestBed.inject(TwitterFeed);
    follows = TestBed.inject(TwitterFollows);
  });

  describe('the cache exists to save money, not milliseconds', () => {
    it('serves a second read without a request', async () => {
      await firstValueFrom(feed.timeline(FOLLOW));
      await firstValueFrom(feed.timeline(FOLLOW));
      // Counting happens in the transport, which this spec stubs out — see
      // twitter-transport.spec.ts. What matters here is that the second read
      // never reached the API at all.
      expect(getUserPosts).toHaveBeenCalledTimes(1);
    });

    it('refetches once the entry is stale', async () => {
      vi.useFakeTimers();
      try {
        await firstValueFrom(feed.timeline(FOLLOW));
        vi.advanceTimersByTime(TIMELINE_TTL_MS + 1);
        await firstValueFrom(feed.timeline(FOLLOW));
        expect(getUserPosts).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('refetches when the user explicitly asks', async () => {
      await firstValueFrom(feed.timeline(FOLLOW));
      await firstValueFrom(feed.timeline(FOLLOW, true));
      expect(getUserPosts).toHaveBeenCalledTimes(2);
    });

    it('does not re-bill a handle that just failed', async () => {
      // Without this, an account that no longer exists costs a 404 on every
      // navigation to its page.
      getUserPosts.mockReturnValue(throwError(() => new Error('User not found')));
      await expect(firstValueFrom(feed.timeline(FOLLOW))).rejects.toThrow();
      // Second read is suppressed rather than billed again.
      await expect(firstValueFrom(feed.timeline(FOLLOW))).resolves.toEqual([]);
      expect(getUserPosts).toHaveBeenCalledTimes(1);
      expect(feed.lastError('NASA')).toMatch(/not found/i);
    });

    it('lets an explicit refresh retry a failed handle', async () => {
      getUserPosts.mockReturnValue(throwError(() => new Error('boom')));
      await expect(firstValueFrom(feed.timeline(FOLLOW))).rejects.toThrow();
      getUserPosts.mockReturnValue(of(page([status('1')])));
      await expect(firstValueFrom(feed.timeline(FOLLOW, true))).resolves.toHaveLength(1);
    });

    it('serves stale content rather than nothing when a refresh fails', async () => {
      await firstValueFrom(feed.timeline(FOLLOW));
      getUserPosts.mockReturnValue(throwError(() => new Error('offline')));
      vi.useFakeTimers();
      try {
        vi.advanceTimersByTime(TIMELINE_TTL_MS + 1);
        await expect(firstValueFrom(feed.timeline(FOLLOW))).rejects.toThrow();
        // The failure is recorded, so the *next* read serves what we still have
        // instead of billing again.
        await expect(firstValueFrom(feed.timeline(FOLLOW))).resolves.toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('cost estimates', () => {
    it('counts only what would actually go to the network', async () => {
      expect(feed.estimateCost(['a', 'b', 'c'])).toBe(3);
      await firstValueFrom(feed.timeline(FOLLOW));
      // NASA is cached now, so refreshing the set honestly costs one less.
      expect(feed.estimateCost(['NASA', 'other'])).toBe(1);
    });

    it('counts everything when forced', async () => {
      await firstValueFrom(feed.timeline(FOLLOW));
      expect(feed.estimateCost(['NASA', 'other'], true)).toBe(2);
    });
  });

  describe('profile details are banked from fetches that happen anyway', () => {
    it('records the numeric id off an authored post', async () => {
      follows.add({ username: 'NASA', displayName: 'NASA' });
      await firstValueFrom(feed.timeline(FOLLOW));
      expect(follows.find('NASA')?.userId).toBe('11348282');
    });

    it('does not take the id from someone else post', async () => {
      // The first post may be a retweet of another account; taking its author
      // id would make every later fetch ask for the wrong person's timeline.
      follows.add({ username: 'NASA', displayName: 'NASA' });
      getUserPosts.mockReturnValue(of(page([status('1', 'SomeoneElse')])));
      await firstValueFrom(feed.timeline(FOLLOW));
      expect(follows.find('NASA')?.userId).toBeUndefined();
    });
  });

  describe('refreshMany', () => {
    const many = (names: string[]): TwitterFollow[] =>
      names.map((username) => ({ username, displayName: username, addedAt: 0, enabled: true }));

    it('loads every account', async () => {
      const result = await firstValueFrom(feed.refreshMany(many(['a', 'b', 'c'])));
      expect(result.loaded).toBe(3);
      expect(result.failed).toEqual([]);
      expect(result.stopped).toBe(false);
    });

    it('issues requests one at a time, not in parallel', async () => {
      // Ten parallel requests through a free CORS proxy is the exact shape that
      // trips its per-origin limit — observed happening in development — and
      // the throttled ones fail *having already been billed*.
      let inFlight = 0;
      let peak = 0;
      getUserPosts.mockImplementation(
        () =>
          new Observable<TwitterPage>((subscriber) => {
            inFlight++;
            peak = Math.max(peak, inFlight);
            setTimeout(() => {
              inFlight--;
              subscriber.next(page([status('1')]));
              subscriber.complete();
            }, 5);
          }),
      );
      await firstValueFrom(feed.refreshMany(many(['a', 'b', 'c', 'd'])));
      expect(peak).toBe(1);
    });

    it('keeps going past one dead handle', async () => {
      // One broken account should not cost the reader the other nine.
      let call = 0;
      getUserPosts.mockImplementation(() => {
        call++;
        return call === 2 ? throwError(() => new Error('User not found')) : of(page([status('1')]));
      });
      const result = await firstValueFrom(feed.refreshMany(many(['a', 'b', 'c'])));
      expect(result.loaded).toBe(2);
      expect(result.failed).toEqual(['b']);
      expect(result.stopped).toBe(false);
    });

    it('stops the batch on a rate limit rather than paying for certain failures', async () => {
      let call = 0;
      getUserPosts.mockImplementation(() => {
        call++;
        return call === 2
          ? throwError(
              () => new Error('Rate-limited — either by CORS.SH or by the Twitter data service.'),
            )
          : of(page([status('1')]));
      });
      const result = await firstValueFrom(feed.refreshMany(many(['a', 'b', 'c', 'd'])));
      expect(result.stopped).toBe(true);
      // Two attempts made, not four.
      expect(call).toBe(2);
    });

    it('stops when the daily limit is hit mid-batch', async () => {
      getUserPosts.mockReturnValue(
        throwError(
          () => new Error('You have reached your daily limit of 200 Twitter data requests.'),
        ),
      );
      const result = await firstValueFrom(feed.refreshMany(many(['a', 'b', 'c'])));
      expect(result.stopped).toBe(true);
      expect(getUserPosts).toHaveBeenCalledTimes(1);
    });

    it('costs nothing for accounts already cached', async () => {
      await firstValueFrom(feed.timeline(FOLLOW));
      getUserPosts.mockClear();
      await firstValueFrom(feed.refreshMany([FOLLOW]));
      expect(getUserPosts).not.toHaveBeenCalled();
    });
  });

  it('evict forces the next read to refetch', async () => {
    await firstValueFrom(feed.timeline(FOLLOW));
    feed.evict('NASA');
    await firstValueFrom(feed.timeline(FOLLOW));
    expect(getUserPosts).toHaveBeenCalledTimes(2);
  });

  describe('persistence across reloads', () => {
    /** Rebuild the injector so a fresh TwitterFeed hydrates from `stored`. */
    async function reload(stored: CachedTimelineRecord[]): Promise<TwitterFeed> {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: TwitterApi, useValue: { getUserPosts } },
          {
            provide: TwitterCache,
            useValue: {
              load: () => Promise.resolve(stored),
              put: () => Promise.resolve(),
              evict: () => Promise.resolve(),
              clear: () => Promise.resolve(),
              entries: () => Promise.resolve(stored),
            },
          },
        ],
      });
      const fresh = TestBed.inject(TwitterFeed);
      await fresh.hydrated;
      return fresh;
    }

    it('serves restored posts without a request', async () => {
      // The whole point: a reload used to cost one request per followed
      // account, which at any real follow count is the largest avoidable spend
      // in the product.
      const fresh = await reload([
        { handle: 'nasa', statuses: [status('1')], fetchedAt: Date.now() - 60_000 },
      ]);
      getUserPosts.mockClear();
      await expect(firstValueFrom(fresh.timeline(FOLLOW))).resolves.toHaveLength(1);
      expect(getUserPosts).not.toHaveBeenCalled();
    });

    it('does not refetch a restored entry just because it is older than the TTL', async () => {
      // A naive age test would make every cold start bill a request per account
      // — the exact cost this persistence exists to remove. Restored entries are
      // shown and left alone until the reader asks for new posts.
      const fresh = await reload([
        { handle: 'nasa', statuses: [status('1')], fetchedAt: Date.now() - TIMELINE_TTL_MS * 10 },
      ]);
      getUserPosts.mockClear();
      await firstValueFrom(fresh.timeline(FOLLOW));
      expect(getUserPosts).not.toHaveBeenCalled();
    });

    it('says a restored copy is a saved one rather than passing it off as current', async () => {
      const fresh = await reload([
        { handle: 'nasa', statuses: [status('1')], fetchedAt: Date.now() - TIMELINE_TTL_MS * 10 },
      ]);
      expect(fresh.isStale('NASA')).toBe(true);
      // A fetch this session replaces it, and it stops being flagged.
      await firstValueFrom(fresh.timeline(FOLLOW, true));
      expect(fresh.isStale('NASA')).toBe(false);
    });

    it('lets an explicit refresh replace a restored entry', async () => {
      const fresh = await reload([
        { handle: 'nasa', statuses: [status('1')], fetchedAt: Date.now() },
      ]);
      getUserPosts.mockClear();
      await firstValueFrom(fresh.timeline(FOLLOW, true));
      expect(getUserPosts).toHaveBeenCalledTimes(1);
    });

    it('writes a successful fetch to the store', async () => {
      const put = vi.fn().mockResolvedValue(undefined);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: TwitterApi, useValue: { getUserPosts } },
          {
            provide: TwitterCache,
            useValue: {
              load: () => Promise.resolve([]),
              put,
              evict: () => Promise.resolve(),
              clear: () => Promise.resolve(),
              entries: () => Promise.resolve([]),
            },
          },
        ],
      });
      const fresh = TestBed.inject(TwitterFeed);
      await fresh.hydrated;
      await firstValueFrom(fresh.timeline(FOLLOW));
      expect(put).toHaveBeenCalledWith(
        expect.objectContaining({ handle: 'nasa', userId: '11348282' }),
      );
    });

    it('waits for the disk read before deciding to spend anything', async () => {
      // The cold page load is the exact navigation this feature exists to make
      // free. If the read raced hydration it would miss, bill a request, and
      // then have the saved copy land moments later — paying for it twice.
      const slowLoad = new Promise<CachedTimelineRecord[]>((resolve) =>
        setTimeout(
          () => resolve([{ handle: 'nasa', statuses: [status('7')], fetchedAt: Date.now() }]),
          5,
        ),
      );
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: TwitterApi, useValue: { getUserPosts } },
          {
            provide: TwitterCache,
            useValue: {
              load: () => slowLoad,
              put: () => Promise.resolve(),
              evict: () => Promise.resolve(),
              clear: () => Promise.resolve(),
              entries: () => Promise.resolve([]),
            },
          },
        ],
      });
      const fresh = TestBed.inject(TwitterFeed);
      getUserPosts.mockClear();
      // Subscribed immediately, before the store has answered.
      const statuses = await firstValueFrom(fresh.timeline(FOLLOW));
      expect(statuses[0].id).toBe('twitter:7');
      expect(getUserPosts).not.toHaveBeenCalled();
    });

    it('finds a restored post for the thread page', async () => {
      // A shared link opened in a new tab now resolves from disk instead of
      // paying for a lookup.
      const fresh = await reload([
        { handle: 'nasa', statuses: [status('42')], fetchedAt: Date.now() },
      ]);
      expect(fresh.findCached('twitter:42')?.id).toBe('twitter:42');
    });
  });
  describe('rotation picks the accounts most worth paying for', () => {
    const follow = (username: string): TwitterFollow => ({
      username,
      displayName: username,
      addedAt: 0,
      enabled: true,
    });

    /** A feed hydrated with known fetch times. */
    async function withCache(
      stored: { handle: string; statuses: Status[]; fetchedAt: number }[],
    ): Promise<TwitterFeed> {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: TwitterApi, useValue: { getUserPosts } },
          {
            provide: TwitterCache,
            useValue: {
              load: () => Promise.resolve(stored),
              put: () => Promise.resolve(),
              evict: () => Promise.resolve(),
              clear: () => Promise.resolve(),
              entries: () => Promise.resolve(stored),
            },
          },
        ],
      });
      const fresh = TestBed.inject(TwitterFeed);
      await fresh.hydrated;
      return fresh;
    }

    it('returns the stalest first', async () => {
      // The whole point of rotation: with 200 follows and a proxy allowing 60
      // requests a minute, refreshing everything is minutes of waiting, most of
      // it re-fetching accounts that were current a moment ago.
      const now = Date.now();
      const fresh = await withCache([
        { handle: 'recent', statuses: [], fetchedAt: now - 1000 },
        { handle: 'ancient', statuses: [], fetchedAt: now - 900_000 },
        { handle: 'middling', statuses: [], fetchedAt: now - 60_000 },
      ]);

      const picked = fresh.stalest([follow('recent'), follow('ancient'), follow('middling')], 2);
      expect(picked.map((f) => f.username)).toEqual(['ancient', 'middling']);
    });

    it('puts never-fetched accounts first', async () => {
      // An account with nothing cached contributes nothing to Home at all, so
      // it is the one case where a request definitely buys something new.
      const fresh = await withCache([
        { handle: 'known', statuses: [], fetchedAt: Date.now() - 500_000 },
      ]);
      const picked = fresh.stalest([follow('known'), follow('brandnew')], 1);
      expect(picked.map((f) => f.username)).toEqual(['brandnew']);
    });

    it('never returns more than asked for, or more than exist', async () => {
      const fresh = await withCache([]);
      expect(fresh.stalest([follow('a'), follow('b')], 5)).toHaveLength(2);
      expect(fresh.stalest([follow('a'), follow('b')], 0)).toHaveLength(0);
      expect(fresh.stalest([follow('a')], -3)).toHaveLength(0);
    });

    it('does not reorder the array it was given', async () => {
      const fresh = await withCache([
        { handle: 'b', statuses: [], fetchedAt: 1 },
        { handle: 'a', statuses: [], fetchedAt: 2 },
      ]);
      const input = [follow('a'), follow('b')];
      fresh.stalest(input, 2);
      expect(input.map((f) => f.username)).toEqual(['a', 'b']);
    });
  });
});
