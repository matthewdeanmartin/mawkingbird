import { provideHttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { misskeyPrimaryMatch } from '../../providers/misskey/misskey-route.guard';
import { saveMisskeyIdentity } from '../../providers/misskey/misskey-identity-store';
import { MkNote } from '../../providers/misskey/misskey-types';
import { misskeyProfileRoute } from '../../status-card/status-card';
import { MisskeySearch, parseHandle } from './misskey-search';

const SERVER = 'https://misskey.design';
const api = (endpoint: string) => `${SERVER}/api/${endpoint}`;
const user = { id: 'u9', name: 'Ai', username: 'ai', host: null, avatarUrl: null };
const note = (id: string, text = `note ${id}`): MkNote => ({
  id,
  createdAt: '2026-11-10T10:00:00.000Z',
  text,
  user,
  userId: 'u9',
  visibility: 'public',
});

@Component({ selector: 'app-other-search', template: '' })
class OtherSearch {}

describe('Misskey search (M3)', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'search', canMatch: [misskeyPrimaryMatch], component: MisskeySearch },
          { path: 'search', component: OtherSearch },
        ]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const key = saveMisskeyIdentity(
      { server: SERVER, userId: 'u1', username: 'me', name: null, avatarUrl: null },
      { token: 'tok' },
    );
    TestBed.inject(Auth).enterMisskey(key);
    harness = await RouterTestingHarness.create();
  });
  afterEach(() => localStorage.clear());

  async function open(url: string): Promise<ComponentFixture<unknown>> {
    await harness.navigateByUrl(url);
    http.expectOne(api('hashtags/trend')).flush([{ tag: '絵', usersCount: 12 }]);
    return harness.fixture;
  }

  const text = () => (harness.routeNativeElement as HTMLElement).textContent ?? '';

  it('is the search page for a Misskey account, with trending tags before a search', async () => {
    await open('/search');
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('.mk-search')).not.toBeNull();
    expect(text()).toContain('#絵');
  });

  it('searches notes on the Misskey server', async () => {
    await open('/search?q=%E7%8C%AB');
    const req = await vi.waitFor(() => http.expectOne(api('notes/search')));
    expect(req.request.body).toMatchObject({ query: '猫', limit: 20, i: 'tok' });
    req.flush([note('n1', 'ねこ')]);
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(text()).toContain('ねこ');
    });
  });

  it('searches a #hashtag by tag, which works even where note search is off', async () => {
    await open('/search?q=%23art');
    const req = await vi.waitFor(() => http.expectOne(api('notes/search-by-tag')));
    expect(req.request.body).toMatchObject({ tag: 'art' });
    req.flush([]);
  });

  it('says so when the server has note search switched off', async () => {
    await open('/search?q=hello');
    (await vi.waitFor(() => http.expectOne(api('notes/search')))).flush(
      { error: { code: 'UNAVAILABLE', message: 'Search of notes unavailable.' } },
      { status: 400, statusText: 'Bad Request' },
    );
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(text()).toContain('Note search is switched off on misskey.design');
    });
  });

  it('finds people and looks up an @user@host handle', async () => {
    await open('/search?q=%40ai%40misskey.io&type=users');
    const lookup = await vi.waitFor(() => http.expectOne(api('users/show')));
    expect(lookup.request.body).toMatchObject({ username: 'ai', host: 'misskey.io' });
    lookup.flush({ ...user, host: 'misskey.io' });
    const search = await vi.waitFor(() => http.expectOne(api('users/search')));
    expect(search.request.body).toMatchObject({ query: 'ai', origin: 'combined' });
    search.flush([user]);
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(text()).toContain('Open the profile of @ai@misskey.io');
    });
  });

  it('lists matching hashtags', async () => {
    await open('/search?q=%E7%B5%B5&type=tags');
    (await vi.waitFor(() => http.expectOne(api('hashtags/search')))).flush([
      '絵',
      '絵描きさんと繋がりたい',
    ]);
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(text()).toContain('#絵描きさんと繋がりたい');
    });
  });

  it('leaves /search to the shared page for other accounts', async () => {
    TestBed.inject(Auth).enterAnonymous();
    await harness.navigateByUrl('/search');
    expect(harness.routeDebugElement?.componentInstance).toBeInstanceOf(OtherSearch);
    expect(TestBed.inject(Router).url).toBe('/search');
  });
});

describe('parseHandle', () => {
  it('reads @user and @user@host, and nothing else', () => {
    expect(parseHandle('@ai')).toEqual({ username: 'ai', host: null });
    expect(parseHandle('@ai@misskey.io')).toEqual({ username: 'ai', host: 'misskey.io' });
    expect(parseHandle('ai')).toBeNull();
    expect(parseHandle('@ai hello')).toBeNull();
  });
});

describe('misskeyProfileRoute', () => {
  it('routes server profile links (mentions) to the in-app Misskey profile', () => {
    expect(misskeyProfileRoute('https://misskey.design/@ai')).toEqual(['/accounts', 'mk:@ai']);
    expect(misskeyProfileRoute('https://misskey.design/@ai@misskey.io')).toEqual([
      '/accounts',
      'mk:@ai@misskey.io',
    ]);
    // The server's own host is local.
    expect(misskeyProfileRoute('https://misskey.design/@ai@misskey.design')).toEqual([
      '/accounts',
      'mk:@ai',
    ]);
    expect(misskeyProfileRoute('https://misskey.design/notes/abc')).toBeNull();
    expect(misskeyProfileRoute('not a url')).toBeNull();
  });
});
