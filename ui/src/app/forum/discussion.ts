import { Account, Status } from '../models';
import { hasHumanQuestion } from './question';

/**
 * A conversation found by a Forum scan: a root post and the replies seen so
 * far. See spec/forum.md.
 *
 * `anchor` is the root when the hunt reached it. When it did not, it is the
 * furthest ancestor reached and the discussion is `partial`, which is shown
 * rather than hidden (MIMB's `root_is_partial`).
 */
export interface Discussion {
  key: string;
  anchor: Status;
  partial: boolean;
  /** Oldest first, one copy per post (by {@link discussionKey}), anchor included. */
  posts: Status[];
  /** The anchor's own context was fetched, so sibling branches are in. */
  treeLoaded: boolean;
}

export type ForumFilter = 'talk' | 'asked' | 'friends' | 'mine' | 'joined';
export type ForumSort = 'recent' | 'popular';
export const FORUM_FILTERS: readonly ForumFilter[] = ['talk', 'asked', 'friends', 'mine', 'joined'];

export interface Participant {
  account: Account;
  posts: number;
  lastAt: string;
}

/** What the list, the filters and the rails read from a discussion. */
export interface DiscussionSummary {
  discussion: Discussion;
  /** The starter first, then by posts in the discussion. */
  participants: Participant[];
  /** Seen replies, or the server's count when that is higher. */
  replyCount: number;
  friendReplyCount: number;
  latestAt: string;
  question: boolean;
  hashtags: string[];
  instance: string;
  friendStarted: boolean;
  iStarted: boolean;
  /** I posted in it, but someone else started it. */
  iJoined: boolean;
}

/** The thing a post is, under any boost wrapper. */
export function unwrap(status: Status): Status {
  return status.reblog ?? status;
}

/**
 * The same post under every server's id. Ids are per server, and the root
 * hunt can meet one post through several servers.
 */
export function discussionKey(status: Status): string {
  return status.uri || status.url || status.id;
}

/**
 * The same person on every server. Account ids are per server, and an origin
 * server's copy of a thread carries that server's ids, so people are matched
 * by profile URL, then by full handle.
 */
export function personKey(account: Account): string {
  return account.url || account.acct;
}

/**
 * MIMB's rule (`HAVING COUNT(*) >= 2 AND COUNT(DISTINCT author) >= 2`): two
 * posts by two people. So a tweet storm is not a discussion, and neither is a
 * lone post, however many question marks it has.
 */
export function isDiscussion(discussion: Discussion): boolean {
  return (
    discussion.posts.length >= 2 &&
    new Set(discussion.posts.map((post) => personKey(post.account))).size >= 2
  );
}

function byTime(left: Status, right: Status): number {
  return left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id);
}

/** Read from another server anonymously: readable, but not ours to act on. */
export function isForeignCopy(post: Status): boolean {
  return post.provider === 'anonymous-mastodon';
}

/**
 * Posts from any mix of servers as one thread: one copy per post (my
 * server's copy wins, since it can be replied to and liked), ordered by time,
 * with every `in_reply_to_id` pointing at the copy that was kept. Without the
 * re-pointing, a reply read from an origin server would hang off a parent id
 * that no longer exists.
 */
export function combine(statuses: readonly Status[]): Status[] {
  const kept = new Map<string, Status>();
  const alias = new Map<string, string>();
  for (const status of statuses) {
    const post = unwrap(status);
    const key = discussionKey(post);
    const earlier = kept.get(key);
    if (!earlier) {
      kept.set(key, post);
    } else if (earlier.id !== post.id) {
      const winner = isForeignCopy(earlier) && !isForeignCopy(post) ? post : earlier;
      const loser = winner === post ? earlier : post;
      kept.set(key, winner);
      alias.set(loser.id, winner.id);
    }
  }
  return [...kept.values()]
    .map((post) => {
      const parent = post.in_reply_to_id && alias.get(post.in_reply_to_id);
      return parent ? { ...post, in_reply_to_id: parent } : post;
    })
    .sort(byTime);
}

/** Add posts to a discussion, keeping it ordered and free of duplicates. */
export function mergePosts(discussion: Discussion, statuses: readonly Status[]): Discussion {
  const posts = combine([...discussion.posts, ...statuses]);
  const unchanged =
    posts.length === discussion.posts.length &&
    posts.every((post, index) => post === discussion.posts[index]);
  if (unchanged) return discussion;
  const anchorKey = discussionKey(discussion.anchor);
  const anchor = posts.find((post) => discussionKey(post) === anchorKey) ?? discussion.anchor;
  return { ...discussion, anchor, posts };
}

/**
 * The thread in reading order: depth first from the anchor, each reply under
 * its parent, siblings oldest first. Posts whose parent is missing follow,
 * oldest first, so nothing found is dropped.
 */
export function threadOrder(discussion: Discussion): Status[] {
  const children = new Map<string, Status[]>();
  for (const post of discussion.posts) {
    if (post.id === discussion.anchor.id || !post.in_reply_to_id) continue;
    children.set(post.in_reply_to_id, [...(children.get(post.in_reply_to_id) ?? []), post]);
  }
  const ordered: Status[] = [];
  const seen = new Set<string>();
  const visit = (post: Status) => {
    if (seen.has(post.id)) return;
    seen.add(post.id);
    ordered.push(post);
    for (const child of children.get(post.id) ?? []) visit(child);
  };
  visit(discussion.anchor);
  for (const post of discussion.posts) if (!seen.has(post.id)) visit(post);
  return ordered;
}

/** The server an account lives on: from `user@host`, else from its profile URL. */
export function instanceOf(account: Account): string {
  const at = account.acct.indexOf('@');
  if (at >= 0) return account.acct.slice(at + 1).toLowerCase();
  try {
    return new URL(account.url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function hashtagsOf(post: Status): string[] {
  return (post.tags ?? []).map((tag) => tag.name.toLowerCase());
}

/**
 * `me` and `following` are {@link personKey}s, so a person counts once
 * whichever server's copy of their post was found.
 */
export function summarize(
  discussion: Discussion,
  me: string | null,
  following: ReadonlySet<string>,
): DiscussionSummary {
  const starter = personKey(discussion.anchor.account);
  const people = new Map<string, Participant & { post: Status }>();
  const hashtags = new Set<string>();
  let friendReplyCount = 0;
  let latestAt = discussion.anchor.created_at;
  for (const post of discussion.posts) {
    const person = personKey(post.account);
    const seen = people.get(person);
    if (seen) {
      seen.posts++;
      if (post.created_at > seen.lastAt) seen.lastAt = post.created_at;
      // Prefer my server's account record: its id works for follow and lists.
      if (isForeignCopy(seen.post) && !isForeignCopy(post)) {
        seen.account = post.account;
        seen.post = post;
      }
    } else {
      people.set(person, { account: post.account, posts: 1, lastAt: post.created_at, post });
    }
    for (const tag of hashtagsOf(post)) hashtags.add(tag);
    if (post.id !== discussion.anchor.id && following.has(person)) friendReplyCount++;
    if (post.created_at > latestAt) latestAt = post.created_at;
  }
  const participants = [...people.entries()]
    .sort(
      ([leftKey, left], [rightKey, right]) =>
        Number(rightKey === starter) - Number(leftKey === starter) ||
        right.posts - left.posts ||
        right.lastAt.localeCompare(left.lastAt),
    )
    .map(([, { account, posts, lastAt }]) => ({ account, posts, lastAt }));
  const iStarted = me !== null && starter === me;
  return {
    discussion,
    participants,
    replyCount: Math.max(discussion.posts.length - 1, discussion.anchor.replies_count),
    friendReplyCount,
    latestAt,
    question: hasHumanQuestion(discussion.anchor.content),
    hashtags: [...hashtags],
    instance: instanceOf(discussion.anchor.account),
    friendStarted: following.has(starter),
    iStarted,
    iJoined: !iStarted && me !== null && people.has(me),
  };
}

/** The tabs: MIMB's `top_filter` values, minus the two that are sorts. */
export function filterSummaries(
  summaries: readonly DiscussionSummary[],
  filter: ForumFilter,
): DiscussionSummary[] {
  switch (filter) {
    case 'talk':
      return [...summaries];
    case 'asked':
      return summaries.filter((summary) => summary.question);
    case 'friends':
      return summaries.filter((summary) => summary.friendStarted);
    case 'mine':
      return summaries.filter((summary) => summary.iStarted);
    case 'joined':
      return summaries.filter((summary) => summary.iJoined);
  }
}

/** Recent: latest activity. Popular: friends' replies, then all replies (MIMB). */
export function compareSummaries(
  sort: ForumSort,
): (a: DiscussionSummary, b: DiscussionSummary) => number {
  const recent = (a: DiscussionSummary, b: DiscussionSummary) =>
    b.latestAt.localeCompare(a.latestAt) || a.discussion.key.localeCompare(b.discussion.key);
  if (sort === 'recent') return recent;
  return (a, b) =>
    b.friendReplyCount - a.friendReplyCount || b.replyCount - a.replyCount || recent(a, b);
}

/** One sampled conversation fragment worth spending a call on. */
export interface Candidate {
  /** The post to ask for context: the top-most of its group in the sample. */
  probe: Status;
  /** Every sampled post in the group, so a found discussion can absorb them. */
  members: Status[];
  score: number;
}

/**
 * Group a sample into candidate conversations and rank them, best first.
 *
 * Posts are grouped by the top-most ancestor present in the sample (the MIMB
 * lite rule), so two replies in one thread cost one call. The probe is that
 * top-most post: its context returns every ancestor to the root and its whole
 * subtree.
 *
 * A group is a candidate only when it shows signs of conversation: a reply,
 * or a reported reply. Groups already absorbed into a discussion (`known`
 * post ids) cost nothing and are skipped. Ranking order (spec/forum.md): my
 * involvement, replies to someone else, reported replies, a question, then
 * recency. Self-reply chains with no other replies (tweet storms) sink.
 */
export function findCandidates(
  sample: readonly Status[],
  me: string | null,
  known: ReadonlySet<string>,
): Candidate[] {
  const posts = new Map<string, Status>();
  for (const status of sample) {
    const post = unwrap(status);
    if (!posts.has(post.id)) posts.set(post.id, post);
  }
  const topOf = (post: Status): Status => {
    let current = post;
    const seen = new Set([current.id]);
    while (current.in_reply_to_id) {
      const parent = posts.get(current.in_reply_to_id);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      current = parent;
    }
    return current;
  };
  const groups = new Map<string, Status[]>();
  for (const post of posts.values()) {
    const top = topOf(post);
    groups.set(top.id, [...(groups.get(top.id) ?? []), post]);
  }

  const candidates: Candidate[] = [];
  for (const [topId, members] of groups) {
    if (members.some((member) => known.has(member.id))) continue;
    const conversational = members.some(
      (member) => member.in_reply_to_id !== null || member.replies_count > 0,
    );
    if (!conversational) continue;
    const probe = posts.get(topId)!;
    const authors = new Set(members.map((member) => member.account.id));
    const toOthers = members.some(
      (member) =>
        !!member.in_reply_to_account_id && member.in_reply_to_account_id !== member.account.id,
    );
    const replies = Math.max(...members.map((member) => member.replies_count));
    const involvesMe =
      me !== null &&
      members.some(
        (member) =>
          member.account.id === me ||
          member.in_reply_to_account_id === me ||
          (member.mentions ?? []).some((mention) => mention.id === me),
      );
    // A chain of one author replying to themselves, with nobody else replying
    // to the last of it, reads as a storm until the context proves otherwise.
    const storm = authors.size === 1 && !toOthers && replies <= members.length;
    const score =
      (involvesMe ? 1000 : 0) +
      (toOthers ? 100 : 0) +
      Math.min(replies, 20) * 10 +
      (authors.size - 1) * 30 +
      (hasHumanQuestion(probe.content) ? 20 : 0) -
      (storm ? 150 : 0);
    candidates.push({ probe, members, score });
  }
  return candidates.sort(
    (left, right) =>
      right.score - left.score || right.probe.created_at.localeCompare(left.probe.created_at),
  );
}
