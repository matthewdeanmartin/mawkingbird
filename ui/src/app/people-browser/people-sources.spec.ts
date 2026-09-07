import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PeopleSourceFactory } from './people-sources';
import { PeoplePage } from './people-source';
import { Account, Relationship } from '../models';
import { seedBskySession } from '../testing/seed-storage';

const BSKY = 'https://bsky.social';
const PUBLIC = 'https://public.api.bsky.app';
const FOLLOWERS = 'app.bsky.graph.getFollowers';
const FOLLOWS = 'app.bsky.graph.getFollows';

function profile(did: string, handle: string, viewer?: Record<string, unknown>) {
  return { did, handle, displayName: handle, ...(viewer ? { viewer } : {}) };
}

function signInBsky(): void {
  seedBskySession({
    service: BSKY,
    handle: 'me.bsky.social',
    did: 'did:plc:me',
    accessJwt: 'access-1',
    refreshJwt: 'refresh-1',
  });
}

describe('PeopleSourceFactory — Bluesky', () => {
  let httpMock: HttpTestingController;
  let factory: PeopleSourceFactory;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => httpMock.verify());

  function setup(): void {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    factory = TestBed.inject(PeopleSourceFactory);
  }

  it('reads followers from getFollowers and following from getFollows', () => {
    // These are named confusingly: getFollows is the *following* list. Swapping
    // them would mislabel both tabs in a way that looks plausible on screen.
    signInBsky();
    setup();
    const source = factory.create('bsky:did:plc:them', null);

    source.fetch('followers', null).subscribe();
    httpMock
      .expectOne((r) => r.url === `${BSKY}/xrpc/${FOLLOWERS}`)
      .flush({
        subject: profile('did:plc:them', 'them.bsky.social'),
        followers: [],
      });

    source.fetch('following', null).subscribe();
    httpMock
      .expectOne((r) => r.url === `${BSKY}/xrpc/${FOLLOWS}`)
      .flush({
        subject: profile('did:plc:them', 'them.bsky.social'),
        follows: [],
      });
  });

  it('adapts profiles and passes the cursor back opaquely', () => {
    signInBsky();
    setup();
    let page: PeoplePage | null = null;
    factory
      .create('bsky:did:plc:them', null)
      .fetch('followers', null)
      .subscribe((p) => (page = p));

    httpMock
      .expectOne((r) => r.url === `${BSKY}/xrpc/${FOLLOWERS}`)
      .flush({
        subject: profile('did:plc:them', 'them.bsky.social'),
        followers: [profile('did:plc:a', 'a.bsky.social')],
        cursor: 'cur-1',
      });

    expect(page!.accounts[0].id).toBe('bsky:did:plc:a');
    expect(page!.accounts[0].acct).toBe('a.bsky.social');
    expect(page!.cursor).toBe('cur-1');
  });

  it('takes relationships from the inline viewer block, with no extra request', () => {
    // Measured: getFollowers/getFollows populate `viewer` when authenticated,
    // so asking again would be a second round trip for data already in hand.
    signInBsky();
    setup();
    const source = factory.create('bsky:did:plc:them', null);
    let accounts: Account[] = [];
    source.fetch('followers', null).subscribe((p) => (accounts = p.accounts));

    httpMock
      .expectOne((r) => r.url === `${BSKY}/xrpc/${FOLLOWERS}`)
      .flush({
        subject: profile('did:plc:them', 'them.bsky.social'),
        followers: [
          profile('did:plc:a', 'a.bsky.social', {
            following: 'at://x/y/z',
            followedBy: 'at://p/q/r',
          }),
        ],
      });

    let rels = new Map<string, Relationship>();
    source.relationships(accounts).subscribe((r) => (rels = r));
    // No further HTTP; httpMock.verify() in afterEach proves it.
    expect(rels.get('bsky:did:plc:a')?.following).toBe(true);
    expect(rels.get('bsky:did:plc:a')?.followed_by).toBe(true);
  });

  it('reports no relationship when signed out, and refuses follows', () => {
    setup();
    const source = factory.create('bsky:did:plc:them', null);
    let accounts: Account[] = [];
    source.fetch('followers', null).subscribe((p) => (accounts = p.accounts));

    // Anonymous reads go to the public AppView, not the entryway.
    httpMock
      .expectOne((r) => r.url === `${PUBLIC}/xrpc/${FOLLOWERS}`)
      .flush({
        subject: profile('did:plc:them', 'them.bsky.social'),
        followers: [profile('did:plc:a', 'a.bsky.social')],
      });

    let rels = new Map<string, Relationship>();
    source.relationships(accounts).subscribe((r) => (rels = r));
    // Unknown, not "not following" — there is no viewer block at all.
    expect(rels.size).toBe(0);
    expect(source.canFollow).toBe(false);
  });

  it('ends paging when the cursor repeats', () => {
    signInBsky();
    setup();
    let page: PeoplePage | null = null;
    factory
      .create('bsky:did:plc:them', null)
      .fetch('followers', 'cur-9')
      .subscribe((p) => (page = p));

    httpMock
      .expectOne((r) => r.url === `${BSKY}/xrpc/${FOLLOWERS}`)
      .flush({
        subject: profile('did:plc:them', 'them.bsky.social'),
        followers: [],
        cursor: 'cur-9',
      });
    expect(page!.cursor).toBeNull();
  });

  it('follows through the graph, stripping the id namespace', () => {
    signInBsky();
    setup();
    const source = factory.create('bsky:did:plc:them', null);
    source.follow({ id: 'bsky:did:plc:a', acct: 'a.bsky.social' } as Account).subscribe();

    const req = httpMock.expectOne(`${BSKY}/xrpc/com.atproto.repo.createRecord`);
    expect((req.request.body as { record: { subject: string } }).record.subject).toBe('did:plc:a');
    req.flush({ uri: 'at://did:plc:me/app.bsky.graph.follow/1', cid: 'c' });
  });

  it('links to the namespaced profile route', () => {
    signInBsky();
    setup();
    const source = factory.create('bsky:did:plc:them', null);
    expect(source.accountLink({ id: 'bsky:did:plc:a' } as Account)).toEqual([
      '/accounts',
      'bsky:did:plc:a',
    ]);
  });
});

/**
 * Mastodon's follower/following lists paginate by the id of the internal follow
 * *relationship*, published only in the `Link` header. Walking them by the last
 * account's id — which is a different number entirely — stops the list early at
 * a point that varies by account, and reads on screen like a privacy setting.
 */
describe('PeopleSourceFactory — Mastodon paging', () => {
  let httpMock: HttpTestingController;
  let factory: PeopleSourceFactory;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    factory = TestBed.inject(PeopleSourceFactory);
  });

  afterEach(() => httpMock.verify());

  const accounts = [
    { id: '900', acct: 'a' },
    { id: '901', acct: 'b' },
  ] as Account[];

  /** What a real server sends: a relationship cursor unrelated to any account id. */
  const linkHeader =
    '<https://example.social/api/v1/accounts/1/followers?max_id=77451>; rel="next", ' +
    '<https://example.social/api/v1/accounts/1/followers?since_id=77500>; rel="prev"';

  it.each([
    ['followers', 'followers'],
    ['following', 'following'],
  ] as const)('takes the next %s cursor from the Link header', (mode, path) => {
    const source = factory.create('1', null);
    let page: PeoplePage | undefined;
    source.fetch(mode, null).subscribe((result) => (page = result));

    httpMock
      .expectOne((r) => r.url === `/api/v1/accounts/1/${path}`)
      .flush(accounts, { headers: { Link: linkHeader } });

    // 77451, not 901. The account id would have been a plausible-looking cursor
    // that quietly truncates the list.
    expect(page!.cursor).toBe('77451');
  });

  it('sends that cursor back as max_id on the next page', () => {
    const source = factory.create('1', null);
    source.fetch('followers', '77451').subscribe();

    const request = httpMock.expectOne((r) => r.url === '/api/v1/accounts/1/followers');
    expect(request.request.params.get('max_id')).toBe('77451');
    request.flush([]);
  });

  it('ends the walk when the server stops offering a next link', () => {
    const source = factory.create('1', null);
    let page: PeoplePage | undefined;
    source.fetch('followers', null).subscribe((result) => (page = result));

    // A full page with no `next`: the last page of a list that divides evenly.
    // The old code kept walking here, because it invented a cursor from the body.
    httpMock
      .expectOne((r) => r.url === '/api/v1/accounts/1/followers')
      .flush(accounts, { headers: { Link: '<https://example.social/x>; rel="prev"' } });

    expect(page!.accounts).toHaveLength(2);
    expect(page!.cursor).toBeNull();
  });
});
