import { Status } from '../platform/api/models';
import { plainText } from '../discovery/search/search-refine';

/**
 * Which of an author's Mastodon posts are blog posts.
 *
 * Pure and framework-free on purpose: the web blog page classifies a few
 * hundred posts fetched live, and Native will run the same function over
 * archive pages. Two definitions of "blog post" would drift, and then a
 * person's blog would read differently on the desktop than in the browser.
 *
 * ## The rule (spec/sprint/blog-2026-11.md, owner decisions 2026-11-17)
 *
 * A blog post is one of the author's own **chains** — a root post plus every
 * public reply the author made to a post already in the chain — that is:
 *
 * - **long**: at least `minWords` words across the chain, one post or many, or
 * - a **storm**: at least `minPosts` posts *and* at least `minStormWords`
 *   words, so ten photo captions of five words each are not a blog post, or
 * - **marked**: the root's first line starts with `BLOG:`.
 *
 * Words are counted from the prose: mentions, links and hashtags do not count
 * (owner, 2026-11-17: words, not characters).
 *
 * A chain that starts as a reply to somebody else is a conversation, not a
 * blog post, unless it is marked. The author's side-replies to other people
 * inside a storm are not part of it. There is no tree: a chain is read in the
 * order it was written.
 *
 * The title is the root's first line, with the marker removed. **Never the
 * content warning** — on Mastodon a CW is a warning, and treating it as a
 * headline would teach authors to misuse it.
 */

export interface BlogThresholds {
  /** Posts in a chain that make it a storm. */
  minPosts: number;
  /** Words a storm needs as well, so a thread of captioned photos is not one. */
  minStormWords: number;
  /** Words that make any post or chain long enough on its own. */
  minWords: number;
}

export const DEFAULT_BLOG_THRESHOLDS: BlogThresholds = {
  minPosts: 3,
  minStormWords: 80,
  minWords: 200,
};

/** Bounds for the settings fields; values outside are clamped, not rejected. */
export const BLOG_THRESHOLD_LIMITS = {
  minPosts: { min: 2, max: 100 },
  minStormWords: { min: 0, max: 5_000 },
  minWords: { min: 20, max: 20_000 },
} as const;

/** Why a chain counts. The first that applies, in this order. */
export type BlogPostReason = 'marked' | 'storm' | 'long';

export interface BlogPost {
  /** The root's id: the address of the post as a whole. */
  id: string;
  root: Status;
  /** Root first, then the author's own replies in the order written. */
  chain: Status[];
  title: string;
  /** Prose after the title, shortened for a list row. */
  excerpt: string;
  /** Characters of prose across the chain. */
  chars: number;
  reason: BlogPostReason;
  /**
   * The root was not among the posts given, so the chain may start earlier.
   * Only reported once history is exhausted; before that such chains are held
   * back (see {@link BlogScan.pendingOlder}), because the next older page
   * usually supplies the root and can turn them into conversations.
   */
  partial: boolean;
}

export interface BlogScan {
  posts: BlogPost[];
  /** Chains whose root is older than the posts given. */
  pendingOlder: number;
}

const MARKER = /^\s*blog:\s*/i;
const EXCERPT_CHARS = 240;
const TITLE_CHARS = 140;
/** Characters per minute: about 230 words of about five letters and a space. */
const CHARS_PER_MINUTE = 1_300;

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** The post's text as lines: paragraphs and `<br>` become line breaks. */
export function textLines(html: string): string[] {
  const text = decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  );
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** The first non-empty line of a post, untouched. */
export function firstLine(html: string): string {
  return textLines(html)[0] ?? '';
}

/** Whether the author marked this post as a blog post with a leading `BLOG:`. */
export function hasBlogMarker(status: Status): boolean {
  return MARKER.test(firstLine(status.content ?? ''));
}

function shorten(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + '…';
}

/** A storm's own bookkeeping: `1/`, `1/7`, `(1/7)` and thread emoji. Only `1`: the root is part one. */
const LEADING_COUNTER =
  /^(?:(?:🧵|👇|⬇)️?\s*)*(?:\(?1\s*\/\s*\d{0,3}\)?[.:]?\s+)?(?:(?:🧵|👇|⬇)️?\s*)*/u;
const TRAILING_COUNTER = /(?:\s+\(?1\s*\/\s*\d{0,3}\)?)?(?:\s*(?:🧵|👇|⬇)️?)*\s*$/u;

/** A title line without the storm's counters, unless that would leave nothing. */
export function withoutCounters(line: string): string {
  const clean = line.replace(LEADING_COUNTER, '').replace(TRAILING_COUNTER, '').trim();
  return clean || line.trim();
}

/**
 * The title: the root's first line without the marker or a storm counter. A
 * marker alone on its line hands the title to the next line. Empty when the
 * post has no text.
 */
export function blogTitle(root: Status): string {
  const lines = textLines(root.content ?? '');
  if (!lines.length) {
    return '';
  }
  const first = lines[0].replace(MARKER, '').trim();
  return shorten(withoutCounters(first || (lines[1] ?? '')), TITLE_CHARS);
}

/** Prose across a chain, markup excluded, the same measure the reader uses. */
export function proseLength(chain: Status[]): number {
  return chain.reduce((total, post) => total + plainText(post.content ?? '').length, 0);
}

/** Links, @mentions and #hashtags: not words anyone wrote as prose. */
const NOT_PROSE = /(?:https?:\/\/\S+|[@#][\p{L}\p{N}_.@-]+)/gu;
/** Scripts written without spaces between words. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;

/**
 * Words of prose in a chain. Spaced scripts count runs of letters or digits;
 * Chinese and Japanese, written without spaces, count about one word per two
 * characters.
 */
export function wordCount(chain: Status[]): number {
  let words = 0;
  for (const post of chain) {
    // Mastodon wraps links, mentions and hashtags in <a>; drop them whole.
    const html = (post.content ?? '').replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, ' ');
    const text = plainText(html).replace(NOT_PROSE, ' ');
    const unspaced = text.match(UNSPACED)?.length ?? 0;
    words += Math.ceil(unspaced / 2);
    words += text.replace(UNSPACED, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
  }
  return words;
}

/** Whole minutes to read, never less than one. */
export function readingMinutes(chars: number): number {
  return Math.max(1, Math.round(chars / CHARS_PER_MINUTE));
}

function excerptOf(chain: Status[]): string {
  const lines = chain.flatMap((post) => textLines(post.content ?? ''));
  // Drop the line the title came from (and a bare marker line before it).
  let start = 1;
  if (lines.length > 1 && lines[0].replace(MARKER, '').trim() === '') {
    start = 2;
  }
  return shorten(lines.slice(start).join(' '), EXCERPT_CHARS);
}

function isPublic(status: Status): boolean {
  return status.visibility === 'public' || status.visibility === 'unlisted';
}

function byWritingOrder(a: Status, b: Status): number {
  const time = a.created_at.localeCompare(b.created_at);
  if (time !== 0) {
    return time;
  }
  return a.id.length - b.id.length || a.id.localeCompare(b.id);
}

/** Clamp to the settings bounds; non-numbers fall back to the default. */
export function clampThresholds(value: Partial<BlogThresholds> | null | undefined): BlogThresholds {
  const pick = (key: keyof BlogThresholds): number => {
    const raw = Number(value?.[key]);
    if (!Number.isFinite(raw)) {
      return DEFAULT_BLOG_THRESHOLDS[key];
    }
    const { min, max } = BLOG_THRESHOLD_LIMITS[key];
    return Math.min(max, Math.max(min, Math.round(raw)));
  };
  return {
    minPosts: pick('minPosts'),
    minStormWords: pick('minStormWords'),
    minWords: pick('minWords'),
  };
}

/** Why a chain counts as a blog post, or null when it does not. */
export function blogReason(chain: Status[], thresholds: BlogThresholds): BlogPostReason | null {
  if (!chain.length) {
    return null;
  }
  if (hasBlogMarker(chain[0])) {
    return 'marked';
  }
  const words = wordCount(chain);
  if (chain.length >= thresholds.minPosts && words >= thresholds.minStormWords) {
    return 'storm';
  }
  if (words >= thresholds.minWords) {
    return 'long';
  }
  return null;
}

/**
 * The author's blog posts among `statuses`, newest first.
 *
 * `statuses` may hold anything an account timeline returns — other authors'
 * reblogs, private posts, replies to strangers — and may be several pages
 * concatenated, duplicates included. `exhausted` says the author's history
 * has been read to its start, so a chain whose root never arrived (deleted,
 * or older than the server will page) is reported as it stands rather than
 * held back.
 */
export function collectBlogPosts(
  statuses: readonly Status[],
  authorId: string,
  thresholds: BlogThresholds,
  exhausted = false,
): BlogScan {
  const own = new Map<string, Status>();
  for (const status of statuses) {
    if (status.reblog || status.account?.id !== authorId || !isPublic(status)) {
      continue;
    }
    own.set(status.id, status);
  }

  /** A reply to the author's own post. Missing `in_reply_to_account_id` is trusted only when the parent is here. */
  const selfParent = (status: Status): string | null => {
    const parentId = status.in_reply_to_id;
    if (!parentId) {
      return null;
    }
    if (status.in_reply_to_account_id === authorId) {
      return parentId;
    }
    if (status.in_reply_to_account_id == null && own.has(parentId)) {
      return parentId;
    }
    return null;
  };

  // Find each post's root: walk up through the author's own replies.
  const rootOf = new Map<string, { rootId: string; partial: boolean }>();
  const resolve = (status: Status): { rootId: string; partial: boolean } => {
    const known = rootOf.get(status.id);
    if (known) {
      return known;
    }
    const path: Status[] = [];
    const seen = new Set<string>();
    let current = status;
    let result: { rootId: string; partial: boolean };
    for (;;) {
      const cached = rootOf.get(current.id);
      if (cached) {
        result = cached;
        break;
      }
      path.push(current);
      seen.add(current.id);
      const parentId = selfParent(current);
      if (!parentId) {
        result = { rootId: current.id, partial: false };
        break;
      }
      const parent = own.get(parentId);
      if (!parent || seen.has(parentId)) {
        // The chain goes on into posts we do not have.
        result = { rootId: current.id, partial: true };
        break;
      }
      current = parent;
    }
    for (const step of path) {
      rootOf.set(step.id, result);
    }
    return result;
  };

  const chains = new Map<string, { partial: boolean; members: Status[] }>();
  for (const status of own.values()) {
    const { rootId, partial } = resolve(status);
    const entry = chains.get(rootId) ?? { partial, members: [] };
    entry.members.push(status);
    chains.set(rootId, entry);
  }

  const posts: BlogPost[] = [];
  let pendingOlder = 0;
  for (const [rootId, { partial, members }] of chains) {
    const root = own.get(rootId)!;
    if (partial && !exhausted) {
      pendingOlder++;
      continue;
    }
    // A conversation: the root answers someone else. Only a marker overrides.
    const answersSomeoneElse = !partial && root.in_reply_to_id != null && selfParent(root) === null;
    if (answersSomeoneElse && !hasBlogMarker(root)) {
      continue;
    }
    const chain = [...members].sort(byWritingOrder);
    const reason = blogReason(chain, thresholds);
    if (!reason) {
      continue;
    }
    posts.push({
      id: root.id,
      root,
      chain,
      title: blogTitle(root),
      excerpt: excerptOf(chain),
      chars: proseLength(chain),
      reason,
      partial,
    });
  }

  posts.sort((a, b) => byWritingOrder(b.root, a.root));
  return { posts, pendingOlder };
}

/**
 * The post's id on its author's own server, for a portable blog link.
 *
 * Read from the home server, that is the raw id the anonymous adapter kept.
 * Read through the reader's own server, the local id means nothing elsewhere,
 * so it comes from the post's public URL instead — the last path segment of
 * `https://host/@user/123` (Mastodon), `/@user/statuses/01H…` (GoToSocial) or
 * `/notice/AbC…` (Akkoma), each of which is the API id on that server. Null
 * when the URL is not on `host` or has no such segment.
 */
export function blogPostId(status: Status, host: string): string | null {
  const ref = status.providerRef as { statusId?: unknown } | undefined;
  if (status.provider === 'anonymous-mastodon' && typeof ref?.statusId === 'string') {
    return ref.statusId;
  }
  try {
    const url = new URL(status.url ?? '');
    if (url.host.toLowerCase() !== host.toLowerCase()) {
      return null;
    }
    const last = url.pathname.replace(/\/$/, '').split('/').pop() ?? '';
    return /^[A-Za-z0-9]+$/.test(last) ? last : null;
  } catch {
    return null;
  }
}

const LEADING_LINE = /^\s*<p>((?:(?!<br\s*\/?>|<\/p>)[\s\S])*)(<br\s*\/?>|<\/p>)/i;

/**
 * The root's HTML with the title line taken out, so a blog post does not show
 * its title twice. A `BLOG:` marker alone on its line goes too. Anything not
 * shaped the way Mastodon writes paragraphs is returned unchanged: a repeated
 * title is a blemish, a mangled post is a bug.
 */
export function withoutTitleLine(html: string): string {
  let rest = html;
  for (let removed = 0; removed < 2; removed++) {
    const match = LEADING_LINE.exec(rest);
    if (!match) {
      return removed ? rest : html;
    }
    const line = textLines(match[1])[0] ?? '';
    const marker = MARKER.test(line);
    const after = rest.slice(match[0].length);
    rest = (match[2].toLowerCase() === '</p>' ? after : '<p>' + after).replace(
      /^\s*<p>\s*<\/p>/i,
      '',
    );
    if (!(marker && line.replace(MARKER, '').trim() === '')) {
      return rest;
    }
  }
  return rest;
}

/**
 * Replies to a post from other people, as its counters tell it: every post's
 * `replies_count`, minus the author's own replies that hold the storm together.
 * An estimate — counters include replies the reader may not be able to see.
 */
export function commentEstimate(chain: Status[]): number {
  const total = chain.reduce((sum, post) => sum + (post.replies_count ?? 0), 0);
  return Math.max(0, total - (chain.length - 1));
}

/**
 * Blog posts in a feed from many people, newest first: each author's posts are
 * classified on their own, exactly as their blog page would. `skipAuthorIds`
 * leaves people out (Roll leaves out the reader).
 */
export function collectAcrossAuthors(
  statuses: readonly Status[],
  thresholds: BlogThresholds,
  skipAuthorIds: ReadonlySet<string> = new Set(),
  exhausted = false,
): BlogScan {
  const byAuthor = new Map<string, Status[]>();
  for (const status of statuses) {
    const id = status.account?.id;
    if (!id || skipAuthorIds.has(id)) {
      continue;
    }
    const list = byAuthor.get(id) ?? [];
    list.push(status);
    byAuthor.set(id, list);
  }
  const posts: BlogPost[] = [];
  let pendingOlder = 0;
  for (const [id, list] of byAuthor) {
    const scan = collectBlogPosts(list, id, thresholds, exhausted);
    posts.push(...scan.posts);
    pendingOlder += scan.pendingOlder;
  }
  posts.sort((a, b) => byWritingOrder(b.root, a.root));
  return { posts, pendingOlder };
}
