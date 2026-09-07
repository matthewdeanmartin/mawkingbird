import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Status } from '../../models';
import { PasteFeedProvider } from './paste-feed-provider';
import { PasteFeedSubscriptions } from './paste-feed-subscriptions';

describe('PasteFeedProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('stays disconnected until the public feed is explicitly followed', () => {
    const provider = TestBed.inject(PasteFeedProvider);
    expect(provider.linked()).toBe(false);

    TestBed.inject(PasteFeedSubscriptions).follow(
      'pastepile',
      'https://pastepile.com/api/public/pastes',
      'Pastepile public pastes',
    );

    expect(provider.linked()).toBe(true);
  });

  it('loads followed recent pastes into shared statuses', () => {
    TestBed.inject(PasteFeedSubscriptions).follow(
      'pastepile',
      'https://pastepile.com/api/public/pastes',
      'Pastepile public pastes',
    );
    const provider = TestBed.inject(PasteFeedProvider);
    const http = TestBed.inject(HttpTestingController);
    let statuses: Status[] = [];

    provider.reset();
    provider.fetchPage().subscribe((page) => (statuses = page));
    http.expectOne('https://www.pastepile.com/api/public/pastes?limit=50').flush({
      items: [
        {
          slug: 'abc',
          title: 'Hello',
          language: 'plaintext',
          preview: 'world',
          created_at: '2026-07-24T01:00:00Z',
          url: 'https://pastepile.com/p/abc',
          raw_url: 'https://pastepile.com/raw/abc',
        },
      ],
    });

    expect(statuses).toHaveLength(1);
    expect(statuses[0].provider).toBe('paste');
    expect(statuses[0].url).toBe('https://pastepile.com/p/abc');
    http.verify();
  });
});
