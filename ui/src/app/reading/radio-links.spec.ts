import { describe, expect, it } from 'vitest';
import { radioAccount, radioPostRef } from './radio-links';

describe('portable Radio links', () => {
  it('reads a portable post reference from a shared link', () => {
    const post = 'https://sea.example/@singer/123';
    const link = new URL(
      `https://mawkingbird.com/playlists/shared?post=${encodeURIComponent(post)}`,
    );
    expect(radioPostRef(link.searchParams.get('post'))).toEqual({
      server: 'https://sea.example',
      id: '123',
      originalUrl: post,
    });
  });
  it.each([
    'https://sea.example/users/singer/statuses/123',
    'https://sea.example/web/statuses/123',
  ])('accepts Mastodon permalink %s', (url) => {
    expect(radioPostRef(url)?.id).toBe('123');
  });
  it.each([
    'javascript:alert(1)',
    'https://user:pass@sea.example/@singer/123',
    'https://sea.example/@singer',
    'https://sea.example/@singer/123/more',
    'http://sea.example/@singer/123',
  ])('rejects non-public or unsupported reference %s', (url) =>
    expect(radioPostRef(url)).toBeNull(),
  );
  it('requires a portable qualified account', () => {
    expect(radioAccount('@singer@sea.example')).toEqual({
      acct: 'singer@sea.example',
      server: 'https://sea.example',
    });
    expect(radioAccount('singer')).toBeNull();
    expect(radioAccount('singer@sea.example/path')).toBeNull();
  });
});
