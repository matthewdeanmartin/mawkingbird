import { BOOST_TYPES, FOLLOW_TYPES, LIKE_TYPES } from './notification-digest';

/**
 * The Inbox's views (owner, 2026-11-26; spec/sprint/inbox-views-2026-11.md).
 *
 * Not filters on one raw feed: each is a different page with its own reason
 * to be here. Conversations is the default, so the inbox opens on people
 * talking to you rather than on "line goes up".
 *
 * - **Conversations**: talk, plus the few things that need you.
 * - **Stats**: likes and boosts, post by post, with faces.
 * - **Who**: follow requests, new followers, and accounts new to you.
 * - **Stream**: everything, as it arrived, lightly grouped by post.
 *
 * Network filters, the audience filter and the type picker apply to all four.
 */
export type InboxTab = 'conversations' | 'stats' | 'who' | 'stream';

export const INBOX_TABS: readonly InboxTab[] = ['conversations', 'stats', 'who', 'stream'];

/** Follow requests on every network: in Who, and in Conversations, since they need an answer. */
export const FOLLOW_REQUEST_TYPES: ReadonlySet<string> = new Set([
  'follow_request',
  'receiveFollowRequest',
]);

/**
 * Talk, and the things to act on: mentions, replies, quotes, polls that ended,
 * edits to posts you interacted with, moderation and report notices, lost
 * follows. Every network's names.
 */
export const CONVERSATION_TYPES: ReadonlySet<string> = new Set([
  // Mastodon
  'mention',
  'quote',
  'quoted_update',
  'poll',
  'update',
  'admin.report',
  'severed_relationships',
  'moderation_warning',
  // Bluesky
  'reply',
  'quote',
  // Misskey
  'pollEnded',
  ...FOLLOW_REQUEST_TYPES,
]);

/** Likes and boosts on every network: "line goes up". */
export function isStatsType(type: string): boolean {
  return LIKE_TYPES.has(type) || BOOST_TYPES.has(type);
}

/** People: follows, follow requests, and (for admins) new sign-ups on your server. */
export function isWhoType(type: string): boolean {
  return FOLLOW_TYPES.has(type) || FOLLOW_REQUEST_TYPES.has(type) || type === 'admin.sign_up';
}

/** Whether a notification of this type belongs on a view. Stream holds everything. */
export function inTab(tab: InboxTab, type: string): boolean {
  switch (tab) {
    case 'conversations':
      return CONVERSATION_TYPES.has(type);
    case 'stats':
      return isStatsType(type);
    case 'who':
      return isWhoType(type);
    case 'stream':
      return true;
  }
}

/**
 * Whether a notification may light the menu's Inbox dot: Conversations and Who
 * only (owner, 2026-11-26). Likes and boosts never pull you in, and neither do
 * Stream-only kinds such as "someone you subscribed to posted".
 */
export function lightsInboxDot(type: string | null | undefined): boolean {
  return !!type && (CONVERSATION_TYPES.has(type) || isWhoType(type));
}

/** The Mastodon types to ask the server about when its marker only gives a count. */
export const DOT_MASTODON_TYPES: readonly string[] = [
  'mention',
  'quote',
  'poll',
  'update',
  'follow',
  'follow_request',
  'admin.report',
  'admin.sign_up',
  'severed_relationships',
  'moderation_warning',
];

export function parseInboxTab(value: string | null | undefined): InboxTab {
  return INBOX_TABS.includes(value as InboxTab) ? (value as InboxTab) : 'conversations';
}
