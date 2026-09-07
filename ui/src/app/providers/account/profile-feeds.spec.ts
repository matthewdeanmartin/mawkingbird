import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileCollections } from './profile-collections';
import type { CollectionResult } from './profile-collections';
import { ProfileFeeds, feedId } from './profile-feeds';
import type { ProfileFeed } from './profile-feeds';

/**
 * The OPML subscription list as a provider collection.
 *
 * Same two properties as `ProfileLists`: a refused write must roll back rather
 * than leave invented state behind, and `loaded()` must stay false until the
 * fetch lands. What is specific here is the id scheme — a feed URL cannot be an
 * object id, and getting that mapping wrong silently merges two feeds.
 */

function feed(url: string, over: Partial<ProfileFeed> = {}): ProfileFeed {
  return { url, title: url, folders: [], ...over };
}

class FakeCollections {
  items: { id: string; value: ProfileFeed }[] = [];
  nextResult: CollectionResult<never> | null = null;
  batchCalls = 0;

  index = vi.fn(() => {
    if (this.nextResult) {
      return Promise.resolve(this.nextResult);
    }
    return Promise.resolve({
      kind: 'ok' as const,
      value: {
        index: {
          kind: 'mawkingbird-profile-index' as const,
          collection: 'feeds',
          revision: 1,
          updatedAt: '2026-08-18T00:00:00.000Z',
          items: this.items.map((item) => ({
            id: item.id,
            updatedAt: '2026-08-18T00:00:00.000Z',
            size: 100,
            inline: item.value,
          })),
        },
        etag: '"e1"',
      },
    });
  });

  put = vi.fn((_collection: string, id: string, value: ProfileFeed) => {
    if (this.nextResult) {
      return Promise.resolve(this.nextResult);
    }
    this.items = [...this.items.filter((item) => item.id !== id), { id, value }];
    return Promise.resolve({ kind: 'ok' as const, value: { revision: 1 } });
  });

  remove = vi.fn((_collection: string, id: string) => {
    if (this.nextResult) {
      return Promise.resolve(this.nextResult);
    }
    this.items = this.items.filter((item) => item.id !== id);
    return Promise.resolve({ kind: 'ok' as const, value: { revision: 1 } });
  });

  batch = vi.fn((_collection: string, operations: { id: string; value?: ProfileFeed }[]) => {
    this.batchCalls++;
    if (this.nextResult) {
      return Promise.resolve(this.nextResult);
    }
    for (const operation of operations) {
      if (operation.value) {
        this.items = [
          ...this.items.filter((item) => item.id !== operation.id),
          { id: operation.id, value: operation.value },
        ];
      }
    }
    return Promise.resolve({
      kind: 'ok' as const,
      value: { written: operations.length, deleted: 0, revision: 1 },
    });
  });
}

describe('feedId', () => {
  it('produces an id the service will accept', () => {
    // The service caps ids at 128 characters and refuses anything with a path
    // separator. A feed URL with a query string breaks both if encoded rather
    // than hashed.
    const long = `https://feedbin.example.com/feed.xml?token=${'a'.repeat(400)}`;
    for (const url of ['https://example.com/feed.xml', long]) {
      const id = feedId(url);
      expect(id, url).not.toBeNull();
      expect(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id ?? ''), url).toBe(true);
    }
  });

  it('is stable for the same URL and different for different ones', () => {
    expect(feedId('https://a.example/feed')).toBe(feedId('https://a.example/feed'));
    expect(feedId('https://a.example/feed')).not.toBe(feedId('https://b.example/feed'));
  });

  it('ignores surrounding whitespace', () => {
    // Otherwise a pasted URL and a typed one become two subscriptions.
    expect(feedId(' https://a.example/feed ')).toBe(feedId('https://a.example/feed'));
  });

  it('refuses an empty URL rather than inventing an id', () => {
    expect(feedId('   ')).toBeNull();
  });
});

describe('ProfileFeeds', () => {
  let feeds: ProfileFeeds;
  let collections: FakeCollections;

  beforeEach(() => {
    localStorage.clear();
    collections = new FakeCollections();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ProfileCollections, useValue: collections }],
    });
    feeds = TestBed.inject(ProfileFeeds);
  });

  it('is not loaded before the first fetch', () => {
    expect(feeds.loaded()).toBe(false);
    expect(feeds.feeds()).toEqual([]);
  });

  it('loads the stored subscription list', async () => {
    collections.items = [
      { id: feedId('https://a.example/feed') ?? '', value: feed('https://a.example/feed') },
    ];

    await feeds.load();

    expect(feeds.loaded()).toBe(true);
    expect(feeds.count()).toBe(1);
  });

  it('keeps the folders a feed sat under', async () => {
    // Carried even though today's UI flattens them, so enabling folders later is
    // a UI change rather than a data migration.
    collections.items = [
      {
        id: feedId('https://a.example/feed') ?? '',
        value: feed('https://a.example/feed', { folders: ['News', 'Local'] }),
      },
    ];

    await feeds.load();

    expect(feeds.feeds()[0].folders).toEqual(['News', 'Local']);
  });

  it('treats the URL as the identity, replacing rather than duplicating', async () => {
    await feeds.put(feed('https://a.example/feed', { title: 'Old' }));
    await feeds.put(feed('https://a.example/feed', { title: 'New' }));

    expect(feeds.count()).toBe(1);
    expect(feeds.feeds()[0].title).toBe('New');
  });

  it('rolls back a refused write', async () => {
    await feeds.put(feed('https://a.example/feed'));
    collections.nextResult = { kind: 'payment-required', message: 'Subscription lapsed.' };

    const ok = await feeds.put(feed('https://b.example/feed'));

    expect(ok).toBe(false);
    // The optimism is only safe because failure rolls back.
    expect(feeds.count()).toBe(1);
    expect(feeds.canWrite()).toBe(false);
    expect(feeds.error()).toBe('Subscription lapsed.');
  });

  it('rolls back a refused removal', async () => {
    await feeds.put(feed('https://a.example/feed'));
    collections.nextResult = { kind: 'failed', message: 'Offline.' };

    const ok = await feeds.remove('https://a.example/feed');

    expect(ok).toBe(false);
    expect(feeds.count()).toBe(1);
  });

  it('uploads a whole list in one write', async () => {
    // One batch, not N puts racing each other for the index.
    const ok = await feeds.replaceAll([
      feed('https://a.example/feed'),
      feed('https://b.example/feed'),
    ]);

    expect(ok).toBe(true);
    expect(collections.batchCalls).toBe(1);
    expect(feeds.count()).toBe(2);
  });

  it('treats an empty collection as loaded rather than failed', async () => {
    collections.nextResult = { kind: 'absent' };

    await feeds.load();

    expect(feeds.loaded()).toBe(true);
    expect(feeds.error()).toBeNull();
  });
});
