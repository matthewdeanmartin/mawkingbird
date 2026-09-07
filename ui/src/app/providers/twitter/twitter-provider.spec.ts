import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../../models';
import { TwitterApi } from './twitter-api';
import { TwitterCache } from './twitter-cache';
import { TwitterFollows } from './twitter-follows';
import { COLD_START_BUDGET, TwitterProvider } from './twitter-provider';

function status(id: string, username = 'NASA', at = '2026-07-31T00:00:00.000Z'): Status {
  return {
    provider: 'twitter',
    providerRef: { tweetId: id, authorId: '11348282' },
    id: `twitter:${id}`,
    created_at: at,
    account: { username, display_name: username, avatar: 'a.png' },
  } as unknown as Status;
}

const page = (statuses: Status[]) => ({ statuses, cursor: null, hasMore: false, skipped: 0 });

describe('TwitterProvider', () => {
  let getUserPosts: ReturnType<typeof vi.fn>;
  let stored: { handle: string; statuses: Status[]; fetchedAt: number }[];
  let batchAvailable: boolean;

  /** Build the provider with `stored` already on "disk". */
  function build(): TwitterProvider {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: TwitterApi, useValue: { getUserPosts, batchAvailable: () => batchAvailable } },
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
    return TestBed.inject(TwitterProvider);
  }

  function follow(names: string[]): void {
    const follows = TestBed.inject(TwitterFollows);
    for (const username of names) {
      follows.add({ username, displayName: username });
    }
  }

  beforeEach(() => {
    localStorage.clear();
    stored = [];
    batchAvailable = false;
    getUserPosts = vi.fn().mockReturnValue(of(page([status('1')])));
  });

  it('serves saved tweets without spending anything', async () => {
    // The core bargain: reading what you already paid for is free. Opening Home
    // must never bill, however many accounts are followed.
    stored = [
      { handle: 'nasa', statuses: [status('1')], fetchedAt: Date.now() },
      { handle: 'esa', statuses: [status('2', 'ESA')], fetchedAt: Date.now() },
    ];
    const provider = build();
    follow(['NASA', 'ESA']);

    const posts = await firstValueFrom(provider.fetchPage());
    expect(posts).toHaveLength(2);
    expect(getUserPosts).not.toHaveBeenCalled();
  });

  it('reports exhausted after one page, so the aggregator stops asking', async () => {
    // FeedAggregator.fetchForeignPage loops until a source yields 20 posts or
    // returns empty. That loop is free for RSS and billable here: left
    // unbounded it would be one request per followed account per scroll.
    stored = [{ handle: 'nasa', statuses: [status('1')], fetchedAt: Date.now() }];
    const provider = build();
    follow(['NASA']);

    await firstValueFrom(provider.fetchPage());
    await expect(firstValueFrom(provider.fetchPage())).resolves.toEqual([]);
    expect(getUserPosts).not.toHaveBeenCalled();
  });

  it('fetches at most the cold-start budget when nothing is saved', async () => {
    // Enough that a freshly connected Home is not mysteriously empty; not so
    // much that navigating to Home is a surprise bill.
    const provider = build();
    follow(['a', 'b', 'c', 'd', 'e', 'f']);

    await firstValueFrom(provider.fetchPage());
    expect(getUserPosts).toHaveBeenCalledTimes(COLD_START_BUDGET);
    expect(provider.unloaded()).toBe(6 - COLD_START_BUDGET);
  });

  it('never refetches an account that has something saved, however old', async () => {
    // A day-old tweet belongs in Home. Fetching a newer one is the reader's
    // decision, made on the connector page.
    stored = [
      { handle: 'nasa', statuses: [status('1')], fetchedAt: Date.now() - 48 * 60 * 60 * 1000 },
    ];
    const provider = build();
    follow(['NASA']);

    await firstValueFrom(provider.fetchPage());
    expect(getUserPosts).not.toHaveBeenCalled();
  });

  it('issues cold-start fetches one at a time', async () => {
    // Parallel requests through a free CORS proxy trip its per-origin limit,
    // and a throttled request fails having already been billed.
    let inFlight = 0;
    let peak = 0;
    getUserPosts.mockImplementation(
      () =>
        new Observable<ReturnType<typeof page>>((subscriber) => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          setTimeout(() => {
            inFlight--;
            subscriber.next(page([status('1')]));
            subscriber.complete();
          }, 5);
        }),
    );
    const provider = build();
    follow(['a', 'b', 'c']);
    await firstValueFrom(provider.fetchPage());
    expect(peak).toBe(1);
  });

  it('starts cold reads together when Mawkingbird can batch them', async () => {
    batchAvailable = true;
    let inFlight = 0;
    let peak = 0;
    getUserPosts.mockImplementation(
      () =>
        new Observable<ReturnType<typeof page>>((subscriber) => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          setTimeout(() => {
            inFlight--;
            subscriber.next(page([status('1')]));
            subscriber.complete();
          }, 5);
        }),
    );
    const provider = build();
    follow(['a', 'b', 'c']);
    await firstValueFrom(provider.fetchPage());
    expect(peak).toBe(COLD_START_BUDGET);
  });

  it('keeps the feed when one followed account fails', async () => {
    // The aggregator treats a thrown error as "this provider is finished",
    // which would drop every other account because one handle was deleted.
    stored = [{ handle: 'nasa', statuses: [status('1')], fetchedAt: Date.now() }];
    getUserPosts.mockReturnValue(throwError(() => new Error('User not found')));
    const provider = build();
    follow(['NASA', 'deleted']);

    const posts = await firstValueFrom(provider.fetchPage());
    expect(posts).toHaveLength(1);
    expect(provider.errors()[0]).toMatch(/@deleted/);
  });

  it('sorts the merged page newest first', async () => {
    stored = [
      { handle: 'old', statuses: [status('1', 'old', '2026-07-01T00:00:00.000Z')], fetchedAt: 1 },
      { handle: 'new', statuses: [status('2', 'new', '2026-07-31T00:00:00.000Z')], fetchedAt: 1 },
    ];
    const provider = build();
    follow(['old', 'new']);

    const posts = await firstValueFrom(provider.fetchPage());
    expect(posts.map((p) => p.id)).toEqual(['twitter:2', 'twitter:1']);
  });

  it('is not linked without follows, however good the key is', async () => {
    // An empty section looks broken; better to show no chip at all.
    const provider = build();
    expect(provider.linked()).toBe(false);
  });
});
