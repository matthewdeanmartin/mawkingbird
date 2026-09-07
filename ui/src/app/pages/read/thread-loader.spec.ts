import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThreadLoader } from './thread-loader';
import { Auth } from '../../auth';
import { SearchServer } from '../../search-server';
import { Status } from '../../models';
import { anonymousStatusRouteRef } from '../../providers/anonymous/anonymous-route-ref';

const ORIGINAL = 'https://graz.social/@publicvoit/117170026233980502';

const REF = {
  server: 'https://graz.social',
  id: '117170026233980502',
  originalUrl: ORIGINAL,
};

function localStatus(id = 'local-9'): Status {
  return {
    id,
    in_reply_to_id: null,
    url: ORIGINAL,
    content: '<p>The post, in full</p>',
    account: { id: '7', username: 'publicvoit', acct: 'publicvoit@graz.social' },
  } as unknown as Status;
}

/**
 * A post on someone else's server, opened by a reader who does have a home
 * server of their own.
 *
 * The id says "read this from graz.social". Doing that literally means an
 * unauthenticated fetch, which quietly hides followers-only and unlisted posts
 * — a downgrade a signed-in reader never asked for. These ids reach a signed-in
 * session through history, bookmarks and the reader's library, so this is not
 * an edge case.
 */
describe('ThreadLoader resolving a remote post through the home server', () => {
  let httpMock: HttpTestingController;

  function setUp(options: { mastodonToken?: boolean; searchServer?: boolean } = {}): ThreadLoader {
    TestBed.configureTestingModule({
      providers: [
        ThreadLoader,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Auth,
          useValue: { lacksMastodonToken: options.mastodonToken === false },
        },
        { provide: SearchServer, useValue: { active: () => options.searchServer === true } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(ThreadLoader);
  }

  beforeEach(() => {
    localStorage.clear();
  });

  it('asks its own server to resolve the post, rather than fetching it unauthenticated', () => {
    const loader = setUp({ mastodonToken: true });
    loader.load(anonymousStatusRouteRef(REF));

    const search = httpMock.expectOne((r) => r.url === '/api/v2/search');
    expect(search.request.params.get('q')).toBe(ORIGINAL);
    expect(search.request.params.get('resolve')).toBe('true');
    // The whole point: no direct call to the remote server.
    httpMock.expectNone((r) => r.url.startsWith('https://graz.social'));

    search.flush({ accounts: [], statuses: [localStatus()], hashtags: [] });

    expect(loader.status()?.id).toBe('local-9');
    // A local copy is an ordinary status, not a read-only public one.
    expect(loader.isAnonymousPublic()).toBe(false);
  });

  it('loads the conversation with the local id, which sees replies the remote would not show', () => {
    const loader = setUp({ mastodonToken: true });
    loader.load(anonymousStatusRouteRef(REF));

    httpMock
      .expectOne((r) => r.url === '/api/v2/search')
      .flush({ accounts: [], statuses: [localStatus()], hashtags: [] });

    const context = httpMock.expectOne('/api/v1/statuses/local-9/context');
    context.flush({ ancestors: [], descendants: [localStatus('local-10')] });

    expect(loader.descendants()).toHaveLength(1);
  });

  it('falls back to the public fetch when our server does not know the post', () => {
    // Legitimate: a server may simply not federate with that instance. Falling
    // back is strictly better than an error.
    const loader = setUp({ mastodonToken: true });
    loader.load(anonymousStatusRouteRef(REF));

    httpMock
      .expectOne((r) => r.url === '/api/v2/search')
      .flush({ accounts: [], statuses: [], hashtags: [] });

    // Two: the status and its context, which is what the public path does.
    expect(httpMock.match((r) => r.url.startsWith('https://graz.social')).length).toBeGreaterThan(
      0,
    );
    expect(loader.isAnonymousPublic()).toBe(true);
  });

  it('falls back when the resolve request itself fails', () => {
    const loader = setUp({ mastodonToken: true });
    loader.load(anonymousStatusRouteRef(REF));

    httpMock
      .expectOne((r) => r.url === '/api/v2/search')
      .flush('nope', { status: 503, statusText: 'Service Unavailable' });

    // Two: the status and its context, which is what the public path does.
    expect(httpMock.match((r) => r.url.startsWith('https://graz.social')).length).toBeGreaterThan(
      0,
    );
    expect(loader.isAnonymousPublic()).toBe(true);
  });

  it('does not try to resolve without a Mastodon token', () => {
    // Anonymous and Bluesky-primary both land here: there is no home server
    // that could fetch on our behalf.
    const loader = setUp({ mastodonToken: false });
    loader.load(anonymousStatusRouteRef(REF));

    httpMock.expectNone((r) => r.url === '/api/v2/search');
    // Two: the status and its context, which is what the public path does.
    expect(httpMock.match((r) => r.url.startsWith('https://graz.social')).length).toBeGreaterThan(
      0,
    );
  });

  it('does not route a resolve through a separately chosen search server', () => {
    // That host is one we read anonymously by design; it is not ours to ask.
    const loader = setUp({ mastodonToken: true, searchServer: true });
    loader.load(anonymousStatusRouteRef(REF));

    httpMock.expectNone((r) => r.url === '/api/v2/search');
    // Two: the status and its context, which is what the public path does.
    expect(httpMock.match((r) => r.url.startsWith('https://graz.social')).length).toBeGreaterThan(
      0,
    );
  });

  it('reads the post directly when the id carries no original URL to resolve by', () => {
    // The feed-id form has no URL in it; there is nothing to hand the server.
    const loader = setUp({ mastodonToken: true });
    loader.load('anonymous-mastodon:graz.social:117170026233980502');

    httpMock.expectNone((r) => r.url === '/api/v2/search');
    // Two: the status and its context, which is what the public path does.
    expect(httpMock.match((r) => r.url.startsWith('https://graz.social')).length).toBeGreaterThan(
      0,
    );
  });
});
