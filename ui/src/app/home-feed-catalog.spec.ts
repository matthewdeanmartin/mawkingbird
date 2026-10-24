import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { firstValueFrom, of } from 'rxjs';
import { HomeFeedCatalog } from './home-feed-catalog';
import { HomeTopics } from './home-topics';
import { Api } from './api';
import { BlueskyFeeds } from './providers/bluesky/bluesky-feeds';
import { Status } from './models';

describe('Favorite Home feed catalogue', () => {
  it('offers actual followed tags and pages the selected tag without fetching Home', async () => {
    const posts = Array.from({ length: 20 }, (_, i) => ({ id: String(i) }) as Status);
    const api = { tagTimeline: vi.fn(() => of(posts)), homeTimeline: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: api },
        { provide: HomeTopics, useValue: { followed: async () => ['cats', 'scifi'] } },
      ],
    });
    const catalog = TestBed.inject(HomeFeedCatalog);
    const choices = await catalog.choices('tags');
    expect(choices.map((c) => c.label)).toEqual(['#cats', '#scifi']);
    const first = await firstValueFrom(catalog.page(choices[0], null));
    expect(first.cursor).toBe('19');
    await firstValueFrom(catalog.page(choices[0], first.cursor));
    expect(api.tagTimeline).toHaveBeenLastCalledWith('cats', '19');
    expect(api.homeTimeline).not.toHaveBeenCalled();
  });
  it('uses the pinned Bluesky entry kind and opaque cursor', async () => {
    const page = vi.fn(() => of({ statuses: [], cursor: 'opaque-cursor' }));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: BlueskyFeeds,
          useValue: {
            load: () =>
              of([
                {
                  uri: 'at://did:plc:cats/app.bsky.graph.list/1',
                  kind: 'list',
                  displayName: 'Cats',
                  pinned: true,
                },
              ]),
            page,
          },
        },
      ],
    });
    const catalog = TestBed.inject(HomeFeedCatalog);
    const choices = await catalog.choices('bsky-pinned');
    expect(choices).toHaveLength(1);
    const result = await firstValueFrom(catalog.page(choices[0], null));
    expect(page).toHaveBeenCalledWith(
      { kind: 'list', uri: 'at://did:plc:cats/app.bsky.graph.list/1' },
      null,
    );
    expect(result.cursor).toBe('opaque-cursor');
  });
});
