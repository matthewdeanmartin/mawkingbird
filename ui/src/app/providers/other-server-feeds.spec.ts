import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { OtherServerFeeds } from './other-server-feeds';
import { EXTERNAL_FETCH } from './external-fetch';
import { Auth } from '../auth';
import { Server } from '../server';
import { authInterceptor } from '../auth.interceptor';
import { Status } from '../models';
import { otherServerHost } from '../other-server-url';

describe('Other server public feeds', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(Server).setBaseUrl('https://home.example');
    TestBed.inject(Auth).setToken('home-token');
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('reads another server without sending the home token or changing the active instance', () => {
    let statuses: Status[] = [];
    TestBed.inject(OtherServerFeeds)
      .statuses('FOOBAR.SOCIAL', 'local', '42')
      .subscribe((result) => (statuses = result));
    const request = http.expectOne(
      (req) => req.url === 'https://foobar.social/api/v1/timelines/public',
    );
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.context.get(EXTERNAL_FETCH)).toBe(true);
    expect(request.request.params.get('local')).toBe('true');
    expect(request.request.params.get('max_id')).toBe('42');
    request.flush([
      {
        id: '41',
        account: { id: '7', username: 'alice', acct: 'alice' },
        reblog: null,
        in_reply_to_id: null,
      },
    ]);
    expect(statuses[0].id).toBe('anonymous-mastodon:foobar.social:41');
    expect(statuses[0].providerRef).toEqual({
      server: 'https://foobar.social',
      statusId: '41',
      accountId: '7',
    });
    expect(statuses[0].account.acct).toBe('alice@foobar.social');
    expect(TestBed.inject(Server).baseUrl()).toBe('https://home.example');
    expect(TestBed.inject(Auth).token()).toBe('home-token');
  });

  it('keeps public reads unauthenticated even when the chosen host is the signed-in host', () => {
    TestBed.inject(OtherServerFeeds).news('home.example').subscribe();
    const request = http.expectOne('https://home.example/api/v1/trends/links');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush([]);
  });

  it('uses the federated and discovery endpoints without a local filter', () => {
    const service = TestBed.inject(OtherServerFeeds);
    service.statuses('foo.social', 'federated').subscribe();
    const federated = http.expectOne((req) => req.url.endsWith('/timelines/public'));
    expect(federated.request.params.has('local')).toBe(false);
    federated.flush([]);
    service.statuses('foo.social', 'trending').subscribe();
    http.expectOne((req) => req.url.endsWith('/trends/statuses')).flush([]);
  });

  it.each([
    'bad/path',
    'user@server.social',
    'foo.social?x=y',
    'https://foo.social/path',
    'foo.social\\path',
    'javascript:alert(1)',
  ])('rejects an invalid server before a request: %s', (host) => {
    expect(otherServerHost(host)).toBeNull();
    expect(() => TestBed.inject(OtherServerFeeds).news(host)).toThrow();
    http.expectNone(() => true);
  });
});
