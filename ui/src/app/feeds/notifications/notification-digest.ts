import { Account, MastodonNotification, Status } from '../../platform/api/models';

/**
 * The inbox, grouped as aggressively as it can be (owner, 2026-11-22).
 *
 * Every "number goes up" notification (likes and boosts, on every network)
 * collapses into **one** summary row that expands into one line per post.
 * New followers collapse into a second summary row. Replies, mentions,
 * quotes, follow requests, polls and everything else stay individual: each is
 * something to read or act on, not a count.
 *
 * "+N" counts notifications that arrived after the inbox was last read
 * (`isNew`). One person liking the same post twice counts once.
 *
 * Only used when no type filter is chosen; a filtered list keeps the per-post
 * grouping of `groupNotifications`.
 */

/** Likes on every network. Misskey reactions count as likes. */
export const LIKE_TYPES: ReadonlySet<string> = new Set([
  'favourite',
  'like',
  'like-via-repost',
  'reaction',
]);
/** Boosts / reposts / renotes on every network. */
export const BOOST_TYPES: ReadonlySet<string> = new Set([
  'reblog',
  'repost',
  'repost-via-repost',
  'renote',
]);
export const FOLLOW_TYPES: ReadonlySet<string> = new Set(['follow']);

export interface PostTally {
  status: Status;
  /** Distinct people who liked / boosted it, among loaded notifications. */
  likes: number;
  boosts: number;
  /** Of those, how many arrived since the inbox was last read. */
  newLikes: number;
  newBoosts: number;
  /** Distinct people, newest first. */
  people: Account[];
  /** Newest activity on it, ISO time (posts are ordered by this). */
  latest: string;
  /** The underlying notifications, newest first. */
  notifications: MastodonNotification[];
}

export interface EngagementDigest {
  kind: 'engagement';
  key: string;
  posts: PostTally[];
  likes: number;
  boosts: number;
  newLikes: number;
  newBoosts: number;
  /** Distinct people across all posts, newest first. */
  people: Account[];
}

export interface FollowDigest {
  kind: 'follows';
  key: string;
  /** Distinct new followers, newest first. */
  accounts: Account[];
  newCount: number;
  notifications: MastodonNotification[];
}

export type DigestRow =
  EngagementDigest | FollowDigest | { kind: 'single'; key: string; notif: MastodonNotification };

function pushDistinct(list: Account[], seen: Set<string>, account: Account): void {
  if (!seen.has(account.id)) {
    seen.add(account.id);
    list.push(account);
  }
}

/**
 * Build the digest from a newest-first list. A summary row takes the position
 * of its newest member, so the list stays newest-first.
 */
export function digestNotifications(
  list: readonly MastodonNotification[],
  isNew: (n: MastodonNotification) => boolean = () => false,
): DigestRow[] {
  const posts = new Map<string, PostTally>();
  const likers = new Map<string, Set<string>>();
  const boosters = new Map<string, Set<string>>();
  const newLikers = new Map<string, Set<string>>();
  const newBoosters = new Map<string, Set<string>>();
  const peopleSeen = new Map<string, Set<string>>();
  const allPeople: Account[] = [];
  const allSeen = new Set<string>();
  const followers: Account[] = [];
  const followSeen = new Set<string>();
  const newFollowers = new Set<string>();
  const followNotifs: MastodonNotification[] = [];

  const rows: DigestRow[] = [];
  let engagementAt = -1;
  let followsAt = -1;

  const add = (map: Map<string, Set<string>>, post: string, account: string): void => {
    const set = map.get(post) ?? new Set<string>();
    set.add(account);
    map.set(post, set);
  };

  for (const n of list) {
    const like = LIKE_TYPES.has(n.type);
    const boost = BOOST_TYPES.has(n.type);
    if ((like || boost) && n.status) {
      if (engagementAt < 0) {
        engagementAt = rows.length;
        rows.push({} as DigestRow); // placeholder, filled below
      }
      const id = n.status.id;
      let tally = posts.get(id);
      if (!tally) {
        tally = {
          status: n.status,
          likes: 0,
          boosts: 0,
          newLikes: 0,
          newBoosts: 0,
          people: [],
          latest: n.created_at,
          notifications: [],
        };
        posts.set(id, tally);
        peopleSeen.set(id, new Set());
      }
      tally.notifications.push(n);
      pushDistinct(tally.people, peopleSeen.get(id)!, n.account);
      pushDistinct(allPeople, allSeen, n.account);
      add(like ? likers : boosters, id, n.account.id);
      if (isNew(n)) add(like ? newLikers : newBoosters, id, n.account.id);
      continue;
    }
    if (FOLLOW_TYPES.has(n.type)) {
      if (followsAt < 0) {
        followsAt = rows.length;
        rows.push({} as DigestRow);
      }
      followNotifs.push(n);
      pushDistinct(followers, followSeen, n.account);
      if (isNew(n)) newFollowers.add(n.account.id);
      continue;
    }
    rows.push({ kind: 'single', key: `n:${n.id}`, notif: n });
  }

  if (engagementAt >= 0) {
    const tallies = [...posts.values()];
    for (const t of tallies) {
      const id = t.status.id;
      t.likes = likers.get(id)?.size ?? 0;
      t.boosts = boosters.get(id)?.size ?? 0;
      t.newLikes = newLikers.get(id)?.size ?? 0;
      t.newBoosts = newBoosters.get(id)?.size ?? 0;
    }
    rows[engagementAt] = {
      kind: 'engagement',
      key: 'd:engagement',
      posts: tallies, // Map insertion order = newest activity first
      likes: tallies.reduce((sum, t) => sum + t.likes, 0),
      boosts: tallies.reduce((sum, t) => sum + t.boosts, 0),
      newLikes: tallies.reduce((sum, t) => sum + t.newLikes, 0),
      newBoosts: tallies.reduce((sum, t) => sum + t.newBoosts, 0),
      people: allPeople,
    };
  }
  if (followsAt >= 0) {
    rows[followsAt] = {
      kind: 'follows',
      key: 'd:follows',
      accounts: followers,
      newCount: newFollowers.size,
      notifications: followNotifs,
    };
  }
  return rows;
}
