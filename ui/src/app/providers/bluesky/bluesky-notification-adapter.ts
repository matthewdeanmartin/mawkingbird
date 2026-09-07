// Adapts app.bsky notifications into Mastodon-shaped MastodonNotification.

import { MastodonNotification, Status } from '../../models';
import { adaptAuthor, adaptPost } from './bluesky-adapter';
import { BskyNotification, BskyPostRecord, BskyPostView } from './bluesky-types';

/**
 * Bluesky's `reason` → Mastodon's notification `type`.
 *
 * `reply` and `quote` both fold to `mention` because that is the Mastodon type
 * whose row already reads "someone wrote this post at you", which is what all
 * three are. The `-via-repost` variants are the same event as their base reason
 * — someone liked your post; they merely found it through a repost — so they
 * fold together rather than earning a row style nobody has designed.
 *
 * Anything absent falls through to the raw reason string. `knownValues` in AT
 * Protocol means "these are known, others are legal", and a `repost-via-repost`
 * appeared in the first 20 notifications of a real account — so the long tail
 * is not hypothetical, and an unknown reason must render, not throw.
 */
const REASON_TYPES: Readonly<Record<string, string>> = {
  like: 'favourite',
  'like-via-repost': 'favourite',
  repost: 'reblog',
  'repost-via-repost': 'reblog',
  follow: 'follow',
  // A starter-pack join is a follow that happens to have a pack attached; the
  // pack itself is not rendered (see the sprint doc).
  'starterpack-joined': 'follow',
  mention: 'mention',
  reply: 'mention',
  quote: 'mention',
};

export function notificationType(reason: string): string {
  return REASON_TYPES[reason] ?? reason;
}

/**
 * Reasons whose `record` *is* the post worth showing.
 *
 * For these the notifying record is an `app.bsky.feed.post` — the reply, the
 * mention, the quote someone wrote — so it renders with no extra request. For
 * `like` and `repost` the record is the like/repost record instead, which shows
 * nothing useful; those need `reasonSubject` hydrated separately.
 */
const RECORD_IS_THE_POST: ReadonlySet<string> = new Set(['reply', 'mention', 'quote']);

/**
 * The at-uris a page of notifications needs hydrated, deduped.
 *
 * Filtered to actual post uris. A `repost-via-repost` names a *repost* record,
 * and `getPosts` drops those silently — nine uris returned eight posts in live
 * testing — so asking for them only wastes a slot in the batch.
 */
export function subjectUris(notifications: BskyNotification[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of notifications) {
    const uri = n.reasonSubject;
    if (
      !uri ||
      seen.has(uri) ||
      RECORD_IS_THE_POST.has(n.reason) ||
      !uri.includes('/app.bsky.feed.post/')
    ) {
      continue;
    }
    seen.add(uri);
    out.push(uri);
  }
  return out;
}

/** Split a uri list into `getPosts`-sized batches (the endpoint caps at 25). */
export function chunkUris(uris: string[], size = 25): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < uris.length; i += size) {
    out.push(uris.slice(i, i + size));
  }
  return out;
}

/** Key hydrated posts by uri. Never index-align these with the request. */
export function postsByUri(posts: BskyPostView[]): Map<string, Status> {
  return new Map(posts.map((post) => [post.uri, adaptPost(post)]));
}

/**
 * One notification, in Mastodon's shape.
 *
 * `created_at` is `indexedAt` rather than the record's own `createdAt`: the
 * latter is written by whoever created the record and can claim any time at
 * all, while `indexedAt` is the AppView's own clock. Sorting a timeline by
 * attacker-supplied timestamps is how a notification pins itself to the top.
 */
export function adaptNotification(
  notification: BskyNotification,
  subjects: Map<string, Status>,
): MastodonNotification {
  return {
    id: `bsky:${notification.uri}`,
    type: notificationType(notification.reason),
    created_at: notification.indexedAt,
    account: adaptAuthor(notification.author),
    status: notificationStatus(notification, subjects),
  };
}

function notificationStatus(
  notification: BskyNotification,
  subjects: Map<string, Status>,
): Status | undefined {
  if (RECORD_IS_THE_POST.has(notification.reason)) {
    return recordAsStatus(notification);
  }
  // Missing is normal, not an error: the subject may be a repost record, or a
  // post deleted since the notification was written. The row still renders.
  return notification.reasonSubject ? subjects.get(notification.reasonSubject) : undefined;
}

/**
 * The inline record rendered as a post.
 *
 * `listNotifications` hands back the bare record, not a `postView` — so there
 * are no counts, no viewer state and no embed view. `adaptPost` is given the
 * notification's own `uri`/`cid` (which identify this very record) and the
 * author it already carries, producing a real, clickable status with zeroed
 * counts. Opening the thread fetches the hydrated version.
 */
function recordAsStatus(notification: BskyNotification): Status | undefined {
  const record = notification.record;
  if (!record || typeof record.text !== 'string') {
    return undefined;
  }
  return adaptPost({
    uri: notification.uri,
    cid: notification.cid,
    author: notification.author,
    record: {
      $type: record.$type ?? 'app.bsky.feed.post',
      text: record.text,
      createdAt: record.createdAt ?? notification.indexedAt,
      facets: record.facets,
      reply: record.reply,
    } satisfies BskyPostRecord,
    indexedAt: notification.indexedAt,
  });
}
