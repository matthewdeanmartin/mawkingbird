import type { UnbirdArchive, UnbirdTweet } from './unbird-archive';

/**
 * Choosing old tweets to replay on Mastodon and spacing them out: the pure
 * half of Unbird's Posts tab (spec/sprint/unbird-2026-11.md, owner decisions).
 *
 * - Only the owner's own posts and their own threads replay. Replies to other
 *   people are dropped: out of context they are broken, and they name handles
 *   that are not the same person on Mastodon. Retweets are someone else's.
 * - Every `@handle` is defused to `handle`. On Mastodon a bare `@bob` resolves
 *   to whoever is `bob` on the reader's server and would ping a stranger.
 * - A web replay is at most {@link WEB_REPLAY_CAP} posts, Mastodon's limit on
 *   scheduled posts, and a quiet drip of a few a day.
 */

/** Mastodon keeps at most 300 scheduled posts per account. */
export const WEB_REPLAY_CAP = 300;
/** Native can hold a longer queue locally and top the server up as slots free. */
export const NATIVE_REPLAY_CAP = 2000;
/** Mastodon allows at most 50 scheduled posts per day. */
export const MAX_PER_DAY = 50;
/** Mastodon refuses a scheduled time less than five minutes away; keep a margin. */
export const SCHEDULE_LEAD_MS = 10 * 60 * 1000;
/** Characters a link counts for on Mastodon, whatever its length. */
const LINK_WEIGHT = 23;

/** One thing to replay: a single post, or a thread of the owner's own posts. */
export interface ReplayUnit {
  /** The first tweet's id. */
  id: string;
  /** In posting order, first post first. */
  tweets: UnbirdTweet[];
  at: string;
  likes: number;
  media: number;
}

export type ReplaySuggestion = 'best' | 'media' | 'threads' | 'oldest' | 'newest';

/**
 * The owner's posts grouped into units. A thread follows the earliest
 * self-reply at each step; side branches are dropped rather than guessed at.
 */
export function replayUnits(archive: UnbirdArchive): ReplayUnit[] {
  const children = new Map<string, UnbirdTweet[]>();
  for (const tweet of archive.tweets) {
    if (tweet.selfReply && tweet.replyTo && !tweet.retweet) {
      children.set(tweet.replyTo, [...(children.get(tweet.replyTo) ?? []), tweet]);
    }
  }
  const units: ReplayUnit[] = [];
  for (const root of archive.tweets) {
    if (root.retweet || root.replyTo || !root.at) continue;
    const tweets = [root];
    const seen = new Set([root.id]);
    for (let next = earliest(children.get(root.id)); next && !seen.has(next.id);) {
      tweets.push(next);
      seen.add(next.id);
      next = earliest(children.get(next.id));
    }
    units.push({
      id: root.id,
      tweets,
      at: root.at,
      likes: tweets.reduce((sum, tweet) => sum + tweet.likes, 0),
      media: tweets.reduce((sum, tweet) => sum + tweet.media, 0),
    });
  }
  return units;
}

function earliest(tweets: UnbirdTweet[] | undefined): UnbirdTweet | undefined {
  return tweets?.reduce((first, tweet) => (tweet.at < first.at ? tweet : first));
}

/**
 * `@bob` → `bob`, always, including `@bob@server` (owner decision): a replay
 * never notifies anyone. Email addresses and URLs are left alone.
 */
export function defuseMentions(text: string): string {
  return text.replace(/(^|[^\w@./])@(\w{1,30})\b/g, '$1$2');
}

/** A self-reply often starts with the owner's own handle(s); drop that run. */
export function stripLeadingMentions(text: string): string {
  return text.replace(/^(?:@\w{1,15}\s+)+/, '');
}

/** The Mastodon text for one tweet of a unit. */
export function replayText(
  tweet: UnbirdTweet,
  index: number,
  options: { dateLine: boolean; locale?: string },
): string {
  let text = defuseMentions(index > 0 ? stripLeadingMentions(tweet.text) : tweet.text).trim();
  if (options.dateLine && index === 0 && tweet.at) {
    const date = new Date(tweet.at).toLocaleDateString(options.locale ?? 'en', {
      dateStyle: 'medium',
    });
    text = `${text}\n\n(From Twitter, ${date})`;
  }
  return text;
}

/** Length as Mastodon counts it: every link is 23 characters. */
export function mastodonLength(text: string): number {
  const links = text.match(/https?:\/\/\S+/g) ?? [];
  const withoutLinks = links.reduce((rest, link) => rest.replace(link, ''), text);
  return [...withoutLinks].length + links.length * LINK_WEIGHT;
}

/** Whether every post in the unit fits the server's limit. */
export function unitFits(unit: ReplayUnit, limit: number, dateLine: boolean): boolean {
  return unit.tweets.every(
    (tweet, index) => mastodonLength(replayText(tweet, index, { dateLine })) <= limit,
  );
}

/** Units in the order a suggestion lists them. */
export function suggest(units: readonly ReplayUnit[], kind: ReplaySuggestion): ReplayUnit[] {
  const sorted = [...units];
  switch (kind) {
    case 'best':
      return sorted.filter((unit) => unit.likes > 0).sort((l, r) => r.likes - l.likes);
    case 'media':
      return sorted.filter((unit) => unit.media > 0).sort((l, r) => r.likes - l.likes);
    case 'threads':
      return sorted.filter((unit) => unit.tweets.length > 1).sort((l, r) => r.likes - l.likes);
    case 'oldest':
      return sorted.sort((l, r) => l.at.localeCompare(r.at));
    default:
      return sorted.sort((l, r) => r.at.localeCompare(l.at));
  }
}

export interface ScheduleOptions {
  /** Units per day. */
  perDay: number;
  /** First day, local midnight. */
  start: Date;
  /** Local hours the posts spread across. */
  fromHour: number;
  toHour: number;
  now: Date;
}

/**
 * A time for each unit: `perDay` a day, evenly spread across the window, in
 * the given order (oldest tweet first reads most naturally). Nothing lands
 * sooner than {@link SCHEDULE_LEAD_MS} from now.
 */
export function planTimes(units: readonly ReplayUnit[], options: ScheduleOptions): Date[] {
  const perDay = Math.max(1, Math.min(MAX_PER_DAY, Math.floor(options.perDay)));
  const span = Math.max(1, options.toHour - options.fromHour) * 60 * 60 * 1000;
  const earliest = options.now.getTime() + SCHEDULE_LEAD_MS;
  const times: Date[] = [];
  const day = new Date(options.start);
  day.setHours(0, 0, 0, 0);
  let slot = 0;
  for (let index = 0; index < units.length;) {
    const at = new Date(day);
    at.setHours(options.fromHour, 0, 0, 0);
    const time = at.getTime() + Math.round(((slot + 0.5) * span) / perDay);
    slot++;
    if (slot >= perDay) {
      slot = 0;
      day.setDate(day.getDate() + 1);
    }
    if (time < earliest) continue;
    times.push(new Date(time));
    index++;
  }
  return times;
}

/** Posts in a selection: what counts against the cap. */
export function postCount(units: readonly ReplayUnit[]): number {
  return units.reduce((sum, unit) => sum + unit.tweets.length, 0);
}
