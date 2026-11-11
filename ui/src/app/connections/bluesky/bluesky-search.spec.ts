import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlueskySearch, BlueskySearchPage } from './bluesky-search';
import { seedBskySession } from '../../testing/seed-storage';

const SERVICE = 'https://bsky.social';
const SEARCH = `${SERVICE}/xrpc/app.bsky.feed.searchPosts`;

function post(uri = 'at://did:plc:a/app.bsky.feed.post/1') {
  return {
    uri,
    cid: 'c',
    author: { did: 'did:plc:a', handle: 'a.bsky.social' },
    record: { $type: 'app.bsky.feed.post', text: 'hello', createdAt: '2026-08-01T09:00:00Z' },
    indexedAt: '2026-08-01T09:00:01.000Z',
  };
}

describe('BlueskySearch', () => {
  let httpMock: HttpTestingController;
  let search: BlueskySearch;

  beforeEach(() => {
    localStorage.clear();
    seedBskySession({
      service: SERVICE,
      handle: 'me.bsky.social',
      did: 'did:plc:me',
      accessJwt: 'access-1',
      refreshJwt: 'refresh-1',
    });
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    search = TestBed.inject(BlueskySearch);
  });

  afterEach(() => httpMock.verify());

  it('sends every set criterion as its own typed param', () => {
    search
      .search(
        {
          text: 'angular',
          author: '@me.bsky.social',
          mentions: '@you.bsky.social',
          language: 'en',
          domain: 'github.com',
          url: 'https://example.com/x',
          after: '2026-01-01',
          before: '2026-02-01',
          sort: 'top',
          tags: ['cats', 'dogs'],
        },
        null,
      )
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === SEARCH);
    const p = req.request.params;
    expect(p.get('q')).toBe('angular');
    // Leading @ is stripped: the server resolves bare handles, not @handles.
    expect(p.get('author')).toBe('me.bsky.social');
    expect(p.get('mentions')).toBe('you.bsky.social');
    expect(p.get('lang')).toBe('en');
    expect(p.get('domain')).toBe('github.com');
    expect(p.get('url')).toBe('https://example.com/x');
    // Date-only bounds are accepted by the real API (measured), so no widening.
    expect(p.get('since')).toBe('2026-01-01');
    expect(p.get('until')).toBe('2026-02-01');
    expect(p.get('sort')).toBe('top');
    expect(p.getAll('tag')).toEqual(['cats', 'dogs']);
    req.flush({ posts: [] });
  });

  it('omits unset criteria entirely rather than sending them blank', () => {
    search.search({ text: 'angular' }, null).subscribe();

    const req = httpMock.expectOne((r) => r.url === SEARCH);
    for (const key of ['author', 'mentions', 'lang', 'domain', 'url', 'since', 'until', 'sort']) {
      expect(req.request.params.has(key)).toBe(false);
    }
    expect(req.request.params.has('cursor')).toBe(false);
    req.flush({ posts: [] });
  });

  it('adapts posts and reports the cursor', () => {
    let page: BlueskySearchPage | null = null;
    search.search({ text: 'a' }, null).subscribe((p) => (page = p));

    httpMock
      .expectOne((r) => r.url === SEARCH)
      .flush({ posts: [post()], cursor: 'cur-1', hitsTotal: 10000 });

    expect(page!.statuses[0].provider).toBe('bluesky');
    expect(page!.statuses[0].content).toBe('<p>hello</p>');
    expect(page!.cursor).toBe('cur-1');
    expect(page!.hitsTotal).toBe(10000);
  });

  it('ends paging when the cursor is absent', () => {
    let page: BlueskySearchPage | null = null;
    search.search({ text: 'a' }, null).subscribe((p) => (page = p));
    httpMock.expectOne((r) => r.url === SEARCH).flush({ posts: [post()] });
    expect(page!.cursor).toBeNull();
  });

  it('ends paging when the cursor repeats, rather than looping', () => {
    // The lexicon warns the cursor "may not enable complete result set traversal".
    let page: BlueskySearchPage | null = null;
    search.search({ text: 'a' }, 'cur-9').subscribe((p) => (page = p));
    httpMock.expectOne((r) => r.url === SEARCH).flush({ posts: [post()], cursor: 'cur-9' });
    expect(page!.cursor).toBeNull();
  });

  it('turns BadQueryString into advice the reader can act on', () => {
    let message = '';
    search.search({ text: '((' }, null).subscribe({ error: (e: Error) => (message = e.message) });
    httpMock
      .expectOne((r) => r.url === SEARCH)
      .flush({ error: 'BadQueryString' }, { status: 400, statusText: 'Bad Request' });
    expect(message).toContain('could not read that query');
  });

  it('explains an auth failure as a session problem, not a query problem', () => {
    // Measured: searchPosts refuses anonymous callers (403 from public.api,
    // 401 from the entryway). 403 is used here because a 401 is indistinguishable
    // from an expired token and is retried through a refresh by BlueskyApi.
    let message = '';
    search.search({ text: 'a' }, null).subscribe({ error: (e: Error) => (message = e.message) });
    httpMock
      .expectOne((r) => r.url === SEARCH)
      .flush({ error: 'AuthRequired' }, { status: 403, statusText: 'Forbidden' });
    expect(message).toContain('linked account');
  });
});
