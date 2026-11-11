import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlueskyAccountPage, BlueskyAccountSearch } from './bluesky-account-search';
import { BlueskyGraph } from './bluesky-graph';
import { seedBskySession } from '../../testing/seed-storage';

const SERVICE = 'https://bsky.social';
const PUBLIC = 'https://public.api.bsky.app';
const FOLLOW_URI = 'at://did:plc:me/app.bsky.graph.follow/f1';

function actor(did: string, handle: string, viewer?: Record<string, unknown>) {
  return { did, handle, displayName: handle, description: 'a bio', ...(viewer ? { viewer } : {}) };
}

function detailed(did: string, handle: string, viewer?: Record<string, unknown>) {
  return {
    did,
    handle,
    displayName: handle,
    description: 'a bio',
    followersCount: 100,
    followsCount: 20,
    postsCount: 300,
    ...(viewer ? { viewer } : {}),
  };
}

function signIn(): void {
  seedBskySession({
    service: SERVICE,
    handle: 'me.bsky.social',
    did: 'did:plc:me',
    accessJwt: 'access-1',
    refreshJwt: 'refresh-1',
  });
}

describe('BlueskyAccountSearch', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => httpMock.verify());

  function setup(): BlueskyAccountSearch {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(BlueskyAccountSearch);
  }

  it('searches the public AppView when signed out', () => {
    // Measured: the bsky.social entryway 401s an anonymous searchActors;
    // public.api.bsky.app answers it.
    const search = setup();
    search.search('angular', null).subscribe();

    const req = httpMock.expectOne((r) => r.url === `${PUBLIC}/xrpc/app.bsky.actor.searchActors`);
    expect(req.request.params.get('q')).toBe('angular');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ actors: [] });
  });

  it('searches the authenticated host when signed in', () => {
    signIn();
    const search = setup();
    search.search('angular', null).subscribe();

    const req = httpMock.expectOne((r) => r.url === `${SERVICE}/xrpc/app.bsky.actor.searchActors`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-1');
    req.flush({ actors: [] });
  });

  it('hydrates counts with one batched getProfiles call', () => {
    let page: BlueskyAccountPage | null = null;
    const search = setup();
    search.search('angular', null).subscribe((p) => (page = p));

    httpMock
      .expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.searchActors'))
      .flush({ actors: [actor('did:plc:a', 'a.bsky.social')], cursor: 'c1' });

    const profiles = httpMock.expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.getProfiles'));
    expect(profiles.request.params.getAll('actors')).toEqual(['did:plc:a']);
    profiles.flush({ profiles: [detailed('did:plc:a', 'a.bsky.social')] });

    // searchActors returns no counts; without hydration every card reads zero.
    expect(page!.results[0].account.followers_count).toBe(100);
    expect(page!.results[0].account.statuses_count).toBe(300);
    expect(page!.cursor).toBe('c1');
  });

  it('keys hydration by DID rather than trusting order or completeness', () => {
    let page: BlueskyAccountPage | null = null;
    const search = setup();
    search.search('a', null).subscribe((p) => (page = p));

    httpMock
      .expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.searchActors'))
      .flush({
        actors: [actor('did:plc:a', 'a.bsky.social'), actor('did:plc:b', 'b.bsky.social')],
      });
    // Reversed, and missing one — the same shape getPosts taught us in Sprint 2.
    httpMock
      .expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.getProfiles'))
      .flush({ profiles: [detailed('did:plc:b', 'b.bsky.social')] });

    expect(page!.results.map((r) => r.account.acct)).toEqual(['a.bsky.social', 'b.bsky.social']);
    expect(page!.results[1].account.followers_count).toBe(100);
    // The un-hydrated one keeps its zeroes rather than borrowing another's.
    expect(page!.results[0].account.followers_count).toBe(0);
  });

  it('still returns results when hydration fails', () => {
    let page: BlueskyAccountPage | null = null;
    const search = setup();
    search.search('a', null).subscribe((p) => (page = p));

    httpMock
      .expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.searchActors'))
      .flush({ actors: [actor('did:plc:a', 'a.bsky.social')] });
    httpMock
      .expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.getProfiles'))
      .flush({}, { status: 500, statusText: 'Server Error' });

    expect(page!.results).toHaveLength(1);
    expect(page!.results[0].account.acct).toBe('a.bsky.social');
  });

  it('reports an unknown relationship when signed out, not "not following"', () => {
    let page: BlueskyAccountPage | null = null;
    const search = setup();
    search.search('a', null).subscribe((p) => (page = p));

    httpMock
      .expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.searchActors'))
      .flush({ actors: [actor('did:plc:a', 'a.bsky.social')] });
    httpMock
      .expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.getProfiles'))
      .flush({ profiles: [detailed('did:plc:a', 'a.bsky.social')] });

    // Anonymous responses carry no viewer block at all.
    expect(page!.results[0].relationship).toBeNull();
  });

  it('maps viewer state and caches the follow uri for a later unfollow', () => {
    signIn();
    let page: BlueskyAccountPage | null = null;
    const search = setup();
    search.search('a', null).subscribe((p) => (page = p));

    httpMock
      .expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.searchActors'))
      .flush({ actors: [actor('did:plc:a', 'a.bsky.social', { following: FOLLOW_URI })] });
    httpMock
      .expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.getProfiles'))
      .flush({ profiles: [detailed('did:plc:a', 'a.bsky.social', { following: FOLLOW_URI })] });

    expect(page!.results[0].relationship?.following).toBe(true);

    // The uri was remembered, so unfollowing needs no second profile read.
    TestBed.inject(BlueskyGraph).unfollow('did:plc:a').subscribe();
    httpMock.expectOne(`${SERVICE}/xrpc/com.atproto.repo.deleteRecord`).flush({});
  });

  it('makes no getProfiles call for an empty result set', () => {
    let page: BlueskyAccountPage | null = null;
    const search = setup();
    search.search('zzz', null).subscribe((p) => (page = p));

    httpMock
      .expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.searchActors'))
      .flush({ actors: [] });
    httpMock.expectNone((r) => r.url.endsWith('/xrpc/app.bsky.actor.getProfiles'));
    expect(page!.results).toEqual([]);
    expect(page!.cursor).toBeNull();
  });

  it('ends paging when the cursor repeats', () => {
    let page: BlueskyAccountPage | null = null;
    const search = setup();
    search.search('a', 'cur-9').subscribe((p) => (page = p));

    httpMock
      .expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.searchActors'))
      .flush({ actors: [], cursor: 'cur-9' });
    expect(page!.cursor).toBeNull();
  });
});
