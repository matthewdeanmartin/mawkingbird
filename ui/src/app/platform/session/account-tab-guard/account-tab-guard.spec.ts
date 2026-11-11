import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../auth';
import { authInterceptor } from '../../http/auth.interceptor';
import { Server } from '../../http/server';
import { AccountTabGuard, TAB_ACCOUNT_KEY } from './account-tab-guard';

const TOKEN_KEY = 'mastodon_mock_token';

describe('AccountTabGuard', () => {
  let httpMock: HttpTestingController;

  function setUp(): { auth: Auth; guard: AccountTabGuard; http: HttpClient } {
    TestBed.configureTestingModule({
      providers: [
        Auth,
        Server,
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    return {
      auth: TestBed.inject(Auth),
      guard: TestBed.inject(AccountTabGuard),
      http: TestBed.inject(HttpClient),
    };
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  it('lets writes through while storage names this tab’s account', () => {
    const { auth, http } = setUp();
    auth.setToken('personal');
    http.post('/api/v1/statuses/1/favourite', {}).subscribe();
    const req = httpMock.expectOne('/api/v1/statuses/1/favourite');
    expect(req.request.headers.get('Authorization')).toBe('Bearer personal');
    req.flush({});
  });

  it('blocks a like after another tab switched accounts, and says so', () => {
    const { auth, guard, http } = setUp();
    auth.setToken('personal');
    // The other tab's switch: storage moves, this tab's memory does not.
    localStorage.setItem(TOKEN_KEY, 'work');
    let failure: unknown;
    http.post('/api/v1/statuses/1/favourite', {}).subscribe({ error: (e) => (failure = e) });
    httpMock.expectNone('/api/v1/statuses/1/favourite');
    expect(failure).toBeInstanceOf(HttpErrorResponse);
    expect(guard.conflict()?.reason).toBe('other-tab');
  });

  it('never blocks reads, so the stale tab can still be looked at', () => {
    const { auth, http } = setUp();
    auth.setToken('personal');
    localStorage.setItem(TOKEN_KEY, 'work');
    http.get('/api/v1/timelines/home').subscribe();
    httpMock.expectOne('/api/v1/timelines/home').flush([]);
  });

  it('clears the other-tab notice once storage agrees again', () => {
    const { auth, guard } = setUp();
    auth.setToken('personal');
    localStorage.setItem(TOKEN_KEY, 'work');
    guard.refresh();
    expect(guard.conflict()?.reason).toBe('other-tab');
    localStorage.setItem(TOKEN_KEY, 'personal');
    guard.refresh();
    expect(guard.conflict()).toBeNull();
  });

  it('pauses writes when a reloaded tab comes back as a different account', () => {
    localStorage.setItem(TOKEN_KEY, 'work');
    localStorage.setItem('mastodon_mock_account_mode', 'mastodon');
    sessionStorage.setItem(
      TAB_ACCOUNT_KEY,
      JSON.stringify({ key: 'mastodon:00000000', handle: 'personal' }),
    );
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { type: 'reload' } as unknown as PerformanceEntry,
    ]);
    const { guard, http } = setUp();
    expect(guard.conflict()).toMatchObject({ reason: 'restored', loadedAs: 'personal' });
    http.post('/api/v1/statuses', {}).subscribe({ error: () => undefined });
    httpMock.expectNone('/api/v1/statuses');

    guard.continueAsActive();
    expect(guard.conflict()).toBeNull();
    http.post('/api/v1/statuses', {}).subscribe();
    httpMock.expectOne('/api/v1/statuses').flush({});
  });

  it('does not treat a fresh navigation (an OAuth return) as a restore', () => {
    localStorage.setItem(TOKEN_KEY, 'work');
    localStorage.setItem('mastodon_mock_account_mode', 'mastodon');
    sessionStorage.setItem(TAB_ACCOUNT_KEY, JSON.stringify({ key: 'none', handle: null }));
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { type: 'navigate' } as unknown as PerformanceEntry,
    ]);
    const { guard } = setUp();
    expect(guard.conflict()).toBeNull();
  });

  it('records a hash, never the token, for the tab', () => {
    const { auth } = setUp();
    auth.setToken('secret-token-value');
    TestBed.tick();
    const stored = sessionStorage.getItem(TAB_ACCOUNT_KEY) ?? '';
    expect(stored).toContain('mastodon:');
    expect(stored).not.toContain('secret-token-value');
  });
});
