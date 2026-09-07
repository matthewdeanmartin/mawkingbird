import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlueskyApi, tidFromSeed } from './bluesky-api';
import { BlueskySession, BskySession } from './bluesky-session';
import { bskySessionStored, seedBskySession, storedBskyProfile } from '../../testing/seed-storage';

const SERVICE = 'https://bsky.social';

function storedSession(): BskySession {
  return {
    service: SERVICE,
    handle: 'me.bsky.social',
    did: 'did:plc:me',
    accessJwt: 'access-1',
    refreshJwt: 'refresh-1',
  };
}

describe('BlueskySession', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('login creates a session, captures the profile, and persists', () => {
    const session = TestBed.inject(BlueskySession);
    let done = false;
    session.login('me.bsky.social', 'app-pass').subscribe(() => (done = true));

    const create = httpMock.expectOne(`${SERVICE}/xrpc/com.atproto.server.createSession`);
    expect(create.request.body).toEqual({ identifier: 'me.bsky.social', password: 'app-pass' });
    create.flush({
      did: 'did:plc:me',
      handle: 'me.bsky.social',
      accessJwt: 'a1',
      refreshJwt: 'r1',
    });

    const profile = httpMock.expectOne((req) => req.url.includes('app.bsky.actor.getProfile'));
    expect(profile.request.headers.get('Authorization')).toBe('Bearer a1');
    profile.flush({ displayName: 'Me', avatar: 'https://cdn/me.jpg' });

    expect(done).toBe(true);
    expect(session.linked()).toBe(true);
    expect(session.session()?.displayName).toBe('Me');
    expect(storedBskyProfile()!['did']).toBe('did:plc:me');
  });

  it('unlink drops the session and storage', () => {
    seedBskySession(storedSession());
    const session = TestBed.inject(BlueskySession);
    expect(session.linked()).toBe(true);

    session.unlink();
    expect(session.linked()).toBe(false);
    expect(bskySessionStored()).toBe(false);
  });
});

describe('BlueskyApi', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    seedBskySession(storedSession());
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('sends the access token and pages the timeline', () => {
    const api = TestBed.inject(BlueskyApi);
    api.getTimeline('cur-1').subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${SERVICE}/xrpc/app.bsky.feed.getTimeline` && r.params.get('cursor') === 'cur-1',
    );
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-1');
    req.flush({ feed: [], cursor: undefined });
  });

  it('pages one actor feed and applies the filter server-side', () => {
    const api = TestBed.inject(BlueskyApi);
    api.getAuthorFeed('did:plc:alice', 'cur-2', 'posts_with_replies').subscribe();

    const req = httpMock.expectOne((r) => r.url === `${SERVICE}/xrpc/app.bsky.feed.getAuthorFeed`);
    expect(req.request.params.get('actor')).toBe('did:plc:alice');
    expect(req.request.params.get('cursor')).toBe('cur-2');
    expect(req.request.params.get('filter')).toBe('posts_with_replies');
    req.flush({ feed: [] });
  });

  it('omits the cursor on a first author-feed page', () => {
    const api = TestBed.inject(BlueskyApi);
    api.getAuthorFeed('did:plc:alice', null).subscribe();

    const req = httpMock.expectOne((r) => r.url === `${SERVICE}/xrpc/app.bsky.feed.getAuthorFeed`);
    expect(req.request.params.has('cursor')).toBe(false);
    // Threads by the author read as one post, matching how the profile shows them.
    expect(req.request.params.get('filter')).toBe('posts_and_author_threads');
    req.flush({ feed: [] });
  });

  it('pages the signed-in actor own likes', () => {
    const api = TestBed.inject(BlueskyApi);
    api.getActorLikes('did:plc:me', 'likes-2').subscribe();

    const req = httpMock.expectOne((r) => r.url === `${SERVICE}/xrpc/app.bsky.feed.getActorLikes`);
    expect(req.request.params.get('actor')).toBe('did:plc:me');
    expect(req.request.params.get('cursor')).toBe('likes-2');
    expect(req.request.params.get('limit')).toBe('50');
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-1');
    req.flush({ feed: [], cursor: undefined });
  });

  it('follow writes a graph.follow record into the viewer own repo', () => {
    const api = TestBed.inject(BlueskyApi);
    api.follow('did:plc:them').subscribe();

    const req = httpMock.expectOne(`${SERVICE}/xrpc/com.atproto.repo.createRecord`);
    expect(req.request.body).toMatchObject({
      repo: 'did:plc:me',
      collection: 'app.bsky.graph.follow',
      record: { $type: 'app.bsky.graph.follow', subject: 'did:plc:them' },
    });
    req.flush({ uri: 'at://did:plc:me/app.bsky.graph.follow/1', cid: 'c' });
  });

  it('posts with a stable rkey and reconciles a committed write after a lost response', () => {
    const api = TestBed.inject(BlueskyApi);
    let result: unknown;
    api
      .post({ text: 'once' }, { rkey: 'operation-1-0', createdAt: '2026-09-05T12:00:00Z' })
      .subscribe((value) => (result = value));

    const create = httpMock.expectOne(`${SERVICE}/xrpc/com.atproto.repo.createRecord`);
    expect(create.request.body).toMatchObject({
      repo: 'did:plc:me',
      collection: 'app.bsky.feed.post',
      rkey: 'operation-1-0',
      record: { text: 'once', createdAt: '2026-09-05T12:00:00Z' },
    });
    create.flush(
      { error: 'RecordAlreadyExists', message: 'Record already exists' },
      { status: 409, statusText: 'Conflict' },
    );

    const get = httpMock.expectOne(
      (request) =>
        request.url === `${SERVICE}/xrpc/com.atproto.repo.getRecord` &&
        request.params.get('rkey') === 'operation-1-0',
    );
    get.flush({ uri: 'at://did:plc:me/app.bsky.feed.post/operation-1-0', cid: 'c1' });
    expect(result).toEqual({
      uri: 'at://did:plc:me/app.bsky.feed.post/operation-1-0',
      cid: 'c1',
    });
  });

  it('mints record keys the PDS accepts as TIDs, stable per seed', () => {
    // The PDS rejects anything else outright: a raw UUID rkey came back as
    // `Invalid TID string (got "…") at $` and lost the whole thread.
    const tid = /^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/;
    expect(tidFromSeed('63c690fa-ea08-44ec-8a2c-9f1e46fc9596-0')).toMatch(tid);
    expect(tidFromSeed('63c690fa-ea08-44ec-8a2c-9f1e46fc9596-1')).toMatch(tid);

    // Stability is the whole idempotency mechanism: a retry after a lost
    // response must address the record the PDS may already have committed.
    expect(tidFromSeed('op-0')).toBe(tidFromSeed('op-0'));
    // Distinct parts must not collide, or a thread would overwrite itself.
    expect(tidFromSeed('op-0')).not.toBe(tidFromSeed('op-1'));
  });

  it('refreshes an expired token once and retries the call', () => {
    const api = TestBed.inject(BlueskyApi);
    let result: unknown;
    api.like('at://post', 'cid').subscribe((r) => (result = r));

    // First attempt: expired.
    httpMock
      .expectOne(`${SERVICE}/xrpc/com.atproto.repo.createRecord`)
      .flush({ error: 'ExpiredToken' }, { status: 400, statusText: 'Bad Request' });

    // Refresh uses the refresh token.
    const refresh = httpMock.expectOne(`${SERVICE}/xrpc/com.atproto.server.refreshSession`);
    expect(refresh.request.headers.get('Authorization')).toBe('Bearer refresh-1');
    refresh.flush({
      did: 'did:plc:me',
      handle: 'me.bsky.social',
      accessJwt: 'a2',
      refreshJwt: 'r2',
    });

    // Retry carries the fresh token.
    const retry = httpMock.expectOne(`${SERVICE}/xrpc/com.atproto.repo.createRecord`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer a2');
    retry.flush({ uri: 'at://like/1', cid: 'c' });

    expect(result).toEqual({ uri: 'at://like/1', cid: 'c' });
    expect(TestBed.inject(BlueskySession).session()?.accessJwt).toBe('a2');
  });

  it('deleteRecord splits the at-uri into repo/collection/rkey', () => {
    const api = TestBed.inject(BlueskyApi);
    api.deleteRecord('at://did:plc:me/app.bsky.feed.like/3xyz').subscribe();

    const req = httpMock.expectOne(`${SERVICE}/xrpc/com.atproto.repo.deleteRecord`);
    expect(req.request.body).toEqual({
      repo: 'did:plc:me',
      collection: 'app.bsky.feed.like',
      rkey: '3xyz',
    });
    req.flush({});
  });

  it('reads and safely replaces the viewer profile record', () => {
    const api = TestBed.inject(BlueskyApi);
    api.getOwnProfileRecord().subscribe();

    const get = httpMock.expectOne((request) =>
      request.url.endsWith('/xrpc/com.atproto.repo.getRecord'),
    );
    expect(get.request.params.get('repo')).toBe('did:plc:me');
    expect(get.request.params.get('collection')).toBe('app.bsky.actor.profile');
    expect(get.request.params.get('rkey')).toBe('self');
    get.flush({ uri: 'at://did:plc:me/app.bsky.actor.profile/self', cid: 'old', value: {} });

    api
      .putProfile({ displayName: 'New name', pinnedPost: { uri: 'at://post' } }, 'old')
      .subscribe();
    const put = httpMock.expectOne(`${SERVICE}/xrpc/com.atproto.repo.putRecord`);
    expect(put.request.body).toEqual({
      repo: 'did:plc:me',
      collection: 'app.bsky.actor.profile',
      rkey: 'self',
      swapRecord: 'old',
      record: {
        $type: 'app.bsky.actor.profile',
        displayName: 'New name',
        pinnedPost: { uri: 'at://post' },
      },
    });
    put.flush({ uri: 'at://did:plc:me/app.bsky.actor.profile/self', cid: 'new' });
  });

  it('creates, deletes, and pages private bookmarks through Bluesky', () => {
    const api = TestBed.inject(BlueskyApi);
    api.createBookmark('at://did:plc:them/app.bsky.feed.post/1', 'post-cid').subscribe();
    const create = httpMock.expectOne(`${SERVICE}/xrpc/app.bsky.bookmark.createBookmark`);
    expect(create.request.body).toEqual({
      uri: 'at://did:plc:them/app.bsky.feed.post/1',
      cid: 'post-cid',
    });
    create.flush({});

    api.deleteBookmark('at://did:plc:them/app.bsky.feed.post/1').subscribe();
    const remove = httpMock.expectOne(`${SERVICE}/xrpc/app.bsky.bookmark.deleteBookmark`);
    expect(remove.request.body).toEqual({ uri: 'at://did:plc:them/app.bsky.feed.post/1' });
    remove.flush({});

    api.getBookmarks('next-cursor', 20).subscribe();
    const list = httpMock.expectOne((request) =>
      request.url.endsWith('/xrpc/app.bsky.bookmark.getBookmarks'),
    );
    expect(list.request.params.get('cursor')).toBe('next-cursor');
    expect(list.request.params.get('limit')).toBe('20');
    list.flush({ bookmarks: [] });
  });

  it('reports Bluesky accounts and posts with protocol-native subjects', () => {
    const api = TestBed.inject(BlueskyApi);
    api
      .reportAccount(
        'did:plc:them',
        'tools.ozone.report.defs#reasonMisleadingSpam',
        ' repeated promos ',
      )
      .subscribe();
    const account = httpMock.expectOne(`${SERVICE}/xrpc/com.atproto.moderation.createReport`);
    expect(account.request.body).toEqual({
      reasonType: 'tools.ozone.report.defs#reasonMisleadingSpam',
      reason: 'repeated promos',
      subject: { $type: 'com.atproto.admin.defs#repoRef', did: 'did:plc:them' },
      modTool: { name: 'mawkingbird/web' },
    });
    account.flush({});

    api
      .reportPost(
        'at://did:plc:them/app.bsky.feed.post/1',
        'post-cid',
        'tools.ozone.report.defs#reasonRuleOther',
        '',
      )
      .subscribe();
    const post = httpMock.expectOne(`${SERVICE}/xrpc/com.atproto.moderation.createReport`);
    expect(post.request.body).toEqual({
      reasonType: 'tools.ozone.report.defs#reasonRuleOther',
      subject: {
        $type: 'com.atproto.repo.strongRef',
        uri: 'at://did:plc:them/app.bsky.feed.post/1',
        cid: 'post-cid',
      },
      modTool: { name: 'mawkingbird/web' },
    });
    post.flush({});
  });
});
