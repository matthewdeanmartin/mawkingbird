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
  for (const { status, tag } of candidates) {
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
    if (!onTopic(post, matched, pack)) {
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
      score: score(post, matched, now),
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
