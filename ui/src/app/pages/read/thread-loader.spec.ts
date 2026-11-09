import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadLoader } from './thread-loader';
import { ThreadPreload } from './thread-preload';
import { Auth } from '../../auth';
import { SearchServer } from '../../search-server';
import { Status } from '../../models';
import { anonymousStatusRouteRef } from '../../providers/anonymous/anonymous-route-ref';
import { saveMisskeyIdentity } from '../../providers/misskey/misskey-identity-store';

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

describe('ThreadLoader with a preloaded thread', () => {
  let httpMock: HttpTestingController;
  let loader: ThreadLoader;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ThreadLoader,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Auth, useValue: { lacksMastodonToken: false } },
        { provide: SearchServer, useValue: { active: () => false } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    loader = TestBed.inject(ThreadLoader);
  });

  it('shows what it was handed without asking any server', () => {
    const root = localStatus('1');
    const reply = { ...localStatus('2'), in_reply_to_id: '1' };
    TestBed.inject(ThreadPreload).offer('1', { status: root, ancestors: [], descendants: [reply] });
    loader.load('1');

    httpMock.expectNone(() => true);
    expect(loader.loading()).toBe(false);
    expect(loader.thread().map((post) => post.id)).toEqual(['1', '2']);
  });

  it('uses an offer once, and only for its own id', () => {
    const preload = TestBed.inject(ThreadPreload);
    preload.offer('1', { status: localStatus('1'), ancestors: [], descendants: [] });
    loader.load('9');
    httpMock.expectOne('/api/v1/statuses/9');
    loader.load('1');
    httpMock.expectOne('/api/v1/statuses/1');
  });
});

/** Watch keeps a thread open as a live chat and re-reads its replies on a timer. */
describe('ThreadLoader refreshing replies', () => {
  let httpMock: HttpTestingController;
  let loader: ThreadLoader;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ThreadLoader,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Auth, useValue: { lacksMastodonToken: false } },
        { provide: SearchServer, useValue: { active: () => false } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    loader = TestBed.inject(ThreadLoader);
  });

  it('re-reads the context quietly, keeping the post, and one request at a time', () => {
    loader.load('1');
    httpMock.expectOne('/api/v1/statuses/1').flush(localStatus('1'));
    httpMock.expectOne('/api/v1/statuses/1/context').flush({ ancestors: [], descendants: [] });
    expect(loader.canRefreshReplies).toBe(true);

    loader.refreshReplies();
    loader.refreshReplies();
    const context = httpMock.expectOne('/api/v1/statuses/1/context');
    expect(loader.loading()).toBe(false);
    context.flush({ ancestors: [], descendants: [localStatus('2')] });
    expect(loader.status()?.id).toBe('1');
    expect(loader.descendants().map((post) => post.id)).toEqual(['2']);

    loader.refreshReplies();
    httpMock
      .expectOne('/api/v1/statuses/1/context')
      .flush('down', { status: 503, statusText: 'Service Unavailable' });
    expect(loader.descendants().map((post) => post.id)).toEqual(['2']);
  });

  it('never polls Twitter, whose replies are paid per request', () => {
    loader.load('twitter:123');
    loader.refreshReplies();
    expect(loader.canRefreshReplies).toBe(false);
    httpMock.expectNone((request) => request.url.endsWith('/context'));
  });
});

/**
 * A Misskey note (`mk:` id), read as the active Misskey identity: the note,
 * its parents (nearest first from the API, oldest first on screen) and its
 * direct replies, all from the reader's own Misskey server.
 */
describe('ThreadLoader with a Misskey note', () => {
  let httpMock: HttpTestingController;

  const user = { id: 'u1', name: null, username: 'alice', host: null, avatarUrl: null };
  const mkNote = (id: string, replyId: string | null = null) => ({
    id,
    createdAt: '2026-11-09T10:00:00.000Z',
    text: `note ${id}`,
    user,
    userId: 'u1',
    visibility: 'public',
    replyId,
  });

  function setUp(activeKey: string | null): ThreadLoader {
    TestBed.configureTestingModule({
      providers: [
        ThreadLoader,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Auth,
          useValue: { activeMisskeyKey: () => activeKey, lacksMastodonToken: true },
        },
        { provide: SearchServer, useValue: { active: () => false } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(ThreadLoader);
  }

  beforeEach(() => localStorage.clear());

  it('asks the reader to sign in when no Misskey identity is active', () => {
    const loader = setUp(null);
    loader.load('mk:n2');
    expect(loader.loading()).toBe(false);
    expect(loader.loadError()).toBeTruthy();
    httpMock.verify();
  });

  it('loads the note, its parents oldest first, and its replies', async () => {
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
    const loader = setUp(key);
    loader.load('mk:n2');
    httpMock.expectOne('https://misskey.io/api/notes/show').flush(mkNote('n2', 'n1'));
    // Nearest parent first, as Misskey sends it.
    httpMock
      .expectOne('https://misskey.io/api/notes/conversation')
      .flush([mkNote('n1', 'n0'), mkNote('n0')]);
    httpMock.expectOne('https://misskey.io/api/notes/children').flush([mkNote('n3', 'n2')]);
    await vi.waitFor(() => expect(loader.loading()).toBe(false));
    expect(loader.status()?.id).toBe('mk:n2');
    expect(loader.ancestors().map((s) => s.id)).toEqual(['mk:n0', 'mk:n1']);
    expect(loader.descendants().map((s) => s.id)).toEqual(['mk:n3']);
    expect(loader.canRefreshReplies).toBe(true);
    httpMock.verify();
  });

  it('keeps the note readable when the parent lookup fails', async () => {
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
    const loader = setUp(key);
    loader.load('mk:n2');
    httpMock.expectOne('https://misskey.io/api/notes/show').flush(mkNote('n2'));
    httpMock
      .expectOne('https://misskey.io/api/notes/conversation')
      .flush({ error: { code: 'X' } }, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne('https://misskey.io/api/notes/children').flush([]);
    await vi.waitFor(() => expect(loader.loading()).toBe(false));
    expect(loader.status()?.id).toBe('mk:n2');
    expect(loader.loadError()).toBeNull();
  });

  it('says the note is gone when Misskey answers NO_SUCH_NOTE', async () => {
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
    const loader = setUp(key);
    loader.load('mk:gone');
    httpMock.expectOne('https://misskey.io/api/notes/conversation').flush([]);
    httpMock.expectOne('https://misskey.io/api/notes/children').flush([]);
    httpMock
      .expectOne('https://misskey.io/api/notes/show')
      .flush({ error: { code: 'NO_SUCH_NOTE' } }, { status: 400, statusText: 'Bad Request' });
    await vi.waitFor(() => expect(loader.loading()).toBe(false));
    expect(loader.status()).toBeNull();
    expect(loader.loadError()).toBeTruthy();
  });
});
