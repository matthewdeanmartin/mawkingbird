import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../../models';
import { Profile } from './profile';
import { Auth } from '../../auth';
import { SearchServer } from '../../search-server';
import { anonymousAccountRouteRef } from '../../providers/anonymous/anonymous-route-ref';

const ORIGINAL = 'https://graz.social/@publicvoit';

const REF = { server: 'https://graz.social', id: '900', originalUrl: ORIGINAL };

/** The account as our own server returns it once it has webfingered them. */
function localAccount(): Account {
  return {
    id: 'local-42',
    username: 'publicvoit',
    acct: 'publicvoit@graz.social',
    display_name: 'Public Voit',
    url: ORIGINAL,
    note: '',
    fields: [],
  } as unknown as Account;
}

/**
 * A profile on someone else's server, opened by a reader who has a home server
 * of their own.
 *
 * The same gap `ThreadLoader` had for statuses, and the same consequence: an
 * `anonymous-account.*` id used to dispatch straight to an unauthenticated read
 * of the remote server, which hides followers-only posts from a reader entitled
 * to see them. These ids reach a signed-in session through history and
 * bookmarks, so it is not an edge case.
 */
describe('Profile resolving a remote account through the home server', () => {
  let httpMock: HttpTestingController;

  function setUp(options: { mastodonToken?: boolean; searchServer?: boolean; url?: string } = {}) {
    const routeId = anonymousAccountRouteRef({
      ...REF,
      originalUrl: 'url' in options ? options.url : ORIGINAL,
    });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: routeId })) },
        },
        { provide: SearchServer, useValue: { active: () => options.searchServer === true } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    if (options.mastodonToken !== false) {
      TestBed.inject(Auth).setToken('t');
    } else {
      TestBed.inject(Auth).enterAnonymous('https://graz.social');
    }
    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    return fixture;
  }

  /** The remote reads the public path makes, whatever else happens. */
  const remoteCalls = () =>
    httpMock.match((request) => request.url.startsWith('https://graz.social'));

  beforeEach(() => localStorage.clear());

  afterEach(() => localStorage.clear());

  it('asks its own server to resolve the account, rather than reading it unauthenticated', () => {
    const fixture = setUp();

    const search = httpMock.expectOne((request) => request.url === '/api/v2/search');
    expect(search.request.params.get('q')).toBe(ORIGINAL);
    expect(search.request.params.get('type')).toBe('accounts');
    expect(search.request.params.get('resolve')).toBe('true');
    // The whole point: nothing goes to the remote server.
    httpMock.expectNone((request) => request.url.startsWith('https://graz.social'));

    search.flush({ accounts: [localAccount()], statuses: [], hashtags: [] });

    expect((fixture.componentInstance as any).account().id).toBe('local-42');
    // Resolved means ordinary: no second fetch of the account we were handed.
    httpMock.expectNone('/api/v1/accounts/local-42');
    httpMock.match(() => true).forEach((request) => request.flush([]));
  });

  /**
   * The reason the fix is worth making. Statuses, pinned posts, collections,
   * endorsements and relationships must all follow the resolved id onto the
   * authenticated path — a header that resolved while its timeline stayed
   * anonymous would still be missing the posts.
   */
  it('loads the timeline and everything beside it under our own credentials', () => {
    setUp();
    httpMock
      .expectOne((request) => request.url === '/api/v2/search')
      .flush({ accounts: [localAccount()], statuses: [], hashtags: [] });

    httpMock
      .expectOne(
        (request) =>
          request.url === '/api/v1/accounts/local-42/statuses' && !request.params.has('pinned'),
      )
      .flush([]);
    httpMock
      .expectOne(
        (request) =>
          request.url === '/api/v1/accounts/local-42/statuses' &&
          request.params.get('pinned') === 'true',
      )
      .flush([]);
    httpMock.expectOne('/api/v1/accounts/local-42/collections').flush({ collections: [] });
    httpMock.expectOne('/api/v1/accounts/local-42/endorsements').flush([]);
    httpMock
      .expectOne((request) => request.url === '/api/v1/accounts/relationships')
      .flush([{ id: 'local-42', following: false }]);

    expect(remoteCalls()).toHaveLength(0);
  });

  it('falls back to the public read when our server does not know the account', () => {
    // Legitimate: a server may simply not federate with that instance. Falling
    // back beats an error — the reader keeps whatever the remote will give.
    setUp();
    httpMock
      .expectOne((request) => request.url === '/api/v2/search')
      .flush({ accounts: [], statuses: [], hashtags: [] });

    expect(remoteCalls().length).toBeGreaterThan(0);
  });

  it('falls back when the resolve request itself fails', () => {
    setUp();
    httpMock
      .expectOne((request) => request.url === '/api/v2/search')
      .flush('nope', { status: 503, statusText: 'Service Unavailable' });

    expect(remoteCalls().length).toBeGreaterThan(0);
  });

  it('does not try to resolve without a Mastodon token', () => {
    // Anonymous and Bluesky-primary both land here: there is no home server
    // that could webfinger on our behalf.
    setUp({ mastodonToken: false });

    httpMock.expectNone((request) => request.url === '/api/v2/search');
    expect(remoteCalls().length).toBeGreaterThan(0);
  });

  it('does not route a resolve through a separately chosen search server', () => {
    // That host is one we read anonymously by design; it is not ours to ask.
    setUp({ searchServer: true });

    httpMock.expectNone((request) => request.url === '/api/v2/search');
    expect(remoteCalls().length).toBeGreaterThan(0);
  });

  it('reads the profile directly when the id carries no original URL to resolve by', () => {
    setUp({ url: undefined });

    httpMock.expectNone((request) => request.url === '/api/v2/search');
    expect(remoteCalls().length).toBeGreaterThan(0);
  });
});
