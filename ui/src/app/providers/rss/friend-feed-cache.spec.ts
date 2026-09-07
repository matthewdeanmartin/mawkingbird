import { describe, expect, it } from 'vitest';
import { normalizeProfileUrl } from './friend-feed-cache';
import { isSkippedHost } from './friend-feed-skip-list';

/**
 * The IndexedDB half of `FriendFeedCache` is not covered here, for the same
 * reason `rss-cache.ts` has no spec: jsdom ships no IndexedDB, and every path
 * in that class is written to degrade to "no cache" when the database cannot be
 * opened. What *is* covered is the pure logic those records are keyed and
 * filtered by, which is where the decisions actually live.
 */
describe('normalizeProfileUrl', () => {
  it('folds the differences that do not change what gets fetched', () => {
    // One probe, not four. Twenty friends linking the same blog with slightly
    // different spellings is the case that makes this worth doing.
    const canonical = 'https://example.com/blog';
    expect(normalizeProfileUrl('https://example.com/blog')).toBe(canonical);
    expect(normalizeProfileUrl('https://www.example.com/blog/')).toBe(canonical);
    expect(normalizeProfileUrl('https://EXAMPLE.com/blog#about')).toBe(canonical);
    expect(normalizeProfileUrl('  https://example.com/blog  ')).toBe(canonical);
  });

  it('keeps the query string, which plenty of sites still route by', () => {
    expect(normalizeProfileUrl('https://example.com/index.php?page=blog')).toBe(
      'https://example.com/index.php?page=blog',
    );
  });

  it('adds a scheme to the bare domains people type into profile fields', () => {
    expect(normalizeProfileUrl('example.com')).toBe('https://example.com');
  });

  it('rejects what is not a fetchable page, before it costs a probe', () => {
    // Profile fields are free text: pronouns, an email address, a chat handle.
    // Each one that reaches the prober would spend a cross-origin fetch to
    // learn it was never a URL.
    expect(normalizeProfileUrl('mailto:someone@example.com')).toBeNull();
    expect(normalizeProfileUrl('xmpp:someone@example.com')).toBeNull();
    expect(normalizeProfileUrl('she/her')).toBeNull();
    expect(normalizeProfileUrl('')).toBeNull();
    expect(normalizeProfileUrl('   ')).toBeNull();
  });

  it('does not treat http and https as the same site', () => {
    // They can serve different things, and the probe result is per-origin.
    expect(normalizeProfileUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeProfileUrl('https://example.com')).toBe('https://example.com');
  });
});

describe('isSkippedHost', () => {
  it('skips platforms with no per-profile feed', () => {
    expect(isSkippedHost('https://twitter.com/someone')).toBe(true);
    expect(isSkippedHost('https://linktr.ee/someone')).toBe(true);
    expect(isSkippedHost('https://ko-fi.com/someone')).toBe(true);
  });

  it('covers subdomains through their registrable domain', () => {
    // So the list stays short: one entry per platform, not one per subdomain.
    expect(isSkippedHost('https://open.spotify.com/artist/x')).toBe(true);
    expect(isSkippedHost('https://www.instagram.com/someone')).toBe(true);
  });

  it('never skips a host that does publish per-author feeds', () => {
    // The whole point of the feature. A wrong entry here is invisible — the
    // feed is simply never found and nothing says why — so this is the
    // assertion that keeps the list honest as it grows.
    expect(isSkippedHost('https://someone.substack.com')).toBe(false);
    expect(isSkippedHost('https://medium.com/@someone')).toBe(false);
    expect(isSkippedHost('https://someone.tumblr.com')).toBe(false);
    expect(isSkippedHost('https://someone.wordpress.com')).toBe(false);
    expect(isSkippedHost('https://github.com/someone')).toBe(false);
    expect(isSkippedHost('https://www.youtube.com/@someone')).toBe(false);
    expect(isSkippedHost('https://example.com')).toBe(false);
  });

  it('does not match a domain that merely ends with a skipped one', () => {
    // `nottwitter.com` and `x.com.evil.example` are not the skipped hosts.
    expect(isSkippedHost('https://nottwitter.com/someone')).toBe(false);
    expect(isSkippedHost('https://notlinktr.ee/someone')).toBe(false);
  });

  it('says no rather than throwing when handed something unparseable', () => {
    expect(isSkippedHost('not a url')).toBe(false);
  });
});
