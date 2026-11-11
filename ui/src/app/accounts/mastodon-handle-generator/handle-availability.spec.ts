import { describe, expect, it, vi } from 'vitest';
import { checkHandle, normalizeDomain, signUpUrl } from './handle-availability';

function answering(status: number): typeof fetch {
  return vi.fn(async () => new Response(status === 200 ? '{}' : null, { status }));
}

describe('handle availability', () => {
  it("reads the server's public account lookup, without credentials", async () => {
    const fetchImpl = answering(404);
    await checkHandle('mastodon.social', 'matthew_martin', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mastodon.social/api/v1/accounts/lookup?acct=matthew_martin',
      expect.objectContaining({ credentials: 'omit' }),
    );
  });

  it('maps the answers: found is taken, not found is free, gone stays taken', async () => {
    expect(await checkHandle('a.social', 'x', answering(200))).toBe('taken');
    expect(await checkHandle('a.social', 'x', answering(404))).toBe('free');
    expect(await checkHandle('a.social', 'x', answering(410))).toBe('taken');
  });

  it('says it could not check rather than guessing', async () => {
    expect(await checkHandle('a.social', 'x', answering(401))).toBe('unknown');
    expect(await checkHandle('a.social', 'x', answering(429))).toBe('unknown');
    expect(await checkHandle('a.social', 'x', answering(503))).toBe('unknown');
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await checkHandle('a.social', 'x', offline)).toBe('unknown');
  });

  it('accepts a server however it is typed or pasted', () => {
    expect(normalizeDomain('mastodon.social')).toBe('mastodon.social');
    expect(normalizeDomain(' https://Mastodon.Social/about ')).toBe('mastodon.social');
    expect(normalizeDomain('@me@fosstodon.org')).toBe('fosstodon.org');
    expect(normalizeDomain('not a server')).toBe('');
    expect(normalizeDomain('localhost')).toBe('');
  });

  it("links to the server's own sign-up page", () => {
    expect(signUpUrl('mastodon.social')).toBe('https://mastodon.social/auth/sign_up');
  });
});
