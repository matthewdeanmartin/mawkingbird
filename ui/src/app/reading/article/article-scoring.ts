import { countWords } from './article-diagnosis';

/**
 * Finding the element that holds the article.
 *
 * A deliberately small take on Readability's approach. The bar is not "as good
 * as Firefox Reader View" — it is "better than a link" on the blogs this app's
 * readers actually follow, which skew toward simple, semantically marked-up
 * personal sites. Most of those are answered by {@link semanticCandidate}
 * without any scoring at all.
 *
 * Scoring exists for the rest: WordPress themes, news sites, and anything whose
 * article body is a `<div>` among forty other `<div>`s.
 */

/** Elements that never hold an article body and are removed before scoring. */
const STRIP_TAGS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'object',
  'embed',
  'svg',
  'form',
  'button',
  'input',
  'select',
  'textarea',
  'nav',
  'aside',
  'footer',
  'header',
  'template',
];

/**
 * Class/id fragments that mark a subtree as furniture rather than article.
 *
 * Conservative on purpose. `comment` is here and is the risky one — a blog
 * whose article body is `<div class="comment-and-post">` would lose, but that
 * is rare, while comment threads scoring above the article is common.
 */
const JUNK_PATTERN =
  /(^|[\s_-])(share|sharing|social|related|recirc|newsletter|signup|subscribe|comment|disqus|promo|advert|ad-|ads-|sponsor|sidebar|widget|cookie|consent|banner|popup|modal|nav|menu|breadcrumb|pagination|footer|header|masthead|byline|tags?|meta)([\s_-]|$)/i;

/** Class/id fragments that mark a subtree as probably the article. */
const CONTENT_PATTERN =
  /(^|[\s_-])(article|post|entry|content|story|body|main|text|prose|markdown)([\s_-]|$)/i;

/** Block containers eligible to be the article root. */
const CANDIDATE_TAGS = new Set(['div', 'section', 'article', 'main', 'td']);

/** The `class` and `id` of an element, as one lowercase string. */
function classAndId(el: Element): string {
  return `${el.getAttribute('class') ?? ''} ${el.getAttribute('id') ?? ''}`.toLowerCase();
}

/**
 * Remove everything that is definitely not article text.
 *
 * Mutates the document, which is safe because callers parse a fresh one per
 * extraction. Runs before scoring so that furniture cannot win, and before
 * counting so that link density reflects prose rather than nav.
 */
export function stripFurniture(doc: Document): void {
  for (const tag of STRIP_TAGS) {
    for (const el of Array.from(doc.querySelectorAll(tag))) {
      el.remove();
    }
  }
  // Elements the page itself hides are not part of the article. This is also
  // the cheapest paywall-truncation defence: the hidden "rest of the article"
  // is usually not in the markup at all, but when it is, the visible portion is
  // what the publisher intends and what we should measure.
  for (const el of Array.from(doc.querySelectorAll('[hidden], [aria-hidden="true"]'))) {
    el.remove();
  }
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    if (JUNK_PATTERN.test(classAndId(el))) {
      el.remove();
    }
  }
}

/**
 * The article root according to the page's own markup.
 *
 * Tried before scoring because a page that says where its article is should be
 * believed. Static-site generators and most blog themes land here, which is the
 * population that matters most for this feature.
 *
 * Requires an *unambiguous* answer: several `<article>` elements means an index
 * page listing posts, not an article, so scoring is the better tool.
 */
export function semanticCandidate(doc: Document): Element | null {
  const byItemprop = doc.querySelectorAll('[itemprop="articleBody" i]');
  if (byItemprop.length === 1) {
    return byItemprop[0];
  }
  const articles = doc.querySelectorAll('article');
  if (articles.length === 1) {
    return articles[0];
  }
  const mainArticle = doc.querySelectorAll('main article');
  if (mainArticle.length === 1) {
    return mainArticle[0];
  }
  return null;
}

/** Words inside `<a>` descendants, for link-density. */
export function linkedWordCount(el: Element): number {
  let total = 0;
  for (const anchor of Array.from(el.querySelectorAll('a'))) {
    total += countWords(anchor.textContent ?? '');
  }
  return total;
}

/** Linked words ÷ all words, 0 when there are no words. */
export function linkDensity(el: Element): number {
  const words = countWords(el.textContent ?? '');
  return words === 0 ? 0 : linkedWordCount(el) / words;
}

/**
 * How much this element looks like an article body.
 *
 * Text length and paragraph count are the signal; link density is the penalty
 * that keeps navigation and "related posts" blocks from winning. Commas are a
 * cheap proxy for prose — Readability's trick, and it holds up: menus and
 * link lists have almost none.
 */
export function scoreElement(el: Element): number {
  const text = el.textContent ?? '';
  const words = countWords(text);
  if (words < 25) {
    return 0;
  }

  let score = Math.min(words / 10, 60);
  score += Math.min((text.match(/,/g) ?? []).length, 30);
  score += Math.min(el.querySelectorAll('p').length * 3, 30);

  const marker = classAndId(el);
  if (CONTENT_PATTERN.test(marker)) {
    score += 25;
  }
  if (el.localName === 'article' || el.localName === 'main') {
    score += 25;
  }

  // The penalty that does the real work. A block that is mostly links is a
  // menu regardless of how much text it contains.
  score *= 1 - Math.min(linkDensity(el), 0.9);

  return score;
}

/** A scored candidate. */
export interface ScoredCandidate {
  element: Element;
  score: number;
}

/**
 * Score every plausible container and return the best.
 *
 * `null` when nothing scored above zero, which means there was no prose to find
 * and the caller should report `junk` rather than render an empty article.
 */
export function bestCandidate(doc: Document): ScoredCandidate | null {
  let best: ScoredCandidate | null = null;
  for (const el of Array.from(doc.body?.querySelectorAll('*') ?? [])) {
    if (!CANDIDATE_TAGS.has(el.localName)) {
      continue;
    }
    const score = scoreElement(el);
    if (score > 0 && (best === null || score > best.score)) {
      best = { element: el, score };
    }
  }
  return best;
}

/**
 * Pick the article root: what the markup declares, else what scoring finds.
 *
 * The semantic answer still has to survive a sanity check. A page can carry a
 * single `<article>` wrapping only a teaser while the real body sits elsewhere,
 * so a semantic candidate with almost no prose is discarded in favour of
 * scoring rather than trusted blindly.
 */
export function findArticleRoot(doc: Document): ScoredCandidate | null {
  const semantic = semanticCandidate(doc);
  if (semantic && countWords(semantic.textContent ?? '') >= 100) {
    return { element: semantic, score: scoreElement(semantic) };
  }
  return bestCandidate(doc);
}
