import type { UnbirdArchive, UnbirdLike, UnbirdTweet } from './unbird-archive';

/**
 * Full-text search over a read archive's tweets and likes, in memory.
 *
 * Tens of thousands of short texts scan in a few milliseconds, so there is no
 * index beyond a lower-cased, accent-folded copy of each text, built once per
 * archive and kept in a WeakMap so a forgotten archive takes it along.
 * Every word must appear (AND); quoted phrases match as written.
 */

export type TweetKind = 'all' | 'originals' | 'threads' | 'replies' | 'media';

export interface TweetQuery {
  text: string;
  kind: TweetKind;
  /** Four-digit year, or null for every year. */
  year: string | null;
  /** Retweets are someone else's words; shown only on request. */
  retweets: boolean;
}

const folded = new WeakMap<object, string[]>();

export function fold(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Quoted phrases and bare words, folded. */
export function terms(query: string): string[] {
  const out: string[] = [];
  const pattern = /"([^"]+)"|(\S+)/g;
  for (let match = pattern.exec(query); match; match = pattern.exec(query)) {
    const term = fold((match[1] ?? match[2]).trim());
    if (term) out.push(term);
  }
  return out;
}

function foldedTexts<T extends { text: string }>(owner: object, items: readonly T[]): string[] {
  let texts = folded.get(owner);
  if (!texts || texts.length !== items.length) {
    texts = items.map((item) => fold(item.text));
    folded.set(owner, texts);
  }
  return texts;
}

function kindMatches(tweet: UnbirdTweet, kind: TweetKind): boolean {
  switch (kind) {
    case 'originals':
      return !tweet.replyTo;
    case 'threads':
      return !!tweet.selfReply;
    case 'replies':
      return !!tweet.replyToOther;
    case 'media':
      return tweet.media > 0;
    default:
      return true;
  }
}

/** Tweets matching the query, newest first, at most `limit`; `total` counts all of them. */
export function searchTweets(
  archive: UnbirdArchive,
  query: TweetQuery,
  limit = 100,
): { results: UnbirdTweet[]; total: number } {
  const wanted = terms(query.text);
  const texts = foldedTexts(archive.tweets, archive.tweets);
  const results: UnbirdTweet[] = [];
  let total = 0;
  archive.tweets.forEach((tweet, index) => {
    if (tweet.retweet && !query.retweets) return;
    if (query.year && !tweet.at.startsWith(query.year)) return;
    if (!kindMatches(tweet, query.kind)) return;
    if (!wanted.every((term) => texts[index].includes(term))) return;
    total++;
    if (results.length < limit) results.push(tweet);
  });
  return { results, total };
}

export function searchLikes(
  archive: UnbirdArchive,
  text: string,
  limit = 100,
): { results: UnbirdLike[]; total: number } {
  const wanted = terms(text);
  const texts = foldedTexts(archive.likes, archive.likes);
  const results: UnbirdLike[] = [];
  let total = 0;
  archive.likes.forEach((like, index) => {
    if (!wanted.every((term) => texts[index].includes(term))) return;
    total++;
    if (results.length < limit) results.push(like);
  });
  return { results, total };
}

/** Years that have tweets, newest first. */
export function tweetYears(archive: UnbirdArchive): string[] {
  return [...new Set(archive.tweets.map((tweet) => tweet.at.slice(0, 4)).filter(Boolean))].sort(
    (left, right) => right.localeCompare(left),
  );
}

/** The tweet on X. Likes and tweets are linked by id; X redirects to the author. */
export function tweetUrl(id: string): string {
  return `https://x.com/i/web/status/${id}`;
}
