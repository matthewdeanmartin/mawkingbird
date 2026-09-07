import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signal, WritableSignal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientPrefs } from '../../client-prefs';
import { Drafts, emptyDraftSnapshot } from '../../drafts';
import { HomeDiagnostics } from '../../home-diagnostics';
import { Status } from '../../models';
import { Streaming } from '../../streaming';
import { FakeStreaming } from '../../testing/fake-streaming';
import { Home } from './home';
import { Auth } from '../../auth';
import { AnonymousHomeFeedCache } from '../../providers/anonymous/anonymous-home-feed-cache';
import { AnonymousMastodonProvider } from '../../providers/anonymous/anonymous-mastodon-provider';
import { JustMyServer } from '../../just-my-server';
import { AnonymousTags } from '../../providers/anonymous/anonymous-tags';
import { TwitterProvider } from '../../providers/twitter/twitter-provider';

/** Exposes Home's protected signals for white-box testing. */
interface HomeInternals {
  statuses: Signal<Status[]>;
  visible: Signal<Status[]>;
  live: WritableSignal<boolean>;
  autoLoading: Signal<boolean>;
  capActive: Signal<boolean>;
  canLoadMore: Signal<boolean>;
  showBoosts: WritableSignal<boolean>;
  showReplies: WritableSignal<boolean>;
  eliza: { follow(): void; unfollow(): void };
  loadMore(): void;
  reviewBookmarks(): void;
  toggleBoosts(): void;
  toggleReplies(): void;
  articles: Signal<{ status: Status; card: NonNullable<Status['card']> }[]>;
  view: WritableSignal<'feed' | 'members' | 'analytics' | 'media' | 'articles'>;
  setView(view: 'feed' | 'members' | 'analytics' | 'media' | 'articles'): void;
  onPosted(status: Status): void;
  startWriting(): void;
}

function internals(fixture: ComponentFixture<Home>): HomeInternals {
  return fixture.componentInstance as unknown as HomeInternals;
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
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    media_attachments: [],
  };
}

describe('Home', () => {
  let httpMock: HttpTestingController;
  let fakeStreaming: FakeStreaming;
  let diagnostics: Pick<HomeDiagnostics, 'info' | 'warn' | 'error'>;

  beforeEach(() => {
    // See docs/shared-jsdom-realm-in-tests.md: one realm, one module registry.
    // A TestBed another suite left instantiated makes this throw.
    TestBed.resetTestingModule();
    fakeStreaming = new FakeStreaming();
    diagnostics = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Streaming, useValue: fakeStreaming },
        { provide: HomeDiagnostics, useValue: diagnostics },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  beforeEach(() => {
    // These specs use fixed 2026-01-01 dates and assert paging, filtering and
    // views — not recency. The default 24h loading window would drop every
    // fixture and stop paging on the first page. The window has its own
    // coverage in feed-aggregator.spec.ts.
    TestBed.inject(ClientPrefs).setHomeWindow('all');
  });

  function setUp(): ComponentFixture<Home> {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/timelines/home?limit=20').flush([]);
    httpMock.expectOne('/api/v1/announcements').flush([]);
    return fixture;
  }

  /**
   * Turn streaming on and flush the fresh-snapshot refetch it triggers.
   *
   * Driven by the Blue preference now that "Go live" has left the toolbar —
   * Home follows `autoRefreshTimeline` through an effect, so the switch has to
   * be flipped there and the effect flushed with `detectChanges`.
   */
  function goLive(fixture: ComponentFixture<Home>, snapshot: Status[] = []): void {
    TestBed.inject(ClientPrefs).setAutoRefreshTimeline(true);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/timelines/home?limit=20').flush(snapshot);
  }

  /** The inverse of {@link goLive}: no refetch happens on the way down. */
  function stopLive(fixture: ComponentFixture<Home>): void {
    TestBed.inject(ClientPrefs).setAutoRefreshTimeline(false);
    fixture.detectChanges();
  }

  it('reports an empty first page with enough context to diagnose filtering', () => {
    setUp();

    expect(diagnostics.warn).toHaveBeenCalledWith(
      'load:first-page-empty',
      expect.objectContaining({ received: 0, stored: 0, visible: 0 }),
    );
  });

  it('toggles retweets and replies in the home feed', () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/announcements').flush([]);
    const original = makeStatus('original');
    const retweet = { ...makeStatus('retweet'), reblog: makeStatus('boosted') };
    const reply = { ...makeStatus('reply'), in_reply_to_id: 'parent' };
    httpMock.expectOne('/api/v1/timelines/home?limit=20').flush([original, retweet, reply]);

    expect(
      internals(fixture)
        .visible()
        .map((status) => status.id),
    ).toEqual(['original', 'retweet']);
    internals(fixture).toggleReplies();
    expect(
      internals(fixture)
        .visible()
        .map((status) => status.id),
    ).toEqual(['original', 'retweet', 'reply']);
    internals(fixture).toggleBoosts();
    expect(
      internals(fixture)
        .visible()
        .map((status) => status.id),
    ).toEqual(['original', 'reply']);
  });

  it('does not fetch more just because a filter hides most of a page', () => {
    // Hiding replies is a display choice, not an instruction to go fetch more.
    // Auto-loading until the *visible* count reached feedMin turned a reply-heavy
    // timeline into a page-burning loop, and (because each page can latch the
    // window cutoff) took "Load more" away in the process.
    const prefs = TestBed.inject(ClientPrefs);
    prefs.setFeedMin(4);
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/announcements').flush([]);

    const page1 = [
      makeStatus('keep-1'),
      ...Array.from({ length: 19 }, (_, i) => ({
        ...makeStatus(`r${i}`),
        in_reply_to_id: 'p',
      })),
    ];
    httpMock.expectOne('/api/v1/timelines/home?limit=20').flush(page1);

    // Twenty fetched is twenty fetched: the minimum is already satisfied, so no
    // second page is requested even though only one post is on screen.
    httpMock.expectNone((r) => r.url === '/api/v1/timelines/home' && !!r.params.get('max_id'));
    expect(
      internals(fixture)
        .visible()
        .map((s) => s.id),
    ).toEqual(['keep-1']);
    expect(internals(fixture).autoLoading()).toBe(false);
  });

  it('leaves "Load more" available after a page the filters mostly hid', () => {
    // The regression: a short visible page must never imply the timeline is over.
    // Paging is the reader's call, and the button has to still be there to make it.
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/announcements').flush([]);
    httpMock.expectOne('/api/v1/timelines/home?limit=20').flush([
      makeStatus('keep-1'),
      ...Array.from({ length: 19 }, (_, i) => ({
        ...makeStatus(`r${i}`),
        in_reply_to_id: 'p',
      })),
    ]);
    fixture.detectChanges();

    expect(internals(fixture).canLoadMore()).toBe(true);
    const el = fixture.nativeElement as HTMLElement;
    expect(
      [...el.querySelectorAll('button')].some((b) => b.textContent?.includes('Load more')),
    ).toBe(true);
  });

  /**
   * The reader's complaint was "I click More and then I'm like… where am I?".
   *
   * The cause was not scroll restoration. Home rendered reactive notices *above*
   * the feed list — the "Older posts are hidden" offer, driven by
   * `droppedByWindow()`, which the aggregator increments while paging, plus the
   * anonymous and Twitter provider warnings. Any of them could turn on partway
   * through a session, insert itself above the post being read, and push the
   * whole list down by its own height. The scroll offset never changed; the
   * content under it did.
   *
   * The invariant, stated structurally so it survives rewording: whatever
   * renders above the first status card at first paint must still be exactly
   * what renders above it after the feed has paged and a provider has started
   * complaining. Nothing may be inserted into that region after first paint.
   *
   * jsdom has no layout, so this cannot assert pixels. It does not need to —
   * counting the nodes ahead of the first card catches the insertion itself,
   * which is the bug. Whether the browser then holds position is
   * `overflow-anchor` in styles.css, and that is a real-device check.
   */
  it('inserts nothing above the feed when a provider warning turns on mid-session', () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/announcements').flush([]);
    httpMock.expectOne('/api/v1/timelines/home?limit=20').flush([makeStatus('a'), makeStatus('b')]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    /** Every element rendered before the first post, as a stable shape. */
    const above = (): string[] => {
      const first = el.querySelector('app-status-card');
      expect(first).not.toBeNull();
      const all = [...el.querySelectorAll('*')];
      return all.slice(0, all.indexOf(first as Element)).map((n) => n.tagName);
    };

    const before = above();
    expect(before.length).toBeGreaterThan(0);

    // The Twitter connector resolves saved accounts asynchronously and can start
    // reporting partway through a session — exactly the mid-read arrival that
    // used to displace the feed.
    TestBed.inject(TwitterProvider).unloaded.set(3);
    fixture.detectChanges();

    // The warning must render (it is not being suppressed, just relocated)…
    expect(el.textContent).toContain('nothing');
    expect(el.querySelector('.feed-warning')).not.toBeNull();
    // …and it must render below the feed, leaving the region above untouched.
    expect(above()).toEqual(before);
  });

  it('toggling a filter chip fetches nothing', () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/announcements').flush([]);
    httpMock
      .expectOne('/api/v1/timelines/home?limit=20')
      .flush([makeStatus('a'), { ...makeStatus('b'), in_reply_to_id: 'p' }]);

    internals(fixture).toggleReplies();
    internals(fixture).toggleBoosts();

    httpMock.expectNone((r) => r.url === '/api/v1/timelines/home');
  });

  it('reuses a populated Anonymous feed until the user explicitly refreshes', () => {
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    const cached = { ...makeStatus('cached'), provider: 'anonymous-mastodon' } as Status;
    TestBed.inject(AnonymousHomeFeedCache).store(
      [cached],
      JSON.stringify({ follows: [], tags: [] }),
    );

    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();

    expect(
      internals(fixture)
        .statuses()
        .map((status) => status.id),
    ).toEqual(['cached']);
    httpMock.expectNone((request) => request.url.includes('/statuses'));

    const reset = vi.spyOn(TestBed.inject(AnonymousMastodonProvider), 'reset');
    fixture.componentInstance.load(true);
    expect(internals(fixture).statuses()).toEqual([]);
    expect(reset).toHaveBeenCalledOnce();
  });

  // Home used to inject onboarding into a thin feed: an Eliza invite, the
  // universal starter kit, and every shipped starter-kit post. It put the same
  // collections in front of the same person on every fresh browser, so it is
  // gone — one link to the hub, and only when there is nothing else to show.

  it('offers one link to the Find Friends hub when the feed is empty', () => {
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');

    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const link = el.querySelector('a[href="/find-friends"]');
    // "Find people to follow" since the first-run empty state replaced the bare
    // link; the assertion is that exactly one route out of an empty feed is
    // offered, not what it is worded as.
    expect(link?.textContent).toContain('Find people');
    // Nothing else fills the empty feed on its own any more.
    expect(el.querySelectorAll('app-starter-kit-post')).toHaveLength(0);
    expect(el.querySelector('.starter-pack-universal')).toBeNull();
    expect(el.querySelector('.eliza-invite')).toBeNull();
  });

  it('keeps the pinned login post for Anonymous, which is not onboarding filler', () => {
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');

    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();

    const loginPost = fixture.nativeElement.querySelector(
      '.anonymous-login-post',
    ) as HTMLAnchorElement;
    expect(loginPost.textContent).toContain(
      'Login or create an account to post content, reply and more',
    );
    expect(loginPost.getAttribute('href')).toBe('/login');
  });

  it('drops the hub link as soon as the feed has anything in it', () => {
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();

    // Following Eliza fills the feed with her posts.
    internals(fixture).eliza.follow();
    fixture.detectChanges();

    expect(internals(fixture).visible().length).toBeGreaterThan(0);
    expect(fixture.nativeElement.querySelector('a[href="/find-friends"]')).toBeNull();
  });

  it('shows the Anonymous practice composer only after Eliza is followed', () => {
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-local-compose')).toBeNull();

    internals(fixture).eliza.follow();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-local-compose')).not.toBeNull();
  });

  it('opens a user stream and flips the live flag when the Blue pref goes on', () => {
    const fixture = setUp();
    goLive(fixture);

    expect(internals(fixture).live()).toBe(true);
    expect(fakeStreaming.lastKind).toEqual({ stream: 'user' });
  });

  it('prepends an incoming "update" event to the timeline', () => {
    const fixture = setUp();
    goLive(fixture);

    fakeStreaming.emit({ event: 'update', payload: makeStatus('99') });

    expect(
      internals(fixture)
        .statuses()
        .map((s) => s.id),
    ).toEqual(['99']);
  });

  it('bounds and deduplicates a long-running live timeline', () => {
    TestBed.inject(ClientPrefs).setFeedMax(50);
    const fixture = setUp();
    goLive(fixture);

    for (let i = 0; i < 75; i += 1) {
      fakeStreaming.emit({
        event: 'update',
        payload: {
          ...makeStatus(`live-${i}`),
          created_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
        },
      });
    }
    // Repeat ids from both the retained and trimmed parts of the stream.
    fakeStreaming.emit({
      event: 'update',
      payload: {
        ...makeStatus('live-70'),
        created_at: new Date(Date.UTC(2026, 0, 1, 0, 70)).toISOString(),
      },
    });
    fakeStreaming.emit({ event: 'update', payload: makeStatus('live-10') });
    fixture.detectChanges();

    const ids = internals(fixture)
      .statuses()
      .map((status) => status.id);
    expect(ids).toHaveLength(50);
    expect(new Set(ids).size).toBe(50);
    expect(fixture.nativeElement.querySelectorAll('app-status-card')).toHaveLength(50);
  });

  it('keeps a retained reading row anchored while a live insert trims the tail', () => {
    TestBed.inject(ClientPrefs).setFeedMax(50);
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/announcements').flush([]);
    httpMock.expectOne('/api/v1/timelines/home?limit=20').flush(page(50));
    fixture.detectChanges();

    goLive(fixture, page(50));
    fixture.detectChanges();
    const before = fixture.nativeElement.querySelectorAll('app-status-card');
    const readingRow = before[10];

    fakeStreaming.emit({
      event: 'update',
      payload: { ...makeStatus('fresh'), created_at: '2026-02-01T00:00:00Z' },
    });
    fixture.detectChanges();

    const after = fixture.nativeElement.querySelectorAll('app-status-card');
    expect(after).toHaveLength(50);
    // Angular's id tracking retains this exact element, allowing the browser's
    // native scroll anchoring to hold the reader's position as the tail drops.
    expect(after[11]).toBe(readingRow);
  });

  it('removes a status on an incoming "delete" event', () => {
    const fixture = setUp();
    goLive(fixture);
    fakeStreaming.emit({ event: 'update', payload: makeStatus('1') });
    fakeStreaming.emit({ event: 'update', payload: makeStatus('2') });

    fakeStreaming.emit({ event: 'delete', payload: '1' });

    expect(
      internals(fixture)
        .statuses()
        .map((s) => s.id),
    ).toEqual(['2']);
  });

  it('turning the pref off closes the stream subscription', () => {
    const fixture = setUp();
    goLive(fixture);
    expect(fakeStreaming.closed).toBe(false);

    stopLive(fixture);

    expect(internals(fixture).live()).toBe(false);
    expect(fakeStreaming.closed).toBe(true);
  });

  it('ignores events once the pref is turned off', () => {
    const fixture = setUp();
    goLive(fixture);
    stopLive(fixture);

    fakeStreaming.emit({ event: 'update', payload: makeStatus('99') });

    expect(internals(fixture).statuses()).toEqual([]);
  });

  // ---------------------------------------------------------------- feed size

  /** A full page of `n` statuses (ids offset so pages don't collide). */
  function page(n: number, offset = 0): Status[] {
    return Array.from({ length: n }, (_, i) => makeStatus(String(offset + i)));
  }

  it('auto-loads further pages until the minimum feed size is reached', () => {
    // Minimum 40 → a full first page (20) triggers one more page automatically.
    TestBed.inject(ClientPrefs).setFeedMin(40);

    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/announcements').flush([]);

    // First page: a full 20 → below min(40), so auto-load fires a second page.
    httpMock.expectOne('/api/v1/timelines/home?limit=20').flush(page(20, 0));
    // Second page: another full 20 → now 40, min reached, auto-load stops.
    httpMock.expectOne((r) => r.url === '/api/v1/timelines/home').flush(page(20, 20));

    expect(internals(fixture).statuses()).toHaveLength(40);
    expect(internals(fixture).autoLoading()).toBe(false);
    httpMock.expectNone((r) => r.url === '/api/v1/timelines/home');
  });

  it('deduplicates the boundary post repeated by the next page', () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/announcements').flush([]);
    httpMock.expectOne('/api/v1/timelines/home?limit=20').flush(page(20, 0));

    internals(fixture).loadMore();
    // "Load more" also decides the bookmark button (see BookmarkPresence); it
    // is one request per day, not per page, and is unrelated to this assertion.
    httpMock.expectOne('/api/v1/bookmarks?limit=1').flush([]);
    httpMock
      .expectOne(
        (request) =>
          request.url === '/api/v1/timelines/home' && request.params.get('max_id') === '19',
      )
      .flush([makeStatus('19'), makeStatus('20')]);

    const ids = internals(fixture)
      .statuses()
      .map((status) => status.id);
    expect(ids).toHaveLength(21);
    expect(ids.filter((id) => id === '19')).toHaveLength(1);
    expect(ids.at(-1)).not.toBe('19');
  });

  it('does not apply Anonymous canonical deduplication to authenticated Home', () => {
    const firstBoost = makeStatus('boost-1');
    const secondBoost = makeStatus('boost-2');
    const sharedOriginal = makeStatus('original');
    sharedOriginal.url = 'https://social.example/@author/original';
    firstBoost.reblog = sharedOriginal;
    secondBoost.reblog = { ...sharedOriginal };

    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/announcements').flush([]);
    httpMock.expectOne('/api/v1/timelines/home?limit=20').flush([firstBoost, secondBoost]);

    expect(
      internals(fixture)
        .statuses()
        .map((status) => status.id),
    ).toEqual(['boost-1', 'boost-2']);
  });

  it('loadMore stops at the maximum and activates the cap', () => {
    // Min 20 (default), max 20 → first page already hits the cap boundary.
    TestBed.inject(ClientPrefs).setFeedMax(20);

    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/announcements').flush([]);
    httpMock.expectOne('/api/v1/timelines/home?limit=20').flush(page(20, 0));

    // Feed is at 20 == max; loadMore must NOT fetch, and the cap engages.
    expect(internals(fixture).statuses()).toHaveLength(20);
    internals(fixture).loadMore();

    httpMock.expectNone((r) => r.url === '/api/v1/timelines/home');
    // The bookmark-button probe, not a tail: the automatic tail is gone.
    httpMock.expectOne('/api/v1/bookmarks?limit=1').flush([]);
    expect(internals(fixture).capActive()).toBe(true);
    expect(internals(fixture).canLoadMore()).toBe(false);
  });

  it('applies the same dedupe and cap when a locally created post is inserted', () => {
    TestBed.inject(ClientPrefs).setFeedMax(50);
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/announcements').flush([]);
    httpMock.expectOne('/api/v1/timelines/home?limit=20').flush(page(50));

    const created = { ...makeStatus('created'), created_at: '2026-02-01T00:00:00Z' };
    internals(fixture).onPosted(created);
    internals(fixture).onPosted({ ...created, content: '<p>same post returned twice</p>' });
    fixture.detectChanges();

    const ids = internals(fixture)
      .statuses()
      .map((status) => status.id);
    expect(ids).toHaveLength(50);
    expect(ids.filter((id) => id === 'created')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('app-status-card')).toHaveLength(50);
  });

  /**
   * Replaces "hitting the cap tacks up to 40 bookmarks onto the bottom, once".
   *
   * The automatic tail is gone. It fired only when the cap, the cooldown and a
   * non-empty bookmark list coincided, which is why it was never seen in
   * practice; bookmarks now arrive when the reader presses a button. What the
   * cap still does is stop the feed and say so — and offer that button, because
   * reviewing what you already saved is not doomscrolling.
   */
  it('hitting the cap stops the feed without tacking bookmarks on by itself', () => {
    TestBed.inject(ClientPrefs).setFeedMax(20);

    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/announcements').flush([]);
    httpMock.expectOne('/api/v1/timelines/home?limit=20').flush(page(20, 0));

    internals(fixture).loadMore();
    // The probe behind the button, not a page of bookmarks: one bookmark is all
    // "do you have any?" needs.
    httpMock.expectOne('/api/v1/bookmarks?limit=1').flush([makeStatus('bm1')]);
    fixture.detectChanges();

    const rendered = fixture.nativeElement.textContent as string;
    expect(rendered).toContain('You’ve had enough for now');
    // Nothing was appended on its own.
    expect(rendered).not.toContain('some posts you saved for later');
    // But the way to reach them is offered.
    expect(rendered).toContain('Review bookmarks');
  });

  // ---------------------------------------------------------------- Eliza merge
  it('keeps Eliza out of the feed until she is followed', () => {
    const fixture = setUp();
    const home = internals(fixture);
    expect(home.visible().some((s) => s.id.startsWith('eliza:'))).toBe(false);
  });

  it('folds Eliza posts into the visible feed once followed', () => {
    const fixture = setUp();
    const home = internals(fixture);

    home.eliza.follow();
    fixture.detectChanges();

    const elizaPosts = home.visible().filter((s) => s.id.startsWith('eliza:'));
    expect(elizaPosts.length).toBeGreaterThan(0);
    // She's not in the raw feed — only the derived visible() view.
    expect(home.statuses().some((s) => s.id.startsWith('eliza:'))).toBe(false);
  });

  it('removes Eliza posts again on unfollow', () => {
    const fixture = setUp();
    const home = internals(fixture);

    home.eliza.follow();
    fixture.detectChanges();
    expect(home.visible().some((s) => s.id.startsWith('eliza:'))).toBe(true);

    home.eliza.unfollow();
    fixture.detectChanges();
    expect(home.visible().some((s) => s.id.startsWith('eliza:'))).toBe(false);
  });

  // ------------------------------------------------- the way in to writing

  it('offers Write and Quick post instead of an open composer by default', () => {
    const fixture = setUp();

    expect(fixture.nativeElement.querySelector('app-compose')).toBeNull();
    const buttons = fixture.nativeElement.querySelectorAll('.write-btn');
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toContain('Write');
    expect(buttons[1].textContent).toContain('Quick post');
  });

  /**
   * "Quick post" names an action an anonymous reader has no destination for —
   * no account, nowhere for a post to go — and the target actually waiting
   * behind the composer for them is a pastebin, which is a surprising answer to
   * a button that read as "post to my followers".
   */
  it('offers no way to publish from an anonymous Home', () => {
    // Not the shared setUp: an anonymous Home reads through the anonymous
    // provider rather than /api/v1/timelines/home, so it makes different calls.
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.match(() => true).forEach((r) => r.flush([]));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.write-btn').length).toBe(0);
    expect(el.querySelector('app-compose')).toBeNull();
  });

  it('opens the mini composer on demand, without persisting the choice', () => {
    const prefs = TestBed.inject(ClientPrefs);
    const fixture = setUp();

    fixture.nativeElement.querySelectorAll('.write-btn')[1].click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-compose')).not.toBeNull();
    // The click bought this visit a composer, not a new default.
    expect(prefs.autoShowMiniComposer()).toBe(false);
  });

  it('collapses the mini composer back to buttons after publishing', () => {
    const fixture = setUp();
    const home = internals(fixture);

    fixture.nativeElement.querySelectorAll('.write-btn')[1].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-compose')).not.toBeNull();

    home.onPosted(makeStatus('fresh'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-compose')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.write-btn').length).toBe(2);
  });

  it('starts open, and stays open after publishing, when the pref asks for it', () => {
    TestBed.inject(ClientPrefs).setAutoShowMiniComposer(true);
    const fixture = setUp();
    const home = internals(fixture);

    expect(fixture.nativeElement.querySelector('app-compose')).not.toBeNull();

    home.onPosted(makeStatus('fresh'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-compose')).not.toBeNull();
  });

  // Thoughtful posting is about the publish step, but a button that opens a
  // posting box is the thing it exists to remove — so it wins over the mini
  // composer outright, auto-show pref included.
  it('offers no Quick post button under thoughtful posting', () => {
    const prefs = TestBed.inject(ClientPrefs);
    prefs.setThoughtfulPosting(true);
    const fixture = setUp();

    expect(fixture.nativeElement.querySelector('app-compose')).toBeNull();
    const buttons = fixture.nativeElement.querySelectorAll('.write-btn');
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain('Write');
  });

  it('does not narrate the drafts workflow back to the user', () => {
    // "Posts go through Drafts first." — the app explaining its own settings on
    // a screen the reader came to for their feed. Removed rather than reworded:
    // thoughtful posting is the user's own choice and needs no running
    // commentary, and Home has no other self-talk to keep it company.
    const prefs = TestBed.inject(ClientPrefs);
    prefs.setThoughtfulPosting(true);
    const fixture = setUp();

    expect(fixture.nativeElement.textContent).not.toContain('Drafts first');
    expect(fixture.nativeElement.querySelector('.write-note')).toBeNull();
  });

  it('resumes an empty draft rather than leaving blank ones behind', () => {
    const drafts = TestBed.inject(Drafts);
    const { id: existing } = drafts.save(emptyDraftSnapshot('public'));
    const fixture = setUp();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    internals(fixture).startWriting();

    expect(navigate).toHaveBeenCalledWith(['/write'], { queryParams: { draft: existing } });
    expect(drafts.drafts().length).toBe(1);
  });

  it('starts a new draft when every existing one has content', () => {
    const drafts = TestBed.inject(Drafts);
    drafts.save({ ...emptyDraftSnapshot('public'), segments: ['already written'] });
    const fixture = setUp();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    internals(fixture).startWriting();

    expect(drafts.drafts().length).toBe(2);
    expect(navigate).toHaveBeenCalledWith(['/write'], {
      queryParams: { draft: drafts.drafts()[0].id },
    });
  });

  // The publish step of write -> draft -> edit -> publish happens here. Hiding
  // the composer when you arrive holding a draft would leave the cycle with no
  // way to finish.
  it('still shows a live composer when arriving to finish a handed-off draft', () => {
    TestBed.inject(ClientPrefs).setThoughtfulPosting(true);
    TestBed.inject(Drafts).handoff({
      segments: ['ready to go out'],
      spoilerText: '',
      sensitive: false,
      visibility: 'public',
      poll: null,
    });

    const fixture = setUp();

    expect(fixture.nativeElement.querySelector('app-compose')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.write-btn')).toBeNull();
  });

  // ---------------------------------------------------------------- feed views

  it('offers Members and Analytics in the command bar, starting on the feed', () => {
    const fixture = setUp();

    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.command-bar .btn')]
      .map((b) => b.textContent?.trim())
      .join(' ');
    expect(labels).toContain('Members');
    expect(labels).toContain('Analytics');
    expect(labels).toContain('Media');
    expect(labels).toContain('Articles');
    expect(internals(fixture).view()).toBe('feed');
  });

  it('puts the compact presentation filters beside Retweets, Replies, and Today', () => {
    const fixture = setUp();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const commandBar = el.querySelector('.command-bar')?.textContent ?? '';
    const filters = el.querySelector('.home-filters')?.textContent ?? '';

    expect(commandBar).not.toContain('Images');
    expect(commandBar).not.toContain('All languages');
    expect(commandBar).not.toContain('Calm');
    expect(filters).toContain('Retweets');
    expect(filters).toContain('Replies');
    expect(filters).not.toContain('Images');
    expect(filters).toContain('All');
    expect(filters).toContain('Calm');
    expect(filters).toContain('Everything');
    expect(filters).not.toContain('Local Feed');
    expect(el.querySelectorAll('.command-bar .command-row')).toHaveLength(2);
  });

  it('puts the complete Reader controls in a dedicated fourth toolbar row', () => {
    const fixture = setUp();
    const prefs = TestBed.inject(ClientPrefs);
    prefs.setFeedReader(true);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const rows = [...el.querySelectorAll('.command-row, .home-filters, .reader-toolbar')];
    const reader = el.querySelector<HTMLElement>('.reader-toolbar');

    expect(rows).toHaveLength(4);
    expect(rows[3]).toBe(reader);
    expect(reader?.textContent).toContain('A−');
    expect(reader?.textContent).toContain('18px');
    expect(reader?.textContent).toContain('A+');
    expect(reader?.querySelector<HTMLSelectElement>('[aria-label="Font family"]')?.value).toBe(
      'serif',
    );
    expect(reader?.querySelector<HTMLSelectElement>('[aria-label="Article theme"]')?.value).toBe(
      'app',
    );
    expect(el.querySelector('.command-bar .font-controls')).toBeNull();

    const larger = [...(reader?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('A+'),
    );
    larger?.click();
    const family = reader?.querySelector<HTMLSelectElement>('[aria-label="Font family"]');
    const theme = reader?.querySelector<HTMLSelectElement>('[aria-label="Article theme"]');
    family!.value = 'sans';
    family!.dispatchEvent(new Event('change'));
    theme!.value = 'sepia';
    theme!.dispatchEvent(new Event('change'));

    expect(prefs.readerFontSize()).toBe(19);
    expect(prefs.readerFontFamily()).toBe('sans');
    expect(prefs.readerTheme()).toBe('sepia');
  });

  it('offers Local Feed only while Home is showing Server Friends', () => {
    const auth = TestBed.inject(Auth);
    auth.setToken('test-token');
    auth.setAccount({
      id: 'me',
      username: 'me',
      acct: 'me',
      display_name: 'Me',
    } as Status['account']);
    const fixture = setUp();
    const serverMode = TestBed.inject(JustMyServer);
    serverMode.listId.set('server-list');
    serverMode.ready.set(true);
    serverMode.enabled.set(true);
    TestBed.flushEffects();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/timelines/list/server-list?limit=20').flush([]);
    fixture.detectChanges();

    // The pinned toolbar probes each server feed's capability, exactly as the
    // Feeds page does, so a server that refuses one gets no link to it.
    for (const url of [
      '/api/v1/timelines/public?limit=20&local=true',
      '/api/v1/trends/statuses',
      '/api/v1/trends/links',
    ]) {
      for (const req of httpMock.match(url)) {
        req.flush([]);
      }
    }
    fixture.detectChanges();

    // Moved out of the command bar into its own row: projected into the bar it
    // lacked the bar's `command-item` class, so it shrank and scrolled out of
    // sight under the right rail.
    const shortcut = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '.pinned-feeds a[href="/feeds/local"]',
    );
    expect(shortcut?.textContent).toContain('Local');
    expect(shortcut?.textContent).not.toContain('Server Friends');
  });

  it('swaps the timeline for the members view, off the posts already loaded', () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/announcements').flush([]);
    httpMock.expectOne('/api/v1/timelines/home?limit=20').flush([makeStatus('a'), makeStatus('b')]);
    fixture.detectChanges();

    internals(fixture).setView('members');
    fixture.detectChanges();
    // The feed itself is never re-fetched; the only call is the batched
    // relationships lookup that marks who you already follow.
    httpMock.expectOne((r) => r.url.startsWith('/api/v1/accounts/relationships')).flush([]);
    fixture.detectChanges();

    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelectorAll('.member-row').length).toBeGreaterThan(0);
    expect(html.querySelector('app-status-card')).toBeNull();
  });

  it('analyzes the loaded home feed without paging it', () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/announcements').flush([]);
    httpMock.expectOne('/api/v1/timelines/home?limit=20').flush([makeStatus('a'), makeStatus('b')]);
    fixture.detectChanges();

    internals(fixture).setView('analytics');
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url.startsWith('/api/v1/accounts/relationships')).flush([]);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('2 posts currently loaded');
    expect(text).toContain('not the whole feed');
  });

  it('keeps paging while Articles is open until it has enough link cards', () => {
    // Articles is a projection over loaded posts, and most posts carry no card.
    // Counting posts (as the ordinary fill does) satisfied feedMin with a
    // handful of articles on screen, which is what made the view look empty.
    const withCard = (id: string): Status => ({
      ...makeStatus(id),
      card: { url: `https://example.com/${id}`, title: id } as Status['card'],
    });
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/announcements').flush([]);
    // A full page that satisfies feedMin on post count but holds two articles.
    httpMock
      .expectOne('/api/v1/timelines/home?limit=20')
      .flush([
        withCard('a1'),
        withCard('a2'),
        ...Array.from({ length: 18 }, (_, i) => makeStatus(`p${i}`)),
      ]);
    fixture.detectChanges();

    internals(fixture).setView('articles');
    fixture.detectChanges();

    // Opening the view pages again, because two articles is not ten.
    const more = httpMock.match(
      (r) => r.url === '/api/v1/timelines/home' && !!r.params.get('max_id'),
    );
    expect(more.length).toBeGreaterThan(0);
    more[0].flush(Array.from({ length: 8 }, (_, i) => withCard(`b${i}`)));
    fixture.detectChanges();

    // Ten reached, so the fill stops rather than paging on.
    expect(internals(fixture).articles().length).toBe(10);
    httpMock.match((r) => r.url === '/api/v1/timelines/home').forEach((r) => r.flush([]));
  });

  it('returns to the feed when the active view is toggled off', () => {
    const fixture = setUp();
    internals(fixture).setView('members');
    fixture.detectChanges();
    expect(internals(fixture).view()).toBe('members');

    internals(fixture).setView('feed');
    fixture.detectChanges();
    expect(internals(fixture).view()).toBe('feed');
    expect((fixture.nativeElement as HTMLElement).querySelector('.home-filters')).not.toBeNull();
  });
});

/**
 * The first five minutes.
 *
 * An anonymous visitor with nothing followed is the state a stranger lands in
 * once the first-run preview ends, and it was the least considered screen in the
 * app: six filter controls above an empty column, and preview posts that
 * vanished later at some unrelated navigation.
 */
/**
 * The end of the feed has to say what stopped it.
 *
 * "You're all caught up" is a claim, and when a filter is holding posts back it
 * is a false one — which is what sends a reader hunting for a bug in their
 * follows. The Boosts/Replies chips already named their number; Calm and the
 * language filter did not, and Calm emptying a feed silently is the case the
 * boss hit in production.
 */
describe('Home, end-of-feed honesty', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    // Spec files share one jsdom realm and one module registry (see
    // docs/shared-jsdom-realm-in-tests.md), so a TestBed left instantiated by
    // the previous suite makes `configureTestingModule` throw here — and every
    // suite after it fails wholesale. Reset first.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Streaming, useValue: new FakeStreaming() },
        { provide: HomeDiagnostics, useValue: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  // Separate hook: these fixtures use fixed dates, and the default 24h window
  // would drop every one of them. Matches the outer suite.
  beforeEach(() => {
    TestBed.inject(ClientPrefs).setHomeWindow('all');
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  /** A post Calm hides: ratioed, per `isRatioed` (>=5 replies, >=2x the rest). */
  function ratioed(id: string): Status {
    return { ...makeStatus(id), replies_count: 20, favourites_count: 1, reblogs_count: 0 };
  }

  it('does not blame your follows when Calm hid every post that arrived', () => {
    // The worst case in this class: posts were fetched, Calm hid all of them,
    // and Home told the reader to go find friends to follow — sending them to
    // fix follows that were working fine.
    TestBed.inject(ClientPrefs).setAlgoCalm(true);
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/timelines/home?limit=20')
      .flush([ratioed('1'), ratioed('2'), ratioed('3')]);
    httpMock.expectOne('/api/v1/announcements').flush([]);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('3 posts loaded, and your filters are hiding them all');
    expect(text).toContain('Turn Calm off to see 3');
    expect(text).not.toContain('Find friends to follow');
  });

  it('names Calm at the end of a feed it only partly hid', () => {
    // The partial case, which reaches the end-of-feed note rather than the
    // all-hidden state: one post survives, two are held back.
    TestBed.inject(ClientPrefs).setAlgoCalm(true);
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/timelines/home?limit=20')
      .flush([makeStatus('1'), ratioed('2'), ratioed('3')]);
    httpMock.expectOne('/api/v1/announcements').flush([]);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('hidden by Calm');
    expect(text).not.toContain('You’re all caught up');
  });

  it('still says you are all caught up when nothing is being held back', () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/timelines/home?limit=20').flush([makeStatus('1')]);
    httpMock.expectOne('/api/v1/announcements').flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('You’re all caught up');
  });
});

/**
 * The bookmark button pair, replacing the automatic tail nobody ever saw.
 *
 * > "I have never seen the bookmark tail. However it is currently implemented,
 * > it is ineffective."
 *
 * The tail needed the cap, the cooldown and a non-empty bookmark list to
 * coincide. These specs pin the two properties that make the replacement
 * different: it is reachable by pressing a button, and it never appears on its
 * own.
 */
describe('Home, bookmark review', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    // Spec files share one jsdom realm and one module registry (see
    // docs/shared-jsdom-realm-in-tests.md), so a TestBed left instantiated by
    // the previous suite makes `configureTestingModule` throw here — and every
    // suite after it fails wholesale. Reset first.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Streaming, useValue: new FakeStreaming() },
        { provide: HomeDiagnostics, useValue: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  // Separate hook: these fixtures use fixed dates, and the default 24h window
  // would drop every one of them. Matches the outer suite.
  beforeEach(() => {
    TestBed.inject(ClientPrefs).setHomeWindow('all');
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  /**
   * Boot Home, press "Load more" — which is what asks whether there are any
   * bookmarks — and answer that probe. Nothing asks on plain load, by design.
   *
   * The stored answer is seeded rather than flushed: `BookmarkPresence` is a
   * root singleton that caches a yes forever and a no for a day, which is the
   * whole point of it, so only the first test in a shared realm would see the
   * request. Seeding gives every test the same starting state.
   */
  function setUpWithBookmarks(has: boolean): ComponentFixture<Home> {
    localStorage.setItem('mockingbird_has_bookmarks_v1', JSON.stringify({ has, at: Date.now() }));
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/timelines/home?limit=20').flush([makeStatus('1')]);
    httpMock.expectOne('/api/v1/announcements').flush([]);
    fixture.detectChanges();

    internals(fixture).loadMore();
    // Whatever paging "Load more" did is not what these specs are about; drain
    // it so the assertions can be about the bookmark button alone.
    for (const open of httpMock.match((c) => c.url.startsWith('/api/v1/timelines/home'))) {
      open.flush([]);
    }
    fixture.detectChanges();
    return fixture;
  }

  it('asks nothing about bookmarks until the reader heads for the end of the feed', () => {
    // The constraint: no bookmark call per feed load. A session that never
    // presses "Load more" never asks.
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/timelines/home?limit=20').flush([makeStatus('1')]);
    httpMock.expectOne('/api/v1/announcements').flush([]);
    fixture.detectChanges();

    httpMock.expectNone((c) => c.url === '/api/v1/bookmarks');
    expect(fixture.nativeElement.textContent).not.toContain('Review bookmarks');
  });

  it('offers the pair only when the reader actually has bookmarks', () => {
    const fixture = setUpWithBookmarks(true);
    expect(fixture.nativeElement.textContent).toContain('Review bookmarks');
  });

  it('hides the button rather than showing a dead one', () => {
    const fixture = setUpWithBookmarks(false);
    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('Review bookmarks');
    // The feed's own end-of-feed note is unaffected — only the bookmark half
    // comes off. (This fixture exhausts the timeline, so the note is the
    // "all caught up" one rather than a "Load more" button.)
    expect(text).toContain('You’re all caught up');
  });

  it('appends a page of bookmarks on press, and never before', () => {
    const fixture = setUpWithBookmarks(true);
    // Nothing appended yet: the tail used to arrive uninvited, this does not.
    expect(fixture.nativeElement.textContent).not.toContain('From your bookmarks');

    internals(fixture).reviewBookmarks();
    httpMock
      .expectOne((c) => c.url === '/api/v1/bookmarks' && c.params.get('limit') === '20')
      .flush([makeStatus('b1'), makeStatus('b2')]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('From your bookmarks');
  });

  it('stops offering more once a short page comes back', () => {
    const fixture = setUpWithBookmarks(true);
    internals(fixture).reviewBookmarks();
    // Fewer than the page size: that is the end of the bookmarks.
    httpMock
      .expectOne((c) => c.url === '/api/v1/bookmarks' && c.params.get('limit') === '20')
      .flush([makeStatus('b1')]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Review bookmarks');
  });
});

/**
 * The reading break stays, and stays overridable — from Settings only.
 */
describe('Home, reading break', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    // Spec files share one jsdom realm and one module registry (see
    // docs/shared-jsdom-realm-in-tests.md), so a TestBed left instantiated by
    // the previous suite makes `configureTestingModule` throw here — and every
    // suite after it fails wholesale. Reset first.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Streaming, useValue: new FakeStreaming() },
        { provide: HomeDiagnostics, useValue: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  // Separate hook: these fixtures use fixed dates, and the default 24h window
  // would drop every one of them. Matches the outer suite.
  beforeEach(() => {
    TestBed.inject(ClientPrefs).setHomeWindow('all');
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('stops the feed at the maximum, and says so', () => {
    const prefs = TestBed.inject(ClientPrefs);
    prefs.setFeedMax(5);
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/timelines/home?limit=20')
      .flush(['1', '2', '3', '4', '5', '6'].map(makeStatus));
    httpMock.expectOne('/api/v1/announcements').flush([]);
    fixture.detectChanges();

    internals(fixture).loadMore();
    httpMock.expectOne('/api/v1/bookmarks?limit=1').flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('You’ve had enough for now');
  });

  it('lets a reader who chose to ignore the break keep paging', () => {
    // The override is a Settings decision, not a button at the end of the feed:
    // relabelling "Load more" would be a different label, not real friction.
    const prefs = TestBed.inject(ClientPrefs);
    prefs.setFeedMax(5);
    prefs.setIgnoreFeedCooldown(true);
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/timelines/home?limit=20')
      .flush(['1', '2', '3', '4', '5', '6'].map(makeStatus));
    httpMock.expectOne('/api/v1/announcements').flush([]);
    fixture.detectChanges();

    internals(fixture).loadMore();
    httpMock.expectOne('/api/v1/bookmarks?limit=1').flush([]);
    // The override is on, so paging continues rather than hitting the wall.
    for (const open of httpMock.match((c) => c.url.startsWith('/api/v1/timelines/home'))) {
      open.flush([]);
    }
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('You’ve had enough for now');
    // And the reason it kept going is the setting, not an absent cap.
    expect(internals(fixture).capActive()).toBe(false);
  });
});

describe('Home, first run', () => {
  beforeEach(() => {
    // See docs/shared-jsdom-realm-in-tests.md.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Streaming, useValue: new FakeStreaming() },
        {
          provide: HomeDiagnostics,
          useValue: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        },
      ],
    });
    TestBed.inject(Auth).enterAnonymous();
  });

  afterEach(() => {
    localStorage.clear();
  });

  function render(): ComponentFixture<Home> {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    return fixture;
  }

  it('hides the filter bar and offers one next step when nothing is followed', () => {
    const fixture = render();
    const root = fixture.nativeElement as HTMLElement;

    // Every control in that bar narrows a feed, and there is nothing to narrow.
    expect(root.querySelector('.home-filters')).toBeNull();

    const empty = root.querySelector('.home-empty');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain("you're not following anyone yet");
    expect(empty?.querySelector('a')?.getAttribute('href')).toBe('/find-friends');
  });

  it('brings the filter bar back once something is followed', () => {
    const fixture = render();
    TestBed.inject(AnonymousTags).follow('birds');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.home-filters')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.home-empty')).toBeNull();
  });

  it('reloads the feed when the preview follows are cleared underneath it', () => {
    // The first-run preview follows three accounts so a stranger sees a working
    // timeline instead of a login wall. Answering the modal unfollows them —
    // which used to empty storage while leaving the rendered posts on screen,
    // so they disappeared later at some unrelated navigation. From the
    // visitor's side that is posts vanishing at random.
    const tags = TestBed.inject(AnonymousTags);
    tags.follow('birds');

    const fixture = render();
    const home = fixture.componentInstance as unknown as { load(force?: boolean): void };
    const reload = vi.spyOn(home, 'load');

    tags.unfollow('birds');
    fixture.detectChanges();

    expect(reload).toHaveBeenCalled();
  });
});
