import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CACHE_RETENTION_MS, TwitterCache } from './twitter-cache';

/**
 * These specs exercise the parts that hold without a working IndexedDB.
 *
 * The test environment has no IndexedDB implementation, which is not a gap in
 * coverage but the single most important case to get right: every method must
 * degrade to "no cache" rather than throwing, because real browsers do the same
 * thing in a Firefox private window or with site storage blocked. The
 * hydrate-and-serve behaviour is covered against a stubbed store in
 * twitter-feed.spec.ts, where the interesting decisions actually live.
 */
describe('TwitterCache', () => {
  let cache: TwitterCache;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    cache = TestBed.inject(TwitterCache);
  });

  it('reports no entries when storage is unavailable', async () => {
    await expect(cache.entries()).resolves.toEqual([]);
  });

  it('does not throw when a write cannot be persisted', async () => {
    // A quota error or a blocked database must not fail the fetch that produced
    // the posts — they are already in memory and about to be rendered.
    await expect(
      cache.put({ handle: 'nasa', statuses: [], fetchedAt: Date.now() }),
    ).resolves.toBeUndefined();
  });

  it('does not throw when evicting or clearing without storage', async () => {
    await expect(cache.evict('nasa')).resolves.toBeUndefined();
    await expect(cache.clear()).resolves.toBeUndefined();
  });

  it('loads nothing rather than failing when storage is unavailable', async () => {
    await expect(cache.load()).resolves.toEqual([]);
  });

  describe('retention', () => {
    it('drops entries past the retention window on load', async () => {
      const now = Date.now();
      const fresh = { handle: 'a', statuses: [], fetchedAt: now - 1000 };
      const ancient = { handle: 'b', statuses: [], fetchedAt: now - CACHE_RETENTION_MS - 1 };
      // Stand in for the store so the filtering rule can be tested without a
      // database; the IndexedDB plumbing is identical to RssCache's.
      const evicted: string[] = [];
      Object.assign(cache, {
        entries: () => Promise.resolve([fresh, ancient]),
        evict: (handle: string) => {
          evicted.push(handle);
          return Promise.resolve();
        },
      });

      const live = await cache.load(now);
      expect(live.map((record) => record.handle)).toEqual(['a']);
      // Expired entries are deleted as they are discovered, so a cache nobody
      // revisits does not grow without bound.
      expect(evicted).toEqual(['b']);
    });

    it('keeps an entry that is stale but still within retention', async () => {
      const now = Date.now();
      Object.assign(cache, {
        entries: () =>
          Promise.resolve([
            { handle: 'a', statuses: [], fetchedAt: now - CACHE_RETENTION_MS + 1000 },
          ]),
        evict: () => Promise.resolve(),
      });
      // Stale is not the same as worthless: a day-old post is worth
      // incomparably more than an empty page and a bill.
      await expect(cache.load(now)).resolves.toHaveLength(1);
    });
  });
});
