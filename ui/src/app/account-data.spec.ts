import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteAccountData,
  inspectAccountData,
  keyBelongsToScope,
  scopeForAccount,
} from './account-data';
import {
  scopeSuffixForDid,
  scopeSuffixForMastodonAccount,
  scopeSuffixForToken,
} from './account-scope';

describe('account-data', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('scopes Anonymous to its own fixed namespace', () => {
    expect(scopeForAccount(null)).toBe('_anonymous');
  });

  /**
   * The app is called Mawkingbird and every visible surface says so; this
   * prefix deliberately does not. It is the namespace already written into
   * every existing user's localStorage, so renaming it to match the brand would
   * orphan their follows, feeds and sessions — the app would look like a fresh
   * install to everyone who already uses it, silently. This test is here so
   * that a well-meaning brand sweep fails loudly instead.
   */
  it('keeps the legacy storage prefix whatever the app is called', () => {
    localStorage.setItem('mockingbird_anonymous_follows', '["x"]');

    expect(keyBelongsToScope('mockingbird_anonymous_follows', '_anonymous')).toBe(true);
    expect(keyBelongsToScope('mawkingbird_anonymous_follows', '_anonymous')).toBe(false);
  });

  it('derives a distinct, token-free scope per saved login', () => {
    const one = scopeForAccount('token-one');
    const two = scopeForAccount('token-two');

    expect(one).not.toBe(two);
    expect(one).not.toContain('token-one');
  });

  it('inspects a Bluesky alt by DID without making it active', () => {
    const one = scopeSuffixForDid('did:plc:one');
    const two = scopeSuffixForDid('did:plc:two');
    localStorage.setItem(`mockingbird_rss_feeds${one}`, '["one"]');
    localStorage.setItem(`mockingbird_rss_feeds${two}`, '["two"]');

    const report = inspectAccountData({ kind: 'bluesky', did: 'did:plc:two' });

    expect(report.entries.map((entry) => entry.key)).toEqual([`mockingbird_rss_feeds${two}`]);
  });

  it('never matches unscoped global keys', () => {
    // The logged-out scope is empty; matching on it would delete app-wide settings.
    expect(keyBelongsToScope('mockingbird_prefs', '')).toBe(false);
    expect(keyBelongsToScope('mastodon_mock_sessions', '')).toBe(false);
  });

  it('matches Anonymous keys by prefix as well as suffix', () => {
    expect(keyBelongsToScope('mockingbird_anonymous_follows', '_anonymous')).toBe(true);
    expect(keyBelongsToScope('mockingbird_rss_feeds_anonymous', '_anonymous')).toBe(true);
    expect(keyBelongsToScope('mockingbird_rss_feeds_abc123', '_anonymous')).toBe(false);
  });

  it('finds only the requested account’s data', () => {
    const mine = scopeSuffixForToken('token-mine');
    const theirs = scopeSuffixForToken('token-theirs');
    localStorage.setItem(`mockingbird_rss_feeds${mine}`, '["a"]');
    localStorage.setItem(`mockingbird_bsky_session${mine}`, '{}');
    localStorage.setItem(`mockingbird_rss_feeds${theirs}`, '["b"]');
    localStorage.setItem('mockingbird_prefs', '{}');

    const report = inspectAccountData('token-mine');

    expect(report.entries).toHaveLength(2);
    expect(report.entries.every((e) => e.key.endsWith(mine))).toBe(true);
    expect(report.totalBytes).toBeGreaterThan(0);
  });

  it('deletes only that account’s data, leaving others and globals intact', () => {
    const mine = scopeSuffixForToken('token-mine');
    const theirs = scopeSuffixForToken('token-theirs');
    localStorage.setItem(`mockingbird_rss_feeds${mine}`, '["a"]');
    localStorage.setItem(`mockingbird_rss_feeds${theirs}`, '["b"]');
    localStorage.setItem('mockingbird_prefs', '{}');
    localStorage.setItem('mastodon_mock_sessions', '[]');

    const removed = deleteAccountData('token-mine');

    expect(removed).toBe(1);
    expect(localStorage.getItem(`mockingbird_rss_feeds${mine}`)).toBeNull();
    expect(localStorage.getItem(`mockingbird_rss_feeds${theirs}`)).toBe('["b"]');
    // The saved-logins list and app-wide prefs must survive a per-account wipe.
    expect(localStorage.getItem('mockingbird_prefs')).toBe('{}');
    expect(localStorage.getItem('mastodon_mock_sessions')).toBe('[]');
  });

  it('deletes both stable data and intentionally unmigrated legacy data', () => {
    const stable = scopeSuffixForMastodonAccount('42', 'https://one.example');
    const legacy = scopeSuffixForToken('old-token');
    localStorage.setItem(`mockingbird_rss_feeds${stable}`, '["feed"]');
    localStorage.setItem(`mockingbird_drafts_server${legacy}`, '["draft"]');

    const removed = deleteAccountData({
      kind: 'mastodon',
      token: 'old-token',
      accountId: '42',
      server: 'https://one.example',
    });

    expect(removed).toBe(2);
    expect(localStorage.getItem(`mockingbird_rss_feeds${stable}`)).toBeNull();
    expect(localStorage.getItem(`mockingbird_drafts_server${legacy}`)).toBeNull();
  });

  it('reports zero when an account has no local data', () => {
    expect(deleteAccountData('token-empty')).toBe(0);
  });

  it('deletes Anonymous data by both prefix and suffix', () => {
    localStorage.setItem('mockingbird_anonymous_follows', '["x"]');
    localStorage.setItem('mockingbird_rss_feeds_anonymous', '["y"]');
    localStorage.setItem('mockingbird_rss_feeds_other', '["z"]');

    expect(deleteAccountData(null)).toBe(2);
    expect(localStorage.getItem('mockingbird_rss_feeds_other')).toBe('["z"]');
  });
});
