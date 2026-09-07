import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from './auth';
import { authInterceptor } from './auth.interceptor';
import { externalFetch } from './providers/external-fetch';
import { SearchServer, searchServerRequest } from './search-server';
import { Server } from './server';

describe('authInterceptor', () => {
  let httpMock: HttpTestingController;
  let auth: Auth;
  let searchServer: SearchServer;
  let httpClient: HttpClient;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        Auth,
        Server,
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(Auth);
    searchServer = TestBed.inject(SearchServer);
    httpClient = TestBed.inject(HttpClient);
  });

  afterEach(() => httpMock.verify());

  it('attaches a Bearer token when a token is set', () => {
    auth.setToken('my-access-token');

    httpClient.get('/api/v1/timelines/home').subscribe();

    const req = httpMock.expectOne('/api/v1/timelines/home');
    expect(req.request.headers.get('Authorization')).toBe('Bearer my-access-token');
    req.flush([]);
  });

  it('does not add an Authorization header when there is no token', () => {
    // localStorage cleared in beforeEach; no token set
    httpClient.get('/api/v1/timelines/home').subscribe();

    const req = httpMock.expectOne('/api/v1/timelines/home');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
  });

  it('never sends the token to external hosts (RSS feeds etc.)', () => {
    auth.setToken('my-access-token');

    httpClient
      .get('https://example.com/feed.xml', { responseType: 'text', context: externalFetch() })
      .subscribe();

    const req = httpMock.expectOne('https://example.com/feed.xml');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush('<rss/>');
  });

  it('never sends the token to a separately chosen search server', () => {
    auth.setToken('my-access-token');
    searchServer.setBaseUrl('mastodon.social');

    httpClient.get('/api/v2/search', { context: searchServerRequest() }).subscribe();

    const req = httpMock.expectOne('/api/v2/search');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('still authenticates search when no separate search server is configured', () => {
    auth.setToken('my-access-token');

    httpClient.get('/api/v2/search', { context: searchServerRequest() }).subscribe();

    const req = httpMock.expectOne('/api/v2/search');
    expect(req.request.headers.get('Authorization')).toBe('Bearer my-access-token');
    req.flush({});
  });

  it('does not overwrite a caller-supplied Authorization header', () => {
    auth.setToken('my-access-token');

    httpClient
      .get('/api/v1/timelines/home', {
        headers: { Authorization: 'Bearer caller-supplied-token' },
      })
      .subscribe();

    const req = httpMock.expectOne('/api/v1/timelines/home');
    expect(req.request.headers.get('Authorization')).toBe('Bearer caller-supplied-token');
    req.flush([]);
  });

  it('authenticates only the selected instance API, without relying on opt-out contexts', () => {
    TestBed.inject(Server).setBaseUrl('https://social.example');
    auth.setToken('instance-secret');
    const urls = [
      'https://social.example/api/v1/timelines/home',
      'https://social.example.evil.test/api/v1/timelines/home',
      'https://evil.test/api/v1/timelines/home',
      'http://social.example/api/v1/timelines/home',
      'https://social.example:444/api/v1/timelines/home',
      'https://social.example/i18n/en.json',
      new URL('i18n/en.json', document.baseURI).toString(),
    ];
    for (const url of urls) {
      httpClient.get(url).subscribe();
      const request = httpMock.expectOne(url);
      expect(request.request.headers.get('Authorization')).toBe(
        url === urls[0] ? 'Bearer instance-secret' : null,
      );
      request.flush({});
    }
  });

  it('does not authenticate same-origin assets even with a same-origin instance', () => {
    auth.setToken('instance-secret');
    httpClient.get(new URL('i18n/en.json', document.baseURI).toString()).subscribe();
    const request = httpMock.expectOne(new URL('i18n/en.json', document.baseURI).toString());
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });
});
