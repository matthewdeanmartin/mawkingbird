import { describe, expect, it } from 'vitest';
import { radioAccount, radioLink, radioPostRef } from './radio-links';

describe('portable Radio links', () => {
  it.each(['/', '/canary/', '/mawkingbird/canary/'])('preserves deployment base %s', (base) => {
    const post = 'https://sea.example/@singer/123';
    const link = new URL(radioLink(`https://mawkingbird.com${base}`, { post }));
    expect(link.pathname).toBe(`${base}radio`);
    expect(link.searchParams.get('post')).toBe(post);
    expect(radioPostRef(link.searchParams.get('post'))).toEqual({
      server: 'https://sea.example',
      id: '123',
      originalUrl: post,
    });
    expect(
      new URL(
        radioLink(`https://mawkingbird.com${base}`, { acct: 'singer@sea.example' }),
      ).searchParams.get('acct'),
    ).toBe('singer@sea.example');
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
