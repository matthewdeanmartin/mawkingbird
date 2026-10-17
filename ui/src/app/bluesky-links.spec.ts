import { describe, expect, it } from 'vitest';
import { blueskyRouteFor } from './bluesky-links';
describe('In-app Bluesky links', () => {
  it('routes DID and handle profiles, feeds and lists', () => {
    expect(blueskyRouteFor('https://bsky.app/profile/did:plc:tam3vlyms3eio4ntidwcqezy')).toEqual([
      '/accounts',
      'bsky:did:plc:tam3vlyms3eio4ntidwcqezy',
    ]);
    expect(blueskyRouteFor('https://bsky.app/profile/oblique.yuwakisa.com')).toEqual([
      '/accounts',
      'bsky:oblique.yuwakisa.com',
    ]);
    expect(
      blueskyRouteFor(
        'https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/05af68c3e9d9',
      ),
    ).toEqual([
      '/feeds/bluesky',
      'feed:at://did:plc:qrz3lhbyuxbeilrc6nekdqme/app.bsky.feed.generator/05af68c3e9d9',
    ]);
    expect(blueskyRouteFor('https://bsky.app/profile/reader.example/lists/friends')).toEqual([
      '/feeds/bluesky',
      'list:at://reader.example/app.bsky.graph.list/friends',
    ]);
  });
  it('leaves other origins, malformed paths and unsupported destinations alone', () => {
    for (const url of [
      'https://bsky.app.evil.test/profile/alice',
      'https://bsky.app@evil.test/profile/alice',
      'https://bsky.app/profile/alice/post/123',
      'https://bsky.app/profile/a%2Fb',
      'https://bsky.app/profile/%',
      'javascript:alert(1)',
    ])
      expect(blueskyRouteFor(url)).toBeNull();
  });
});
