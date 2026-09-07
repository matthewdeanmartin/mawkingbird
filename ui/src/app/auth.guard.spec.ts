import { TestBed } from '@angular/core/testing';
import { provideRouter, UrlTree } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Auth } from './auth';
import { authGuard } from './auth.guard';
import { Server } from './server';

describe('authGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [Auth, Server, provideRouter([])],
    });
  });

  it('returns true when the user is authenticated', () => {
    const auth = TestBed.inject(Auth);
    auth.setToken('test-token');

    const result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));

    expect(result).toBe(true);
  });

  it('returns true for the local Anonymous account', () => {
    const auth = TestBed.inject(Auth);
    auth.enterAnonymous('https://mastodon.social');

    const result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));

    expect(result).toBe(true);
  });

  it.each([
    '/read/112469071892317602',
    '/statuses/123',
    '/accounts/123/@ann@example.com',
    '/tags/books',
  ])('opens public content anonymously on a fresh browser: %s', (url) => {
    const result = TestBed.runInInjectionContext(() => authGuard({} as any, { url } as any));
    expect(result).toBe(true);
    expect(TestBed.inject(Auth).isAnonymous).toBe(true);
    expect(TestBed.inject(Server).baseUrl()).toBe('https://mastodon.social');
  });

  it('preserves the chosen instance for a legacy numeric content link', () => {
    TestBed.inject(Server).setBaseUrl('https://example.social');
    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as any, { url: '/read/123' } as any),
    );
    expect(result).toBe(true);
    expect(TestBed.inject(Server).baseUrl()).toBe('https://example.social');
  });

  it('keeps private routes behind the front door', () => {
    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as any, { url: '/settings/profile' } as any),
    );
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Auth).isAnonymous).toBe(false);
  });

  /**
   * The front page, not the login page. A visitor with no account is a stranger
   * who has not yet been told what this app is, and the old destination opened
   * on a server picker and an OAuth scope group. `/` offers both doors.
   */
  it('sends an unauthenticated visitor to the front page, not a login form', () => {
    // Ensure no token is set (localStorage cleared in beforeEach)
    const auth = TestBed.inject(Auth);
    auth.logoutAll();

    const result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/');
  });
});
