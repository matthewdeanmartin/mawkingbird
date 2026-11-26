import {
  HttpClient,
  HttpResponse,
  provideHttpClient,
  withInterceptors,
  withXhr,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serverRole } from '../http/server-role';
import { ConnectionMeter } from '../network/connection-meter';
import { accountScopeSuffix, scopeSuffixForToken } from '../session/account-scope';
import { SAVED_COPY_HEADER, readCacheInterceptor } from './read-cache.interceptor';
import {
  MemoryReadCacheStore,
  READ_CACHE_STORE,
  ReadCache,
  evictionPlan,
  isCacheableRead,
  readCacheKey,
} from './read-cache';

describe('read cache rules', () => {
  it('keeps first pages of the reads that matter offline', () => {
    expect(isCacheableRead('/api/v1/timelines/home')).toBe(true);
    expect(isCacheableRead('/api/v1/timelines/home?limit=20')).toBe(true);
    expect(isCacheableRead('/api/v1/notifications?types[]=mention')).toBe(true);
    expect(isCacheableRead('/api/v1/statuses/123/context')).toBe(true);
    expect(isCacheableRead('/api/v1/accounts/42/statuses')).toBe(true);
  });

  it('skips later pages, other endpoints and absolute URLs', () => {
    expect(isCacheableRead('/api/v1/timelines/home?max_id=9')).toBe(false);
    expect(isCacheableRead('/api/v2/search?q=x')).toBe(false);
    expect(isCacheableRead('/api/v1/accounts/42/followers')).toBe(false);
    expect(isCacheableRead('https://mastodon.social/api/v1/timelines/home')).toBe(false);
  });

  it('evicts oldest first until under the limit', () => {
    const metas = [
      { key: 'b', scope: 's', savedAt: 2, size: 40 },
      { key: 'a', scope: 's', savedAt: 1, size: 40 },
      { key: 'c', scope: 's', savedAt: 3, size: 40 },
    ];
    expect(evictionPlan(metas, 200)).toEqual([]);
    expect(evictionPlan(metas, 100)).toEqual(['a']);
    expect(evictionPlan(metas, 30)).toEqual(['a', 'b', 'c']);
  });
});

describe('readCacheInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let store: MemoryReadCacheStore;
  const HOME = '/api/v1/timelines/home';
  const OTHER = scopeSuffixForToken('tok-other');
  let ME = '';

  beforeEach(() => {
    localStorage.clear();
    // A signed-in token gives a real account scope.
    localStorage.setItem('mastodon_mock_token', 'tok-me');
    ME = accountScopeSuffix();
    store = new MemoryReadCacheStore();
    TestBed.configureTestingModule({
      providers: [
        { provide: READ_CACHE_STORE, useValue: store },
        provideHttpClient(withXhr(), withInterceptors([readCacheInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('saves a fresh answer with its Link header', async () => {
    http.get(HOME).subscribe();
    httpMock.expectOne(HOME).flush([{ id: '1' }], { headers: { Link: '<x>; rel="next"' } });
    await settle();
    const saved = store.entries.get(readCacheKey(ME, HOME))!;
    expect(JSON.parse(saved.body)).toEqual([{ id: '1' }]);
    expect(saved.link).toContain('rel="next"');
  });

  it('answers from the saved copy when the network gives no answer', async () => {
    await TestBed.inject(ReadCache).save(ME, HOME, [{ id: 'saved' }], null);
    let body: unknown = null;
    let savedAt: string | null = null;
    http.get(HOME, { observe: 'response' }).subscribe((r: HttpResponse<unknown>) => {
      body = r.body;
      savedAt = r.headers.get(SAVED_COPY_HEADER);
    });
    httpMock.expectOne(HOME).error(new ProgressEvent('error'), { status: 0 });
    await vi.waitFor(() => expect(body).toEqual([{ id: 'saved' }]));
    expect(savedAt).not.toBeNull();
    expect(TestBed.inject(ReadCache).servedSavedAt()).not.toBeNull();
  });

  it.each([429, 500, 503])('shows the saved copy, and says so, on a %s', async (code) => {
    const cache = TestBed.inject(ReadCache);
    await cache.save(ME, HOME, [{ id: 'saved' }], null);
    let body: unknown = null;
    http.get(HOME).subscribe((b) => (body = b));
    httpMock.expectOne(HOME).flush('', { status: code, statusText: 'Boom' });
    await vi.waitFor(() => expect(body).toEqual([{ id: 'saved' }]));
    expect(cache.stale()?.url).toBe(HOME);

    // Another address answering says nothing about this one.
    http.get('/api/v1/lists').subscribe();
    httpMock.expectOne('/api/v1/lists').flush([]);
    expect(cache.stale()).not.toBeNull();
    http.get(HOME).subscribe();
    httpMock.expectOne(HOME).flush([]);
    expect(cache.stale()).toBeNull();
  });

  it.each([
    [HOME, 403],
    [HOME, 404],
    ['/api/v1/accounts/verify_credentials', 503],
  ])('passes on what the server really said: %s %s', async (url, code) => {
    await TestBed.inject(ReadCache).save(ME, url, [{ id: 'saved' }], null);
    let status = -1;
    http.get(url).subscribe({ error: (e) => (status = e.status) });
    httpMock.expectOne(url).flush('', { status: code, statusText: 'No' });
    await settle();
    expect(status).toBe(code);
    expect(TestBed.inject(ReadCache).stale()).toBeNull();
  });

  it('skips the network entirely while offline when a copy exists', async () => {
    await TestBed.inject(ReadCache).save(ME, HOME, [{ id: 'saved' }], null);
    TestBed.inject(ConnectionMeter).hints.set({ online: false });
    let body: unknown = null;
    http.get(HOME).subscribe((b) => (body = b));
    await vi.waitFor(() => expect(body).toEqual([{ id: 'saved' }]));
    httpMock.expectNone(HOME);
  });

  it('keeps accounts apart and leaves other servers alone', async () => {
    await TestBed.inject(ReadCache).save(OTHER, HOME, [{ id: 'theirs' }], null);
    let failed = false;
    http.get(HOME).subscribe({ error: () => (failed = true) });
    httpMock.expectOne(HOME).error(new ProgressEvent('error'), { status: 0 });
    await vi.waitFor(() => expect(failed).toBe(true));

    http.get(HOME, { context: serverRole('peer') }).subscribe();
    httpMock.expectOne(HOME).flush([]);
    await settle();
    expect([...store.entries.keys()].every((k) => k.startsWith(OTHER))).toBe(true);
  });

  it('forgets one account on sign-out', async () => {
    const cache = TestBed.inject(ReadCache);
    await cache.save(ME, HOME, [], null);
    await cache.save(OTHER, HOME, [], null);
    await cache.forgetScope(ME);
    expect([...store.entries.keys()]).toEqual([readCacheKey(OTHER, HOME)]);
  });
});
