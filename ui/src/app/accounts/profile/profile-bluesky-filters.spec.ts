import { describe, expect, it } from 'vitest';
import { isBlueskyReplyToOthers } from './profile';
import { Status } from '../../platform/api/models';

const AUTHOR = 'did:plc:author';
const post = (parentUri: string | null, reblog = false): Status =>
  ({
    account: { id: `bsky:${AUTHOR}` },
    in_reply_to_id: parentUri ? `bsky:${parentUri}` : null,
    providerRef: { replyParentUri: parentUri },
    reblog: reblog ? ({} as Status) : null,
  }) as unknown as Status;

describe('isBlueskyReplyToOthers (profile Replies toggle)', () => {
  it('counts a reply to someone else, but not a self-thread, a post or a repost', () => {
    expect(isBlueskyReplyToOthers(post('at://did:plc:other/app.bsky.feed.post/1'))).toBe(true);
    expect(isBlueskyReplyToOthers(post(`at://${AUTHOR}/app.bsky.feed.post/1`))).toBe(false);
    expect(isBlueskyReplyToOthers(post(null))).toBe(false);
    expect(isBlueskyReplyToOthers(post('at://did:plc:other/app.bsky.feed.post/1', true))).toBe(
      false,
    );
  });
});
