import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlueskySession } from './bluesky-session';
import { blueskyIsPrimaryKind } from './bluesky-identity-store';
import { seedBskyIdentity, seedBskySession } from '../../testing/seed-storage';

const MODE_KEY = 'mastodon_mock_account_mode';
const TOKEN_KEY = 'mastodon_mock_token';
const IDENTITY_PROFILE = 'mockingbird_bsky_identity_profile';
const IDENTITY_CREDENTIALS = 'mockingbird_bsky_identity_credentials';

/**
 * `BlueskySession` serves two roles from one class, decided at construction: the
 * app's **identity** (Bluesky-primary, unscoped keys) or a **connector** (scoped
 * under someone else's account).
 *
 * This matters far more than it looks. Every Bluesky consumer in the app —
 * `BlueskyApi`, `BlueskyChatApi`, `BlueskyProvider`, `BlueskyReply` — injects this
 * singleton and reads `session()`. Getting the role wrong either leaves a
 * Bluesky-primary account with no timeline, or exposes one account's link to
 * another.
 */
describe('BlueskySession: identity vs connector', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => localStorage.clear());

  describe('role detection', () => {
    it('is a connector when no account kind is set', () => {
      expect(blueskyIsPrimaryKind()).toBe(false);
    });

    it('is the identity when the kind is bluesky and an identity exists', () => {
      localStorage.setItem(MODE_KEY, 'bluesky');
      seedBskyIdentity({ did: 'did:plc:me', handle: 'me.bsky.social' });

      expect(blueskyIsPrimaryKind()).toBe(true);
    });

    /**
     * The stale-key state: a `bluesky` kind with no identity behind it, left by a
     * settings import that carried the profile but not the JWTs. `Auth` refuses to
     * activate it; this must agree, or the two disagree about which account is
     * active.
     */
    it('is not the identity when the kind is bluesky but no identity exists', () => {
      localStorage.setItem(MODE_KEY, 'bluesky');

      expect(blueskyIsPrimaryKind()).toBe(false);
    });

    it('is a connector under a Mastodon account, even with an identity in storage', () => {
      localStorage.setItem(MODE_KEY, 'mastodon');
      localStorage.setItem(TOKEN_KEY, 'token-abc');
      seedBskyIdentity({ did: 'did:plc:me', handle: 'me.bsky.social' });

      expect(blueskyIsPrimaryKind()).toBe(false);
    });
  });

  describe('as the primary identity', () => {
    beforeEach(() => {
      localStorage.setItem(MODE_KEY, 'bluesky');
      seedBskyIdentity(
        { did: 'did:plc:me', handle: 'me.bsky.social', displayName: 'Me' },
        { accessJwt: 'id-access', refreshJwt: 'id-refresh' },
      );
    });

    it('loads the identity, so every Bluesky consumer sees it', () => {
      const session = TestBed.inject(BlueskySession);

      expect(session.isPrimaryIdentity).toBe(true);
      expect(session.linked()).toBe(true);
      expect(session.session()?.handle).toBe('me.bsky.social');
      expect(session.session()?.accessJwt).toBe('id-access');
    });

    /**
     * The retention policy governs *connector* credentials the user has forgotten
     * about ("I connected GitHub once in 2024"). Applied to the account you are
     * signed in as, it would sign you out of the whole app after 90 days by
     * default — and leave a `bluesky` kind with no identity behind it.
     */
    it('is exempt from the credential retention policy', () => {
      // A login far outside any retention window.
      seedBskyIdentity(
        { did: 'did:plc:me', handle: 'me.bsky.social' },
        { connectedAt: Date.now() - 400 * 24 * 60 * 60 * 1000 },
      );
      const session = TestBed.inject(BlueskySession);

      expect(session.expiresAt()).toBeNull();
      session.enforceLifetime();

      expect(session.session()).not.toBeNull();
      expect(localStorage.getItem(IDENTITY_PROFILE)).not.toBeNull();
    });

    /**
     * Unlinking the identity must not leave the app claiming to be signed in as
     * an account whose credentials are gone.
     */
    it('clears the account kind when the identity is unlinked', () => {
      const session = TestBed.inject(BlueskySession);
      session.unlink();

      expect(localStorage.getItem(IDENTITY_PROFILE)).toBeNull();
      expect(localStorage.getItem(IDENTITY_CREDENTIALS)).toBeNull();
      expect(localStorage.getItem(MODE_KEY)).toBeNull();
    });
  });

  describe('as a connector under a Mastodon account', () => {
    beforeEach(() => {
      localStorage.setItem(MODE_KEY, 'mastodon');
      localStorage.setItem(TOKEN_KEY, 'token-abc');
    });

    it('loads the scoped connector link, not any identity in storage', () => {
      // Suffix for 'token-abc', pinned by account-scope.spec.
      seedBskySession(
        {
          service: 'https://bsky.social',
          handle: 'connector.bsky.social',
          did: 'did:plc:connector',
          accessJwt: 'conn-access',
          refreshJwt: 'conn-refresh',
          connectedAt: Date.now(),
        },
        '_6xtdsz',
      );
      seedBskyIdentity({ did: 'did:plc:other', handle: 'other.bsky.social' });

      const session = TestBed.inject(BlueskySession);

      expect(session.isPrimaryIdentity).toBe(false);
      expect(session.session()?.handle).toBe('connector.bsky.social');
    });

    /** The regression clause every sprint in this roadmap carries. */
    it('still ages out under the retention policy', () => {
      seedBskySession(
        {
          service: 'https://bsky.social',
          handle: 'connector.bsky.social',
          did: 'did:plc:connector',
          accessJwt: 'conn-access',
          refreshJwt: 'conn-refresh',
          connectedAt: Date.now() - 400 * 24 * 60 * 60 * 1000,
        },
        '_6xtdsz',
      );

      const session = TestBed.inject(BlueskySession);
      // An expired link is dropped on load, which is the pre-existing behaviour.
      expect(session.session()).toBeNull();
    });

    it('leaves the account kind alone when a connector is unlinked', () => {
      seedBskySession(
        {
          service: 'https://bsky.social',
          handle: 'connector.bsky.social',
          did: 'did:plc:connector',
          accessJwt: 'conn-access',
          refreshJwt: 'conn-refresh',
          connectedAt: Date.now(),
        },
        '_6xtdsz',
      );

      TestBed.inject(BlueskySession).unlink();

      expect(localStorage.getItem(MODE_KEY)).toBe('mastodon');
      expect(localStorage.getItem(TOKEN_KEY)).toBe('token-abc');
    });
  });

  describe('loginAsIdentity', () => {
    it('writes the unscoped identity keys rather than the scoped connector keys', () => {
      localStorage.setItem(TOKEN_KEY, 'token-abc'); // a Mastodon session is active
      const session = TestBed.inject(BlueskySession);
      const httpMock = TestBed.inject(HttpTestingController);

      session.loginAsIdentity('me.bsky.social', 'app-pass').subscribe();

      httpMock.expectOne('https://bsky.social/xrpc/com.atproto.server.createSession').flush({
        did: 'did:plc:me',
        handle: 'me.bsky.social',
        accessJwt: 'a',
        refreshJwt: 'r',
      });
      httpMock.expectOne((r) => r.url.includes('getProfile')).flush({ displayName: 'Me' });

      expect(localStorage.getItem(IDENTITY_PROFILE)).not.toBeNull();
      expect(localStorage.getItem(IDENTITY_CREDENTIALS)).not.toBeNull();
      // Nothing landed in the previous account's connector namespace.
      expect(localStorage.getItem('mockingbird_bsky_profile_6xtdsz')).toBeNull();
    });
  });
});
