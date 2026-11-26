import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Account, Relationship } from '../platform/api/models';
import { Auth } from '../platform/session/auth';
import { ClientPrefs } from '../platform/storage/client-prefs';
import { FollowState } from './follow-state';
import { ReplyGuys } from './reply-guys';

const RELATIONSHIPS = '/api/v1/accounts/relationships';

function account(id: string): Account {
  return { id, acct: id, username: id } as Account;
}

function relationship(id: string, overrides: Partial<Relationship> = {}): Relationship {
  return {
    id,
    following: false,
    followed_by: false,
    requested: false,
    blocking: false,
    muting: false,
    ...overrides,
  };
}

/** Let the coalescing microtask, and FollowState's request, run. */
async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ReplyGuys', () => {
  let guys: ReplyGuys;
  let http: HttpTestingController;
  let auth: Auth;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
    });
    guys = TestBed.inject(ReplyGuys);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(Auth);
    auth.setToken('token');
    auth.setAccount({ id: 'me' } as Account);
  });

  it('has no answer about the reader themselves, and asks nothing', async () => {
    expect(guys.iFollow(account('me'))).toBeNull();
    expect(guys.followsMe(account('me'))).toBeNull();
    await tick();
    http.expectNone(() => true);
  });

  it('asks Mastodon once per page of cards and answers both directions', async () => {
    const guy = account('guy');
    const friend = account('friend');
    expect(guys.iFollow(guy)).toBeNull();
    expect(guys.iFollow(friend)).toBeNull();
    await tick();
    const req = http.expectOne((r) => r.url === RELATIONSHIPS);
    expect(req.request.params.getAll('id[]')).toEqual(['guy', 'friend']);
    req.flush([
      relationship('guy', { followed_by: true }),
      relationship('friend', { following: true }),
    ]);
    await tick();
    expect(guys.notFollowed(guy)).toBe(true);
    expect(guys.followsMe(guy)).toBe(true);
    expect(guys.notFollowed(friend)).toBe(false);
    expect(guys.followsMe(friend)).toBe(false);
    // Asked once: later renders read the answer.
    guys.iFollow(guy);
    await tick();
    http.expectNone((r) => r.url === RELATIONSHIPS);
  });

  it('a follow written anywhere lifts the guard at once', () => {
    const follows = TestBed.inject(FollowState);
    follows.write([relationship('guy')]);
    expect(guys.notFollowed(account('guy'))).toBe(true);
    follows.write([relationship('guy', { following: true })]);
    expect(guys.notFollowed(account('guy'))).toBe(false);
  });

  it('reads a Bluesky author’s viewer state without a request', async () => {
    const author = { ...account('bsky:did:plc:guy'), viewerFollows: false, followsViewer: true };
    expect(guys.notFollowed(author)).toBe(true);
    expect(guys.followsMe(author)).toBe(true);
    await tick();
    http.expectNone(() => true);
  });

  it('a failed lookup stays "no answer", never "not followed"', async () => {
    expect(guys.notFollowed(account('guy'))).toBe(false);
    await tick();
    http
      .expectOne((r) => r.url === RELATIONSHIPS)
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await tick();
    expect(guys.iFollow(account('guy'))).toBeNull();
    expect(guys.notFollowed(account('guy'))).toBe(false);
  });

  it('asks nothing for an anonymous reader', async () => {
    Object.defineProperty(auth, 'isAnonymous', { get: () => true, configurable: true });
    expect(guys.iFollow(account('guy'))).toBeNull();
    await tick();
    http.expectNone(() => true);
  });

  it('the click-through is on by default', () => {
    expect(TestBed.inject(ClientPrefs).replyGuyCw()).toBe(true);
    expect(guys.cwOn()).toBe(true);
    expect(guys.hideFromNotifications()).toBe(false);
  });
});
