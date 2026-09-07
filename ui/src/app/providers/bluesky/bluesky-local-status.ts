// Builds the Mastodon-shaped Status shown in the UI for a record the viewer
// just created on Bluesky. createRecord returns only uri/cid, so the visible
// card is assembled locally from the session identity + the sent text/facets.

import { Status } from '../../models';
import { adaptAuthor, postUrl, renderRichText } from './bluesky-adapter';
import { BskySession } from './bluesky-session';
import { BskyFacet, BskyRef } from './bluesky-types';

export function buildLocalBskyStatus(
  session: BskySession,
  uri: string,
  cid: string,
  text: string,
  facets: BskyFacet[],
  /** The post being replied to; omit for a top-level post. */
  parent?: BskyRef,
): Status {
  const account = adaptAuthor({
    did: session.did,
    handle: session.handle,
    displayName: session.displayName,
    avatar: session.avatar,
  });
  return {
    provider: 'bluesky',
    providerRef: {
      uri,
      cid,
      likeUri: null,
      repostUri: null,
      // A top-level post roots its own future thread.
      replyRoot: parent ? parent.replyRoot : { uri, cid },
      replyParentUri: parent?.uri ?? null,
      // Composing here never attaches a link card.
      externalUri: null,
    } satisfies BskyRef,
    id: `bsky:${uri}`,
    created_at: new Date().toISOString(),
    edited_at: null,
    content: renderRichText(text, facets),
    spoiler_text: '',
    visibility: 'public',
    url: postUrl(session.handle, uri),
    account,
    reblog: null,
    quote: null,
    in_reply_to_id: parent ? `bsky:${parent.uri}` : null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    media_attachments: [],
  };
}
