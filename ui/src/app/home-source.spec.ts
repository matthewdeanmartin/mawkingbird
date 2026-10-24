import { HomeTopics } from './home-topics';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, firstValueFrom } from 'rxjs';
import { HomeSource, matchesInterest } from './home-source';
import { HomeFeedCatalog } from './home-feed-catalog';
import { HomeAlgoSettings, HOME_FACTORY } from './home-algo-settings';
import { Api } from './api';
import { Status } from './models';

function post(id: string, content: string, tags: string[] = []): Status {
  return {
    id,
    url: `https://example.test/${id}`,
    content,
    tags: tags.map((name) => ({ name, url: '' })),
    reblog: null,
    spoiler_text: '',
    created_at: '2026-10-24T12:00:00Z',
  } as Status;
}
describe('Home sources', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [HomeSource] }));
  it('matches whole words and explicit hashtags case-insensitively, including retweet targets', () => {
    for (const word of ['scifi', 'SCIFI', '#SciFi'])
      expect(matchesInterest(post('1', `<p>${word}</p>`), ['SciFi'])).toBe(true);
    expect(matchesInterest(post('1', '<p>scifidelity</p>'), ['scifi'])).toBe(false);
    expect(matchesInterest(post('1', '<a href="https://scifi.test">cats</a>'), ['scifi'])).toBe(
      false,
    );
    expect(matchesInterest(post('1', '<p>cats</p>', ['SciFi']), ['scifi'])).toBe(true);
    expect(matchesInterest({ ...post('2', 'cats'), reblog: post('1', 'SCIFI') }, ['scifi'])).toBe(
      true,
    );
  });
  it('uses only the selected favorite and its cursor, without requesting Home', async () => {
    const favorite = { type: 'tags', id: 'cats', label: '#cats' };
    const page = vi
      .fn()
      .mockReturnValueOnce(of({ posts: [post('1', 'cats')], cursor: 'older' }))
      .mockReturnValueOnce(of({ posts: [], cursor: null }));
    TestBed.overrideProvider(HomeAlgoSettings, {
      useValue: { value: () => ({ ...HOME_FACTORY, mode: 'favorite', favorite }) },
    });
    TestBed.overrideProvider(HomeFeedCatalog, { useValue: { page } });
    const home = vi.fn(() => of([]));
    const source = TestBed.inject(HomeSource);
    expect((await firstValueFrom(source.page(home))).map((p) => p.id)).toEqual(['1']);
    await firstValueFrom(source.page(home));
    expect(page).toHaveBeenLastCalledWith(favorite, 'older');
    expect(source.hasMore()).toBe(false);
    expect(home).not.toHaveBeenCalled();
  });
  it('filters Home locally, adds tag posts and deduplicates without searching', async () => {
    const match = post('1', 'SCIFI');
    const stranger = post('2', 'space', ['scifi']);
    const api = { tagTimeline: vi.fn(() => of([stranger, match])), search: vi.fn() };
    TestBed.overrideProvider(Api, { useValue: api });
    TestBed.overrideProvider(HomeAlgoSettings, {
      useValue: { value: () => ({ ...HOME_FACTORY, mode: 'interests' }) },
    });
    TestBed.overrideProvider(HomeTopics, {
      useValue: { followed: async () => ['scifi'] },
    });
    const source = TestBed.inject(HomeSource);
    const result = await firstValueFrom(source.page(() => of([match, post('3', 'my cat')])));
    expect(result.map((p) => p.id).sort()).toEqual(['1', '2']);
    expect(api.search).not.toHaveBeenCalled();
    expect(source.hasMore()).toBe(false);
  });
});
