import { Account, Status } from '../../models';

/**
 * Build a "virtual tweet": a synthetic Mastodon status whose body is a chunk of
 * static, in-app content (the Design essay, the Credits list). It renders through
 * the normal {@link StatusCard} so a page like Design or Credits reads as a post
 * in the centre column — no bespoke full-page layout, no leaving the app.
 *
 * The body is trusted, hand-authored HTML (not user input): callers pass the same
 * markup the old standalone pages rendered. StatusCard runs it through its own
 * sanitiser like any other status content.
 */
export interface VirtualTweetInput {
  /** Stable id, so the card and any deep link are deterministic. */
  id: string;
  /** Trusted HTML body of the post. */
  content: string;
  /** The synthetic author to attribute the post to. */
  account: Account;
  /** Optional permalink; null renders as a post with no external URL. */
  url?: string | null;
}

/** The house account every virtual tweet is attributed to. */
export const MAWKINGBIRD_ACCOUNT: Account = {
  id: 'mawkingbird:house',
  username: 'mawkingbird',
  acct: 'mawkingbird',
  display_name: 'Mawkingbird',
  note: 'A 2018-Twitter-style client for Mastodon.',
  url: '',
  avatar: 'favicon-32x32.png',
  avatar_static: 'favicon-32x32.png',
  header: '',
  followers_count: 0,
  following_count: 0,
  statuses_count: 0,
  bot: false,
  locked: false,
  discoverable: false,
  fields: [],
};

/** Synthesize a Status from static content for rendering via StatusCard. */
export function virtualTweet(input: VirtualTweetInput): Status {
  return {
    provider: 'paste',
    id: input.id,
    created_at: new Date().toISOString(),
    edited_at: null,
    content: input.content,
    spoiler_text: '',
    visibility: 'public',
    url: input.url ?? null,
    account: input.account,
    reblog: null,
    quote: null,
    in_reply_to_id: null,
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
    language: 'en',
    media_attachments: [],
    application: { name: 'Mawkingbird', website: '' },
  };
}
