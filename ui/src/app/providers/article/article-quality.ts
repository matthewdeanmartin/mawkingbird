import { countWords } from './article-diagnosis';
import { linkDensity } from './article-scoring';
import { ArticleMetrics, ArticleQuality } from './article-models';

/**
 * The quality gate: deciding whether an extraction is worth rendering.
 *
 * The single most important judgement in this feature. A confidently rendered
 * page of navigation links, cookie copy and "Subscribe to continue" is worse
 * than no feature at all, because it teaches the reader that the button lies.
 *
 * ## The two errors are not symmetric
 *
 * *False junk* (rejecting a good article) costs the reader a feature that would
 * have worked — one click, one visible fallback link, mild disappointment.
 * *False good* (rendering junk as an article) costs trust in the button, which
 * is not recoverable by trying again.
 *
 * So these thresholds are tuned toward rejecting. When in doubt, `thin` — which
 * renders the text *and* says it may be incomplete — is usually the honest
 * answer, and it is the reason the verdict has three values rather than two.
 */

/**
 * Below this, there is no article worth a reader view.
 *
 * 150 words is roughly three short paragraphs — under it, whatever we found is
 * a teaser, a caption block, or a cookie notice.
 */
const MIN_WORDS = 150;

/**
 * Below this, `thin` rather than `good` — a lede, not a piece.
 *
 * Calibrated 2026-08-21 against the fixture corpus, downward from an initial
 * guess of 400. That guess was wrong in the expensive direction: a 300-word
 * post is an ordinary complete blog entry, and flagging it "this may be only
 * part of the article" would put a false caveat on a large share of the
 * personal blogs this feature exists to read. 200 words is about where a piece
 * stops looking like an excerpt.
 */
const THIN_WORDS = 200;

/**
 * Link density above which text is a menu rather than prose.
 *
 * The highest-value single metric. It is what separates a nav-and-footer soup
 * from writing, and what catches a homepage extracted in place of an article.
 */
const MAX_LINK_DENSITY = 0.35;

/** Density above which a result is suspect but still worth showing. */
const THIN_LINK_DENSITY = 0.22;

/** Prose paragraphs needed before a result counts as an article. */
const MIN_PARAGRAPHS = 2;

/** Words that make a `<p>` prose rather than a caption or a byline. */
const PARAGRAPH_WORDS = 25;

/** Measure an extracted root. Pure; the verdict is computed separately. */
export function measure(root: Element, markdown: string): ArticleMetrics {
  const text = root.textContent ?? '';
  const wordCount = countWords(markdown);
  const paragraphCount = Array.from(root.querySelectorAll('p')).filter(
    (p) => countWords(p.textContent ?? '') >= PARAGRAPH_WORDS,
  ).length;
  const markupLength = root.innerHTML.length;
  return {
    wordCount,
    linkDensity: linkDensity(root),
    paragraphCount,
    textToMarkupRatio: markupLength === 0 ? 0 : text.length / markupLength,
  };
}

/**
 * Turn measurements into a verdict.
 *
 * Stated as a sequence of rejections then a sequence of doubts, because that
 * ordering is what makes the result readable: the first rule that fires is the
 * reason, and the reasons are listed worst-first.
 */
export function judge(metrics: ArticleMetrics): ArticleQuality {
  // Rejections.
  if (metrics.wordCount < MIN_WORDS) {
    return 'junk';
  }
  if (metrics.linkDensity > MAX_LINK_DENSITY) {
    return 'junk';
  }
  // A wall of text with no paragraph structure is usually a sidebar list or a
  // stripped nav, not an essay. Allowed through when it is long enough that
  // being wrong would discard something substantial.
  if (metrics.paragraphCount < MIN_PARAGRAPHS && metrics.wordCount < 600) {
    return 'junk';
  }

  // Doubts: rendered, but flagged.
  if (metrics.wordCount < THIN_WORDS) {
    return 'thin';
  }
  if (metrics.linkDensity > THIN_LINK_DENSITY) {
    return 'thin';
  }
  if (metrics.paragraphCount < MIN_PARAGRAPHS) {
    return 'thin';
  }

  return 'good';
}
