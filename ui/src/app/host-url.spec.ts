import { describe, expect, it } from 'vitest';
import { isLocalHost, normalizeHostUrl } from './host-url';

describe('normalizeHostUrl', () => {
  it('prepends https:// to a bare domain', () => {
    expect(normalizeHostUrl('mastodon.social')).toBe('https://mastodon.social');
  });

  it('preserves an explicit scheme (even the "wrong" one)', () => {
    expect(normalizeHostUrl('http://example.social')).toBe('http://example.social');
    expect(normalizeHostUrl('https://example.social')).toBe('https://example.social');
  });

  it('uses http:// for localhost and *.localhost', () => {
    expect(normalizeHostUrl('localhost')).toBe('http://localhost');
    expect(normalizeHostUrl('localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeHostUrl('mastodon.localhost')).toBe('http://mastodon.localhost');
  });

  it('uses http:// for bare IP addresses', () => {
    expect(normalizeHostUrl('127.0.0.1')).toBe('http://127.0.0.1');
    expect(normalizeHostUrl('192.168.1.5:8080')).toBe('http://192.168.1.5:8080');
  });

  it('trims whitespace and trailing slashes', () => {
    expect(normalizeHostUrl('  mastodon.social/  ')).toBe('https://mastodon.social');
  });

  it('returns empty string for blank input (the "this server" sentinel)', () => {
    expect(normalizeHostUrl('')).toBe('');
    expect(normalizeHostUrl('   ')).toBe('');
  });
});

describe('isLocalHost', () => {
  it('recognizes local dev targets', () => {
    expect(isLocalHost('localhost')).toBe(true);
    expect(isLocalHost('localhost:3000')).toBe(true);
    expect(isLocalHost('app.localhost')).toBe(true);
    expect(isLocalHost('127.0.0.1')).toBe(true);
    expect(isLocalHost('10.0.0.42:9000')).toBe(true);
  });

  it('treats normal domains as remote', () => {
    expect(isLocalHost('mastodon.social')).toBe(false);
    expect(isLocalHost('notlocalhost.com')).toBe(false);
  });
});
