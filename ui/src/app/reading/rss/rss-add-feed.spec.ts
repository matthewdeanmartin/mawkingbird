import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ParsedFeed } from './rss-parser';
import { RssFetch } from './rss-fetch';
import { RssAddFeed } from './rss-add-feed';
import { RssSubscriptions } from './rss-subscriptions';

function feed(title: string, itemCount = 3): ParsedFeed {
  return {
    title,
    link: null,
    items: Array.from({ length: itemCount }, (_, i) => ({
      guid: `${title}-${i}`,
      title: `${title} ${i}`,
      link: null,
      publishedAt: null,
      html: '<p>x</p>',
      isFullContent: true,
      enclosures: [],
      categories: [],
      author: null,
      commentsFeedUrl: null,
      commentCount: null,
    })),
  };
}

describe('RssAddFeed', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function setUp(fetchImpl: (url: string) => unknown) {
    TestBed.configureTestingModule({
      providers: [{ provide: RssFetch, useValue: { fetchFeed: vi.fn(fetchImpl) } }],
    });
    return TestBed.inject(RssAddFeed);
  }

  it('subscribes on a successful fetch and reports the title and item count', async () => {
    const service = setUp(() => of(feed('A News', 12)));
    const result = await firstValueFrom(service.add('https://a.example/feed', false));
    expect(result).toEqual({ title: 'A News', itemCount: 12 });
    expect(TestBed.inject(RssSubscriptions).has('https://a.example/feed')).toBe(true);
  });

  it('rejects without subscribing when already subscribed', async () => {
    const service = setUp(() => of(feed('A')));
    TestBed.inject(RssSubscriptions).add('https://a.example/feed', 'A');

    await expect(firstValueFrom(service.add('https://a.example/feed', false))).rejects.toThrow(
      /already subscribed/,
    );
  });

  it('propagates a fetch failure without subscribing', async () => {
    const service = setUp(() => throwError(() => new Error('CORS blocked')));
    await expect(firstValueFrom(service.add('https://a.example/feed', false))).rejects.toThrow(
      'CORS blocked',
    );
    expect(TestBed.inject(RssSubscriptions).has('https://a.example/feed')).toBe(false);
  });

  it('surfaces the limit error and does not subscribe past it', async () => {
    const service = setUp(() => of(feed('A')));
    const subs = TestBed.inject(RssSubscriptions);
    subs.setLimit(1);
    subs.add('https://existing.example/feed', 'Existing');

    await expect(firstValueFrom(service.add('https://a.example/feed', false))).rejects.toThrow(
      /limit/,
    );
    expect(subs.has('https://a.example/feed')).toBe(false);
  });
});
