import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlueskyFeedEntry, BlueskyFeeds, savedFeeds } from './bluesky-feeds';
import { seedBskySession } from '../../testing/seed-storage';

const SERVICE = 'https://bsky.social';
const PREFS = `${SERVICE}/xrpc/app.bsky.actor.getPreferences`;
const GENERATORS = `${SERVICE}/xrpc/app.bsky.feed.getFeedGenerators`;
const GET_LIST = `${SERVICE}/xrpc/app.bsky.graph.getList`;
const FEED_URI = 'at://did:plc:z/app.bsky.feed.generator/whats-hot';
const LIST_URI = 'at://did:plc:z/app.bsky.graph.list/abc';
const CURATE = 'app.bsky.graph.defs#curatelist';

function generator(uri = FEED_URI, displayName = 'Discover') {
  return {
    uri,
    cid: 'c',
    did: 'did:web:feed',
    creator: { did: 'did:plc:z', handle: 'bsky.app' },
    displayName,
    description: 'the algo',
    indexedAt: '2026-08-01T00:00:00.000Z',
  };
}

describe('savedFeeds', () => {
  it('finds savedFeedsPrefV2 among the other preference types', () => {
    // Measured: a real account returned 7 preference types in one response.
    const items = savedFeeds([
      { $type: 'app.bsky.actor.defs#mutedWordsPref' },
      { $type: 'app.bsky.actor.defs#interestsPref' },
      {
        $type: 'app.bsky.actor.defs#savedFeedsPrefV2',
        items: [{ id: '1', type: 'feed', value: FEED_URI, pinned: true }],
      } as { $type: string },
      { $type: 'app.bsky.actor.defs#bskyAppStatePref' },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].value).toBe(FEED_URI);
  });

  it('drops the timeline sentinel — that is the home feed, already shown', () => {
    const items = savedFeeds([
      {
        $type: 'app.bsky.actor.defs#savedFeedsPrefV2',
        items: [
          { id: '0', type: 'timeline', value: 'following', pinned: true },
          { id: '1', type: 'feed', value: FEED_URI, pinned: true },
        ],
      } as { $type: string },
    ]);
    expect(items.map((i) => i.type)).toEqual(['feed']);
  });

  it('returns nothing when the preference is absent', () => {
    expect(savedFeeds([{ $type: 'app.bsky.actor.defs#interestsPref' }])).toEqual([]);
  });
});

describe('BlueskyFeeds', () => {
  let httpMock: HttpTestingController;
  let feeds: BlueskyFeeds;

  beforeEach(() => {
    localStorage.clear();
    seedBskySession({
      service: SERVICE,
      handle: 'me.bsky.social',
      did: 'did:plc:me',
      accessJwt: 'access-1',
      refreshJwt: 'refresh-1',
    });
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    feeds = TestBed.inject(BlueskyFeeds);
  });

  afterEach(() => httpMock.verify());

  function flushPrefs(items: unknown[]): void {
    httpMock.expectOne(PREFS).flush({
      preferences: [{ $type: 'app.bsky.actor.defs#savedFeedsPrefV2', items }],
    });
  }

  it('describes saved feeds in one batched call and keeps the pinned flag', () => {
    let entries: BlueskyFeedEntry[] = [];
    feeds.load().subscribe((e) => (entries = e));

    flushPrefs([{ id: '1', type: 'feed', value: FEED_URI, pinned: true }]);

    const describe = httpMock.expectOne((r) => r.url === GENERATORS);
    expect(describe.request.params.getAll('feeds')).toEqual([FEED_URI]);
    describe.flush({ feeds: [generator()] });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'feed',
      displayName: 'Discover',
      creatorHandle: 'bsky.app',
      pinned: true,
      memberCount: null,
    });
  });

  it('keeps curatelists and drops modlists', () => {
    let entries: BlueskyFeedEntry[] = [];
    feeds.load().subscribe((e) => (entries = e));

    flushPrefs([
      { id: '1', type: 'list', value: LIST_URI, pinned: false },
      { id: '2', type: 'list', value: 'at://did:plc:z/app.bsky.graph.list/block', pinned: false },
    ]);

    const calls = httpMock.match((r) => r.url === GET_LIST);
    expect(calls).toHaveLength(2);
    calls[0].flush({
      list: {
        uri: LIST_URI,
        cid: 'c',
        creator: { did: 'did:plc:z', handle: 'curator.bsky.social' },
        name: 'Good posters',
        purpose: CURATE,
        listItemCount: 12,
        indexedAt: '2026-08-01T00:00:00.000Z',
      },
    });
    // A modlist is a blocklist; rendering it as a readable feed would mislead.
    calls[1].flush({
      list: {
        uri: 'at://did:plc:z/app.bsky.graph.list/block',
        cid: 'c',
        creator: { did: 'did:plc:z', handle: 'curator.bsky.social' },
        name: 'Blocked',
        purpose: 'app.bsky.graph.defs#modlist',
        indexedAt: '2026-08-01T00:00:00.000Z',
      },
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'list',
      displayName: 'Good posters',
      memberCount: 12,
    });
  });

  it('makes no describe calls when nothing is saved', () => {
    let entries: BlueskyFeedEntry[] | null = null;
    feeds.load().subscribe((e) => (entries = e));
    flushPrefs([{ id: '0', type: 'timeline', value: 'following', pinned: true }]);
    httpMock.expectNone((r) => r.url === GENERATORS);
    httpMock.expectNone((r) => r.url === GET_LIST);
    expect(entries).toEqual([]);
  });

  it('survives a list that will not describe', () => {
    let entries: BlueskyFeedEntry[] = [];
    feeds.load().subscribe((e) => (entries = e));

    flushPrefs([
      { id: '1', type: 'feed', value: FEED_URI, pinned: false },
      { id: '2', type: 'list', value: LIST_URI, pinned: false },
    ]);
    httpMock.expectOne((r) => r.url === GENERATORS).flush({ feeds: [generator()] });
    httpMock
      .expectOne((r) => r.url === GET_LIST)
      .flush({ error: 'InvalidRequest' }, { status: 400, statusText: 'Bad Request' });

    // The feed still lands; one dead list does not sink the section.
    expect(entries.map((e) => e.kind)).toEqual(['feed']);
  });

  it('caches, so a second load makes no requests', () => {
    feeds.load().subscribe();
    flushPrefs([{ id: '1', type: 'feed', value: FEED_URI, pinned: false }]);
    httpMock.expectOne((r) => r.url === GENERATORS).flush({ feeds: [generator()] });

    let entries: BlueskyFeedEntry[] = [];
    feeds.load().subscribe((e) => (entries = e));
    expect(entries).toHaveLength(1);
    // httpMock.verify() in afterEach proves nothing else was requested.
  });

  it('pages a feed through getFeed and a list through getListFeed', () => {
    feeds.page({ uri: FEED_URI, kind: 'feed' }, null).subscribe();
    const feedReq = httpMock.expectOne((r) => r.url === `${SERVICE}/xrpc/app.bsky.feed.getFeed`);
    expect(feedReq.request.params.get('feed')).toBe(FEED_URI);
    feedReq.flush({ feed: [] });

    feeds.page({ uri: LIST_URI, kind: 'list' }, null).subscribe();
    const listReq = httpMock.expectOne(
      (r) => r.url === `${SERVICE}/xrpc/app.bsky.feed.getListFeed`,
    );
    expect(listReq.request.params.get('list')).toBe(LIST_URI);
    listReq.flush({ feed: [] });
  });

  it('ends paging when the cursor repeats', () => {
    let cursor: string | null = 'unset';
    feeds.page({ uri: FEED_URI, kind: 'feed' }, 'cur-9').subscribe((p) => (cursor = p.cursor));
    httpMock
      .expectOne((r) => r.url === `${SERVICE}/xrpc/app.bsky.feed.getFeed`)
      .flush({ feed: [], cursor: 'cur-9' });
    expect(cursor).toBeNull();
  });
});
