import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from './auth';
import { Server } from './server';
import { bskyIdentityStored, seedBskyIdentity, seedSessions } from './testing/seed-storage';
import { saveBlueskyIdentity } from './providers/bluesky/bluesky-identity-store';
import { BlueskyOAuth } from './providers/bluesky/bluesky-oauth';
import { scopeSuffixForMastodonAccount, scopeSuffixForToken } from './account-scope';

/**
 * Auth session/server linkage. The core account-switching bug was that a token's instance
 * wasn't remembered, so switching accounts left the Server pointed at the previous host and
 * verify_credentials 401'd. These tests pin the capture-on-login / restore-on-switch contract.
 */
describe('Auth + Server linkage', () => {
  let auth: Auth;
  let server: Server;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [Auth, Server] });
    server = TestBed.inject(Server);
    auth = TestBed.inject(Auth);
  });

  it('setToken captures the currently-selected instance into the session', () => {
    server.setBaseUrl('https://mastodon.art');
    auth.setToken('art-token');

    const session = auth.sessions().find((s) => s.token === 'art-token');
    expect(session?.server).toBe('https://mastodon.art');
  });

  it('switchTo restores the session’s instance before activating its token', () => {
    server.setBaseUrl('https://mastodon.art');
    auth.setToken('art-token');

    server.setBaseUrl('https://mastodon.social');
    auth.setToken('social-token');
    expect(server.baseUrl()).toBe('https://mastodon.social');

    // Switching back to the art account must move the server back to mastodon.art.
    expect(auth.switchTo('art-token')).toBe(true);
    expect(server.baseUrl()).toBe('https://mastodon.art');
    expect(auth.token()).toBe('art-token');
  });

  it('backfills server for a legacy session that predates the field', () => {
    // Simulate a session saved before `server` existed (no server key).
    seedSessions([{ token: 'legacy', account: null }]);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [Auth, Server] });
    server = TestBed.inject(Server);
    auth = TestBed.inject(Auth);

    server.setBaseUrl('https://mastodon.social');
    auth.setToken('legacy');

    const session = auth.sessions().find((s) => s.token === 'legacy');
    expect(session?.server).toBe('https://mastodon.social');
  });

  it('rotates credentials in place for the same verified account and server', () => {
    server.setBaseUrl('https://mastodon.example');
    auth.setToken('old-token');
    localStorage.setItem(
      `mockingbird_rss_feeds${scopeSuffixForToken('old-token')}`,
      '["saved-feed"]',
    );
    auth.setAccount({ id: '42', username: 'alice', acct: 'alice' } as never);
    const sessionId = auth.sessions()[0].id;
    auth.setToken('new-token');

    expect(
      auth.adoptReauthorizedSession(
        { id: '42', username: 'alice', acct: 'alice' } as never,
        'new-token',
        'https://mastodon.example',
      ),
    ).toBe(true);
    expect(auth.sessions()).toHaveLength(1);
    expect(auth.sessions()[0]).toMatchObject({ id: sessionId, token: 'new-token' });
    expect(auth.token()).toBe('new-token');
    expect(localStorage.getItem('mastodon_mock_session_tokens')).not.toContain('old-token');
    expect(
      localStorage.getItem(
        `mockingbird_rss_feeds${scopeSuffixForMastodonAccount('42', 'https://mastodon.example')}`,
      ),
    ).toBe('["saved-feed"]');
  });

  it('does not merge equal numeric account ids from different servers', () => {
    server.setBaseUrl('https://one.example');
    auth.setToken('one-token');
    auth.setAccount({ id: '42', username: 'alice', acct: 'alice' } as never);
    server.setBaseUrl('https://two.example');
    auth.setToken('two-token');

    expect(
      auth.adoptReauthorizedSession(
        { id: '42', username: 'other', acct: 'other' } as never,
        'two-token',
        'https://two.example',
      ),
    ).toBe(false);
    expect(auth.sessions()).toHaveLength(2);
  });

  it('enters Anonymous without removing authenticated sessions', () => {
    server.setBaseUrl('https://mastodon.art');
    auth.setToken('art-token');

    auth.enterAnonymous('https://hachyderm.io');

    expect(auth.isAuthenticated).toBe(true);
    expect(auth.isAnonymous).toBe(true);
    expect(auth.token()).toBeNull();
    expect(auth.account()?.display_name).toBe('Anonymous');
    expect(server.baseUrl()).toBe('https://hachyderm.io');
    expect(auth.sessions().map((s) => s.token)).toEqual(['art-token']);
  });

  it('offers login prompts only when Anonymous is the only local account', () => {
    const auth = TestBed.inject(Auth);
    auth.enterAnonymous();
    expect(auth.shouldOfferLogin).toBe(true);

    auth.setToken('saved-token');
    auth.enterAnonymous();
    expect(auth.shouldOfferLogin).toBe(false);
  });

  it('exits Anonymous for login without activating or deleting a saved session', () => {
    server.setBaseUrl('https://mastodon.art');
    auth.setToken('art-token');
    auth.enterAnonymous('https://mastodon.social');

    auth.exitAnonymous();

    expect(auth.isAuthenticated).toBe(false);
    expect(auth.isAnonymous).toBe(false);
    expect(auth.sessions().map((session) => session.token)).toEqual(['art-token']);
  });

  /**
   * The reported bug, at its source.
   *
   * "Log out" offered a dialog promising not to delete anything, and then called
   * `logout()`, which forgets the active account by design. Worse, it auto-switched
   * into the next saved account, so the app looked like it had merely changed
   * identity — the deletion was only noticed after it had happened twice and both
   * accounts were gone.
   */
  it('leaveActive signs out without forgetting any saved account', () => {
    server.setBaseUrl('https://mastodon.art');
    auth.setToken('art-token');
    server.setBaseUrl('https://mastodon.social');
    auth.setToken('social-token');
    auth.switchTo('art-token');

    auth.leaveActive();

    // Both accounts survive, in order.
    expect(auth.sessions().map((session) => session.token)).toEqual(['art-token', 'social-token']);
    // ...and no identity was silently activated in place of the one left.
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.token()).toBeNull();
    expect(localStorage.getItem('mastodon_mock_token')).toBeNull();
  });

  it('leaveActive survives being used twice, which is how both accounts were lost', () => {
    server.setBaseUrl('https://mastodon.art');
    auth.setToken('art-token');
    server.setBaseUrl('https://mastodon.social');
    auth.setToken('social-token');

    auth.leaveActive();
    auth.switchTo('social-token');
    auth.leaveActive();

    expect(auth.sessions()).toHaveLength(2);
  });

  it('leaveActive from Anonymous leaves the stable alone too', () => {
    server.setBaseUrl('https://mastodon.art');
    auth.setToken('art-token');
    auth.enterAnonymous('https://ohai.social');

    auth.leaveActive();

    expect(auth.sessions().map((session) => session.token)).toEqual(['art-token']);
    expect(auth.isAnonymous).toBe(false);
    expect(auth.isAuthenticated).toBe(false);
  });

  /** The narrower promise still has to work: removing an account must remove it. */
  it('logout still forgets the active account, for callers that mean it', () => {
    server.setBaseUrl('https://mastodon.art');
    auth.setToken('art-token');
    server.setBaseUrl('https://mastodon.social');
    auth.setToken('social-token');
    auth.switchTo('art-token');

    auth.logout();

    expect(auth.sessions().map((session) => session.token)).toEqual(['social-token']);
  });

  it('always offers Anonymous in the switcher and restores a saved login', () => {
    server.setBaseUrl('https://mastodon.art');
    auth.setToken('art-token');

    expect(auth.otherSessions().some((choice) => choice.kind === 'anonymous')).toBe(true);

    auth.enterAnonymous();
    const saved = auth.otherSessions().find((choice) => choice.kind === 'mastodon')!;
    expect(auth.switchAccount(saved)).toBe(true);

    expect(auth.isAnonymous).toBe(false);
    expect(auth.token()).toBe('art-token');
    expect(server.baseUrl()).toBe('https://mastodon.art');
  });
});

/**
 * The Bluesky-primary account kind.
 *
 * These are all written against the risk that made this a sprint of its own:
 * widening the identity model is exactly how the reported account-loss bug
 * comes back. Every exit path is asserted to leave the *other* accounts alone.
 */
describe('Auth account kinds', () => {
  let auth: Auth;
  let server: Server;

  /** Rebuild Auth so it re-reads storage, as it does on a page load. */
  function rebuild(): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [Auth, Server] });
    server = TestBed.inject(Server);
    auth = TestBed.inject(Auth);
  }

  beforeEach(() => {
    localStorage.clear();
    rebuild();
  });

  describe('the overloaded-predicate split', () => {
    it('answers the triple correctly for a Mastodon account', () => {
      auth.setToken('t');
      expect(auth.kind()).toBe('mastodon');
      expect(auth.lacksMastodonToken).toBe(false);
      expect(auth.isAnonymousIdentity).toBe(false);
      expect(auth.isBlueskyPrimary).toBe(false);
    });

    it('answers the triple correctly for Anonymous', () => {
      auth.enterAnonymous();
      expect(auth.kind()).toBe('anonymous');
      expect(auth.lacksMastodonToken).toBe(true);
      expect(auth.isAnonymousIdentity).toBe(true);
      expect(auth.isBlueskyPrimary).toBe(false);
    });

    /**
     * The case the split exists for: no Mastodon token (so authenticated
     * Mastodon calls must be skipped) but *not* the local Anonymous identity
     * (so the anonymous stores must not be touched).
     */
    it('answers the triple correctly for Bluesky-primary', () => {
      seedBskyIdentity({ did: 'did:plc:abc123', handle: 'me.bsky.social' });
      expect(auth.enterBluesky()).toBe(true);

      expect(auth.kind()).toBe('bluesky');
      expect(auth.lacksMastodonToken).toBe(true);
      expect(auth.isAnonymousIdentity).toBe(false);
      expect(auth.isBlueskyPrimary).toBe(true);
      // The legacy predicate must stay false, or every anonymous-store branch
      // in the app would fire for a Bluesky account.
      expect(auth.isAnonymous).toBe(false);
    });

    it('answers the triple correctly when signed out', () => {
      expect(auth.kind()).toBeNull();
      expect(auth.lacksMastodonToken).toBe(true);
      expect(auth.isAnonymousIdentity).toBe(false);
      expect(auth.isBlueskyPrimary).toBe(false);
    });
  });

  it('counts a Bluesky-primary account as authenticated, so the guard admits it', () => {
    seedBskyIdentity({ did: 'did:plc:abc123', handle: 'me.bsky.social' });
    auth.enterBluesky();
    expect(auth.isAuthenticated).toBe(true);
  });

  it('surfaces the Bluesky identity as the active account', () => {
    seedBskyIdentity({
      did: 'did:plc:abc123',
      handle: 'me.bsky.social',
      displayName: 'Me',
    });
    auth.enterBluesky();

    expect(auth.account()?.display_name).toBe('Me');
    expect(auth.account()?.acct).toBe('me.bsky.social');
    // Namespaced, so it can never collide with a real Mastodon account id.
    expect(auth.account()?.id).toBe('bsky:did:plc:abc123');
  });

  it('survives a reload', () => {
    seedBskyIdentity({ did: 'did:plc:abc123', handle: 'me.bsky.social' });
    auth.enterBluesky();

    rebuild();

    expect(auth.kind()).toBe('bluesky');
    expect(auth.account()?.acct).toBe('me.bsky.social');
  });

  /**
   * A stale `bluesky` mode key with no identity behind it must not strand the
   * app in an account that cannot make a single request. This is the state a
   * settings import leaves behind: it carries the profile, never the JWTs.
   */
  it('refuses to activate a Bluesky kind with no identity in storage', () => {
    localStorage.setItem('mastodon_mock_account_mode', 'bluesky');
    rebuild();

    expect(auth.kind()).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
  });

  it('refuses enterBluesky when there is no identity to enter', () => {
    expect(auth.enterBluesky()).toBe(false);
    expect(auth.kind()).toBeNull();
  });

  describe('switching', () => {
    it('round-trips Bluesky → Mastodon → Bluesky with both accounts intact', () => {
      server.setBaseUrl('https://mastodon.art');
      auth.setToken('art-token');
      seedBskyIdentity({ did: 'did:plc:abc123', handle: 'me.bsky.social' });

      expect(auth.enterBluesky()).toBe(true);
      expect(auth.token()).toBeNull();
      // The Mastodon session survives being switched away from.
      expect(auth.sessions().map((s) => s.token)).toEqual(['art-token']);

      const mastodon = auth.otherSessions().find((c) => c.kind === 'mastodon')!;
      expect(auth.switchAccount(mastodon)).toBe(true);
      expect(auth.kind()).toBe('mastodon');
      expect(auth.token()).toBe('art-token');
      expect(server.baseUrl()).toBe('https://mastodon.art');

      const bluesky = auth.otherSessions().find((c) => c.kind === 'bluesky')!;
      expect(auth.switchAccount(bluesky)).toBe(true);
      expect(auth.kind()).toBe('bluesky');
      expect(auth.token()).toBeNull();
      expect(auth.sessions().map((s) => s.token)).toEqual(['art-token']);
    });

    it('offers the Bluesky identity in the switcher only when it is not active', () => {
      seedBskyIdentity({ did: 'did:plc:abc123', handle: 'me.bsky.social' });
      auth.setToken('art-token');

      expect(auth.otherSessions().some((c) => c.kind === 'bluesky')).toBe(true);

      auth.enterBluesky();
      expect(auth.otherSessions().some((c) => c.kind === 'bluesky')).toBe(false);
    });

    it('switches between multiple Bluesky alts by DID', () => {
      seedBskyIdentity({ did: 'did:plc:one', handle: 'one.bsky.social' });
      seedBskyIdentity({ did: 'did:plc:two', handle: 'two.bsky.social' });

      expect(auth.enterBluesky('did:plc:one')).toBe(true);
      const alt = auth.otherSessions().find((choice) => choice.did === 'did:plc:two')!;
      expect(alt.account?.acct).toBe('two.bsky.social');

      expect(auth.switchAccount(alt)).toBe(true);
      expect(auth.account()?.acct).toBe('two.bsky.social');
      expect(auth.otherSessions().some((choice) => choice.did === 'did:plc:one')).toBe(true);
      expect(auth.otherSessions().some((choice) => choice.did === 'did:plc:two')).toBe(false);
    });

    it('removes one inactive Bluesky alt without touching the active identity', () => {
      seedBskyIdentity({ did: 'did:plc:one', handle: 'one.bsky.social' });
      seedBskyIdentity({ did: 'did:plc:two', handle: 'two.bsky.social' });
      auth.enterBluesky('did:plc:one');

      auth.removeBlueskyIdentity('did:plc:two');

      expect(auth.account()?.acct).toBe('one.bsky.social');
      expect(auth.blueskyAccounts().map((choice) => choice.did)).toEqual(['did:plc:one']);
    });

    it('revokes the SDK session when an OAuth alt is removed', () => {
      saveBlueskyIdentity(
        { service: 'https://pds.example', did: 'did:plc:oauth', handle: 'oauth.example' },
        { authMethod: 'oauth' },
      );
      rebuild();
      const revoke = vi.spyOn(TestBed.inject(BlueskyOAuth), 'revoke').mockResolvedValue(undefined);

      auth.removeBlueskyIdentity('did:plc:oauth');

      expect(revoke).toHaveBeenCalledWith('did:plc:oauth');
      expect(auth.blueskyAccounts().some((choice) => choice.did === 'did:plc:oauth')).toBe(false);
    });

    it('does not offer a Bluesky row when no identity exists', () => {
      auth.setToken('art-token');
      expect(auth.otherSessions().some((c) => c.kind === 'bluesky')).toBe(false);
    });

    it('switches Anonymous → Bluesky without disturbing either', () => {
      seedBskyIdentity({ did: 'did:plc:abc123', handle: 'me.bsky.social' });
      auth.enterAnonymous();

      const bluesky = auth.otherSessions().find((c) => c.kind === 'bluesky')!;
      expect(auth.switchAccount(bluesky)).toBe(true);

      expect(auth.isBlueskyPrimary).toBe(true);
      expect(auth.isAnonymous).toBe(false);
      // Anonymous is permanent and is still offered to switch back to.
      expect(auth.otherSessions().some((c) => c.kind === 'anonymous')).toBe(true);
    });
  });

  /**
   * The account-loss suite. `leaveActive` exists because signing out once
   * deleted a saved account and silently activated another; a new account kind
   * is the obvious way to reintroduce that, so every exit is pinned here.
   */
  describe('leaving, without losing anything', () => {
    beforeEach(() => {
      server.setBaseUrl('https://mastodon.art');
      auth.setToken('art-token');
      seedBskyIdentity({ did: 'did:plc:abc123', handle: 'me.bsky.social' });
      auth.enterBluesky();
    });

    it('leaveActive keeps both the Mastodon stable and the Bluesky identity', () => {
      auth.leaveActive();

      expect(auth.isAuthenticated).toBe(false);
      expect(auth.sessions().map((s) => s.token)).toEqual(['art-token']);
      expect(bskyIdentityStored()).toBe(true);
      // Still switchable back to, which is the whole promise of leaveActive.
      rebuild();
      expect(auth.otherSessions().some((c) => c.kind === 'bluesky')).toBe(true);
    });

    /**
     * The specific hazard: without a Bluesky branch, `logout()` filters the
     * stable by a null token (removing nothing) and then auto-switches into a
     * saved Mastodon account — so the app looks like it *changed* accounts
     * rather than signing out. That is precisely how the original bug hid.
     */
    it('logout forgets the Bluesky identity and does NOT silently activate Mastodon', () => {
      auth.logout();

      expect(bskyIdentityStored()).toBe(false);
      expect(auth.isAuthenticated).toBe(false);
      expect(auth.kind()).toBeNull();
      // The Mastodon account is neither activated nor destroyed.
      expect(auth.token()).toBeNull();
      expect(auth.sessions().map((s) => s.token)).toEqual(['art-token']);
    });

    it('removeSession cannot touch the Bluesky identity', () => {
      auth.removeSession('art-token');

      expect(auth.sessions()).toHaveLength(0);
      expect(bskyIdentityStored()).toBe(true);
    });

    it('logoutAll takes everything, including the Bluesky identity', () => {
      auth.logoutAll();

      expect(auth.sessions()).toHaveLength(0);
      expect(bskyIdentityStored()).toBe(false);
      expect(auth.isAuthenticated).toBe(false);
    });

    it('exitAnonymous does nothing to a Bluesky-primary account', () => {
      auth.exitAnonymous();

      expect(auth.isBlueskyPrimary).toBe(true);
      expect(bskyIdentityStored()).toBe(true);
    });
  });
});
