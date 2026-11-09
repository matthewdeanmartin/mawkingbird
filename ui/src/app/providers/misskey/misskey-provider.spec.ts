import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../auth';
import { saveMisskeyIdentity } from './misskey-identity-store';
import { MisskeyProvider } from './misskey-provider';
import { MkNote } from './misskey-types';

function note(id: string): MkNote {
  return {
    id,
    createdAt: '2026-11-09T10:00:00.000Z',
    text: `note ${id}`,
    user: { id: 'u1', name: null, username: 'alice', host: null, avatarUrl: null },
    userId: 'u1',
    visibility: 'public',
  };
}

describe('MisskeyProvider', () => {
  let provider: MisskeyProvider;
  let http: HttpTestingController;
  let auth: Auth;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(Auth);
    provider = TestBed.inject(MisskeyProvider);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  function signIn(): void {
    const key = saveMisskeyIdentity(
      {
        server: 'https://misskey.io',
        userId: 'u1',
        username: 'alice',
        name: null,
        avatarUrl: null,
      },
      { token: 'tok' },
    );
    auth.enterMisskey(key);
  }

  /** Flush the next timeline request once the lazy adapter import has settled. */
  async function page(notes: MkNote[], endpoint = 'notes/timeline'): Promise<unknown> {
    const result = firstValueFrom(provider.fetchPage());
    http.expectOne(`https://misskey.io/api/${endpoint}`).flush(notes);
    return result;
  }

  it('is linked only while a Misskey identity is active', () => {
    expect(provider.linked()).toBe(false);
    signIn();
    expect(provider.linked()).toBe(true);
    auth.enterAnonymous();
    expect(provider.linked()).toBe(false);
  });

  it('returns nothing and makes no request when signed out', async () => {
    expect(await firstValueFrom(provider.fetchPage())).toEqual([]);
  });

  it('pages backwards with untilId and adapts notes', async () => {
    signIn();
    provider.reset();
    const first = (await page([note('n3'), note('n2')])) as { id: string }[];
    expect(first.map((s) => s.id)).toEqual(['mk:n3', 'mk:n2']);
    const second = firstValueFrom(provider.fetchPage());
    const req = http.expectOne('https://misskey.io/api/notes/timeline');
    expect(req.request.body.untilId).toBe('n2');
    req.flush([]);
    expect(await second).toEqual([]);
    // Exhausted: no further request.
    expect(await firstValueFrom(provider.fetchPage())).toEqual([]);
  });

  it('reads the chosen timeline and remembers it per account', async () => {
    signIn();
    provider.setTimeline('local');
    provider.reset();
    expect(provider.timeline()).toBe('local');
    await page([], 'notes/local-timeline');
  });

  it('records errors and flags a rejected token for sign-in', async () => {
    signIn();
    provider.reset();
    const result = firstValueFrom(provider.fetchPage()).catch((e: unknown) => e);
    http
      .expectOne('https://misskey.io/api/notes/timeline')
      .flush(
        { error: { code: 'AUTHENTICATION_FAILED' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await result;
    expect(provider.errors().length).toBe(1);
    expect(provider.authenticationFailed()).toBe(true);
  });
});
