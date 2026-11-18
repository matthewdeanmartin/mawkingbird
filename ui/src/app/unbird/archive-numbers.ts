import type { UnbirdArchive, UnbirdPerson, UnbirdTweet } from './unbird-archive';

/**
 * "Your Twitter in numbers": a private look back, computed on the device.
 *
 * Deliberately not a share card. There is nowhere to host one except a
 * 500-character Mastodon post, and the numbers are about the reader, not for
 * their audience.
 *
 * Times use the browser's time zone: the archive stores UTC and does not say
 * where the owner lived, so "your busiest hour" is in the zone you read it in.
 */

export interface ArchiveNumbers {
  first: string | null;
  last: string | null;
  years: number;
  perYear: { year: string; tweets: number }[];
  originals: number;
  threads: number;
  replies: number;
  retweets: number;
  withMedia: number;
  likes: number;
  following: number;
  followers: number;
  /** Most-liked of the owner's own tweets. */
  best: UnbirdTweet[];
  /** 0 (Sunday) to 6. */
  busiestDay: number | null;
  /** 0 to 23. */
  busiestHour: number | null;
  /** Most-talked-to people. */
  talkedTo: UnbirdPerson[];
  hashtags: { tag: string; count: number }[];
}

export function archiveNumbers(archive: UnbirdArchive): ArchiveNumbers {
  const own = archive.tweets.filter((tweet) => !tweet.retweet && tweet.at);
  const sorted = [...own].sort((left, right) => left.at.localeCompare(right.at));
  const years = new Map<string, number>();
  const days = new Array<number>(7).fill(0);
  const hours = new Array<number>(24).fill(0);
  const tags = new Map<string, { tag: string; count: number }>();

  for (const tweet of own) {
    const year = tweet.at.slice(0, 4);
    years.set(year, (years.get(year) ?? 0) + 1);
    const at = new Date(tweet.at);
    days[at.getDay()]++;
    hours[at.getHours()]++;
    for (const [, tag] of tweet.text.matchAll(/(?:^|\s)#([\p{L}\p{N}_]+)/gu)) {
      const key = tag.toLowerCase();
      const entry = tags.get(key) ?? { tag, count: 0 };
      entry.count++;
      tags.set(key, entry);
    }
  }

  const perYear = [...years]
    .map(([year, tweets]) => ({ year, tweets }))
    .sort((left, right) => left.year.localeCompare(right.year));
  const peak = (counts: number[]) => (own.length ? counts.indexOf(Math.max(...counts)) : null);

  return {
    first: sorted[0]?.at ?? null,
    last: sorted.at(-1)?.at ?? null,
    years: perYear.length,
    perYear,
    originals: own.filter((tweet) => !tweet.replyTo).length,
    threads: own.filter((tweet) => tweet.selfReply).length,
    replies: own.filter((tweet) => tweet.replyToOther).length,
    retweets: archive.tweets.length - own.length,
    withMedia: own.filter((tweet) => tweet.media > 0).length,
    likes: archive.likes.length,
    following: archive.followingCount,
    followers: archive.followerCount,
    best: own
      .filter((tweet) => !tweet.replyToOther && tweet.likes > 0)
      .sort((left, right) => right.likes - left.likes || right.retweets - left.retweets)
      .slice(0, 5),
    busiestDay: peak(days),
    busiestHour: peak(hours),
    talkedTo: [...archive.people]
      .filter((person) => person.reply_count + person.mention_count > 0 && person.twitter_handle)
      .sort(
        (left, right) =>
          right.reply_count + right.mention_count - (left.reply_count + left.mention_count),
      )
      .slice(0, 10),
    hashtags: [...tags.values()].sort((left, right) => right.count - left.count).slice(0, 10),
  };
}
