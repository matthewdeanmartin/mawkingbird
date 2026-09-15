import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { PasteFeedProvider } from './paste-feed-provider';
import { PasteFeedSubscriptions } from './paste-feed-subscriptions';
import { PasteProviderRegistry } from './paste-provider-registry';
import { RentryProvider } from './rentry-provider';

describe('PasteFeedProvider', () => {
  const recent = vi.fn(() =>
    of([
      {
        slug: 'abc',
        title: 'Hello',
        language: 'plaintext',
        preview: 'world',
        createdAt: '2026-07-24T01:00:00Z',
        url: 'https://paste.example/abc',
        rawUrl: 'https://paste.example/abc/raw',
      },
    ]),
  );

  beforeEach(() => {
    localStorage.clear();
    recent.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        {
          provide: PasteProviderRegistry,
          useFactory: () => {
            const adapter = TestBed.inject(RentryProvider);
            const feed = {
              id: 'example',
              label: 'Example',
              recent,
              status: adapter.status.bind(adapter),
            };
            return { feeds: [feed], feed: (id: string) => (id === feed.id ? feed : undefined) };
          },
        },
      ],
    });
  });

  it('stays disconnected until the public feed is explicitly followed', () => {
    const provider = TestBed.inject(PasteFeedProvider);
    expect(provider.linked()).toBe(false);
    TestBed.inject(PasteFeedSubscriptions).follow(
      'example',
      'https://paste.example/feed',
      'Example',
    );
    expect(provider.linked()).toBe(true);
  });

  it('loads followed recent pastes into shared statuses', () => {
    TestBed.inject(PasteFeedSubscriptions).follow(
      'example',
      'https://paste.example/feed',
      'Example',
    );
    const provider = TestBed.inject(PasteFeedProvider);
    provider.reset();
    provider.fetchPage().subscribe((statuses) => {
      expect(statuses).toHaveLength(1);
      expect(statuses[0].provider).toBe('paste');
      expect(statuses[0].url).toBe('https://paste.example/abc');
    });
    expect(recent).toHaveBeenCalledOnce();
  });

  it('ignores saved subscriptions whose connector is no longer installed', () => {
    TestBed.inject(PasteFeedSubscriptions).follow(
      'retired',
      'https://retired.example/feed',
      'Retired',
    );
    const provider = TestBed.inject(PasteFeedProvider);
    expect(provider.linked()).toBe(false);
    provider.fetchPage().subscribe((statuses) => expect(statuses).toEqual([]));
    expect(recent).not.toHaveBeenCalled();
  });
});
