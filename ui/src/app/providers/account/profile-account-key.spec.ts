import { describe, expect, it } from 'vitest';
import {
  ANONYMOUS_ACCOUNT_KEY,
  blueskyAccountKey,
  mastodonAccountKey,
} from './profile-account-key';

/**
 * The account key decides which persona's collections a request touches, so a
 * wrong answer is not a crash — it is one account reading or writing another's
 * lists. These tests are mostly about refusing rather than guessing.
 *
 * The property that matters most: **stability**. The same account must produce
 * the same key after a re-login and on a different machine, which is exactly
 * what `accountScopeSuffix()` cannot promise and why this exists beside it.
 */

describe('mastodonAccountKey', () => {
  it('builds a key from host and username', () => {
    expect(mastodonAccountKey('alice', 'https://example.social')).toBe(
      'mastodon:example.social/alice',
    );
  });

  it('is stable regardless of the token', () => {
    // The whole reason this is not accountScopeSuffix(): nothing session-shaped
    // is an input, so re-logging in cannot change the answer.
    const first = mastodonAccountKey('alice', 'https://example.social');
    const second = mastodonAccountKey('alice', 'https://example.social');
    expect(first).toBe(second);
  });

  it('gives two accounts on one Mastodon server different namespaces', () => {
    expect(mastodonAccountKey('alice', 'https://example.social')).not.toBe(
      mastodonAccountKey('alt', 'https://example.social'),
    );
  });

  it('lowercases both halves so case cannot fork a namespace', () => {
    expect(mastodonAccountKey('Alice', 'https://Example.Social')).toBe(
      'mastodon:example.social/alice',
    );
  });

  it('keeps only the local part of a remote acct', () => {
    // `acct` carries a host for a remote account; pairing that host with this
    // instance's would produce a key naming neither.
    expect(mastodonAccountKey('alice@other.social', 'https://example.social')).toBe(
      'mastodon:example.social/alice',
    );
  });

  it('strips a port so dev and production agree', () => {
    expect(mastodonAccountKey('alice', 'http://example.social:3000')).toBe(
      'mastodon:example.social/alice',
    );
  });

  it('strips a path', () => {
    expect(mastodonAccountKey('alice', 'https://example.social/web/home')).toBe(
      'mastodon:example.social/alice',
    );
  });

  it('refuses a relative base url rather than inventing a host', () => {
    // "This server" is not a stable cross-machine identity, so it gets no key.
    expect(mastodonAccountKey('alice', '')).toBeNull();
  });

  it.each([
    ['a hostname with no dot', 'alice', 'http://localhost'],
    ['an empty username', '', 'https://example.social'],
    ['a username with a slash', 'a/b', 'https://example.social'],
    ['a username with a colon', 'a:b', 'https://example.social'],
    ['a traversal attempt', '..', 'https://example.social'],
  ])('refuses %s', (_label, acct, base) => {
    expect(mastodonAccountKey(acct, base)).toBeNull();
  });
});

describe('blueskyAccountKey', () => {
  it('accepts a plc DID', () => {
    expect(blueskyAccountKey('did:plc:abc123')).toBe('bsky:did:plc:abc123');
  });

  it('accepts a web DID', () => {
    expect(blueskyAccountKey('did:web:example.com')).toBe('bsky:did:web:example.com');
  });

  it.each([['notadid'], ['did:unknown:x'], ['']])('refuses %s', (did) => {
    expect(blueskyAccountKey(did)).toBeNull();
  });
});

describe('the anonymous key', () => {
  it('is the fixed literal the service expects', () => {
    // Pinned: the service accepts exactly this string, and a rename here would
    // silently orphan every anonymous persona's collections.
    expect(ANONYMOUS_ACCOUNT_KEY).toBe('anonymous');
  });
});
