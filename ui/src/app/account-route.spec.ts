import { describe, expect, it } from 'vitest';
import { accountRoutePath, parseAccountRoute } from './account-route';

describe('parseAccountRoute', () => {
  it('reads a bare id', () => {
    expect(parseAccountRoute(['109655875667638018'])).toEqual({ id: '109655875667638018' });
  });

  it('reads a bare qualified handle', () => {
    expect(parseAccountRoute(['@alice@example.social'])).toEqual({
      handle: 'alice@example.social',
    });
  });

  it('reads id and handle together', () => {
    expect(parseAccountRoute(['123', '@alice@example.social'])).toEqual({
      id: '123',
      handle: 'alice@example.social',
    });
  });

  it('accepts the two in either order, since readers reorder them by hand', () => {
    expect(parseAccountRoute(['@alice@example.social', '123'])).toEqual({
      id: '123',
      handle: 'alice@example.social',
    });
  });

  it('ignores a bare local handle, which cannot be resolved elsewhere', () => {
    // "@alice" only means something on the server that wrote it — exactly the
    // ambiguity this route exists to remove.
    expect(parseAccountRoute(['@alice'])).toBeNull();
  });

  it('ignores empty segments from a one-segment route', () => {
    expect(parseAccountRoute(['123', ''])).toEqual({ id: '123' });
  });

  it('returns null for synthetic ids owned by other handlers', () => {
    // bsky:, rss:, eliza:self and the base64 anonymous refs are not ours.
    expect(parseAccountRoute(['bsky:did:plc:abc'])).toBeNull();
    expect(parseAccountRoute(['rss:https://example.com/feed'])).toBeNull();
    expect(parseAccountRoute(['eliza:self'])).toBeNull();
    expect(parseAccountRoute(['anonymous-account.eyJzZXJ2ZXIiOiJ4In0'])).toBeNull();
  });
});

describe('accountRoutePath', () => {
  it('puts the id first and the handle second', () => {
    expect(accountRoutePath({ id: '123', handle: 'alice@example.social' })).toEqual([
      '/accounts',
      '123',
      '@alice@example.social',
    ]);
  });

  it('falls back to handle alone when there is no id', () => {
    expect(accountRoutePath({ handle: 'alice@example.social' })).toEqual([
      '/accounts',
      '@alice@example.social',
    ]);
  });

  it('falls back to id alone when there is no handle', () => {
    expect(accountRoutePath({ id: '123' })).toEqual(['/accounts', '123']);
  });

  it('round-trips through the parser', () => {
    const ref = { id: '123', handle: 'alice@example.social' };
    const [, ...segments] = accountRoutePath(ref) as string[];
    expect(parseAccountRoute(segments)).toEqual(ref);
  });
});
