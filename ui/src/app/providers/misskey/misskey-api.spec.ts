import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../auth';
import { EXTERNAL_FETCH } from '../external-fetch';
import { MisskeyApi, MisskeyApiError } from './misskey-api';
import { saveMisskeyIdentity } from './misskey-identity-store';

describe('MisskeyApi', () => {
  let api: MisskeyApi;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(MisskeyApi);
    http = TestBed.inject(HttpTestingController);
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
    TestBed.inject(Auth).enterMisskey(key);
  }

  it('POSTs to /api/<endpoint> with the token as `i`, outside the Mastodon interceptors', () => {
    signIn();
    let got: unknown;
    api.timeline('local', 'n9', 20).subscribe((notes) => (got = notes));
    const req = http.expectOne('https://misskey.io/api/notes/local-timeline');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ limit: 20, untilId: 'n9', i: 'tok' });
    expect(req.request.context.get(EXTERNAL_FETCH)).toBe(true);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
    expect(got).toEqual([]);
  });

  it('acts as this tab identity even after another tab moves the shared pointer', () => {
    signIn();
    saveMisskeyIdentity(
      {
        server: 'https://other.example',
        userId: 'u9',
        username: 'zed',
        name: null,
        avatarUrl: null,
      },
      { token: 'other-tok' },
      true,
    );
    api.i().subscribe();
    const req = http.expectOne('https://misskey.io/api/i');
    expect(req.request.body).toEqual({ i: 'tok' });
    req.flush({});
  });

  it('omits untilId on the first page and uses the hybrid endpoint for Social', () => {
    signIn();
    api.timeline('social', null).subscribe();
    const req = http.expectOne('https://misskey.io/api/notes/hybrid-timeline');
    expect(req.request.body).toEqual({ limit: 20, i: 'tok' });
    req.flush([]);
  });

  it('fails without a request when no identity is signed in', () => {
    let error: MisskeyApiError | null = null;
    api.note('n1').subscribe({ error: (e: MisskeyApiError) => (error = e) });
    http.expectNone(() => true);
    expect(error!.signInRequired).toBe(true);
  });

  it('sends no token for public meta', () => {
    api.meta('https://misskey.io').subscribe();
    const req = http.expectOne('https://misskey.io/api/meta');
    expect(req.request.body).toEqual({ detail: false });
    req.flush({ name: 'Misskey.io' });
  });

  it('maps Misskey error bodies to a coded error', () => {
    signIn();
    let error: MisskeyApiError | null = null;
    api.note('gone').subscribe({ error: (e: MisskeyApiError) => (error = e) });
    http
      .expectOne('https://misskey.io/api/notes/show')
      .flush(
        { error: { code: 'NO_SUCH_NOTE', message: 'No such note.' } },
        { status: 400, statusText: 'Bad Request' },
      );
    expect(error).toBeInstanceOf(MisskeyApiError);
    expect(error!.code).toBe('NO_SUCH_NOTE');
    expect(error!.status).toBe(400);
    expect(error!.signInRequired).toBe(false);
  });

  it('flags a rejected token as sign-in required', () => {
    signIn();
    let error: MisskeyApiError | null = null;
    api.i().subscribe({ error: (e: MisskeyApiError) => (error = e) });
    http
      .expectOne('https://misskey.io/api/i')
      .flush(
        { error: { code: 'AUTHENTICATION_FAILED' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    expect(error!.signInRequired).toBe(true);
  });

  it('reads profiles, user notes and social notifications', () => {
    signIn();
    api.user({ userId: 'u9' }).subscribe();
    expect(http.expectOne('https://misskey.io/api/users/show').request.body).toEqual({
      userId: 'u9',
      i: 'tok',
    });
    api.userNotes('u9', 'n5').subscribe();
    expect(http.expectOne('https://misskey.io/api/users/notes').request.body).toEqual({
      userId: 'u9',
      limit: 20,
      withReplies: false,
      withRenotes: true,
      untilId: 'n5',
      i: 'tok',
    });
    api.notifications(null).subscribe();
    const req = http.expectOne('https://misskey.io/api/i/notifications');
    expect(req.request.body.includeTypes).toEqual([
      'follow',
      'mention',
      'reply',
      'renote',
      'quote',
      'reaction',
      'receiveFollowRequest',
    ]);
    expect(req.request.body.untilId).toBeUndefined();
  });

  it('checks a MiAuth session at /api/miauth/<session>/check', () => {
    api.miauthCheck('https://misskey.io', 'abc-123').subscribe();
    const req = http.expectOne('https://misskey.io/api/miauth/abc-123/check');
    expect(req.request.method).toBe('POST');
    req.flush({ ok: false });
  });
});
