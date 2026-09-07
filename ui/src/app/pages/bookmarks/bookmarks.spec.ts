import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signal, WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../../models';
import {
  RaindropBookmark,
  RaindropCollection,
  RaindropSession,
} from '../../providers/raindrop/raindrop-session';
import { BookmarkGroup } from './bookmark-groups';
import { Bookmarks } from './bookmarks';
import { Auth } from '../../auth';
import { seedBskyIdentity } from '../../testing/seed-storage';

/** Exposes Bookmarks' protected signals for white-box testing. */
interface BookmarksInternals {
  statuses: WritableSignal<Status[]>;
  loading: WritableSignal<boolean>;
  exhausted: WritableSignal<boolean>;
  nativePage: WritableSignal<number>;
  provider: WritableSignal<'native' | 'raindrop'>;
  collections: WritableSignal<RaindropCollection[]>;
  raindropBookmarks: WritableSignal<RaindropBookmark[]>;
  raindropPage: WritableSignal<number>;
  filterDraft: WritableSignal<string>;
  nativeFilter: WritableSignal<string>;
  raindropFilter: WritableSignal<string>;
  filteredStatuses: Signal<Status[]>;
  view: WritableSignal<'all' | 'authors' | 'hashtags' | 'media'>;
  groups: Signal<BookmarkGroup[]>;
  nextPage(): void;
  previousPage(): void;
  firstPage(): void;
  selectProvider(provider: 'native' | 'raindrop'): void;
  selectRaindropCollection(id: number): void;
  applyFilter(event?: Event): void;
  clearFilter(): void;
  moveNativeToRaindrop(status: Status): Promise<void>;
  moveRaindropToNative(bookmark: RaindropBookmark): Promise<void>;
  onChanged(updated: Status): void;
  onDeleted(removed: Status): void;
}

function internals(fixture: ComponentFixture<Bookmarks>): BookmarksInternals {
  return fixture.componentInstance as unknown as BookmarksInternals;
}

function makeStatus(id: string): Status {
  return {
    id,
    created_at: '2026-01-01T00:00:00Z',
    edited_at: null,
    content: `<p>status ${id}</p>`,
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account: { id: '1', username: 'alan', acct: 'alan', display_name: 'Alan' } as Status['account'],
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: true,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    media_attachments: [],
  };
}

describe('Bookmarks', () => {
  let httpMock: HttpTestingController;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function setUp(): ComponentFixture<Bookmarks> {
    const fixture = TestBed.createComponent(Bookmarks);
    fixture.detectChanges();
    return fixture;
  }

  it('starts with loading=true and an empty statuses list', () => {
    const fixture = setUp();
    expect(internals(fixture).loading()).toBe(true);
    expect(internals(fixture).statuses()).toEqual([]);
    httpMock.expectOne('/api/v1/bookmarks?limit=20').flush([]);
  });

  it('populates statuses and clears loading on successful fetch', () => {
    const fixture = setUp();
    const s1 = makeStatus('1');
    const s2 = makeStatus('2');

    httpMock.expectOne('/api/v1/bookmarks?limit=20').flush([s1, s2]);

    expect(internals(fixture).loading()).toBe(false);
    expect(internals(fixture).statuses()).toEqual([s1, s2]);
  });

  it('loads Bluesky-primary bookmarks from the private Bluesky library', () => {
    seedBskyIdentity({ did: 'did:plc:me', handle: 'me.bsky.social' });
    expect(TestBed.inject(Auth).enterBluesky()).toBe(true);
    const fixture = setUp();
    const request = httpMock.expectOne((req) =>
      req.url.endsWith('/xrpc/app.bsky.bookmark.getBookmarks'),
    );
    expect(request.request.params.get('limit')).toBe('20');
    request.flush({
      bookmarks: [
        {
          subject: { uri: 'at://did:plc:alice/app.bsky.feed.post/1', cid: 'cid-1' },
          item: {
            uri: 'at://did:plc:alice/app.bsky.feed.post/1',
            cid: 'cid-1',
            author: { did: 'did:plc:alice', handle: 'alice.bsky.social' },
            record: {
              $type: 'app.bsky.feed.post',
              text: 'Saved on Bluesky',
              createdAt: '2026-01-01T00:00:00Z',
            },
            indexedAt: '2026-01-01T00:00:00Z',
          },
        },
      ],
    });

    expect(internals(fixture).statuses()).toHaveLength(1);
    expect(internals(fixture).statuses()[0].provider).toBe('bluesky');
    expect(internals(fixture).statuses()[0].bookmarked).toBe(true);
    httpMock.expectNone('/api/v1/bookmarks?limit=20');
  });

  it('clears loading on HTTP error', () => {
    const fixture = setUp();

    httpMock.expectOne('/api/v1/bookmarks?limit=20').error(new ProgressEvent('error'));

    expect(internals(fixture).loading()).toBe(false);
    expect(internals(fixture).statuses()).toEqual([]);
  });

  it('pages Native bookmarks 20 at a time and returns to a cached previous page', () => {
    const fixture = setUp();
    const first = Array.from({ length: 20 }, (_, index) => makeStatus(String(index + 1)));
    httpMock.expectOne('/api/v1/bookmarks?limit=20').flush(first);

    internals(fixture).nextPage();
    const next = httpMock.expectOne('/api/v1/bookmarks?max_id=20&limit=20');
    next.flush([makeStatus('21')]);
    expect(internals(fixture).nativePage()).toBe(1);
    expect(internals(fixture).exhausted()).toBe(true);

    internals(fixture).previousPage();
    expect(internals(fixture).nativePage()).toBe(0);
    expect(internals(fixture).statuses()).toEqual(first);
    httpMock.expectNone((request) => request.url === '/api/v1/bookmarks');
  });

  it('filters only the currently visible Native page without another API call', () => {
    const fixture = setUp();
    const alice = makeStatus('1');
    alice.account = { ...alice.account, acct: 'alice' };
    alice.content = '<p>Angular notes</p>';
    const bob = makeStatus('2');
    bob.account = { ...bob.account, acct: 'bob' };
    bob.content = '<p>Gardening notes</p>';
    httpMock.expectOne('/api/v1/bookmarks?limit=20').flush([alice, bob]);

    internals(fixture).filterDraft.set('  BOB  ');
    internals(fixture).applyFilter();

    expect(internals(fixture).nativeFilter()).toBe('BOB');
    expect(internals(fixture).filteredStatuses()).toEqual([bob]);
    httpMock.expectNone((request) => request.url === '/api/v1/bookmarks');

    internals(fixture).clearFilter();
    expect(internals(fixture).filteredStatuses()).toEqual([alice, bob]);
  });

  it('shows Raindrop and at most three real folders when the connector is configured', async () => {
    TestBed.inject(RaindropSession).connect('test-token');
    const folders = Array.from({ length: 4 }, (_, index) => ({
      _id: index + 1,
      title: `Folder ${index + 1}`,
      count: index,
    }));
    globalThis.fetch = vi.fn().mockImplementation((input: string) => {
      const items = input.includes('/collections') ? folders : [];
      return Promise.resolve(new Response(JSON.stringify({ result: true, items })));
    });

    const fixture = setUp();
    httpMock.expectOne('/api/v1/bookmarks?limit=20').flush([]);
    await vi.waitFor(() => expect(internals(fixture).collections()).toHaveLength(3));
    internals(fixture).provider.set('raindrop');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    const folderTabs = fixture.nativeElement.querySelectorAll('.folder-tabs .tab');
    expect(text).toContain('Native');
    expect(text).toContain('Raindrop');
    expect(folderTabs).toHaveLength(4);
    expect(folderTabs[3].textContent).toContain('Folder 3');
  });

  it('pages Raindrop inside the selected folder without a Last operation', async () => {
    TestBed.inject(RaindropSession).connect('test-token');
    const fetchMock = vi.fn().mockImplementation((input: string) => {
      const items = input.includes('/collections')
        ? [{ _id: 7, title: 'Reading', count: 21 }]
        : Array.from({ length: 20 }, (_, index) => raindropBookmark(index + 1));
      return Promise.resolve(new Response(JSON.stringify({ result: true, items })));
    });
    globalThis.fetch = fetchMock;
    const fixture = setUp();
    httpMock.expectOne('/api/v1/bookmarks?limit=20').flush([]);
    await vi.waitFor(() => expect(internals(fixture).collections()).toHaveLength(1));

    internals(fixture).selectProvider('raindrop');
    await vi.waitFor(() => expect(internals(fixture).raindropBookmarks()).toHaveLength(20));
    internals(fixture).selectRaindropCollection(7);
    await vi.waitFor(() => expect(internals(fixture).raindropBookmarks()).toHaveLength(20));
    internals(fixture).nextPage();
    await vi.waitFor(() => expect(internals(fixture).raindropPage()).toBe(1));
    internals(fixture).previousPage();
    await vi.waitFor(() => expect(internals(fixture).raindropPage()).toBe(0));

    expect(fetchMock.mock.calls.map((call) => call[0])).toContain(
      'https://api.raindrop.io/rest/v1/raindrops/7?page=1&perpage=20',
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Last');
  });

  it('sends the applied filter to Raindrop and resets paging to the first page', async () => {
    TestBed.inject(RaindropSession).connect('test-token');
    const fetchMock = vi.fn().mockImplementation((input: string) => {
      const items = input.includes('/collections') ? [] : [raindropBookmark(1)];
      return Promise.resolve(new Response(JSON.stringify({ result: true, items })));
    });
    globalThis.fetch = fetchMock;
    const fixture = setUp();
    httpMock.expectOne('/api/v1/bookmarks?limit=20').flush([]);

    internals(fixture).selectProvider('raindrop');
    await vi.waitFor(() => expect(internals(fixture).raindropBookmarks()).toHaveLength(1));
    internals(fixture).raindropPage.set(4);
    internals(fixture).filterDraft.set('  type:article important:true  ');
    internals(fixture).applyFilter();
    await vi.waitFor(() => expect(internals(fixture).raindropPage()).toBe(0));

    expect(internals(fixture).raindropFilter()).toBe('type:article important:true');
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(
      'https://api.raindrop.io/rest/v1/raindrops/0?page=0&perpage=20&search=type%3Aarticle+important%3Atrue',
    );
  });

  it('moves a Native bookmark only after Raindrop save and native unbookmark succeed', async () => {
    TestBed.inject(RaindropSession).connect('test-token');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ result: true, items: [] })));
    globalThis.fetch = fetchMock;
    const fixture = setUp();
    const status = makeStatus('42');
    status.url = 'https://social.example/@alan/42';
    httpMock.expectOne('/api/v1/bookmarks?limit=20').flush([status]);
    fixture.detectChanges();

    const conversion = fixture.nativeElement.querySelector('.conversion-row') as HTMLElement;
    expect(conversion.closest('app-status-card')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-status-card + .conversion-row')).toBeNull();

    const moving = internals(fixture).moveNativeToRaindrop(status);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    let unbookmark: TestRequest | undefined;
    await vi.waitFor(() => {
      unbookmark = httpMock.expectOne('/api/v1/statuses/42/unbookmark');
    });
    unbookmark!.flush({ ...status, bookmarked: false });
    await moving;

    expect(internals(fixture).statuses()).toEqual([]);
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.raindrop.io/rest/v1/raindrop');
  });

  it('resolves and moves a Raindrop post into Native bookmarks', async () => {
    TestBed.inject(RaindropSession).connect('test-token');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ result: true, items: [] })));
    globalThis.fetch = fetchMock;
    const fixture = setUp();
    httpMock.expectOne('/api/v1/bookmarks?limit=20').flush([]);
    const bookmark = raindropBookmark(9);
    internals(fixture).raindropBookmarks.set([bookmark]);

    const moving = internals(fixture).moveRaindropToNative(bookmark);
    const status = makeStatus('99');
    status.url = bookmark.link;
    status.bookmarked = false;
    httpMock
      .expectOne(
        (request) =>
          request.url === '/api/v2/search' &&
          request.params.get('q') === bookmark.link &&
          request.params.get('type') === 'statuses' &&
          request.params.get('resolve') === 'true' &&
          request.params.get('limit') === '5',
      )
      .flush({ accounts: [], statuses: [status], hashtags: [] });
    let create: TestRequest | undefined;
    await vi.waitFor(() => {
      create = httpMock.expectOne('/api/v1/statuses/99/bookmark');
    });
    create!.flush({ ...status, bookmarked: true });
    await moving;

    expect(internals(fixture).raindropBookmarks()).toEqual([]);
    expect(internals(fixture).statuses()[0].id).toBe('99');
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('https://api.raindrop.io/rest/v1/raindrop/9');
  });

  it('onChanged replaces the status with the matching id', () => {
    const fixture = setUp();
    const s1 = makeStatus('1');
    const s2 = makeStatus('2');
    httpMock.expectOne('/api/v1/bookmarks?limit=20').flush([s1, s2]);

    const updated = { ...s2, content: '<p>updated</p>' };
    internals(fixture).onChanged(updated);

    expect(internals(fixture).statuses()).toEqual([s1, updated]);
  });

  it('onDeleted removes the matching status by id', () => {
    const fixture = setUp();
    const s1 = makeStatus('1');
    const s2 = makeStatus('2');
    httpMock.expectOne('/api/v1/bookmarks?limit=20').flush([s1, s2]);

    internals(fixture).onDeleted(s1);

    expect(internals(fixture).statuses()).toEqual([s2]);
  });

  it('onChanged does not affect other statuses', () => {
    const fixture = setUp();
    const s1 = makeStatus('1');
    const s2 = makeStatus('2');
    const s3 = makeStatus('3');
    httpMock.expectOne('/api/v1/bookmarks?limit=20').flush([s1, s2, s3]);

    const updated = { ...s2, content: '<p>changed</p>' };
    internals(fixture).onChanged(updated);

    expect(internals(fixture).statuses()[0]).toBe(s1);
    expect(internals(fixture).statuses()[1]).toBe(updated);
    expect(internals(fixture).statuses()[2]).toBe(s3);
  });

  // ---------------------------------------------------------------- library views

  function makeAuthored(id: string, acct: string, content: string, media = 0): Status {
    const s = makeStatus(id);
    return {
      ...s,
      content,
      account: { ...s.account, id: `a-${acct}`, acct, username: acct },
      media_attachments: Array.from(
        { length: media },
        (_, i) =>
          ({ id: `m${id}-${i}`, url: 'x', preview_url: 'x' }) as Status['media_attachments'][0],
      ),
    };
  }

  it("the 'all' view is a single unlabeled group in fetch order", () => {
    const fixture = setUp();
    const s1 = makeStatus('1');
    const s2 = makeStatus('2');
    httpMock.expectOne('/api/v1/bookmarks?limit=20').flush([s1, s2]);

    const groups = internals(fixture).groups();
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('');
    expect(groups[0].statuses).toEqual([s1, s2]);
  });

  it("the 'authors' view groups by account with largest shelf first", () => {
    const fixture = setUp();
    httpMock
      .expectOne('/api/v1/bookmarks?limit=20')
      .flush([
        makeAuthored('1', 'alice', '<p>one</p>'),
        makeAuthored('2', 'bob', '<p>two</p>'),
        makeAuthored('3', 'bob', '<p>three</p>'),
      ]);

    internals(fixture).view.set('authors');
    const groups = internals(fixture).groups();
    expect(groups.map((g) => g.label)).toEqual(['@bob', '@alice']);
    expect(groups[0].statuses.map((s) => s.id)).toEqual(['2', '3']);
  });

  it("the 'hashtags' view shelves posts under every tag plus a no-hashtags shelf", () => {
    const fixture = setUp();
    httpMock
      .expectOne('/api/v1/bookmarks?limit=20')
      .flush([
        makeAuthored('1', 'alice', '<p>I love #cats and #dogs</p>'),
        makeAuthored('2', 'bob', '<p>more #cats</p>'),
        makeAuthored('3', 'bob', '<p>nothing tagged</p>'),
      ]);

    internals(fixture).view.set('hashtags');
    const groups = internals(fixture).groups();
    expect(groups.map((g) => g.label)).toEqual(['#cats', '#dogs', 'no hashtags']);
    expect(groups[0].statuses.map((s) => s.id)).toEqual(['1', '2']);
    expect(groups[2].statuses.map((s) => s.id)).toEqual(['3']);
  });

  it("the 'media' view keeps only posts with attachments", () => {
    const fixture = setUp();
    httpMock
      .expectOne('/api/v1/bookmarks?limit=20')
      .flush([
        makeAuthored('1', 'alice', '<p>photo</p>', 2),
        makeAuthored('2', 'bob', '<p>text only</p>'),
      ]);

    internals(fixture).view.set('media');
    const groups = internals(fixture).groups();
    expect(groups).toHaveLength(1);
    expect(groups[0].statuses.map((s) => s.id)).toEqual(['1']);
  });
});

function raindropBookmark(id: number): RaindropBookmark {
  return {
    _id: id,
    title: `Raindrop ${id}`,
    link: `https://social.example/@alice/${id}`,
    excerpt: `Saved post ${id}`,
    created: '2026-01-01T00:00:00Z',
    collection: { $id: 7 },
  };
}
