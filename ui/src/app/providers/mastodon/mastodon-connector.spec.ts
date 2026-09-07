import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../auth';
import { seedBskyIdentity } from '../../testing/seed-storage';
import {
  clearMastodonConnectorToken,
  DEFAULT_CONNECTOR_SERVER,
  MastodonConnector,
  mastodonConnectorToken,
} from './mastodon-connector';

const MODE_KEY = 'mastodon_mock_account_mode';
const TOKEN_KEY = 'mastodon_mock_token';

/** Sign the test into a Bluesky-primary account before anything is constructed. */
function seedBlueskyPrimary(did = 'did:plc:me'): void {
  localStorage.setItem(MODE_KEY, 'bluesky');
  seedBskyIdentity({ did, handle: 'me.bsky.social' });
}

function connector(): MastodonConnector {
  return TestBed.inject(MastodonConnector);
}

/**
 * The **Mastodon connector**: Mastodon attached to a Bluesky-primary account.
 *
 * The sprint's central hazard is that signing in to Mastodon from a Bluesky
 * session silently converts the account kind — `Auth.setToken()` sets
 * `kind='mastodon'` and clears the DID, so the user would be ejected from their
 * own identity by pressing "sign in". Most of what follows pins that it doesn't.
 */
describe('MastodonConnector', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => localStorage.clear());

  describe('the three states', () => {
    it('starts absent — the opt-in the user reversed the default for', () => {
      seedBlueskyPrimary();

      expect(connector().current()).toEqual({ state: 'absent' });
      expect(connector().optedIn()).toBe(false);
      // The point of `absent`: nothing to call, so nothing gets called.
      expect(connector().server()).toBeNull();
    });

    it('writes nothing to storage until it is opted into', () => {
      seedBlueskyPrimary();
      connector().current();

      expect(localStorage.getItem('mockingbird_mastodon_connector')).toBeNull();
    });

    it('opts in anonymously on mastodon.social by default', () => {
      seedBlueskyPrimary();
      connector().enableAnonymous();

      expect(connector().current()).toEqual({
        state: 'anonymous',
        server: DEFAULT_CONNECTOR_SERVER,
      });
      expect(connector().signedIn()).toBe(false);
    });

    it('upgrades to signed-in and reports the token', () => {
      seedBlueskyPrimary();
      connector().enableAnonymous();
      connector().signIn('tok-123', DEFAULT_CONNECTOR_SERVER, null);

      expect(connector().signedIn()).toBe(true);
      expect(connector().token()).toBe('tok-123');
    });

    it('signs out back to anonymous, not to absent', () => {
      seedBlueskyPrimary();
      connector().enableAnonymous();
      connector().signIn('tok-123', DEFAULT_CONNECTOR_SERVER, null);
      connector().signOut();

      // The user asked to sign out of an account, not to stop reading Mastodon.
      expect(connector().current()).toEqual({
        state: 'anonymous',
        server: DEFAULT_CONNECTOR_SERVER,
      });
      expect(connector().token()).toBeNull();
    });

    it('disables all the way back to absent, forgetting the token', () => {
      seedBlueskyPrimary();
      connector().enableAnonymous();
      connector().signIn('tok-123', DEFAULT_CONNECTOR_SERVER, null);
      connector().disable();

      expect(connector().current()).toEqual({ state: 'absent' });
      expect(localStorage.getItem('mockingbird_mastodon_connector')).toBeNull();
      expect(mastodonConnectorToken()).toBeNull();
    });
  });

  describe('changing servers', () => {
    it('drops credentials, because a token only works on its own instance', () => {
      seedBlueskyPrimary();
      connector().enableAnonymous();
      connector().signIn('tok-123', DEFAULT_CONNECTOR_SERVER, null);
      connector().setServer('https://fosstodon.org');

      expect(connector().current()).toEqual({
        state: 'anonymous',
        server: 'https://fosstodon.org',
      });
      expect(connector().token()).toBeNull();
    });

    it('will not materialise a connector that was never opted into', () => {
      seedBlueskyPrimary();
      connector().setServer('https://fosstodon.org');

      expect(connector().current()).toEqual({ state: 'absent' });
    });
  });

  describe('persistence', () => {
    it('survives a reload', () => {
      seedBlueskyPrimary();
      connector().enableAnonymous('https://fosstodon.org');
      connector().signIn('tok-123', 'https://fosstodon.org', null);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });

      expect(connector().current()).toEqual({
        state: 'signed-in',
        server: 'https://fosstodon.org',
        account: null,
      });
      expect(connector().token()).toBe('tok-123');
    });

    it('degrades a signed-in record with no token to anonymous', () => {
      seedBlueskyPrimary();
      connector().enableAnonymous();
      connector().signIn('tok-123', DEFAULT_CONNECTOR_SERVER, null);
      // What a settings import that carried the profile but not the secret
      // leaves behind. Losing the credential must not cost the opt-in.
      //
      // Via the helper rather than a literal key: the connector is account-scoped,
      // so the real key carries a `_bsky_<hash>` suffix and removing the bare
      // name would delete nothing.
      clearMastodonConnectorToken();

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });

      expect(connector().current()).toEqual({
        state: 'anonymous',
        server: DEFAULT_CONNECTOR_SERVER,
      });
    });

    it('treats an unparseable record as absent rather than throwing', () => {
      seedBlueskyPrimary();
      localStorage.setItem('mockingbird_mastodon_connector', '{not json');

      expect(connector().current()).toEqual({ state: 'absent' });
    });
  });

  describe('scoping', () => {
    it('is per account — one identity cannot see another’s connector', () => {
      seedBlueskyPrimary('did:plc:alice');
      connector().enableAnonymous('https://fosstodon.org');

      // Switch identities the way a real account switch does, then rebuild.
      localStorage.clear();
      seedBlueskyPrimary('did:plc:bob');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });

      expect(connector().current()).toEqual({ state: 'absent' });
    });
  });

  describe('the token seam: Auth.connectMastodon', () => {
    it('authenticates calls without claiming the identity', () => {
      seedBlueskyPrimary();
      const auth = TestBed.inject(Auth);
      auth.connectMastodon('tok-123');

      // The whole point: the interceptor reads `token()` and gets one...
      expect(auth.token()).toBe('tok-123');
      // ...while everything that says *who the user is* stays Bluesky.
      expect(auth.kind()).toBe('bluesky');
      expect(auth.isBlueskyPrimary).toBe(true);
      expect(localStorage.getItem(MODE_KEY)).toBe('bluesky');
    });

    it('adds no row to the account switcher', () => {
      seedBlueskyPrimary();
      const auth = TestBed.inject(Auth);
      auth.connectMastodon('tok-123');

      // A connector is not a login. A phantom row here would be the *other*
      // thing the user might have meant ("keep it separate"), and the two must
      // stay distinguishable.
      expect(auth.sessions()).toEqual([]);
      expect(auth.otherSessions().some((choice) => choice.kind === 'mastodon')).toBe(false);
    });

    it('does not mirror the token to TOKEN_KEY', () => {
      seedBlueskyPrimary();
      TestBed.inject(Auth).connectMastodon('tok-123');

      // `storedKind()` reads a bare token as evidence of a mastodon-primary
      // account. Mirroring here would let a connector promote itself into the
      // identity whenever the bluesky mode key went stale.
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    });

    it('restores the connector token on the next load', () => {
      seedBlueskyPrimary();
      connector().enableAnonymous();
      connector().signIn('tok-123', DEFAULT_CONNECTOR_SERVER, null);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });

      const auth = TestBed.inject(Auth);
      expect(auth.token()).toBe('tok-123');
      expect(auth.kind()).toBe('bluesky');
    });

    it('leaves an anonymous connector unauthenticated', () => {
      seedBlueskyPrimary();
      connector().enableAnonymous();

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });

      // Anonymous means anonymous: a leftover token behind an anonymous record
      // must not quietly authenticate calls the user asked to make without one.
      expect(TestBed.inject(Auth).token()).toBeNull();
    });

    it('disconnecting refuses to sign a mastodon-primary account out', () => {
      localStorage.setItem(MODE_KEY, 'mastodon');
      localStorage.setItem(TOKEN_KEY, 'identity-token');
      const auth = TestBed.inject(Auth);
      auth.disconnectMastodon();

      // There is no connector here — that token *is* the identity, and this
      // door does not sign people out.
      expect(auth.token()).toBe('identity-token');
      expect(auth.kind()).toBe('mastodon');
    });
  });

  describe('the connector never outlives its identity', () => {
    it('is forgotten when the Bluesky identity is logged out', () => {
      seedBlueskyPrimary();
      connector().enableAnonymous();
      connector().signIn('tok-123', DEFAULT_CONNECTOR_SERVER, null);

      TestBed.inject(Auth).logout();

      // An orphaned connector token is not merely untidy: with the identity
      // gone, `storedKind()` would read it as a mastodon-primary account and
      // sign the browser in as somebody else on the next reload.
      expect(mastodonConnectorToken()).toBeNull();
    });

    it('is forgotten by logoutAll', () => {
      seedBlueskyPrimary();
      connector().enableAnonymous();
      connector().signIn('tok-123', DEFAULT_CONNECTOR_SERVER, null);

      TestBed.inject(Auth).logoutAll();

      expect(mastodonConnectorToken()).toBeNull();
    });
  });

  describe('regression: other account kinds are untouched', () => {
    it('a mastodon-primary session keeps its own token and kind', () => {
      localStorage.setItem(MODE_KEY, 'mastodon');
      localStorage.setItem(TOKEN_KEY, 'identity-token');

      const auth = TestBed.inject(Auth);
      expect(auth.token()).toBe('identity-token');
      expect(auth.kind()).toBe('mastodon');
      expect(connector().current()).toEqual({ state: 'absent' });
    });

    it('an anonymous session is unaffected', () => {
      localStorage.setItem(MODE_KEY, 'anonymous');

      const auth = TestBed.inject(Auth);
      expect(auth.kind()).toBe('anonymous');
      expect(auth.token()).toBeNull();
    });
  });
});
