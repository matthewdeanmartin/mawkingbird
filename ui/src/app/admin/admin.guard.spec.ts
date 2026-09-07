import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Api } from '../api';
import { Auth } from '../auth';
import { Account, Role } from '../models';
import { Server } from '../server';
import { adminGuard } from './admin.guard';

/** Minimal Account stub with a role field. */
function makeAccount(roleName: string): Account {
  const role: Role = { id: '1', name: roleName, permissions: '0', highlighted: false };
  return {
    id: '1',
    username: 'tester',
    acct: 'tester',
    display_name: 'Tester',
    note: '',
    url: '',
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: [],
    role,
  } as Account;
}

describe('adminGuard', () => {
  let httpMock: HttpTestingController;
  let auth: Auth;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        Auth,
        Server,
        Api,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(Auth);
  });

  afterEach(() => httpMock.verify());

  it('returns true when the authenticated account has a non-empty role name', async () => {
    auth.setToken('admin-token');
    auth.setAccount(makeAccount('admin'));

    const result = await TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));

    expect(result).toBe(true);
  });

  it('returns a UrlTree for /home when the account role name is empty', async () => {
    auth.setToken('user-token');
    auth.setAccount(makeAccount(''));

    const result = await TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/home');
  });

  it('fetches verify_credentials when account is null, then grants access for staff', async () => {
    auth.setToken('admin-token');
    // account() is null — simulate a deep link before the account was loaded
    expect(auth.account()).toBeNull();

    const guardPromise = firstValueFrom(
      TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any)) as any,
    );

    // The guard should issue a verify_credentials request
    const req = httpMock.expectOne('/api/v1/accounts/verify_credentials');
    req.flush(makeAccount('moderator'));

    const result = await guardPromise;
    expect(result).toBe(true);
    // setAccount should have been called
    expect(auth.account()?.role?.name).toBe('moderator');
  });

  it('fetches verify_credentials when account is null, then redirects non-staff to /home', async () => {
    auth.setToken('user-token');
    expect(auth.account()).toBeNull();

    const guardPromise = firstValueFrom(
      TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any)) as any,
    );

    const req = httpMock.expectOne('/api/v1/accounts/verify_credentials');
    req.flush(makeAccount(''));

    const result = await guardPromise;
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/home');
  });

  // Straight to the Mastodon page, past the network chooser: getting here means an
  // existing Mastodon token failed verification, so there is nothing to choose.
  it('redirects to /login/mastodon on HTTP error during verify_credentials', async () => {
    auth.setToken('stale-token');
    expect(auth.account()).toBeNull();

    const guardPromise = firstValueFrom(
      TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any)) as any,
    );

    const req = httpMock.expectOne('/api/v1/accounts/verify_credentials');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    const result = await guardPromise;
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/login/mastodon');
  });
});
