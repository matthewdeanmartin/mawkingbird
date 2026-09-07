import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../../auth';
import { Account } from '../../../models';
import { BridgeFinder } from './bridge-finder';

const PUBLIC = 'https://public.api.bsky.app';

function account(username: string, changes: Partial<Account> = {}): Account {
  return {
    id: username,
    username,
    acct: `${username}@social.example`,
    display_name: username,
    note: '',
    url: `https://social.example/@${username}`,
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: [],
    ...changes,
  };
}

describe('BridgeFinder', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    // BridgeFinder is providedIn: 'root', so it and its HTTP backend must be
    // torn down between tests — otherwise a failure here leaves the shared
    // TestBed instantiated and every later spec file fails to configure one.
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  function setup(me: Account = account('me')): BridgeFinder {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Auth, useValue: { account: () => me, kind: () => 'mastodon' } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const finder = TestBed.inject(BridgeFinder);
    finder.delayMs = 0;
    return finder;
  }

  /**
   * Let the engine's pending promise chain run up to its next request.
   *
   * Every step of the walk is `await`ed, so a subscription is only made a
   * microtask after the call that leads to it. Asserting synchronously would
   * always find no request in flight.
   */
  function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  /** One page of Mastodon /following, with no Link header (so: the last page). */
  async function flushFollowing(accounts: Account[]): Promise<void> {
    await settle();
    httpMock.expectOne((r) => r.url === '/api/v1/accounts/me/following').flush(accounts);
    await settle();
  }

  it('walks /following by the Link header cursor, not by account id', async () => {
    // The trap this guards: /following paginates by an internal relationship id,
    // so walking it with the last account's id re-reads page one forever.
    const finder = setup();
    const loading = finder.load();

    await settle();
    const first = httpMock.expectOne((r) => r.url === '/api/v1/accounts/me/following');
    expect(first.request.params.get('max_id')).toBeNull();
    first.flush([account('alice')], {
      headers: {
        Link: '<https://social.example/api/v1/accounts/me/following?max_id=999>; rel="next"',
      },
    });

    await settle();
    const second = httpMock.expectOne((r) => r.url === '/api/v1/accounts/me/following');
    expect(second.request.params.get('max_id')).toBe('999');
    second.flush([account('bob')]);

    await loading;
    expect(finder.rows()).toHaveLength(2);
    expect(finder.sourcePageCount()).toBe(2);
  });

  it('spends zero searches on the free pass and confirms bios in one batch', async () => {
    const finder = setup();
    const loading = finder.load();

    await flushFollowing([
      account('alice', { note: '<p>bsky: https://bsky.app/profile/alice.bsky.social</p>' }),
      account('bob', { note: '<p>also @bob.bsky.social</p>' }),
      account('carol', { note: '<p>no handle here</p>' }),
    ]);

    // One getProfiles for both clues — 25 to a call, so two people cost one request.
    const profiles = httpMock.expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.getProfiles'));
    expect(profiles.request.params.getAll('actors')).toEqual([
      'alice.bsky.social',
      'bob.bsky.social',
    ]);
    profiles.flush({
      profiles: [
        { did: 'did:plc:alice', handle: 'alice.bsky.social', displayName: 'Alice' },
        { did: 'did:plc:bob', handle: 'bob.bsky.social', displayName: 'Bob' },
      ],
    });

    await loading;

    expect(finder.freeMatchCount()).toBe(2);
    expect(finder.callCount()).toBe(0);
    expect(finder.confirmCount()).toBe(1);
    expect(finder.rows()[0].matches[0].confidence).toBe('exact');
    expect(finder.rows()[0].matches[0].account.id).toBe('bsky:did:plc:alice');
    // Carol named nobody, so she is what a paid scan would work through.
    expect(finder.pendingRows().map((row) => row.person.username)).toEqual(['carol']);
  });

  it('marks a verified profile field as verified rather than merely claimed', async () => {
    const finder = setup();
    const loading = finder.load();

    await flushFollowing([
      account('alice', {
        fields: [
          {
            name: 'Bluesky',
            value: 'https://bsky.app/profile/alice.bsky.social',
            verified_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    ]);
    httpMock
      .expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.getProfiles'))
      .flush({ profiles: [{ did: 'did:plc:alice', handle: 'alice.bsky.social' }] });

    await loading;
    expect(finder.rows()[0].matches[0].signals).toEqual(['Verified link in their profile']);
  });

  it('records existing follows from the free pass without extra calls', async () => {
    const finder = setup();
    const loading = finder.load();

    await flushFollowing([
      account('alice', { note: 'https://bsky.app/profile/alice.bsky.social' }),
    ]);
    httpMock
      .expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.getProfiles'))
      .flush({
        profiles: [
          {
            did: 'did:plc:alice',
            handle: 'alice.bsky.social',
            viewer: { following: 'at://did:plc:me/app.bsky.graph.follow/1' },
          },
        ],
      });

    await loading;
    // getProfiles carries viewer state, so the Bluesky side needs no relationship call.
    expect(finder.isFollowing(finder.rows()[0].matches[0].account)).toBe(true);
  });

  it('stops the paid scan at the budget and resumes where it left off', async () => {
    const finder = setup();
    const loading = finder.load();
    await flushFollowing([account('alice'), account('bob'), account('carol')]);
    await loading;

    expect(finder.pendingRows()).toHaveLength(3);

    const firstScan = finder.scan(2);
    for (const handle of ['alice', 'bob']) {
      await settle();
      const req = httpMock.expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.searchActors'));
      expect(req.request.params.get('q')).toBe(handle);
      req.flush({ actors: [] });
    }
    await firstScan;

    expect(finder.callCount()).toBe(2);
    expect(finder.pendingRows().map((row) => row.person.username)).toEqual(['carol']);

    const secondScan = finder.scan(2);
    await settle();
    const resumed = httpMock.expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.searchActors'));
    expect(resumed.request.params.get('q')).toBe('carol');
    resumed.flush({ actors: [] });
    await secondScan;

    expect(finder.callCount()).toBe(3);
    expect(finder.pendingRows()).toHaveLength(0);
  });

  it('gives up the rest of the scan on a rate limit', async () => {
    const finder = setup();
    const loading = finder.load();
    await flushFollowing([account('alice'), account('bob')]);
    await loading;

    const scanning = finder.scan(10);
    await settle();
    httpMock
      .expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.searchActors'))
      .flush({}, { status: 429, statusText: 'Too Many Requests' });
    await scanning;

    // A rate limit will not clear mid-scan, so bob is never attempted.
    expect(finder.callCount()).toBe(1);
    expect(finder.rows()[0].error).toContain('Rate limited');
  });

  it('still follows after a stopped scan', async () => {
    // stop() and a 429 both leave the stop flag set. A later Follow click is a
    // new action, not a resumption of the cancelled one, so followAll clears the
    // flag first — without that, this click is a silent no-op.
    const finder = setup();
    finder.setDirection({ source: 'bluesky', target: 'mastodon' });

    const loading = finder.load();
    await settle();
    httpMock
      .expectOne((r) => r.url === `${PUBLIC}/xrpc/app.bsky.graph.getFollows`)
      .flush({ follows: [{ did: 'did:plc:alice', handle: 'alice.bsky.social' }] });
    await loading;

    finder.stop();

    const target = account('alice', { id: '42' });
    const following = finder.followAll([target]);
    await settle();
    httpMock
      .expectOne((r) => r.url === '/api/v1/accounts/42/follow')
      .flush({
        id: '42',
        following: true,
        followed_by: false,
        requested: false,
        blocking: false,
        muting: false,
      });
    await following;

    expect(finder.isFollowing(target)).toBe(true);
  });

  it('reads Bluesky follows and searches Mastodon in the other direction', async () => {
    const finder = setup(account('me', { acct: 'me.bsky.social' }));
    finder.setDirection({ source: 'bluesky', target: 'mastodon' });

    const loading = finder.load();
    await settle();
    const follows = httpMock.expectOne((r) => r.url === `${PUBLIC}/xrpc/app.bsky.graph.getFollows`);
    expect(follows.request.params.get('actor')).toBe('me.bsky.social');
    follows.flush({
      follows: [
        {
          did: 'did:plc:alice',
          handle: 'alice.bsky.social',
          description: 'also @alice@fosstodon.org',
        },
        { did: 'did:plc:bob', handle: 'bob.bsky.social', description: 'no handle' },
      ],
    });

    // The Mastodon side has no batch lookup, so a clue costs one lookup — still
    // a lookup rather than a search.
    await settle();
    const lookup = httpMock.expectOne((r) => r.url === '/api/v1/accounts/lookup');
    expect(lookup.request.params.get('acct')).toBe('alice@fosstodon.org');
    lookup.flush(account('alice', { id: '42', acct: 'alice@fosstodon.org' }));

    await settle();
    const relationships = httpMock.expectOne((r) =>
      r.url.startsWith('/api/v1/accounts/relationships'),
    );
    relationships.flush([]);

    await loading;
    expect(finder.freeMatchCount()).toBe(1);
    expect(finder.rows()[0].matches[0].account.id).toBe('42');
    expect(finder.pendingRows().map((row) => row.person.acct)).toEqual(['bob.bsky.social']);
  });

  it('reports a failure to read the follow list rather than showing an empty result', async () => {
    const finder = setup();
    const loading = finder.load();
    await settle();
    httpMock
      .expectOne((r) => r.url === '/api/v1/accounts/me/following')
      .flush({}, { status: 500, statusText: 'Server Error' });
    await loading;

    expect(finder.loadError()).toBe('Could not read who you follow on Mastodon.');
    expect(finder.rows()).toEqual([]);
  });

  it('clears results when the direction changes', async () => {
    const finder = setup();
    const loading = finder.load();
    await flushFollowing([account('alice')]);
    await loading;
    expect(finder.rows()).toHaveLength(1);

    finder.setDirection({ source: 'bluesky', target: 'mastodon' });
    expect(finder.rows()).toEqual([]);
    expect(finder.sourcePageCount()).toBe(0);
  });
});
