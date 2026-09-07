import { describe, expect, it } from 'vitest';
import { parseFeedRef } from './bluesky-feed';

const FEED = 'at://did:plc:z/app.bsky.feed.generator/whats-hot';
const LIST = 'at://did:plc:z/app.bsky.graph.list/abc';

describe('parseFeedRef', () => {
  it('splits kind from at-uri', () => {
    expect(parseFeedRef(`feed:${FEED}`)).toEqual({ kind: 'feed', uri: FEED });
    expect(parseFeedRef(`list:${LIST}`)).toEqual({ kind: 'list', uri: LIST });
  });

  it('accepts a percent-encoded uri', () => {
    // The uri is encoded into the route because it contains slashes; Angular
    // normally decodes it, but a raw URL fragment must work too.
    expect(parseFeedRef(`feed:${encodeURIComponent(FEED)}`)).toEqual({ kind: 'feed', uri: FEED });
  });

  it('rejects an unknown kind', () => {
    expect(parseFeedRef(`modlist:${LIST}`)).toBeNull();
  });

  it('rejects anything that is not an at-uri', () => {
    expect(parseFeedRef('feed:https://example.com')).toBeNull();
    expect(parseFeedRef('feed:')).toBeNull();
    expect(parseFeedRef('nonsense')).toBeNull();
  });

  it('does not throw on a malformed percent escape', () => {
    expect(parseFeedRef('feed:%E0%A4%A')).toBeNull();
  });
});
