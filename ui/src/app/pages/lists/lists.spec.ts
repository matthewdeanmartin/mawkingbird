import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Collection, UserList } from '../../models';
import { RssCache } from '../../providers/rss/rss-cache';
import { RssFeedSub, RssSubscriptions } from '../../providers/rss/rss-subscriptions';
import { Lists } from './lists';
import { TwitterFollows } from '../../providers/twitter/twitter-follows';

/** Exposes Lists' protected signals for white-box testing. */
interface ListsInternals {
  lists: WritableSignal<UserList[]>;
  loading: WritableSignal<boolean>;
  newTitle: WritableSignal<string>;
  collections: WritableSignal<Collection[]>;
  collectionsSupported: WritableSignal<boolean>;
  newCollectionName: WritableSignal<string>;
  listToDelete: WritableSignal<UserList | null>;
  collectionToDelete: WritableSignal<Collection | null>;
  load(): void;
  create(): void;
  tagQuery: WritableSignal<string>;
  normalizedTagQuery(): string;
  viewTag(): void;
  askDeleteList(list: UserList, event: Event): void;
  remove(list: UserList): void;
  createCollection(): void;
  askDeleteCollection(c: Collection, event: Event): void;
  removeCollection(c: Collection): void;
  askUnsubscribeRss(feed: RssFeedSub, event: Event): void;
  removeRss(feed: RssFeedSub): void;
  section: WritableSignal<string>;
}

function makeCollection(id: string, name = `Collection ${id}`): Collection {
  return {
    id,
    account_id: '9',
    name,
    description: '',
    discoverable: false,
    sensitive: false,
    local: true,
    item_count: 0,
    items: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    uri: `https://example.social/collections/${id}`,
  };
}

const noopEvent = {
  stopPropagation: () => {
    /* noop */
  },
  preventDefault: () => {
    /* noop */
  },
} as unknown as Event;

function internals(fixture: ComponentFixture<Lists>): ListsInternals {
  return fixture.componentInstance as unknown as ListsInternals;
}

/** The Lists section's own "New list name" input, or null when that section isn't rendered. */
function newListInput(fixture: ComponentFixture<Lists>): HTMLInputElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector('input[placeholder="New list name"]');
}

function makeList(id: string, title = `List ${id}`): UserList {
  return { id, title };
}

describe('Lists', () => {
  let httpMock: HttpTestingController;
  let routeOnly: 'tags' | 'lists' | undefined;

  beforeEach(() => {
    // RSS subscriptions persist to localStorage, so a feed added by one test
    // would otherwise show up as a row in every test after it.
    localStorage.clear();
    routeOnly = undefined;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        // No IndexedDB in this environment; unsubscribing evicts through this.
        { provide: RssCache, useValue: { evict: () => Promise.resolve() } },
        {
          provide: ActivatedRoute,
          useFactory: () => ({ snapshot: { data: routeOnly ? { only: routeOnly } : {} } }),
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /**
   * Server-feed capability probing fires in ngOnInit: two timelines/public GETs
   * plus the two trends endpoints, now that every server-feed row is probed
   * rather than only Fediverse/Local. Tests don't assert on the resulting rows,
   * so we just settle them all as empty.
   */
  function flushServerFeedProbes(): void {
    httpMock
      .match(
        (r) =>
          r.url === '/api/v1/timelines/public' ||
          r.url === '/api/v1/trends/statuses' ||
          r.url === '/api/v1/trends/links',
      )
      .forEach((req) => req.flush([]));
  }

  /**
   * The profile-directory row is probed with one limit=1 GET before it is
   * offered. Tests don't assert on the row, so settle it as empty (which hides
   * it, like the probed server feeds above).
   */
  function flushDirectoryProbe(): void {
    httpMock.match((r) => r.url === '/api/v1/directory').forEach((req) => req.flush([]));
  }

  /**
   * Popular Bluesky feeds load for **every** account kind, not just linked ones
   * — the endpoint is anonymous, so withholding it would hide public content
   * for no reason. That means it fires here too, where no Bluesky account
   * exists. Settled as empty, which hides the section.
   */
  function flushPopularFeeds(): void {
    httpMock
      .match((r) => r.url.includes('app.bsky.unspecced.getPopularFeedGenerators'))
      .forEach((req) => req.flush({ feeds: [] }));
  }

  /**
   * On the default (unfiltered) Feeds view the Tags section loads followed and
   * featured hashtags. Tests don't assert on them, so settle both as empty.
   */
  function flushTagLoads(): void {
    httpMock.match((r) => r.url === '/api/v1/followed_tags').forEach((req) => req.flush([]));
    httpMock.match((r) => r.url === '/api/v1/featured_tags').forEach((req) => req.flush([]));
  }

  /**
   * Creates the component and settles the collections side of ngOnInit.
   * By default the auth snapshot is empty, so loadCollections() first calls
   * verify_credentials; erroring it short-circuits the collection fetches.
   */
  function setUp(): ComponentFixture<Lists> {
    const fixture = TestBed.createComponent(Lists);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/accounts/verify_credentials').error(new ProgressEvent('error'));
    flushServerFeedProbes();
    flushDirectoryProbe();
    flushTagLoads();
    flushPopularFeeds();
    return fixture;
  }

  it('starts with loading=true and an empty lists array', () => {
    const fixture = setUp();
    expect(internals(fixture).loading()).toBe(true);
    expect(internals(fixture).lists()).toEqual([]);
    httpMock.expectOne('/api/v1/lists').flush([]);
  });

  it('accepts a hashtag to preview, with or without the #', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/lists').flush([]);

    internals(fixture).tagQuery.set('#mawkingbird');
    expect(internals(fixture).normalizedTagQuery()).toBe('mawkingbird');

    internals(fixture).tagQuery.set('  mawkingbird ');
    expect(internals(fixture).normalizedTagQuery()).toBe('mawkingbird');

    // Mastodon tags are one alphanumeric run, so a phrase is rejected rather
    // than sent to a tag page that could only ever show nothing.
    internals(fixture).tagQuery.set('cat pictures');
    expect(internals(fixture).normalizedTagQuery()).toBe('');
  });

  // -------------------------------------------------------------- landing
  // /feeds now defaults to a drill-down category list rather than the full
  // stack, so reaching one kind of feed costs one click instead of a scroll
  // past the other fifteen.

  it('defaults to the landing category list on /feeds', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/lists').flush([]);
    fixture.detectChanges();

    expect(internals(fixture).section()).toBe('landing');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('All feeds');
    expect(text).toContain('RSS feeds');
    expect(text).toContain('Bluesky feeds');
    // The old full-stack content is not rendered until a category is chosen.
    expect(newListInput(fixture)).toBeNull();
  });

  it('drilling into a category shows only that section', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/lists').flush([]);
    internals(fixture).section.set('rss');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('RSS feeds');
    // Lists' own create box belongs to a different section and must not
    // leak into a view narrowed to one kind.
    expect(newListInput(fixture)).toBeNull();
  });

  it('"All feeds" returns to the full stack', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/lists').flush([]);
    internals(fixture).section.set('all');
    fixture.detectChanges();

    expect(newListInput(fixture)).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('RSS feeds');
  });

  it('/feeds/lists and /feeds/tags skip the landing list entirely', () => {
    routeOnly = 'lists';
    const fixture = TestBed.createComponent(Lists);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/accounts/verify_credentials').error(new ProgressEvent('error'));
    httpMock.expectOne('/api/v1/lists').flush([]);
    flushServerFeedProbes();
    flushDirectoryProbe();
    flushPopularFeeds();
    fixture.detectChanges();

    expect(internals(fixture).section()).toBe('all');
    expect(newListInput(fixture)).not.toBeNull();
  });

  it('keeps Twitter accounts off the tags-only route', () => {
    routeOnly = 'tags';
    TestBed.inject(TwitterFollows).add({ username: 'NASA', displayName: 'NASA' });
    const fixture = TestBed.createComponent(Lists);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/followed_tags').flush([]);
    httpMock.expectOne('/api/v1/featured_tags').flush([]);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Twitter accounts');
  });

  // ------------------------------------------------------------------ RSS
  // The Feeds page is the hub that makes RSS findable: before it existed, a
  // subscribed feed could only be reached by spotting one of its posts in the
  // home timeline.

  it('lists subscribed RSS feeds, linking each to its feed profile', () => {
    const subs = TestBed.inject(RssSubscriptions);
    subs.add('https://blog.example.com/feed.xml', 'Example Blog', false, 12);
    const fixture = setUp();
    httpMock.expectOne('/api/v1/lists').flush([]);
    internals(fixture).section.set('rss');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('RSS feeds');
    expect(text).toContain('Example Blog');
    expect(text).toContain('12 items');
    expect(text).toContain('blog.example.com');

    // The feed URL is percent-encoded into the route segment, which is what the
    // profile page's `rss:` parser expects on the way back out.
    const href = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLAnchorElement>("a[href*='accounts/rss']")
      ?.getAttribute('href');
    expect(href).toBe('/accounts/rss:https:%2F%2Fblog.example.com%2Ffeed.xml');
  });

  it('still lists a feed that is switched off, marked as off', () => {
    const subs = TestBed.inject(RssSubscriptions);
    subs.add('https://blog.example.com/feed.xml', 'Example Blog');
    subs.setEnabled('https://blog.example.com/feed.xml', false);
    const fixture = setUp();
    httpMock.expectOne('/api/v1/lists').flush([]);
    internals(fixture).section.set('rss');
    fixture.detectChanges();

    // A disabled feed must stay visible, or it can never be found to re-enable.
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Example Blog');
    expect(text).toContain('· off');
  });

  it('marks a proxied feed on the row', () => {
    const subs = TestBed.inject(RssSubscriptions);
    subs.add('https://blog.example.com/feed.xml', 'Example Blog', true);
    const fixture = setUp();
    httpMock.expectOne('/api/v1/lists').flush([]);
    internals(fixture).section.set('rss');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('via proxy');
  });

  it('unsubscribes only after the confirmation is accepted', () => {
    const subs = TestBed.inject(RssSubscriptions);
    subs.add('https://blog.example.com/feed.xml', 'Example Blog');
    const fixture = setUp();
    httpMock.expectOne('/api/v1/lists').flush([]);

    const feed = subs.feeds()[0];
    internals(fixture).askUnsubscribeRss(feed, noopEvent);
    // Asking must not remove anything on its own.
    expect(subs.feeds()).toHaveLength(1);

    internals(fixture).removeRss(feed);
    expect(subs.feeds()).toEqual([]);
  });

  it('invites you to subscribe when there are no feeds', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/lists').flush([]);
    internals(fixture).section.set('rss');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('None yet');
  });

  it('populates lists and clears loading on successful fetch', () => {
    const fixture = setUp();
    const l1 = makeList('1');
    const l2 = makeList('2');

    httpMock.expectOne('/api/v1/lists').flush([l1, l2]);

    expect(internals(fixture).loading()).toBe(false);
    expect(internals(fixture).lists()).toEqual([l1, l2]);
  });

  it('clears loading on HTTP error', () => {
    const fixture = setUp();

    httpMock.expectOne('/api/v1/lists').error(new ProgressEvent('error'));

    expect(internals(fixture).loading()).toBe(false);
    expect(internals(fixture).lists()).toEqual([]);
  });

  it('create() does nothing when newTitle is blank', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/lists').flush([]);

    internals(fixture).newTitle.set('   ');
    internals(fixture).create();

    // No POST should be made
    httpMock.expectNone('/api/v1/lists');
  });

  it('create() POSTs to /api/v1/lists and appends the new list', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/lists').flush([]);

    internals(fixture).newTitle.set('My New List');
    internals(fixture).create();

    const newList = makeList('42', 'My New List');
    httpMock.expectOne('/api/v1/lists').flush(newList);

    expect(internals(fixture).lists()).toEqual([newList]);
    expect(internals(fixture).newTitle()).toBe('');
  });

  it('create() appends to existing lists', () => {
    const fixture = setUp();
    const l1 = makeList('1');
    httpMock.expectOne('/api/v1/lists').flush([l1]);

    internals(fixture).newTitle.set('Second List');
    internals(fixture).create();

    const l2 = makeList('2', 'Second List');
    httpMock.expectOne('/api/v1/lists').flush(l2);

    expect(internals(fixture).lists()).toEqual([l1, l2]);
  });

  it('remove() DELETEs /api/v1/lists/:id and removes it from the list', () => {
    const fixture = setUp();
    const l1 = makeList('1');
    const l2 = makeList('2');
    httpMock.expectOne('/api/v1/lists').flush([l1, l2]);

    internals(fixture).remove(l1);

    httpMock.expectOne('/api/v1/lists/1').flush({});

    expect(internals(fixture).lists()).toEqual([l2]);
  });

  it('remove() only removes the targeted list', () => {
    const fixture = setUp();
    const l1 = makeList('1');
    const l2 = makeList('2');
    const l3 = makeList('3');
    httpMock.expectOne('/api/v1/lists').flush([l1, l2, l3]);

    internals(fixture).remove(l2);

    httpMock.expectOne('/api/v1/lists/2').flush({});

    expect(internals(fixture).lists()).toEqual([l1, l3]);
  });

  it('loads collections once credentials are verified', () => {
    const fixture = TestBed.createComponent(Lists);
    fixture.detectChanges();
    flushServerFeedProbes();
    flushDirectoryProbe();
    flushTagLoads();
    flushPopularFeeds();

    httpMock
      .expectOne('/api/v1/accounts/verify_credentials')
      .flush({ id: '9', username: 'me', acct: 'me' });
    httpMock.expectOne('/api/v1/lists').flush([]);
    httpMock.expectOne('/api/v1/accounts/9/endorsements').flush([]);
    httpMock.expectOne('/api/v1/accounts/9/collections').flush({ collections: [] });
    httpMock.expectOne('/api/v1/accounts/9/in_collections').flush({ collections: [] });

    const c = fixture.componentInstance as unknown as {
      collectionsLoading: WritableSignal<boolean>;
      collectionsSupported: WritableSignal<boolean>;
    };
    expect(c.collectionsLoading()).toBe(false);
    expect(c.collectionsSupported()).toBe(true);
  });

  /**
   * Settle ngOnInit with a *verified* account (id 9), flushing the lists fetch
   * and both collection GETs. Returns the fixture with collections loaded.
   */
  function setUpVerified(collections: Collection[] = []): ComponentFixture<Lists> {
    const fixture = TestBed.createComponent(Lists);
    fixture.detectChanges();
    flushServerFeedProbes();
    flushDirectoryProbe();
    flushTagLoads();
    flushPopularFeeds();
    httpMock
      .expectOne('/api/v1/accounts/verify_credentials')
      .flush({ id: '9', username: 'me', acct: 'me' });
    httpMock.expectOne('/api/v1/lists').flush([]);
    httpMock.expectOne('/api/v1/accounts/9/endorsements').flush([]);
    httpMock.expectOne('/api/v1/accounts/9/collections').flush({ collections });
    httpMock.expectOne('/api/v1/accounts/9/in_collections').flush({ collections: [] });
    return fixture;
  }

  it('flips collectionsSupported=false when the collections GET 404s (pre-4.6 server)', () => {
    const fixture = TestBed.createComponent(Lists);
    fixture.detectChanges();
    flushServerFeedProbes();
    flushDirectoryProbe();
    flushTagLoads();
    flushPopularFeeds();

    httpMock
      .expectOne('/api/v1/accounts/verify_credentials')
      .flush({ id: '9', username: 'me', acct: 'me' });
    httpMock.expectOne('/api/v1/lists').flush([]);
    httpMock.expectOne('/api/v1/accounts/9/endorsements').flush([]);
    httpMock
      .expectOne('/api/v1/accounts/9/collections')
      .flush('', { status: 404, statusText: 'Not Found' });
    httpMock.expectOne('/api/v1/accounts/9/in_collections').flush({ collections: [] });

    expect(internals(fixture).collectionsSupported()).toBe(false);
  });

  it('createCollection() POSTs the create body and appends the wrapped collection', () => {
    const fixture = setUpVerified();

    internals(fixture).newCollectionName.set('Besties');
    internals(fixture).createCollection();

    const post = httpMock.expectOne('/api/v1/collections');
    expect(post.request.method).toBe('POST');
    // mastodon.social requires sensitive + discoverable on create (verified live).
    expect(post.request.body).toEqual({ name: 'Besties', sensitive: false, discoverable: false });
    post.flush({ collection: makeCollection('C1', 'Besties') });

    expect(
      internals(fixture)
        .collections()
        .map((c) => c.name),
    ).toEqual(['Besties']);
    expect(internals(fixture).newCollectionName()).toBe('');
  });

  it('createCollection() reloads instead of appending when the stub returns {collection:null}', () => {
    const fixture = setUpVerified();

    internals(fixture).newCollectionName.set('Stub');
    internals(fixture).createCollection();
    httpMock.expectOne('/api/v1/collections').flush({ collection: null });

    // Null payload → loadCollections() re-runs (account already verified).
    httpMock.expectOne('/api/v1/accounts/9/endorsements').flush([]);
    httpMock
      .expectOne('/api/v1/accounts/9/collections')
      .flush({ collections: [makeCollection('C2')] });
    httpMock.expectOne('/api/v1/accounts/9/in_collections').flush({ collections: [] });

    expect(
      internals(fixture)
        .collections()
        .map((c) => c.id),
    ).toEqual(['C2']);
  });

  it('askDeleteList() stages the list for confirmation without deleting', () => {
    const fixture = setUp();
    const l1 = makeList('1');
    httpMock.expectOne('/api/v1/lists').flush([l1]);

    internals(fixture).askDeleteList(l1, noopEvent);

    // No DELETE yet — just staged for the confirm dialog.
    expect(internals(fixture).listToDelete()).toEqual(l1);
    httpMock.expectNone('/api/v1/lists/1');
  });

  it('removeCollection() DELETEs and drops the row', () => {
    const c1 = makeCollection('C1');
    const c2 = makeCollection('C2');
    const fixture = setUpVerified([c1, c2]);

    internals(fixture).removeCollection(c1);
    httpMock.expectOne('/api/v1/collections/C1').flush({});

    expect(
      internals(fixture)
        .collections()
        .map((c) => c.id),
    ).toEqual(['C2']);
  });

  it('load() sets loading=true then fetches fresh data', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/lists').flush([]);

    internals(fixture).load();
    expect(internals(fixture).loading()).toBe(true);

    const l1 = makeList('1');
    httpMock.expectOne('/api/v1/lists').flush([l1]);

    expect(internals(fixture).loading()).toBe(false);
    expect(internals(fixture).lists()).toEqual([l1]);
  });
});
