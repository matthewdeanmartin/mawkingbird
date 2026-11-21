/**
 * The account's Bluesky reading preferences, applied as bsky.app applies them
 * (spec/bsky_parity.md, sprint 4). Pure and API-free, like the label engine:
 * the home provider and the thread loader call it, and BlueskyModeration fills
 * the state it reads from the account's preferences.
 */
import type { BskyReplyRule, BskyPostControlsValue } from './bluesky-post-controls';
import type { BskyFeedItem, BskyThreadNode } from './bluesky-types';

/** `feedViewPref` for the Following feed (`feed: 'home'`). */
export interface BskyHomeFeedPrefs {
  hideReplies: boolean;
  hideRepliesByUnfollowed: boolean;
  /** Hide others' replies with fewer likes than this; 0 shows all. */
  hideRepliesByLikeCount: number;
  hideReposts: boolean;
  hideQuotePosts: boolean;
}

/**
 * bsky.app's defaults when the account has never saved a Following-feed
 * preference: everything shows except replies to people you don't follow.
 */
export const DEFAULT_HOME_FEED_PREFS: BskyHomeFeedPrefs = {
  hideReplies: false,
  hideRepliesByUnfollowed: true,
  hideRepliesByLikeCount: 0,
  hideReposts: false,
  hideQuotePosts: false,
};

export type BskyThreadSort = 'oldest' | 'newest' | 'most-likes' | 'random' | 'hotness';
export const THREAD_SORTS: readonly BskyThreadSort[] = [
  'hotness',
  'oldest',
  'newest',
  'most-likes',
  'random',
];

/** The Following feed preference out of a stored `feedViewPref`, over the defaults. */
export function homeFeedPrefsOf(pref: Record<string, unknown> | undefined): BskyHomeFeedPrefs {
  const bool = (key: keyof BskyHomeFeedPrefs) =>
    typeof pref?.[key] === 'boolean' ? (pref[key] as boolean) : DEFAULT_HOME_FEED_PREFS[key];
  const likes = pref?.['hideRepliesByLikeCount'];
  return {
    hideReplies: bool('hideReplies') as boolean,
    hideRepliesByUnfollowed: bool('hideRepliesByUnfollowed') as boolean,
    hideRepliesByLikeCount: typeof likes === 'number' && likes > 0 ? Math.floor(likes) : 0,
    hideReposts: bool('hideReposts') as boolean,
    hideQuotePosts: bool('hideQuotePosts') as boolean,
  };
}

export function threadSortOf(pref: Record<string, unknown> | undefined): BskyThreadSort {
  const sort = pref?.['sort'];
  return THREAD_SORTS.includes(sort as BskyThreadSort) ? (sort as BskyThreadSort) : 'hotness';
}

function isQuote(item: BskyFeedItem): boolean {
  const type = item.post.embed?.$type ?? '';
  return (
    type.startsWith('app.bsky.embed.record#') || type.startsWith('app.bsky.embed.recordWithMedia#')
  );
}

/**
 * Following-feed items the reader's preferences keep, as bsky.app's feed tuner
 * decides. A reply is always kept when it continues the author's own thread
 * (a self-thread) or was written by the reader.
 */
export function filterHomeFeed(
  items: readonly BskyFeedItem[],
  prefs: BskyHomeFeedPrefs,
  viewerDid: string | undefined,
): BskyFeedItem[] {
  return items.filter((item) => {
    const repost = !!item.reason?.$type.endsWith('#reasonRepost');
    if (repost && prefs.hideReposts) return false;
    if (prefs.hideQuotePosts && isQuote(item)) return false;
    if (!item.post.record.reply || repost) return true;
    const author = item.post.author.did;
    if (author === viewerDid) return true;
    const parentAuthor = item.reply?.parent?.author;
    if (parentAuthor?.did === author) return true; // a self-thread reads as one post
    if (prefs.hideReplies) return false;
    if (prefs.hideRepliesByUnfollowed) {
      const followed = (did?: string, following?: string) =>
        !!following || (!!did && did === viewerDid);
      if (!parentAuthor || !followed(parentAuthor.did, parentAuthor.viewer?.following)) {
        return false;
      }
    }
    if (prefs.hideRepliesByLikeCount && (item.post.likeCount ?? 0) < prefs.hideRepliesByLikeCount) {
      return false;
    }
    return true;
  });
}

/**
 * A thread's replies, each level sorted by the reader's choice. `hotness` is
 * Bluesky's own ranking, which is the order the server already returns.
 */
export function sortThreadReplies(
  nodes: readonly BskyThreadNode[],
  sort: BskyThreadSort,
  random: () => number = Math.random,
): BskyThreadNode[] {
  const sorted = [...nodes];
  const time = (n: BskyThreadNode) => Date.parse(n.post?.indexedAt ?? '') || 0;
  if (sort === 'oldest') sorted.sort((a, b) => time(a) - time(b));
  else if (sort === 'newest') sorted.sort((a, b) => time(b) - time(a));
  else if (sort === 'most-likes')
    sorted.sort((a, b) => (b.post?.likeCount ?? 0) - (a.post?.likeCount ?? 0));
  else if (sort === 'random') {
    for (let i = sorted.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    }
  }
  return sorted.map((node) =>
    node.replies?.length
      ? { ...node, replies: sortThreadReplies(node.replies, sort, random) }
      : node,
  );
}

// ---------------------------------------------- default reply and quote controls

const THREADGATE = 'app.bsky.feed.threadgate';
const RULES: Record<BskyReplyRule, string> = {
  mention: `${THREADGATE}#mentionRule`,
  follower: `${THREADGATE}#followerRule`,
  following: `${THREADGATE}#followingRule`,
};
const DISABLE_QUOTES = 'app.bsky.feed.postgate#disableRule';

/** `postInteractionSettingsPref` as the composer's controls value. */
export function controlsFromPref(pref: Record<string, unknown> | undefined): BskyPostControlsValue {
  const allow = pref?.['threadgateAllowRules'] as { $type?: string }[] | undefined;
  const embed = pref?.['postgateEmbeddingRules'] as { $type?: string }[] | undefined;
  const quotes = !embed?.some((rule) => rule.$type === DISABLE_QUOTES);
  if (!Array.isArray(allow)) return { replies: 'everyone', quotes };
  const rules = (Object.keys(RULES) as BskyReplyRule[]).filter((rule) =>
    allow.some((a) => a.$type === RULES[rule]),
  );
  const lists = allow.filter((a) => a.$type?.endsWith('#listRule')).length;
  if (!rules.length && !lists) return { replies: 'nobody', quotes };
  return { replies: rules, quotes, ...(lists ? { lists } : {}) };
}

/**
 * The controls value as a `postInteractionSettingsPref`, keeping list rules
 * chosen on bsky.app unless replies become everyone or nobody.
 */
export function prefFromControls(
  value: BskyPostControlsValue,
  current: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const lists = (
    (current?.['threadgateAllowRules'] as { $type?: string }[] | undefined) ?? []
  ).filter((rule) => rule.$type?.endsWith('#listRule'));
  const { threadgateAllowRules: _a, postgateEmbeddingRules: _p, ...rest } = current ?? {};
  return {
    ...rest,
    $type: 'app.bsky.actor.defs#postInteractionSettingsPref',
    ...(value.replies === 'everyone'
      ? {}
      : {
          threadgateAllowRules:
            value.replies === 'nobody'
              ? []
              : [...value.replies.map((rule) => ({ $type: RULES[rule] })), ...lists],
        }),
    ...(value.quotes ? {} : { postgateEmbeddingRules: [{ $type: DISABLE_QUOTES }] }),
  };
}
