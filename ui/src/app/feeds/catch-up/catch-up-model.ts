import { Account, Status } from '../../platform/api/models';

/**
 * Catch-up: a bounded session over the people you follow, with an ending.
 *
 * Phanpy's idea (spec/phanpy_parity.md item 1), Mawkingbird's reason: a feed
 * that ends is a wellness feature. Home already has a cap; Catch-up goes
 * further and is *about* the boundary. It loads "since last time" (or a range
 * you pick), shows it grouped by who wrote it, and says when you've seen it
 * all. Finishing records the session, and the next one starts there.
 *
 * Pure: no Angular, no storage. The page owns loading and persistence.
 */

/** 'last' = since the end of the previous finished session. */
export type CatchUpRange = 'last' | 1 | 3 | 6 | 12 | 24;

export const CATCH_UP_RANGES: readonly CatchUpRange[] = ['last', 1, 3, 6, 12, 24];

/** With no previous session, "since last time" means the last 12 hours. */
export const FIRST_SESSION_HOURS = 12;

/** The longest "since last time" reaches back, however long ago that was. */
export const MAX_SESSION_HOURS = 72;

/**
 * Most posts one session loads. A catch-up that can run to thousands is an
 * endless feed with extra steps. Reaching it is reported, not hidden.
 */
export const CATCH_UP_MAX_POSTS = 600;

/** Past sessions kept for the history list and overlap warning. */
export const CATCH_UP_HISTORY = 10;

export interface CatchUpSession {
  /** Epoch ms: the oldest post time the session covered. */
  from: number;
  /** Epoch ms: when the session was loaded (its newest boundary). */
  to: number;
  posts: number;
  people: number;
}

export type CatchUpKind = 'all' | 'originals' | 'replies' | 'boosts' | 'links' | 'media';

export const CATCH_UP_KINDS: readonly CatchUpKind[] = [
  'all',
  'originals',
  'replies',
  'boosts',
  'links',
  'media',
];

export type CatchUpSort = 'people' | 'recent';

export interface AuthorGroup {
  account: Account;
  /** Oldest first: catching up reads forward in time. */
  posts: Status[];
  latest: number;
}

const HOUR = 3_600_000;

/** The session's start boundary (epoch ms) for a range and the last finished session. */
export function rangeStart(range: CatchUpRange, now: number, last: CatchUpSession | null): number {
  if (range !== 'last') {
    return now - range * HOUR;
  }
  if (!last) {
    return now - FIRST_SESSION_HOURS * HOUR;
  }
  return Math.max(last.to, now - MAX_SESSION_HOURS * HOUR);
}

/**
 * The previous session this one would re-read, if any: an explicit range can
 * reach back before the last session's end. Worth saying so ("you caught up
 * on part of this at 9:40"), never worth blocking.
 */
export function overlapping(
  start: number,
  history: readonly CatchUpSession[],
): CatchUpSession | null {
  return history.find((session) => session.to > start) ?? null;
}

function time(status: Status): number {
  const ms = Date.parse(status.created_at);
  return Number.isNaN(ms) ? 0 : ms;
}

export function matchesKind(status: Status, kind: CatchUpKind): boolean {
  const shown = status.reblog ?? status;
  switch (kind) {
    case 'all':
      return true;
    case 'boosts':
      return !!status.reblog;
    case 'replies':
      return !status.reblog && !!status.in_reply_to_id;
    case 'originals':
      return !status.reblog && !status.in_reply_to_id;
    case 'links':
      return (
        !!shown.card || /<a [^>]*href="https?:\/\/(?![^"]*\/tags\/)[^"]*"/i.test(shown.content)
      );
    case 'media':
      return (shown.media_attachments?.length ?? 0) > 0;
  }
}

/**
 * Posts grouped by the account that put them in your feed (a booster for a
 * boost: that's who you follow). Duplicate ids, which merged providers can
 * produce, are dropped.
 */
export function groupByAuthor(statuses: readonly Status[], sort: CatchUpSort): AuthorGroup[] {
  const seen = new Set<string>();
  const groups = new Map<string, AuthorGroup>();
  for (const status of statuses) {
    if (seen.has(status.id)) continue;
    seen.add(status.id);
    const key = `${status.provider ?? 'mastodon'}:${status.account.id}`;
    let group = groups.get(key);
    if (!group) {
      group = { account: status.account, posts: [], latest: 0 };
      groups.set(key, group);
    }
    group.posts.push(status);
    group.latest = Math.max(group.latest, time(status));
  }
  const list = [...groups.values()];
  for (const group of list) {
    group.posts.sort((a, b) => time(a) - time(b));
  }
  return list.sort((a, b) =>
    sort === 'people'
      ? b.posts.length - a.posts.length || b.latest - a.latest
      : b.latest - a.latest,
  );
}

/** Newest first, capped, as stored: the history list is a log, not an archive. */
export function recordSession(
  history: readonly CatchUpSession[],
  session: CatchUpSession,
): CatchUpSession[] {
  return [session, ...history].slice(0, CATCH_UP_HISTORY);
}

/** Stored history made safe: wrong shapes are dropped rather than trusted. */
export function normalizeHistory(value: unknown): CatchUpSession[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is CatchUpSession =>
        !!item &&
        typeof item === 'object' &&
        ['from', 'to', 'posts', 'people'].every(
          (key) => typeof (item as Record<string, unknown>)[key] === 'number',
        ),
    )
    .slice(0, CATCH_UP_HISTORY);
}
