import { Account, MastodonNotification } from '../platform/api/models';
import { hostOf } from './audience-composition';

/**
 * Who reacted to your posts, when, and to which post: the timed record behind
 * the discovery rate and top boosters.
 *
 * Built from the same notifications the decay scan reads. A like or boost
 * notification names your post and carries the reacting account in full
 * (follower count included), so neither figure needs a lookup per person.
 */

export type ReactionKind = 'likes' | 'boosts' | 'replies';
export const REACTION_KINDS: readonly ReactionKind[] = ['likes', 'boosts', 'replies'];

export interface Reaction {
  kind: ReactionKind;
  personId: string;
  postId: string;
  /** Epoch ms. */
  at: number;
}

export interface ReactedPost {
  id: string;
  /** Your post's text, HTML. */
  content: string;
  /** Lowercase hashtag names. */
  tags: string[];
}

export interface ReactionLog {
  reactions: Reaction[];
  people: Map<string, Account>;
  /** Posts seen in a like or boost; a post with only replies is absent. */
  posts: Map<string, ReactedPost>;
  /** The earliest follow notification seen per person, epoch ms. */
  firstFollow: Map<string, number>;
}

/** Collects a {@link ReactionLog} from notifications, newest first. */
export class ReactionLogBuilder {
  private readonly log: ReactionLog = {
    reactions: [],
    people: new Map(),
    posts: new Map(),
    firstFollow: new Map(),
  };

  constructor(private readonly accountId: string) {}

  add(notification: MastodonNotification): void {
    const at = Date.parse(notification.created_at);
    const person = notification.account;
    if (Number.isNaN(at) || !person?.id || person.id === this.accountId) {
      return;
    }
    if (notification.type === 'follow') {
      const seen = this.log.firstFollow.get(person.id);
      this.log.firstFollow.set(person.id, seen === undefined ? at : Math.min(seen, at));
      return;
    }
    const status = notification.status;
    if (!status) {
      return;
    }
    if (notification.type === 'favourite' || notification.type === 'reblog') {
      this.log.posts.set(status.id, {
        id: status.id,
        content: status.content ?? '',
        tags: [...new Set((status.tags ?? []).map((t) => t.name.toLowerCase()))],
      });
      this.record(notification.type === 'favourite' ? 'likes' : 'boosts', person, status.id, at);
    } else if (
      notification.type === 'mention' &&
      status.in_reply_to_id &&
      status.in_reply_to_account_id === this.accountId
    ) {
      this.record('replies', person, status.in_reply_to_id, at);
    }
  }

  private record(kind: ReactionKind, person: Account, postId: string, at: number): void {
    // Newest first, so the first account seen is the most recent snapshot.
    if (!this.log.people.has(person.id)) {
      this.log.people.set(person.id, person);
    }
    this.log.reactions.push({ kind, personId: person.id, postId, at });
  }

  build(): ReactionLog {
    return this.log;
  }
}

// ---------------------------------------------------------------------------
// Discovery rate
// ---------------------------------------------------------------------------

/** Fewer judged reactions than this and a post or hashtag is not ranked. */
export const MIN_REACTIONS_TO_RANK = 5;
/** A hashtag needs this many posts, or it only describes one post. */
export const MIN_POSTS_PER_TAG = 2;

export interface DiscoveryShare {
  /** Reactions whose follow state is known. */
  reactions: number;
  /** Of those, from people who did not follow you at the time. */
  discovered: number;
  /** Whole percentage; null with nothing to divide. */
  pct: number | null;
}

export interface DiscoveryRow extends DiscoveryShare {
  /** Post id or hashtag. */
  key: string;
  /** Different people who found you through it. */
  newPeople: number;
  /** Post text (HTML) for a post row; empty for a hashtag. */
  content: string;
}

export interface Discovery {
  overall: DiscoveryShare;
  byKind: Record<ReactionKind, DiscoveryShare>;
  /** Different people with a known follow state. */
  people: number;
  /** Of those, people who reacted while not following you. */
  newPeople: number;
  /** New people who follow you now. */
  followedAfter: number;
  /** People whose follow state is unknown; their reactions are left out. */
  unknownPeople: number;
  posts: DiscoveryRow[];
  tags: DiscoveryRow[];
}

/**
 * Whether a reaction came from someone who was not following you then.
 *
 * Follow state is only known *now*, so someone who discovered you and then
 * followed looks like a follower. The follow notification repairs that when it
 * was read: a reaction before their first follow was a discovery. Null means
 * the follow state is unknown.
 */
export function isDiscovery(
  reaction: Reaction,
  log: ReactionLog,
  followsYou: ReadonlyMap<string, boolean>,
): boolean | null {
  const follows = followsYou.get(reaction.personId);
  if (follows === undefined) {
    return null;
  }
  if (!follows) {
    return true;
  }
  const since = log.firstFollow.get(reaction.personId);
  return since !== undefined && reaction.at < since;
}

function share(reactions: number, discovered: number): DiscoveryShare {
  return {
    reactions,
    discovered,
    pct: reactions ? Math.round((discovered / reactions) * 100) : null,
  };
}

class Bucket {
  reactions = 0;
  discovered = 0;
  readonly newPeople = new Set<string>();
  readonly posts = new Set<string>();

  add(reaction: Reaction, discovery: boolean): void {
    this.reactions++;
    this.posts.add(reaction.postId);
    if (discovery) {
      this.discovered++;
      this.newPeople.add(reaction.personId);
    }
  }
}

function bucketFor(map: Map<string, Bucket>, key: string): Bucket {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = new Bucket();
    map.set(key, bucket);
  }
  return bucket;
}

function rows(buckets: Map<string, Bucket>, content: (key: string) => string): DiscoveryRow[] {
  return [...buckets.entries()]
    .filter(([, b]) => b.reactions >= MIN_REACTIONS_TO_RANK && b.newPeople.size > 0)
    .map(([key, b]) => ({
      key,
      ...share(b.reactions, b.discovered),
      newPeople: b.newPeople.size,
      content: content(key),
    }))
    .sort((a, b) => b.newPeople - a.newPeople || (b.pct ?? 0) - (a.pct ?? 0));
}

/** The discovery rate overall, by kind, by post and by hashtag. */
export function computeDiscovery(
  log: ReactionLog,
  followsYou: ReadonlyMap<string, boolean>,
): Discovery {
  const all = new Bucket();
  const kinds: Record<ReactionKind, Bucket> = {
    likes: new Bucket(),
    boosts: new Bucket(),
    replies: new Bucket(),
  };
  const posts = new Map<string, Bucket>();
  const tags = new Map<string, Bucket>();
  const known = new Set<string>();
  const unknown = new Set<string>();
  for (const reaction of log.reactions) {
    const discovery = isDiscovery(reaction, log, followsYou);
    if (discovery === null) {
      unknown.add(reaction.personId);
      continue;
    }
    known.add(reaction.personId);
    all.add(reaction, discovery);
    kinds[reaction.kind].add(reaction, discovery);
    bucketFor(posts, reaction.postId).add(reaction, discovery);
    for (const tag of log.posts.get(reaction.postId)?.tags ?? []) {
      bucketFor(tags, tag).add(reaction, discovery);
    }
  }
  for (const [tag, bucket] of tags) {
    if (bucket.posts.size < MIN_POSTS_PER_TAG) tags.delete(tag);
  }
  return {
    overall: share(all.reactions, all.discovered),
    byKind: {
      likes: share(kinds.likes.reactions, kinds.likes.discovered),
      boosts: share(kinds.boosts.reactions, kinds.boosts.discovered),
      replies: share(kinds.replies.reactions, kinds.replies.discovered),
    },
    people: known.size,
    newPeople: all.newPeople.size,
    followedAfter: [...all.newPeople].filter((id) => followsYou.get(id)).length,
    unknownPeople: unknown.size,
    posts: rows(posts, (id) => log.posts.get(id)?.content ?? ''),
    tags: rows(tags, () => ''),
  };
}

// ---------------------------------------------------------------------------
// Top boosters
// ---------------------------------------------------------------------------

export interface Booster {
  account: Account;
  /** Their server, or null when unknown. */
  host: string | null;
  /** Different posts of yours they boosted. */
  posts: number;
  followers: number;
  /** Their last boost, epoch ms. */
  last: number;
}

export type BoosterSort = 'audience' | 'posts';

/** People who boosted you, by their own audience or by how often they do it. */
export function topBoosters(log: ReactionLog, sort: BoosterSort): Booster[] {
  const byPerson = new Map<string, { posts: Set<string>; last: number }>();
  for (const r of log.reactions) {
    if (r.kind !== 'boosts') continue;
    const entry = byPerson.get(r.personId) ?? { posts: new Set<string>(), last: 0 };
    entry.posts.add(r.postId);
    entry.last = Math.max(entry.last, r.at);
    byPerson.set(r.personId, entry);
  }
  const out: Booster[] = [];
  for (const [id, entry] of byPerson) {
    const account = log.people.get(id);
    if (!account) continue;
    out.push({
      account,
      host: hostOf(account),
      posts: entry.posts.size,
      followers: Math.max(0, account.followers_count ?? 0),
      last: entry.last,
    });
  }
  return out.sort((a, b) =>
    sort === 'audience'
      ? b.followers - a.followers || b.posts - a.posts
      : b.posts - a.posts || b.followers - a.followers,
  );
}
