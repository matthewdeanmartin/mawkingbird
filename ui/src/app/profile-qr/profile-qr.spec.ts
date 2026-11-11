import { describe, expect, it } from 'vitest';
import { scannedAccountQuery } from './profile-qr';

describe('scannedAccountQuery', () => {
  it('accepts profile URLs from common fediverse servers', () => {
    expect(scannedAccountQuery('https://mastodon.social/@Gargron')).toBe(
      'https://mastodon.social/@Gargron',
    );
    expect(scannedAccountQuery(' https://example.social/users/alice/ ')).toBe(
      'https://example.social/users/alice',
    );
    expect(scannedAccountQuery('https://example.social/@bob@other.example')).toBe(
      'https://example.social/@bob@other.example',
    );
  });

  it('accepts handles with or without the leading @', () => {
    expect(scannedAccountQuery('@alice@example.social')).toBe('@alice@example.social');
    expect(scannedAccountQuery('alice@example.social')).toBe('@alice@example.social');
  });

  it('refuses posts, non-web schemes and arbitrary text', () => {
    expect(scannedAccountQuery('https://mastodon.social/@Gargron/123')).toBeNull();
    expect(scannedAccountQuery('https://example.com/about')).toBeNull();
    expect(scannedAccountQuery('javascript:alert(1)')).toBeNull();
    expect(scannedAccountQuery('WIFI:S:home;T:WPA;P:secret;;')).toBeNull();
    expect(scannedAccountQuery('')).toBeNull();
  });
});
