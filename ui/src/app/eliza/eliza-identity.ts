/**
 * Eliza's synthetic identity: her {@link Account} and her timeline {@link Status}
 * objects, built from the copy in `eliza-content.ts`.
 *
 * Everything here uses the reserved `eliza:` id namespace. Real Mastodon ids are
 * numeric strings, so `eliza:self` / `eliza:post:<slug>` can never collide with a
 * real account or status — which is what lets the interception layer (both the
 * anonymous provider and the authenticated `api.ts` front-door) recognise an
 * Eliza-directed call with a cheap `id.startsWith('eliza:')` test.
 */

import { Account, Status } from '../models';
import { ELIZA_BIO, ELIZA_POSTS } from './eliza-content';

/** Reserved id prefix. Any id under this namespace is Eliza's and never real. */
export const ELIZA_NS = 'eliza:';

/** Eliza's account id. */
export const ELIZA_ID = 'eliza:self';

/** Her local username. */
export const ELIZA_ACCT = 'eliza';

/**
 * Her conversation-store peer key.
 *
 * Also the key {@link ConversationStore} treats as ephemeral: starting a new
 * conversation with Eliza clears the old one instead of archiving it.
 */
export const ELIZA_PEER = 'eliza';

/**
 * Her fully-qualified handle. Deliberately on `mockingbird.com` — which is not a
 * Mastodon instance and never will be — so that anything qualifying her handle
 * (list membership, mentions) can't resolve to a real `eliza@mastodon.social`.
 */
export const ELIZA_HANDLE = 'eliza@mockingbird.com';

/** True for any id that belongs to Eliza (her account or one of her posts). */
export function isElizaId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(ELIZA_NS);
}

/** Wrap a plain-text body in the minimal paragraph HTML `status-card` expects. */
function toHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Eliza's account, freshly built. Counts reflect her real (synthetic) posts. */
export function elizaAccount(): Account {
  return {
    id: ELIZA_ID,
    username: ELIZA_ACCT,
    acct: ELIZA_HANDLE,
    display_name: 'Eliza',
    note: toHtml(ELIZA_BIO),
    url: '',
    avatar: 'eliza-avatar.svg',
    avatar_static: 'eliza-avatar.svg',
    header: '',
    header_static: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: ELIZA_POSTS.length,
    bot: true,
    locked: false,
    discoverable: false,
    fields: [],
    role: null,
    source: {
      privacy: 'public',
      sensitive: false,
      language: 'en',
      note: ELIZA_BIO,
      fields: [],
    },
  };
}

/**
 * Build one of Eliza's timeline posts as a full {@link Status}.
 *
 * @param post  A `ELIZA_POSTS` entry.
 * @param now   Reference time in ms (the caller's clock); the post's
 *              `created_at` is `now - agoMinutes`, keeping the timeline plausibly
 *              ordered without a real server.
 */
export function elizaPostStatus(
  post: (typeof ELIZA_POSTS)[number],
  account: Account,
  now: number,
): Status {
  const createdAt = new Date(now - post.agoMinutes * 60_000).toISOString();
  return {
    provider: 'anonymous-mastodon',
    id: `eliza:post:${post.id}`,
    created_at: createdAt,
    edited_at: null,
    content: toHtml(post.body),
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account,
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
    pinned: !!post.pinned,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    language: 'en',
    media_attachments: [],
    application: null,
    mentions: [],
  };
}

/** Eliza's full timeline, newest first, pinned posts hoisted to the top. */
export function elizaTimeline(now: number = Date.now()): Status[] {
  const account = elizaAccount();
  const statuses = ELIZA_POSTS.map((p) => elizaPostStatus(p, account, now));
  return statuses.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
}
