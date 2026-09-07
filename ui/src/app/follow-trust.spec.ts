import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Auth } from './auth';
import { FollowTrust } from './follow-trust';
import { Account } from './models';
import { AnonymousAccount } from './providers/anonymous/anonymous-account';
import { AnonymousFollows } from './providers/anonymous/anonymous-follows';

function account(id: string): Account {
  return { id, acct: id, url: `https://example.social/@${id}` } as Account;
}

/** Wait for the microtask that coalesces per-card questions into one request. */
const flushBatch = () => Promise.resolve();

describe('FollowTrust', () => {
  let follows: FollowTrust;
  let http: HttpTestingController;

  function setup(auth: Partial<Auth> = {}, anonFollowing: string[] = []) {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Auth, useValue: { isAnonymous: false, isBlueskyPrimary: false, ...auth } },
        {
          provide: AnonymousFollows,
          useValue: { isFollowing: (a: Account) => anonFollowing.includes(a.acct) },
        },
        { provide: AnonymousAccount, useValue: { server: () => 'https://example.social' } },
      ],
    });
    follows = TestBed.inject(FollowTrust);
    http = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => setup());

  it('is not trusted until the relationship arrives', async () => {
    // The safety property: unknown reads as "not following", so a warning stays
    // shut rather than opening on a guess.
    expect(follows.isFollowing(account('alice'))).toBe(false);

    await flushBatch();
    http
      .expectOne((r) => r.url === '/api/v1/accounts/relationships')
      .flush([{ id: 'alice', following: true }]);

    expect(follows.isFollowing(account('alice'))).toBe(true);
  });

  it('answers a whole page in one request', async () => {
    for (const id of ['a', 'b', 'c']) {
      follows.isFollowing(account(id));
    }
    await flushBatch();

    const req = http.expectOne((r) => r.url === '/api/v1/accounts/relationships');
    expect(req.request.params.getAll('id[]')).toEqual(['a', 'b', 'c']);
    req.flush([
      { id: 'a', following: true },
      { id: 'b', following: false },
      { id: 'c', following: true },
    ]);

    expect(follows.isFollowing(account('a'))).toBe(true);
    expect(follows.isFollowing(account('b'))).toBe(false);
    expect(follows.isFollowing(account('c'))).toBe(true);
    http.verify();
  });

  it('never asks about the same account twice', async () => {
    follows.isFollowing(account('alice'));
    await flushBatch();
    http
      .expectOne((r) => r.url === '/api/v1/accounts/relationships')
      .flush([{ id: 'alice', following: false }]);

    follows.isFollowing(account('alice'));
    await flushBatch();
    http.expectNone((r) => r.url === '/api/v1/accounts/relationships');
  });

  it('settles ids the server omitted, so they are not re-requested', async () => {
    follows.isFollowing(account('ghost'));
    await flushBatch();
    http.expectOne((r) => r.url === '/api/v1/accounts/relationships').flush([]);

    follows.isFollowing(account('ghost'));
    await flushBatch();
    http.expectNone((r) => r.url === '/api/v1/accounts/relationships');
  });

  it('allows a retry after a failed request', async () => {
    follows.isFollowing(account('alice'));
    await flushBatch();
    http
      .expectOne((r) => r.url === '/api/v1/accounts/relationships')
      .flush(null, { status: 503, statusText: 'nope' });

    // Still safely untrusted, and not pinned there for the session.
    expect(follows.isFollowing(account('alice'))).toBe(false);
    await flushBatch();
    http
      .expectOne((r) => r.url === '/api/v1/accounts/relationships')
      .flush([{ id: 'alice', following: true }]);
    expect(follows.isFollowing(account('alice'))).toBe(true);
  });

  it('prime resolves a page before any card asks', async () => {
    follows.prime([account('a'), account('b')]);
    const req = http.expectOne((r) => r.url === '/api/v1/accounts/relationships');
    expect(req.request.params.getAll('id[]')).toEqual(['a', 'b']);
    req.flush([{ id: 'a', following: true }]);

    expect(follows.isFollowing(account('a'))).toBe(true);
    await flushBatch();
    http.expectNone((r) => r.url === '/api/v1/accounts/relationships');
  });

  it('reset makes it ask again', async () => {
    follows.isFollowing(account('alice'));
    await flushBatch();
    http
      .expectOne((r) => r.url === '/api/v1/accounts/relationships')
      .flush([{ id: 'alice', following: true }]);

    follows.reset();
    expect(follows.isFollowing(account('alice'))).toBe(false);
    await flushBatch();
    http.expectOne((r) => r.url === '/api/v1/accounts/relationships');
  });

  describe('without a Mastodon token', () => {
    it('reads the local follow store when anonymous, with no request', async () => {
      setup({ isAnonymous: true }, ['friend']);
      expect(follows.isFollowing(account('friend'))).toBe(true);
      expect(follows.isFollowing(account('stranger'))).toBe(false);
      await flushBatch();
      http.expectNone((r) => r.url === '/api/v1/accounts/relationships');
    });

    /** Bluesky-primary is signed in, but has no Mastodon token to spend. */
    it('reads the local follow store when Bluesky-primary', async () => {
      setup({ isBlueskyPrimary: true }, ['friend']);
      expect(follows.isFollowing(account('friend'))).toBe(true);
      follows.prime([account('a')]);
      await flushBatch();
      http.expectNone((r) => r.url === '/api/v1/accounts/relationships');
    });
  });
});
