import { Status } from '../../models';
import { plainText } from '../search/search-refine';

/**
 * What counts as a document, and how one is assembled from posts.
 *
 * The reader will open anything it is pointed at — refusing to render is never
 * the right answer to "I wanted to read this". But *the library* only shelves
 * documents, and the difference has to be decided somewhere both the reader and
 * the library agree on. That is here.
 *
 * See `sprint/kindle-1-page-and-shell.md` §1c.
 */

/**
 * Long enough to be worth reading as a document rather than as a post.
 *
 * Deliberately not derived from any server's post limit. Mastodon's default is
 * 500 characters but instances routinely raise it, and some of the posts this
 * feature exists for are single 2,000-character essays on such a server. The
 * threshold is about reading effort — roughly a minute — not about what a
 * particular admin configured.
 */
export const DOCUMENT_MIN_CHARS = 500;

/**
 * Extract one author's own chain from a thread: where they started writing,
 * plus every later post where they replied to something already in the chain.
 *
 * This covers both storm styles — replying to your own previous post, and
 * replying repeatedly to your own first one. Posts by other people, and the
 * author's side-replies to them, are not part of the article.
 *
 * ## Whose chain, and where it starts
 *
 * `focusId` names the post the reader actually opened; the chain is *that*
 * author's, and it begins at the earliest post of theirs that reaches the
 * focused post through an unbroken run of their own replies.
 *
 * Both halves of that matter, and getting either wrong shows the reader one
 * post where a storm should be:
 *
 * - **Whose.** Taking the thread's first post meant that a storm written as a
 *   reply to somebody else produced a one-post "article" — that other person's
 *   post — because every subsequent post failed the same-author test.
 * - **Where.** Starting at the focused post itself would drop the beginning of
 *   a storm whenever the reader arrived on post four of nine, which is the
 *   normal case for a link shared from the middle.
 *
 * Walking back stops at the first post that is not the author's, so a storm
 * that genuinely begins as a reply to someone else begins at the author's own
 * first line, not at the post they were answering.
 */
export function readerChain(thread: Status[], focusId?: string): Status[] {
  if (!thread.length) {
    return [];
  }

  const byId = new Map(thread.map((s) => [s.id, s]));
  const focus = (focusId && byId.get(focusId)) || thread[0];
  const authorId = focus.account.id;

  // Walk back through the author's own replies to find where they started.
  let root = focus;
  const seen = new Set([root.id]);
  for (;;) {
    const parentId = root.in_reply_to_id;
    if (parentId === null || parentId === undefined || seen.has(parentId)) {
      break;
    }
    const parent = byId.get(parentId);
    if (!parent || parent.account.id !== authorId) {
      break;
    }
    root = parent;
    seen.add(parent.id);
  }

  // Then forward, in thread order, taking the author's replies to the chain.
  const chain = [root];
  const chainIds = new Set([root.id]);
  const startedAt = thread.indexOf(root);
  for (const s of thread.slice(startedAt + 1)) {
    if (s.account.id === authorId && s.in_reply_to_id !== null && chainIds.has(s.in_reply_to_id)) {
      chain.push(s);
      chainIds.add(s.id);
    }
  }
  return chain;
}

/** Characters of actual prose across a chain, tags and markup excluded. */
export function chainTextLength(chain: Status[]): number {
  return chain.reduce((total, post) => total + plainText(post.content ?? '').length, 0);
}

/**
 * Whether this is a document — something the library should remember.
 *
 * Four ways to qualify, any one of which is enough:
 *
 * - **An RSS item.** It is an article by construction; that is what a feed is.
 * - **An expanded article.** The reader fetched a page and got prose back.
 * - **A chain of more than one post.** A tweetstorm is a document even when
 *   each individual post is short — the whole point is that it was written as
 *   one thing and split by a character limit.
 * - **A single post over {@link DOCUMENT_MIN_CHARS}.** The long-tweet case.
 *
 * Everything else is an ordinary post: read it, react to it, and let it go. The
 * operator's rule, stated plainly — short or never-viewed tweets are never
 * tracked — is this function returning false.
 */
export function isDocument(chain: Status[], hasExpandedArticle: boolean): boolean {
  if (!chain.length) {
    return false;
  }
  if (hasExpandedArticle) {
    return true;
  }
  if (chain[0].provider === 'rss') {
    return true;
  }
  if (chain.length > 1) {
    return true;
  }
  return chainTextLength(chain) >= DOCUMENT_MIN_CHARS;
}

/**
 * A title for a document that has none of its own.
 *
 * A tweetstorm has no headline; its first sentence is the closest thing, and is
 * what the author would have written as one had the medium had a field for it.
 *
 * Lives here rather than in the reader because the library's "save for later"
 * control needs the same title from a feed row, where the reader is not
 * running. Two implementations of "what do we call this" would drift, and the
 * shelf would then show a document under one name and the reader under another.
 */
export function documentTitle(root: Status): string {
  const text = plainText(root.content ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) {
    return root.url ?? '';
  }
  const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return firstSentence.length > 90 ? firstSentence.slice(0, 87) + '…' : firstSentence;
}
