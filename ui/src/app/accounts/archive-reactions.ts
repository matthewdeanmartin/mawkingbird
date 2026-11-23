import { Account, MastodonNotification, Status } from '../platform/api/models';
import type { NativeTimedReactions } from '../platform/session/native-analytics-types';

const DAY = 86_400_000;

/** The archive read covers at least this many days, so best times see months. */
export const ARCHIVE_MIN_DAYS = 90;
/** The archive command's limit. */
export const ARCHIVE_MAX_DAYS = 365;

/** How many days to ask the archive for, to reach back to `oldest` (epoch ms). */
export function archiveDays(oldest: number, now: number = Date.now()): number {
  const days = Math.ceil((now - oldest) / DAY) + 1;
  return Math.min(ARCHIVE_MAX_DAYS, Math.max(ARCHIVE_MIN_DAYS, days));
}

/**
 * The archive's rows as notifications, newest first, so one pipeline serves
 * both sources. A like or boost whose post link was never saved keeps its
 * person and time but names no post.
 */
export function archiveNotifications(rows: NativeTimedReactions): MastodonNotification[] {
  return rows.events.flatMap((event) => {
    const person = rows.people[event.actor];
    if (!person) {
      return [];
    }
    const post = event.post ? rows.posts[event.post] : undefined;
    return [
      {
        id: event.id,
        type: event.kind,
        created_at: event.at,
        account: person as Account,
        status: post as Status | undefined,
      },
    ];
  });
}
