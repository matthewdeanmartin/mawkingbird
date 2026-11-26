// Rank (spec/show-prep.md): relevance, engagement and recency; one post once; few per author.
import { vetStatus } from './vet.mjs';

/**
 * @typedef {{
 *   post: any, segment: string, score: number, matched: string[], tags: string[],
 *   verdict: import('./vet.mjs').Verdict, reasons: string[],
 * }} Ranked
 */

const DAY = 86_400_000;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Visible text of a post: HTML stripped, common entities decoded. */
export function plainText(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>|<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
      if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? entity;
      const point = code[1] === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * On topic at all? A post whose only keyword hits are ambiguous names (#Elk,
 * #Ivory) needs a context word too, or it is about elk.
 */
export function onTopic(post, matched, pack) {
  if (!matched.length) return true;
  if (!matched.every((k) => pack.ambiguous?.includes(k))) return true;
  const text = plainText(post.content).toLowerCase();
  return (pack.contextWords ?? []).some((w) => wordPattern(w).test(text));
}

/**
 * Which segment a post belongs to: the first segment (in pack order) with a
 * keyword in the text or hashtags. The last segment is the catch-all.
 *
 * @param {any} post
 * @param {import('./topic.mjs').Segment[]} segments
 */
export function segmentFor(post, segments) {
  const text = `${plainText(post.content).toLowerCase()} ${(post.tags ?? []).map((t) => t.name.toLowerCase()).join(' ')}`;
  for (const segment of segments) {
    // Whole words only: "app" must not match "happy", nor "elk" "welkin".
    const matched = segment.keywords.filter((k) => wordPattern(k).test(text));
    if (matched.length) return { segment: segment.id, matched };
  }
  return { segment: segments.at(-1).id, matched: [] };
}

const patterns = new Map();
function wordPattern(keyword) {
  let pattern = patterns.get(keyword);
  if (!pattern) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u');
    patterns.set(keyword, pattern);
  }
  return pattern;
}

/** A seed account's post is vouched for by the pack: a small lift. */
const SEED_BONUS = 3;

/**
 * Seed posts skip the hashtag filter, so they must still be about the topic:
 * a keyword, or one of the pack's context words. A developer's cat photo is not.
 */
function seedOnTopic(post, matched, pack) {
  // A specific keyword: a named project, or a segment's word other than the
  // catch-all's ("app" let a developer's other app in; "fediverse" their jokes).
  // Addresses don't count: a project's own domain (toot.fedilab.app) is in
  // every post it makes, about anything.
  const catchAll = new Set(pack.segments.at(-1)?.keywords ?? []);
  const text = plainText(post.content)
    .replace(/https?:\/\/\S+/g, ' ')
    .toLowerCase();
  const specific = [
    ...pack.segments.slice(0, -1).flatMap((s) => s.keywords),
    ...pack.hashtags.map((t) => t.toLowerCase()),
  ];
  return specific.some((k) => !catchAll.has(k) && wordPattern(k).test(text));
}

/** Words that tie an article to the fediverse at all: every episode is about Mastodon. */
const FEDIVERSE = ['mastodon', 'fediverse', 'fedi', 'activitypub'];

/**
 * The keywords a trending link matches, or none. Only specific words count:
 * the segments' keywords except the catch-all's ("app", "client" match the
 * day's ordinary news), and the pack's hashtags. A link matched only by
 * ambiguous names needs a context word too, as posts do.
 *
 * @param {any} link A trend link: title, description, provider_name.
 * @param {import('./topic.mjs').TopicPack} pack
 * @returns {string[]}
 */
export function linkMatches(link, pack) {
  const text = plainText(
    `${link.title ?? ''} ${link.description ?? ''} ${link.provider_name ?? ''}`,
  ).toLowerCase();
  // A named project (one of the pack's hashtags, like "phanpy" or "esp32")
  // counts on its own, unless the name is ambiguous. A segment's plain word
  // ("desktop", "android") is everyday news unless the article is about the
  // fediverse too.
  const fediverse = FEDIVERSE.some((w) => wordPattern(w).test(text));
  const named = pack.hashtags
    .map((t) => t.toLowerCase())
    .filter((t) => wordPattern(t).test(text) && (!pack.ambiguous?.includes(t) || fediverse));
  if (named.length) return named;
  if (!fediverse) return [];
  return pack.segments
    .slice(0, -1)
    .flatMap((s) => s.keywords)
    .filter((k) => wordPattern(k).test(text));
}

/** Engagement stops counting past this (log scale): about 400 interactions. */
const ENGAGEMENT_CAP = 6;

/**
 * Score: relevance counts most (a keyword hit beats a viral off-topic post),
 * engagement is log-scaled and capped so one big account does not drown the
 * rest, and a post loses half its recency bonus every three days.
 */
export function score(post, matched, now) {
  const relevance = matched.length ? 8 + 2 * (matched.length - 1) : 0;
  const engagement = Math.min(
    ENGAGEMENT_CAP,
    Math.log1p(
      (post.favourites_count ?? 0) + 2 * (post.reblogs_count ?? 0) + 3 * (post.replies_count ?? 0),
    ),
  );
  const ageDays = Math.max(0, (now - Date.parse(post.created_at)) / DAY);
  const recency = 2 * Math.pow(0.5, ageDays / 3);
  return Math.round((relevance + engagement + recency) * 100) / 100;
}

/**
 * Vet, deduplicate (by URI, boosts unwrapped), score, cap per author, and keep
 * skipped posts out. Sorted best first.
 *
 * @param {import('./gather.mjs').Candidate[]} candidates
 * @param {import('./topic.mjs').TopicPack} pack
 * @param {number} [now]
 * @returns {Ranked[]}
 */
export function rankCandidates(candidates, pack, now = Date.now()) {
  const byUri = new Map();
  const texts = new Set();
  for (const { status, tag, seed } of candidates) {
    const post = status.reblog ?? status;
    const key = post.uri ?? post.url ?? post.id;
    const seen = byUri.get(key);
    if (seen) {
      if (!seen.tags.includes(tag)) seen.tags.push(tag);
      continue;
    }
    const { verdict, reasons } = vetStatus(status, { ...pack, now });
    if (verdict === 'skip') {
      byUri.set(key, { skipped: true, tags: [tag] });
      continue;
    }
    const { segment, matched } = segmentFor(post, pack.segments);
    if (!onTopic(post, matched, pack) || (seed && !seedOnTopic(post, matched, pack))) {
      byUri.set(key, { skipped: true, tags: [tag] });
      continue;
    }
    // The same text under another address is a cross-post, or an article
    // farm posting one link from several accounts: keep the first. Short
    // texts ("+1", "This!") are left alone, they collide by accident.
    const plain = plainText(post.content);
    const textKey = plain.length >= 40 ? plain.slice(0, 160) : `${key}`;
    if (texts.has(textKey)) {
      byUri.set(key, { skipped: true, tags: [tag] });
      continue;
    }
    texts.add(textKey);
    byUri.set(key, {
      post,
      segment,
      matched,
      tags: [tag],
      verdict,
      reasons,
      score: score(post, matched, now) + (seed ? SEED_BONUS : 0),
    });
  }
  const ranked = [...byUri.values()].filter((r) => !r.skipped).sort((a, b) => b.score - a.score);
  const perAuthor = new Map();
  return ranked.filter((r) => {
    const author = r.post.account?.acct ?? r.post.account?.id;
    const count = perAuthor.get(author) ?? 0;
    perAuthor.set(author, count + 1);
    return count < pack.perAuthor;
  });
}
