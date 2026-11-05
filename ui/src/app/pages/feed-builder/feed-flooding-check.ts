import { FLOOD_MIN_POSTS, FLOOD_SHARE } from '../../feed-doctor';
import { feedAuthors } from '../../feed-metrics';
import { Account, Status } from '../../models';
import { shuffled } from './feed-sample';

/**
 * How much the Flooding tab reads: up to `tags` of the ticked hashtags, one
 * request of `postsPerTag` each. A fixed budget, like the preview's.
 */
export const FLOOD_CHECK = { tags: 8, postsPerTag: 40, concurrency: 4 } as const;

export interface TagReading {
  tag: string;
  total: number;
  /** The account with the most posts in this hashtag's sample, if any. */
  loudest: { account: Account; count: number; share: number } | null;
}

export interface Flooder {
  account: Account;
  /** Every hashtag this account floods, with the evidence. */
  evidence: { tag: string; count: number; total: number; share: number }[];
}

/**
 * Who floods a hashtag, by Feed Doctor's rule: one author at FLOOD_SHARE or
 * more of a sample of at least FLOOD_MIN_POSTS posts. Authorship goes through
 * `feedAuthors`, so a boost counts for whoever wrote the post.
 */
export function readTag(tag: string, posts: Status[]): TagReading {
  const [top] = feedAuthors(posts);
  return {
    tag,
    total: posts.length,
    loudest: top ? { account: top.account, count: top.count, share: top.share } : null,
  };
}

export function flooders(readings: readonly TagReading[]): Flooder[] {
  const byAccount = new Map<string, Flooder>();
  for (const reading of readings) {
    const top = reading.loudest;
    if (!top || reading.total < FLOOD_MIN_POSTS || top.share < FLOOD_SHARE) continue;
    const key = top.account.acct.toLowerCase();
    const entry = byAccount.get(key) ?? { account: top.account, evidence: [] };
    entry.evidence.push({
      tag: reading.tag,
      count: top.count,
      total: reading.total,
      share: top.share,
    });
    byAccount.set(key, entry);
  }
  return [...byAccount.values()].sort(
    (a, b) =>
      Math.max(...b.evidence.map((e) => e.share)) - Math.max(...a.evidence.map((e) => e.share)),
  );
}

/** Read up to FLOOD_CHECK.tags hashtags concurrently, reporting each request as it lands. */
export async function checkTags(options: {
  tags: readonly string[];
  read: (tag: string, limit: number) => Promise<Status[]>;
  random?: () => number;
  onProgress?: (done: number, planned: number) => void;
}): Promise<TagReading[]> {
  const chosen = shuffled(options.tags, options.random).slice(0, FLOOD_CHECK.tags);
  const readings: TagReading[] = [];
  let done = 0;
  let next = 0;
  options.onProgress?.(0, chosen.length);
  const worker = async () => {
    while (next < chosen.length) {
      const tag = chosen[next++];
      let posts: Status[];
      try {
        posts = await options.read(tag, FLOOD_CHECK.postsPerTag);
      } catch {
        posts = [];
      }
      readings.push(readTag(tag, posts));
      options.onProgress?.(++done, chosen.length);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(FLOOD_CHECK.concurrency, chosen.length) }, () => worker()),
  );
  return chosen.map((tag) => readings.find((r) => r.tag === tag) as TagReading);
}
