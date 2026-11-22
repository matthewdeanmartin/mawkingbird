import { provideHttpClient } from '@angular/common/http';
import { HttpRequest } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { READ_CACHE_STORE, MemoryReadCacheStore, ReadCache } from '../platform/offline/read-cache';
import { accountScopeSuffix } from '../platform/session/account-scope';
import { LiteStore } from './lite-store';
import { Auth } from '../platform/session/auth';
import { LiteHome, LiteNotifications, LiteProfile, LiteSearch, LiteThread } from './lite-pages';
import { LitePrefs } from './lite-prefs';
import { LiteShell } from './lite-shell';
import { LITE_ROUTES } from './lite.routes';
import { WritePage } from '../publishing/write/write-page';

function status(id: string, text = `post ${id}`, accountId = 'a1') {
  return {
    id,
    created_at: '2026-11-21T10:00:00.000Z',
    content: `<p>${text}</p>`,
    visibility: 'public',
    url: `https://example.social/@a/${id}`,
    uri: `https://example.social/statuses/${id}`,
    account: {
      id: accountId,
      username: 'alice',
      acct: 'alice',
      display_name: 'Alice',
      avatar: '',
      url: 'https://example.social/@alice',
      followers_count: 1,
      following_count: 1,
      statuses_count: 1,
      emojis: [],
      fields: [],
    },
    media_attachments: [],
    mentions: [],
    tags: [],
    emojis: [],
    reblogs_count: 0,
    favourites_count: 0,
    replies_count: 0,
    spoiler_text: '',
    sensitive: false,
  };
}

describe('Lite pages', () => {
  let httpMock: HttpTestingController;
  const params = new BehaviorSubject(convertToParamMap({}));
  const query = new BehaviorSubject(convertToParamMap({}));

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: READ_CACHE_STORE, useValue: new MemoryReadCacheStore() },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: params,
            queryParamMap: query,
            snapshot: { paramMap: convertToParamMap({}), queryParamMap: convertToParamMap({}) },
          },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(Auth).setToken('lite-reader');
  });

  afterEach(() => {
    httpMock.match(() => true);
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  function render<T>(component: Type<T>): ComponentFixture<T> {
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    return fixture;
  }

  /** Lite starts loading a moment after a screen appears; wait for the request. */
  async function request(
    match: string | ((r: HttpRequest<unknown>) => boolean),
  ): Promise<TestRequest> {
    return vi.waitFor(() => httpMock.expectOne(match as string));
  }
  const HOME = (r: HttpRequest<unknown>) => r.url === '/api/v1/timelines/home';

  it('Home makes one request per page and loads more only when asked', async () => {
    const f = render(LiteHome);
    const first = await request(HOME);
    expect(first.request.params.get('limit')).toBe('20');
    first.flush([status('2'), status('1')]);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('app-status-card')).toHaveLength(2);
    httpMock.expectNone(HOME);

    (el.querySelector('button.more') as HTMLButtonElement).click();
    const second = httpMock.expectOne(HOME);
    expect(second.request.params.get('max_id')).toBe('1');
    second.flush([]);
    f.detectChanges();
    expect(el.textContent).toContain("That's everything");
  });

  it('Home has the quick composer; Write is the full writer', async () => {
    const f = render(LiteHome);
    expect(
      (f.nativeElement as HTMLElement).querySelector('.lite-quick-compose app-compose'),
    ).not.toBeNull();
    const write = LITE_ROUTES.find((r) => r.path === 'write')!;
    expect(await (write.loadComponent as () => Promise<unknown>)()).toBe(WritePage);
  });

  it('holds Home for the visit: coming back shows it at once with no request', async () => {
    const first = render(LiteHome);
    (await request(HOME)).flush([status('2'), status('1')]);
    first.destroy();

    const again = render(LiteHome);
    await new Promise((resolve) => setTimeout(resolve, 0));
    httpMock.expectNone(HOME);
    expect((again.nativeElement as HTMLElement).querySelectorAll('app-status-card')).toHaveLength(
      2,
    );
  });

  it('Refresh reloads the screen on display and keeps it visible meanwhile', async () => {
    const f = render(LiteHome);
    (await request(HOME)).flush([status('1')]);
    f.detectChanges();
    TestBed.inject(LiteStore).refresh();
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('app-status-card')).toHaveLength(1);
    expect(el.textContent).toContain('Getting the newest');
    const fresh = httpMock.expectOne(HOME);
    expect(fresh.request.params.has('max_id')).toBe(false);
    fresh.flush([status('3'), status('2'), status('1')]);
    f.detectChanges();
    expect(el.querySelectorAll('app-status-card')).toHaveLength(3);
  });

  async function saveHome(items: unknown[], ageMs: number): Promise<void> {
    const scope = accountScopeSuffix();
    await TestBed.inject(ReadCache).save(scope, '/api/v1/timelines/home?limit=20', items, null);
    const memory = TestBed.inject(READ_CACHE_STORE) as MemoryReadCacheStore;
    for (const entry of memory.entries.values()) entry.savedAt = Date.now() - ageMs;
  }

  it('shows a fresh saved copy at once and makes no request for it', async () => {
    await saveHome([status('5')], 60_000);
    const f = render(LiteHome);
    await new Promise((resolve) => setTimeout(resolve, 0));
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelectorAll('app-status-card')).toHaveLength(1);
    httpMock.expectNone(HOME);
  });

  it('checks a stale saved copy once in the background, then merges the newest', async () => {
    await saveHome([status('5')], 10 * 60_000);
    const f = render(LiteHome);
    const live = await request(HOME);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('app-status-card')).toHaveLength(1);
    expect(el.textContent).toContain('Showing a copy saved');
    live.flush([status('6'), status('5')]);
    f.detectChanges();
    expect(el.querySelectorAll('app-status-card')).toHaveLength(2);
  });

  it('does not check a stale saved copy when updates are set to Refresh only', async () => {
    TestBed.inject(LitePrefs).set('refresh', 'manual');
    await saveHome([status('5')], 10 * 60_000);
    render(LiteHome);
    await new Promise((resolve) => setTimeout(resolve, 0));
    httpMock.expectNone(HOME);
  });

  it('keeps the reader in place: newer posts wait behind the pill when scrolled down', async () => {
    const f = render(LiteHome);
    (await request(HOME)).flush([status('2'), status('1')]);
    f.detectChanges();
    const scroll = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(800);
    TestBed.inject(LiteStore).refresh();
    f.detectChanges();
    httpMock.expectOne(HOME).flush([status('4'), status('3'), status('2'), status('1')]);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('app-status-card')).toHaveLength(2);
    const pill = [...el.querySelectorAll('button')].find((b) =>
      b.textContent!.includes('New posts'),
    );
    expect(pill?.textContent).toContain('2');
    scroll.mockReturnValue(0);
    pill!.click();
    f.detectChanges();
    expect(el.querySelectorAll('app-status-card')).toHaveLength(4);
  });

  it('marks a gap when the newest page does not reach the posts already held', async () => {
    const f = render(LiteHome);
    (await request(HOME)).flush([status('2'), status('1')]);
    TestBed.inject(LiteStore).refresh();
    f.detectChanges();
    httpMock.expectOne(HOME).flush([status('40'), status('39')]);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('app-status-card')).toHaveLength(4);
    expect(el.textContent).toContain("weren't loaded");
  });

  it('opens a thread from the feed with the post already on screen and fetches only replies', async () => {
    const home = render(LiteHome);
    (await request(HOME)).flush([status('9')]);
    home.destroy();
    params.next(convertToParamMap({ id: '9' }));
    const f = render(LiteThread);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('app-status-card')).toHaveLength(1);
    (await request('/api/v1/statuses/9/context')).flush({
      ancestors: [status('8')],
      descendants: [],
    });
    httpMock.expectNone('/api/v1/statuses/9');
    f.detectChanges();
    expect(el.querySelectorAll('app-status-card')).toHaveLength(2);
  });

  it('opens a profile from a tapped author without asking for the account again', async () => {
    const home = render(LiteHome);
    (await request(HOME)).flush([status('9', 'hello', '42')]);
    home.destroy();
    params.next(convertToParamMap({ id: '42' }));
    const f = render(LiteProfile);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain('Alice');
    httpMock.expectNone('/api/v1/accounts/42');
    await request((r) => r.url === '/api/v1/accounts/42/statuses');
  });

  it('keeps what it has when a refresh fails, and says so', async () => {
    const f = render(LiteHome);
    (await request(HOME)).flush([status('1')]);
    TestBed.inject(LiteStore).refresh();
    f.detectChanges();
    httpMock.expectOne(HOME).flush('', { status: 503, statusText: 'Unavailable' });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('app-status-card')).toHaveLength(1);
    expect(el.textContent).toContain("Couldn't get anything newer");
  });

  it('Notifications show one line per event and the post underneath, with padding while loading', async () => {
    const f = render(LiteNotifications);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('app-lite-status .lite-status')?.textContent).toContain('Loading');
    (await request((r) => r.url === '/api/v1/notifications')).flush([
      {
        id: 'n1',
        type: 'favourite',
        created_at: '2026-11-21T10:00:00.000Z',
        account: status('x').account,
        status: status('9'),
      },
    ]);
    f.detectChanges();
    expect(el.textContent).toContain('Alice favourited your post');
    expect(el.querySelectorAll('app-status-card')).toHaveLength(1);
  });

  it('A thread it has never seen loads the post and its replies separately', async () => {
    params.next(convertToParamMap({ id: '9' }));
    const f = render(LiteThread);
    (await request('/api/v1/statuses/9')).flush(status('9'));
    (await request('/api/v1/statuses/9/context')).flush({
      ancestors: [status('8')],
      descendants: [status('10')],
    });
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelectorAll('app-status-card')).toHaveLength(3);
  });

  it('Search runs the query in the address and links people into Lite', async () => {
    query.next(convertToParamMap({ q: 'birds' }));
    const f = render(LiteSearch);
    const req = await request((r) => r.url === '/api/v2/search');
    expect(req.request.params.get('q')).toBe('birds');
    req.flush({ accounts: [status('x').account], hashtags: [{ name: 'birds' }], statuses: [] });
    f.detectChanges();
    const links = [...(f.nativeElement as HTMLElement).querySelectorAll('a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toContain('/m/accounts/a1');
    expect(links).toContain('/m/tags/birds');
  });

  it('The shell names every destination with the full app’s short names, no More menu', () => {
    const f = render(LiteShell);
    const el = f.nativeElement as HTMLElement;
    const labels = [...el.querySelectorAll('nav.lite-nav a')].map((a) => a.textContent!.trim());
    expect(labels).toEqual([
      'Home',
      'Inbox',
      'Chat',
      'Search',
      'Write',
      'Lists',
      'Bookmarks',
      'Radio',
      'Videos',
    ]);
    expect(el.querySelector('nav details')).toBeNull();
  });

  it('The shell says Lite is Mastodon-only for other accounts', () => {
    TestBed.inject(Auth).kind.set(null);
    const f = render(LiteShell);
    expect((f.nativeElement as HTMLElement).textContent).toContain('signed-in Mastodon account');
  });
});
