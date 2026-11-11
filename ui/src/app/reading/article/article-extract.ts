import { inspectHtml } from './article-diagnosis';
import { extractMetadata } from './article-metadata';
import { ArticleBody, ArticleResult } from './article-models';
import { judge, measure } from './article-quality';
import { findArticleRoot, stripFurniture } from './article-scoring';
import { htmlToMarkdown } from './html-to-markdown';
import { readabilityExtract } from './article-readability';

/**
 * Raw HTML → a renderable result.
 *
 * The one entry point for turning a fetched page into something the reader can
 * show. Pure: no HTTP, no Angular, no storage. Everything it needs is the bytes
 * and the URL they came from, which is what makes it testable against a corpus
 * of saved pages.
 *
 * ## Nothing here executes anything
 *
 * `DOMParser` builds a detached document: no script runs, no `<img>` fires, no
 * network request happens. The document is never attached to the live DOM. The
 * markdown conversion downstream then discards every construct that could carry
 * behaviour. A hostile page is, at worst, badly formatted prose.
 */

/**
 * Extract everything worth having from a fetched page.
 *
 * `finalUrl` must be where the content actually came from — the end of any
 * redirect chain, which the proxy reports in `X-Proxy-Final-Url`. Relative
 * links and images resolve against it.
 *
 * Always returns a result. Metadata is attempted first and independently, so a
 * page that refuses extraction still yields a card, which is what keeps the
 * failure path from being a dead end.
 */
export function extractArticle(
  html: string,
  finalUrl: string,
  requestedUrl: string = finalUrl,
): ArticleResult {
  const fetchedAt = new Date().toISOString();
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Metadata comes first and from the untouched document: `stripFurniture`
  // removes `<header>`, which is where a fair number of pages keep their
  // `<h1>`, and it does not care about `<meta>` either way.
  const card = extractMetadata(doc, finalUrl);

  const base = (): Omit<ArticleResult, 'diagnosis' | 'article'> => ({
    requestedUrl,
    finalUrl,
    card,
    fetchedAt,
  });

  // Tier 1: is this page hostile or empty in a way we can name?
  const preVerdict = inspectHtml(doc, html);
  if (preVerdict) {
    return { ...base(), article: null, diagnosis: preVerdict };
  }

  // Readability must see the document **as fetched**, so the clone is taken
  // here — eagerly, before `stripFurniture` runs.
  //
  // This ordering is the whole correctness of the fallback. `stripFurniture`
  // destructively removes `<header>`, `<nav>`, `<aside>` and anything matching
  // the junk pattern from `doc` itself; Readability scores exactly those
  // elements to decide where the body is. Handing it the stripped document
  // would ask it to judge a page whose evidence had already been thrown away —
  // it would agree with our heuristic by construction and rescue nothing.
  //
  // Deliberately *not* deferred behind a closure. A lazy `() => doc.cloneNode()`
  // reads like a free optimisation and is silently wrong: it captures `doc` by
  // reference, so by the time the fallback calls it the strip has already
  // happened and the "pristine" copy is the mutilated one. Paying for a clone
  // on every expansion is the honest price of having a fallback that works.
  const pristine = doc.cloneNode(true) as Document;

  stripFurniture(doc);

  const root = findArticleRoot(doc);

  // Tier 2: our own heuristic. Kept first — it is tuned to this pipeline, and
  // the quality gate below is calibrated against the metrics it produces.
  const own = root ? attempt(root.element, finalUrl) : null;

  // Tier 3: Mozilla Readability, when ours declined or produced junk.
  //
  // The gate is applied to both candidates identically. Readability is better
  // than our heuristic on the long tail, but "better on average" is not
  // "trustworthy unreviewed" — a page it reads as navigation soup is still
  // navigation soup, and rendering that would break the same promise the gate
  // exists to keep.
  const best =
    own?.quality === 'good' ? own : bestOf(own, attempt(readabilityBody(pristine), finalUrl));

  if (!best) {
    return { ...base(), article: null, diagnosis: 'junk' };
  }

  const title =
    card?.title ??
    doc.querySelector('h1')?.textContent?.trim() ??
    doc.querySelector('title')?.textContent?.trim() ??
    'Untitled';

  const article: ArticleBody = {
    title,
    byline: card?.author_name ?? null,
    siteName: card?.provider_name || null,
    markdown: best.markdown,
    images: best.images,
    quality: best.quality,
    metrics: best.metrics,
  };

  return {
    ...base(),
    article,
    diagnosis: best.quality === 'thin' ? 'partial' : 'ok',
  };
}

/** One extraction candidate, measured and judged but not yet chosen. */
interface Candidate {
  markdown: string;
  images: string[];
  metrics: ReturnType<typeof measure>;
  quality: ReturnType<typeof judge>;
}

/**
 * Convert and score one candidate root.
 *
 * Returns null for a root the gate rejects, so a caller can treat "no
 * candidate" and "rejected candidate" the same way — which is correct here,
 * because a junk extraction is worth exactly as much as none.
 */
function attempt(element: Element | null, baseUrl: string): Candidate | null {
  if (!element) {
    return null;
  }
  const { markdown, images } = htmlToMarkdown(element, baseUrl);
  const metrics = measure(element, markdown);
  const quality = judge(metrics);
  return quality === 'junk' ? null : { markdown, images, metrics, quality };
}

/** Readability's body element for a document, or null when it declines. */
function readabilityBody(doc: Document): Element | null {
  return readabilityExtract(doc)?.element ?? null;
}

/**
 * Pick between two surviving candidates.
 *
 * `good` beats `thin`; between equals, the longer one wins. Word count is a
 * crude tiebreak, but the failure it guards against is concrete: a truncated
 * extraction that happens to be clean enough to pass the gate would otherwise
 * be preferred over a complete one purely by running first.
 */
function bestOf(a: Candidate | null, b: Candidate | null): Candidate | null {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  if (a.quality !== b.quality) {
    return a.quality === 'good' ? a : b;
  }
  return b.metrics.wordCount > a.metrics.wordCount ? b : a;
}
