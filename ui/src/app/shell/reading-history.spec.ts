import { By } from '@angular/platform-browser';
import { Location, PlatformLocation, ViewportScroller } from '@angular/common';
import { MockPlatformLocation } from '@angular/common/testing';
import { Component, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  NavigationEnd,
  provideRouter,
  RouteReuseStrategy,
  Router,
  RouterOutlet,
  withInMemoryScrolling,
} from '@angular/router';
import { filter, firstValueFrom, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadingHistory, READING_ROUTES } from './reading-history';
import { ReadingOutlet } from './reading-outlet';

@Injectable()
class Pages {
  cursor = 0;
  next(): number {
    return ++this.cursor;
  }
}

@Component({
  template: `<article>
    <button (click)="more()">More</button>
    @for (post of posts(); track post) {
      <p>{{ post }}</p>
    }
  </article>`,
  providers: [Pages],
})
class Feed {
  readonly pages = inject(Pages);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');
  readonly posts = signal([this.pages.next()]);
  readonly filter = signal('all');
  readonly suspended = vi.fn();
  readonly resumed = vi.fn();
  destroyed = false;
  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
  }
  more(): void {
    this.posts.update((posts) => [...posts, this.pages.next()]);
  }
  suspendReading(): void {
    this.suspended();
  }
  resumeReading(): void {
    this.resumed();
  }
}

@Component({
  imports: [RouterOutlet, ReadingOutlet],
  template: `<main id="main"><router-outlet mbReadingOutlet /></main>`,
})
class Shell {}

describe('reading history across real router navigations', () => {
  let router: Router;
  let location: Location;
  let history: ReadingHistory;
  let fixture: ReturnType<typeof TestBed.createComponent<Shell>>;
  const scroll = {
    getScrollPosition: vi.fn(() => [0, 720]),
    scrollToPosition: vi.fn(),
    scrollToAnchor: vi.fn(),
    setHistoryScrollRestoration: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'home', component: Feed },
            { path: 'nested', component: Shell, children: [{ path: 'home', component: Feed }] },
            { path: 'statuses/:id', component: Feed },
            { path: 'accounts/:id', component: Feed },
            {
              path: 'settings',
              component: Shell,
              children: [{ path: 'notifications', component: Feed }],
            },
            { path: 'blocked', component: Feed, canActivate: [() => false] },
          ],
          withInMemoryScrolling(),
        ),
        { provide: PlatformLocation, useClass: MockPlatformLocation },
        { provide: RouteReuseStrategy, useExisting: ReadingHistory },
        { provide: ViewportScroller, useValue: scroll },
      ],
    });
    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
    history = TestBed.inject(ReadingHistory);
    history.start(router);
    router.setUpLocationChangeListener();
    history.setScope('account-a@server-a');
    fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    vi.clearAllMocks();
  });

  function page(): Feed {
    return fixture.debugElement.query(By.directive(Feed)).componentInstance as Feed;
  }

  async function go(url: string): Promise<Feed> {
    await router.navigateByUrl(url);
    fixture.detectChanges();
    await fixture.whenStable();
    return page();
  }
  async function pop(forward = false, internal = false): Promise<Feed> {
    const ended = firstValueFrom(
      router.events.pipe(filter((event) => event instanceof NavigationEnd)),
    );
    if (internal) history.back();
    else if (forward) location.forward();
    else location.back();
    await ended;
    fixture.detectChanges();
    await fixture.whenStable();
    return page();
  }

  it('preserves trailing slashes, queries and fragments when saving history state', async () => {
    const platform = TestBed.inject(PlatformLocation);
    platform.replaceState({ navigationId: 1 }, '', '/for/readers/?filter=held#reading');
    (router.events as Subject<NavigationEnd>).next(
      new NavigationEnd(1, '/for/readers', '/for/readers'),
    );
    expect(platform.pathname + platform.search + platform.hash).toBe(
      '/for/readers/?filter=held#reading',
    );
    expect(platform.getState()).toEqual(
      expect.objectContaining({
        navigationId: 1,
        readingSession: expect.any(String),
      }),
    );
  });

  it('restores ten loaded pages and continues pagination after thread → profile → thread', async () => {
    const home = await go('/home');
    for (let i = 0; i < 10; i++) home.more();
    home.filter.set('media');
    const thread = await go('/statuses/one');
    const profile = await go('/accounts/alice');
    profile.more();
    await go('/statuses/two');
    expect(await pop(false, true)).toBe(profile);
    expect(profile.posts()).toEqual([1, 2]);
    expect(await pop()).toBe(thread);
    expect(await pop(false, true)).toBe(home);
    expect(home.posts()).toHaveLength(11);
    expect(home.filter()).toBe('media');
    home.more();
    expect(home.posts().at(-1)).toBe(12);
    expect(home.destroyed).toBe(false);
    expect(home.suspended).toHaveBeenCalledOnce();
    expect(home.resumed).toHaveBeenCalledOnce();
  });

  it('preserves Forward and isolates separate visits to the same URL', async () => {
    const original = await go('/home');
    original.more();
    const thread = await go('/statuses/one');
    const second = await go('/home');
    expect(second).not.toBe(original);
    second.more();
    second.more();
    expect(await pop()).toBe(thread);
    expect(await pop()).toBe(original);
    expect(original.posts()).toEqual([1, 2]);
    expect(await pop(true)).toBe(thread);
    expect(await pop(true)).toBe(second);
    expect(second.posts()).toEqual([1, 2, 3]);
  });

  it('keeps profile tabs and photo URL changes mounted, including replaceUrl and Back', async () => {
    const profile = await go('/accounts/alice');
    profile.more();
    expect(await go('/accounts/alice?tab=media')).toBe(profile);
    await router.navigateByUrl('/accounts/alice?tab=media&photo=two', { replaceUrl: true });
    fixture.detectChanges();
    expect(page()).toBe(profile);
    await go('/statuses/one');
    expect(await pop()).toBe(profile);
    expect(profile.posts()).toEqual([1, 2]);
    expect(await pop()).toBe(profile);
    expect(router.url).toBe('/accounts/alice');
    expect(profile.posts()).toEqual([1, 2]);
  });

  it('restores the same retained profile when browser history skips over a photo entry', async () => {
    const profile = await go('/accounts/alice');
    profile.more();
    await go('/accounts/alice?photo=one');
    await go('/statuses/one');
    const ended = firstValueFrom(
      router.events.pipe(filter((event) => event instanceof NavigationEnd)),
    );
    location.historyGo(-2);
    await ended;
    fixture.detectChanges();
    expect(page()).toBe(profile);
    expect(router.url).toBe('/accounts/alice');
    expect(profile.posts()).toEqual([1, 2]);
  });

  it('keeps distinct parameters and query filters in distinct visits', async () => {
    const first = await go('/accounts/alice?tab=media');
    first.more();
    const second = await go('/accounts/bob');
    expect(second.id).toBe('bob');
    expect(await pop()).toBe(first);
    expect(router.url).toBe('/accounts/alice?tab=media');
    expect(first.posts()).toEqual([1, 2]);
  });

  it('destroys the oldest view after ten retained views, and reloads an evicted entry', async () => {
    const oldest = await go('/home');
    for (let i = 0; i < 11; i++) await go(`/statuses/${i}`);
    expect(oldest.destroyed).toBe(true);
    for (let i = 0; i < 11; i++) await pop();
    expect(router.url).toBe('/home');
    expect(page()).not.toBe(oldest);
  });

  it('evicts an oversized retained view even below the ten-view limit', async () => {
    const home = await go('/home');
    const main = fixture.nativeElement.querySelector('main') as HTMLElement;
    const query = main.querySelectorAll.bind(main);
    const spy = vi
      .spyOn(main, 'querySelectorAll')
      .mockImplementation((selector: string) =>
        selector === '*' ? ({ length: 100_001 } as NodeListOf<Element>) : query(selector),
      );
    await go('/statuses/one');
    expect(home.destroyed).toBe(true);
    spy.mockRestore();
    expect(await pop()).not.toBe(home);
  });

  it('destroys retained pages on identity/server change and never restores their private state', async () => {
    const old = await go('/home');
    await go('/statuses/one');
    history.setScope('account-b@server-b');
    expect(old.destroyed).toBe(true);
    expect(await pop()).not.toBe(old);
  });

  it('restores a feed after its surrounding shell was destroyed and recreated', async () => {
    const feed = await go('/nested/home');
    feed.more();
    await go('/statuses/one');
    expect(await pop()).toBe(feed);
    expect(feed.posts()).toEqual([1, 2]);
  });

  it('leaves settings uncached and preserves the preceding feed', async () => {
    const home = await go('/home');
    const settings = await go('/settings/notifications');
    expect(await pop()).toBe(home);
    expect(settings.destroyed).toBe(true);
  });

  it('does not discard a view when a navigation guard cancels leaving', async () => {
    const home = await go('/home');
    home.more();
    expect(await router.navigateByUrl('/blocked')).toBe(false);
    expect(page()).toBe(home);
    await go('/statuses/one');
    expect(await pop()).toBe(home);
    expect(home.posts()).toEqual([1, 2]);
  });

  it('uses a safe home fallback when a thread is opened directly', async () => {
    await go('/statuses/one');
    history.back();
    await fixture.whenStable();
    expect(router.url).toBe('/home');
  });

  it('does not retain a replaced entry that cannot be reached with Back', async () => {
    const home = await go('/home');
    await router.navigateByUrl('/statuses/one', { replaceUrl: true });
    fixture.detectChanges();
    expect(home.destroyed).toBe(true);
  });

  it('restores the viewport on Back instead of resetting it to the top', async () => {
    await go('/home');
    await go('/statuses/one');
    scroll.scrollToPosition.mockClear();
    await pop();
    await vi.waitFor(() => expect(scroll.scrollToPosition).toHaveBeenCalledWith([0, 720]));
  });

  it('covers all existing feed families, profiles and thread variants', () => {
    for (const path of [
      'home',
      'public',
      'notifications',
      'search',
      'bookmarks',
      'rss',
      'feeds/:feed',
      'feeds/servers/:server/:feed',
      'feeds/bluesky/:ref',
      'lists/:id',
      'client-lists/:id',
      'tag-bundles/:id',
      'tags/:tag',
      'misskey/:kind/:id',
      'link',
      'forum',
      'forum/d/:id',
      'videos/fedi',
      'statuses/:id',
      'accounts/:id',
      'accounts/:id/:handle',
    ]) {
      expect(READING_ROUTES.has(path), path).toBe(true);
    }
  });
});
