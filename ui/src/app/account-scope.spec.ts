import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BLUESKY_SCOPE_PREFIX,
  accountScopeSuffix,
  scopeSuffixForDid,
  scopeSuffixForMastodonAccount,
  scopedKey,
} from './account-scope';
import { seedSessions } from './testing/seed-storage';
import {
  saveBlueskyIdentity,
  setActiveBlueskyIdentity,
} from './providers/bluesky/bluesky-identity-store';

const TOKEN_KEY = 'mastodon_mock_token';
const MODE_KEY = 'mastodon_mock_account_mode';
/** Put a usable Bluesky-primary identity in storage. */
function seedBlueskyIdentity(did: string, handle = 'someone.bsky.social'): void {
  saveBlueskyIdentity(
    { service: 'https://bsky.social', did, handle },
    { accessJwt: 'a', refreshJwt: 'r', connectedAt: Date.now() },
  );
  setActiveBlueskyIdentity(did);
}

describe('account-scope', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns an empty suffix when logged out', () => {
    expect(accountScopeSuffix()).toBe('');
    expect(scopedKey('mockingbird_rss_feeds')).toBe('mockingbird_rss_feeds');
  });

  it('derives a stable, non-empty suffix from the active token', () => {
    localStorage.setItem(TOKEN_KEY, 'token-abc');
    const a = accountScopeSuffix();
    const b = accountScopeSuffix();
    expect(a).not.toBe('');
    expect(a).toBe(b); // stable for the same token
    expect(a.startsWith('_')).toBe(true);
  });

  it('never embeds the raw token in the key', () => {
    localStorage.setItem(TOKEN_KEY, 'super-secret-token-value');
    const key = scopedKey('mockingbird_bsky_session');
    expect(key).not.toContain('super-secret-token-value');
    expect(key.startsWith('mockingbird_bsky_session_')).toBe(true);
  });

  it('gives different accounts different namespaces', () => {
    localStorage.setItem(TOKEN_KEY, 'token-one');
    const one = scopedKey('base');
    localStorage.setItem(TOKEN_KEY, 'token-two');
    const two = scopedKey('base');
    expect(one).not.toBe(two);
  });

  it('uses a stable namespace for the one Anonymous account', () => {
    localStorage.setItem('mastodon_mock_account_mode', 'anonymous');

    expect(accountScopeSuffix()).toBe('_anonymous');
    expect(scopedKey('mockingbird_rss_feeds')).toBe('mockingbird_rss_feeds_anonymous');
  });

  /**
   * The regression guard for the whole account-kinds change.
   *
   * Every scoped key in the app hangs off these two strings. Changing either by
   * one character silently repoints a user's RSS feeds, saved searches, lists
   * and linked accounts at a namespace nothing has ever written to — no error,
   * no migration, the data just appears to be gone.
   *
   * So these are asserted against hardcoded literals rather than anything
   * derived: a test that recomputes the expected value with the same function
   * under test would happily agree with a broken implementation.
   */
  describe('legacy and fixed suffixes', () => {
    it('pins the Anonymous suffix to its exact historical value', () => {
      localStorage.setItem(MODE_KEY, 'anonymous');
      expect(accountScopeSuffix()).toBe('_anonymous');
    });

    it('pins the Mastodon token suffix to its exact historical value', () => {
      localStorage.setItem(TOKEN_KEY, 'token-abc');
      expect(accountScopeSuffix()).toBe('_6xtdsz');
      expect(scopedKey('mockingbird_rss_feeds')).toBe('mockingbird_rss_feeds_6xtdsz');
    });

    it('pins the logged-out suffix to empty', () => {
      expect(accountScopeSuffix()).toBe('');
    });

    /**
     * A Mastodon session with a token must keep hashing the token even once the
     * mode key is written explicitly — the branch order matters.
     */
    it('is unaffected by an explicit mastodon mode key', () => {
      localStorage.setItem(MODE_KEY, 'mastodon');
      localStorage.setItem(TOKEN_KEY, 'art-token');
      expect(accountScopeSuffix()).toBe('_143bfte');
    });
  });

  describe('bluesky-primary scope', () => {
    it('derives a collision-free suffix from the DID of the primary identity', () => {
      localStorage.setItem(MODE_KEY, 'bluesky');
      seedBlueskyIdentity('did:plc:testidentity');

      expect(accountScopeSuffix()).toBe('_bluesky_Ymx1ZXNreQBkaWQ6cGxjOnRlc3RpZGVudGl0eQ');
      expect(scopedKey('mockingbird_rss_feeds')).toBe(
        'mockingbird_rss_feeds_bluesky_Ymx1ZXNreQBkaWQ6cGxjOnRlc3RpZGVudGl0eQ',
      );
    });

    it('gives two Bluesky accounts different namespaces', () => {
      expect(scopeSuffixForDid('did:plc:testidentity')).not.toBe(
        scopeSuffixForDid('did:plc:abc123'),
      );
    });

    it('is distinguishable from a Mastodon suffix by its prefix', () => {
      expect(scopeSuffixForDid('did:plc:abc123').startsWith(BLUESKY_SCOPE_PREFIX)).toBe(true);
      localStorage.setItem(TOKEN_KEY, 'token-abc');
      expect(accountScopeSuffix().startsWith(BLUESKY_SCOPE_PREFIX)).toBe(false);
    });

    /**
     * A `bluesky` mode with no identity behind it is a stale key — left by an
     * import that carried the profile but not the JWTs, or a half-finished
     * unlink. Falling back to the logged-out namespace matches what `Auth` does
     * with the same inconsistency, so the two cannot disagree about which
     * account is active.
     */
    it('falls back to the logged-out namespace when the identity is missing', () => {
      localStorage.setItem(MODE_KEY, 'bluesky');
      expect(accountScopeSuffix()).toBe('');
    });

    it('ignores a leftover Mastodon token while Bluesky is primary', () => {
      localStorage.setItem(MODE_KEY, 'bluesky');
      localStorage.setItem(TOKEN_KEY, 'token-abc');
      seedBlueskyIdentity('did:plc:testidentity');

      expect(accountScopeSuffix()).toBe('_bluesky_Ymx1ZXNreQBkaWQ6cGxjOnRlc3RpZGVudGl0eQ');
    });

    it('never embeds the raw DID in the key', () => {
      localStorage.setItem(MODE_KEY, 'bluesky');
      seedBlueskyIdentity('did:plc:testidentity');
      expect(scopedKey('base')).not.toContain('did:plc:testidentity');
    });
  });

  describe('verified Mastodon identity', () => {
    it('keeps the same namespace when the credential changes', () => {
      seedSessions([
        {
          token: 'token-one',
          server: 'https://mastodon.example',
          account: { id: '42', username: 'alice', acct: 'alice' },
        },
      ] as never);
      localStorage.setItem(MODE_KEY, 'mastodon');
      localStorage.setItem(TOKEN_KEY, 'token-one');
      const first = accountScopeSuffix();

      seedSessions([
        {
          token: 'token-two',
          server: 'https://mastodon.example',
          account: { id: '42', username: 'alice', acct: 'alice' },
        },
      ] as never);
      localStorage.setItem(TOKEN_KEY, 'token-two');

      expect(accountScopeSuffix()).toBe(first);
      expect(first).toBe('_mastodon_bWFzdG9kb24AaHR0cHM6Ly9tYXN0b2Rvbi5leGFtcGxlADQy');
    });

    it('separates the same numeric id on different servers', () => {
      expect(scopeSuffixForMastodonAccount('42', 'https://one.example')).not.toBe(
        scopeSuffixForMastodonAccount('42', 'https://two.example'),
      );
    });

    it('separates different ids on one server and exposes no raw identity fields', () => {
      const first = scopeSuffixForMastodonAccount('42', 'https://one.example');
      const second = scopeSuffixForMastodonAccount('84', 'https://one.example');
      expect(first).not.toBe(second);
      expect(first).not.toContain('one.example');
      expect(first).not.toContain('42');
    });

    it('adopts legacy account data but does not invent a draft migration', () => {
      localStorage.setItem('mockingbird_rss_feeds_6xtdsz', '["feed"]');
      localStorage.setItem('mockingbird_drafts_https%3A%2F%2Fmastodon.example_6xtdsz', '["draft"]');
      sessionStorage.setItem('mockingbird_blogger_token_6xtdsz', 'credential');
      seedSessions([
        {
          token: 'token-abc',
          server: 'https://mastodon.example',
          account: { id: '42', username: 'alice', acct: 'alice' },
        },
      ] as never);
      localStorage.setItem(MODE_KEY, 'mastodon');
      localStorage.setItem(TOKEN_KEY, 'token-abc');

      const stable = accountScopeSuffix();

      expect(localStorage.getItem(`mockingbird_rss_feeds${stable}`)).toBe('["feed"]');
      expect(localStorage.getItem('mockingbird_rss_feeds_6xtdsz')).toBeNull();
      expect(sessionStorage.getItem(`mockingbird_blogger_token${stable}`)).toBe('credential');
      expect(sessionStorage.getItem('mockingbird_blogger_token_6xtdsz')).toBeNull();
      expect(localStorage.getItem('mockingbird_drafts_https%3A%2F%2Fmastodon.example_6xtdsz')).toBe(
        '["draft"]',
      );
    });
  });
});
