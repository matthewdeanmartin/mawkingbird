import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { accountScopeSuffix, MISSKEY_SCOPE_PREFIX } from './account-scope';
import { Auth } from './auth';
import { Server } from '../http/server';
import { seedSessions } from '../../testing/seed-storage';
import {
  misskeyIdentities,
  saveMisskeyIdentity,
} from '../../connections/misskey/misskey-identity-store';

const ALICE = {
  server: 'https://misskey.io',
  userId: 'u1',
  username: 'alice',
  name: 'Alice',
  avatarUrl: 'https://misskey.io/a.webp',
};
const BOB = { ...ALICE, userId: 'u2', username: 'bob', name: 'Bob' };

function freshAuth(): Auth {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [Auth, Server] });
  return TestBed.inject(Auth);
}

/**
 * Misskey as a first-class account kind (Sprint M1). The contract mirrors the
 * Bluesky-primary one: entering, switching and leaving never cost a saved
 * account of any other kind, and a Misskey identity never carries a Mastodon
 * token.
 */
describe('Auth with a Misskey-primary identity', () => {
  beforeEach(() => localStorage.clear());

  it('enters a saved identity as the misskey kind with no Mastodon token', () => {
    const key = saveMisskeyIdentity(ALICE, { token: 'mk-token' });
    const auth = freshAuth();
    expect(auth.enterMisskey(key)).toBe(true);
    expect(auth.kind()).toBe('misskey');
    expect(auth.isMisskeyPrimary).toBe(true);
    expect(auth.isForeignPrimary).toBe(true);
    expect(auth.isBlueskyPrimary).toBe(false);
    expect(auth.isAnonymous).toBe(false);
    expect(auth.token()).toBeNull();
    expect(auth.activeMisskeyKey()).toBe(key);
    expect(auth.account()?.id).toBe('mk:u1');
    expect(auth.account()?.acct).toBe('alice@misskey.io');
  });

  it('refuses to enter when there is no identity', () => {
    const auth = freshAuth();
    expect(auth.enterMisskey('https://misskey.io#nobody')).toBe(false);
    expect(auth.kind()).toBeNull();
  });

  it('survives a reload as the same identity', () => {
    const key = saveMisskeyIdentity(ALICE, { token: 'mk-token' });
    freshAuth().enterMisskey(key);
    const reloaded = freshAuth();
    expect(reloaded.kind()).toBe('misskey');
    expect(reloaded.activeMisskeyKey()).toBe(key);
    expect(reloaded.matchesStoredAccount()).toBe(true);
    expect(reloaded.identityKey()).toMatch(/^misskey:[0-9a-f]{8}$/);
  });

  it('treats a misskey mode key without its identity as signed out', () => {
    localStorage.setItem('mastodon_mock_account_mode', 'misskey');
    expect(freshAuth().kind()).toBeNull();
  });

  it('scopes account storage per Misskey identity', () => {
    const alice = saveMisskeyIdentity(ALICE, { token: 'a' });
    const bob = saveMisskeyIdentity(BOB, { token: 'b' });
    const auth = freshAuth();
    auth.enterMisskey(alice);
    const aliceScope = accountScopeSuffix();
    auth.enterMisskey(bob);
    const bobScope = accountScopeSuffix();
    expect(aliceScope.startsWith(MISSKEY_SCOPE_PREFIX)).toBe(true);
    expect(bobScope.startsWith(MISSKEY_SCOPE_PREFIX)).toBe(true);
    expect(aliceScope).not.toBe(bobScope);
  });

  it('lists other Misskey identities and Mastodon sessions as switch targets', () => {
    seedSessions([{ token: 'masto', server: 'https://mastodon.social', account: null }]);
    const alice = saveMisskeyIdentity(ALICE, { token: 'a' });
    const bob = saveMisskeyIdentity(BOB, { token: 'b' });
    const auth = freshAuth();
    auth.enterMisskey(alice);
    const keys = auth.otherSessions().map((choice) => choice.key);
    expect(keys).toContain(`misskey:${bob}`);
    expect(keys).not.toContain(`misskey:${alice}`);
    expect(keys.some((k) => k.startsWith('mastodon:'))).toBe(true);
    expect(keys).toContain('anonymous');
  });

  it('switches from Misskey to Mastodon and back without losing either', () => {
    seedSessions([{ token: 'masto', server: 'https://mastodon.social', account: null }]);
    const alice = saveMisskeyIdentity(ALICE, { token: 'a' });
    const auth = freshAuth();
    auth.enterMisskey(alice);
    expect(auth.switchTo('masto')).toBe(true);
    expect(auth.kind()).toBe('mastodon');
    expect(auth.activeMisskeyKey()).toBeNull();
    const back = auth.misskeyAccounts().find((choice) => choice.misskeyKey === alice);
    expect(back && auth.switchAccount(back)).toBe(true);
    expect(auth.kind()).toBe('misskey');
    expect(auth.token()).toBeNull();
    expect(auth.sessions().length).toBe(1);
  });

  it('logout forgets only the active Misskey identity and never activates Mastodon', () => {
    seedSessions([{ token: 'masto', server: 'https://mastodon.social', account: null }]);
    const alice = saveMisskeyIdentity(ALICE, { token: 'a' });
    const bob = saveMisskeyIdentity(BOB, { token: 'b' });
    const auth = freshAuth();
    auth.enterMisskey(alice);
    auth.logout();
    expect(auth.kind()).toBeNull();
    expect(auth.token()).toBeNull();
    expect(misskeyIdentities().map((i) => i.key)).toEqual([bob]);
    expect(auth.sessions().length).toBe(1);
  });

  it('leaveActive keeps the identity for the switcher', () => {
    const alice = saveMisskeyIdentity(ALICE, { token: 'a' });
    const auth = freshAuth();
    auth.enterMisskey(alice);
    auth.leaveActive();
    expect(auth.kind()).toBeNull();
    expect(misskeyIdentities().length).toBe(1);
  });

  it('removeMisskeyIdentity signs out only when it was the active one', () => {
    const alice = saveMisskeyIdentity(ALICE, { token: 'a' });
    const bob = saveMisskeyIdentity(BOB, { token: 'b' });
    const auth = freshAuth();
    auth.enterMisskey(alice);
    auth.removeMisskeyIdentity(bob);
    expect(auth.kind()).toBe('misskey');
    auth.removeMisskeyIdentity(alice);
    expect(auth.kind()).toBeNull();
    expect(misskeyIdentities()).toEqual([]);
  });

  it('logoutAll removes Misskey identities too', () => {
    saveMisskeyIdentity(ALICE, { token: 'a' });
    const auth = freshAuth();
    auth.logoutAll();
    expect(misskeyIdentities()).toEqual([]);
  });

  it('entering Anonymous clears the Misskey identity from the session but keeps it saved', () => {
    const alice = saveMisskeyIdentity(ALICE, { token: 'a' });
    const auth = freshAuth();
    auth.enterMisskey(alice);
    auth.enterAnonymous();
    expect(auth.activeMisskeyKey()).toBeNull();
    expect(auth.isForeignPrimary).toBe(false);
    expect(misskeyIdentities().length).toBe(1);
    expect(auth.shouldOfferLogin).toBe(false);
  });

  it('setAccount never writes a Mastodon account behind a Misskey identity', () => {
    const alice = saveMisskeyIdentity(ALICE, { token: 'a' });
    const auth = freshAuth();
    auth.enterMisskey(alice);
    auth.setAccount({ ...auth.account()!, id: '123', acct: 'someone@mastodon.social' });
    expect(auth.account()?.id).toBe('mk:u1');
  });
});
