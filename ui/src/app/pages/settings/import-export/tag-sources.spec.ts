import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../../../models';
import { BlueskyApi } from '../../../providers/bluesky/bluesky-api';
import { BlueskySession } from '../../../providers/bluesky/bluesky-session';
import { BskyFeedItem } from '../../../providers/bluesky/bluesky-types';
import {
  bskyPostTagNames,
  PRESELECTED,
  rankTags,
  statusTagNames,
  tallyTags,
  TagSources,
} from './tag-sources';

function bskyPost(text: string, tags: string[], reason = false): BskyFeedItem {
  return {
    post: {
      record: {
        text,
        facets: tags.map((tag) => ({
          index: { byteStart: 0, byteEnd: 0 },
          features: [{ $type: 'app.bsky.richtext.facet#tag', tag }],
        })),
      },
    },
    ...(reason ? { reason: { $type: 'app.bsky.feed.defs#reasonRepost' } } : {}),
  } as unknown as BskyFeedItem;
}

describe('tallyTags', () => {
  it('counts case-insensitively and drops what Mastodon cannot represent', () => {
    const counts = tallyTags(['#Cats', 'cats', 'not-a-tag', '2026', 'foss']);
    expect([...counts.entries()]).toEqual([
      ['cats', 2],
      ['foss', 1],
    ]);
  });
});

describe('rankTags', () => {
  it('drops single-use noise and pre-ticks the top rows', () => {
    const counts = new Map([
      ['cats', 5],
      ['baking', 3],
      ['onceonly', 1],
    ]);
    const ranked = rankTags(counts);

    expect(ranked.map((row) => row.tag)).toEqual(['cats', 'baking']);
    expect(ranked.every((row) => row.selected)).toBe(true);
  });

  it('keeps the raw list when nothing was used twice, rather than showing nothing', () => {
    const ranked = rankTags(new Map([['cats', 1]]));
    expect(ranked.map((row) => row.tag)).toEqual(['cats']);
  });

  it('pre-ticks only the first rows when the list is long', () => {
    const counts = new Map(
      Array.from({ length: PRESELECTED + 5 }, (_, i) => [`tag${i}`, 20 - i] as const),
    );
    const ranked = rankTags(counts);

    expect(ranked.filter((row) => row.selected)).toHaveLength(PRESELECTED);
  });
});

describe('statusTagNames', () => {
  it('prefers the tags field and falls back to hashtags in the body', () => {
    expect(statusTagNames({ tags: [{ name: 'cats', url: '' }], content: '' } as Status)).toEqual([
      'cats',
    ]);
    expect(statusTagNames({ content: '<p>a #baking post</p>' } as Status)).toEqual(['baking']);
  });
});

describe('bskyPostTagNames', () => {
  it('reads facets, falls back to text, and ignores reposts', () => {
    expect(bskyPostTagNames(bskyPost('hi', ['cats']))).toEqual(['cats']);
    expect(bskyPostTagNames(bskyPost('a #baking post', []))).toEqual(['baking']);
    // A repost is someone else's post; counting its tags would misread the account.
    expect(bskyPostTagNames(bskyPost('hi', ['cats'], true))).toEqual([]);
  });
});

describe('TagSources', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('ranks hashtags from favourites, following the Link cursor', async () => {
    const sources = TestBed.inject(TagSources);
    const loaded = sources.loadFromFavourites();

    httpMock
      .expectOne('/api/v1/favourites?limit=40')
      .flush(
        [
          { tags: [{ name: 'cats', url: '' }] },
          { tags: [{ name: 'cats', url: '' }] },
          { tags: [{ name: 'onceonly', url: '' }] },
        ],
        { headers: { Link: '<https://x/api/v1/favourites?max_id=7>; rel="next"' } },
      );
    await Promise.resolve();
    httpMock
      .expectOne('/api/v1/favourites?limit=40&max_id=7')
      .flush([{ tags: [{ name: 'baking', url: '' }] }, { tags: [{ name: 'baking', url: '' }] }]);
    await loaded;

    expect(sources.suggestions().map((row) => row.tag)).toEqual(['baking', 'cats']);
    expect(sources.sampled()).toBe(5);
    expect(sources.error()).toBeNull();
  });

  it('stops at the end of the list when the server sends no cursor', async () => {
    const sources = TestBed.inject(TagSources);
    const loaded = sources.loadFromFavourites();

    // The mock answers with the whole list and no Link header; that is the end,
    // not a failure.
    httpMock
      .expectOne('/api/v1/favourites?limit=40')
      .flush([{ tags: [{ name: 'cats', url: '' }] }]);
    await loaded;

    expect(sources.suggestions().map((row) => row.tag)).toEqual(['cats']);
    expect(sources.error()).toBeNull();
  });

  it('reports a failed read rather than showing an empty list as a result', async () => {
    const sources = TestBed.inject(TagSources);
    const loaded = sources.loadFromFavourites();

    httpMock
      .expectOne('/api/v1/favourites?limit=40')
      .flush('nope', { status: 500, statusText: 'Server Error' });
    await loaded;

    expect(sources.error()).toBe('Could not read your favourites.');
    expect(sources.loading()).toBe(false);
  });

  it('samples Bluesky posts and asks for a link when there is no session', async () => {
    const getAuthorFeed = vi
      .fn()
      .mockReturnValueOnce(of({ feed: [bskyPost('hi', ['cats']), bskyPost('yo', ['cats'])] }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BlueskyApi, useValue: { getAuthorFeed } },
        { provide: BlueskySession, useValue: { session: () => ({ did: 'did:plc:me' }) } },
      ],
    });
    const sources = TestBed.inject(TagSources);

    await sources.loadFromBluesky();

    expect(getAuthorFeed).toHaveBeenCalledWith('did:plc:me', null, 'posts_with_replies');
    expect(sources.suggestions().map((row) => row.tag)).toEqual(['cats']);
  });

  it('asks for a Bluesky link rather than failing when none is connected', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BlueskyApi, useValue: { getAuthorFeed: vi.fn() } },
        { provide: BlueskySession, useValue: { session: () => null } },
      ],
    });
    const sources = TestBed.inject(TagSources);

    await sources.loadFromBluesky();

    expect(sources.error()).toContain('Link a Bluesky account');
  });

  it('selectedTags() returns the ticked rows, and select-all flips every one', () => {
    const sources = TestBed.inject(TagSources);
    sources.loadCounts(
      new Map([
        ['cats', 3],
        ['baking', 2],
      ]),
      10,
    );

    sources.toggle('cats');
    expect(sources.selectedTags()).toEqual(['baking']);

    sources.setAllSelected(true);
    expect(sources.selectedTags()).toEqual(['cats', 'baking']);
  });
});
