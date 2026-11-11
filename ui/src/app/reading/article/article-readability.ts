import { Readability } from '@mozilla/readability';

/**
 * The fallback extractor: Mozilla Readability, behind the in-house one.
 *
 * ## Why a second extractor at all
 *
 * `article-scoring.ts` is a good heuristic and it is right often enough to be
 * worth keeping — it is smaller, it is tuned to this pipeline, and when it wins
 * it wins on the first try. But "often enough" leaves a real tail of pages that
 * come back `junk`, and a reader who presses the button and gets a shrug does
 * not care which of our heuristics declined. Readability is the standalone
 * library behind Firefox Reader View, tuned against a far larger corpus of real
 * pages than this project will ever assemble, so it is the obvious thing to
 * reach for when ours gives up.
 *
 * ## Why it is second and not first
 *
 * Not sentiment about the existing code. Two practical reasons:
 *
 * - **It mutates the document.** `Readability.parse()` rewrites the DOM it is
 *   given, so it can only run on a clone. Running it speculatively on every
 *   page would mean paying for a full document clone on the majority of pages
 *   that never need it.
 * - **The in-house path already produces metrics** the quality gate is
 *   calibrated against. Keeping it first means the calibration continues to
 *   describe the common case, and Readability's output is judged by the same
 *   gate rather than trusted blindly.
 *
 * ## What this does *not* do
 *
 * It does not convert to markdown. Readability emits HTML, and this project
 * already has a converter (`html-to-markdown.ts`) whose entire vocabulary is
 * the constructs the reader renders — which is also the security argument for
 * the feature. Adding Turndown alongside it would mean two markdown dialects
 * and two places for a construct to slip through. So this returns an element
 * and the existing converter takes it from there.
 *
 * ## Safety
 *
 * Same posture as the rest of the pipeline: the document is detached, built by
 * `DOMParser`, and never attached to the live DOM, so nothing in it executes.
 * Readability's own output is then fed through the markdown converter, which
 * cannot express a script, an event handler or an attribute it was not written
 * to emit. That is the sanitize step — an allowlist by construction rather than
 * a denylist applied afterwards.
 */

/** What Readability found, or null when it declined too. */
export interface ReadabilityExtract {
  /** The article body, as a detached element ready for the markdown converter. */
  element: Element;
  /** Readability's own title guess. Weaker than the metadata card's, so used only as a fallback. */
  title: string | null;
  /** Readability's byline guess, when it found one. */
  byline: string | null;
  /** The site name, when Readability identified one. */
  siteName: string | null;
}

/**
 * Run Readability over a parsed document.
 *
 * **Consumes `doc`.** `Readability.parse()` rewrites the document it is handed,
 * so the caller must pass a copy it does not need afterwards — `extractArticle`
 * passes a clone taken before its own destructive `stripFurniture` pass. The
 * clone lives at the call site rather than here because that is where it can be
 * made conditional: the majority of pages never reach this path, and cloning
 * unconditionally inside would charge every one of them for it.
 *
 * Never throws. Readability is third-party code running over arbitrary hostile
 * markup; a crash here must degrade to "no article", exactly as our own
 * extractor declining does, rather than taking down the expansion.
 */
export function readabilityExtract(doc: Document): ReadabilityExtract | null {
  let parsed: ReturnType<Readability['parse']>;
  try {
    parsed = new Readability(doc).parse();
  } catch {
    return null;
  }

  if (!parsed?.content) {
    return null;
  }

  // Readability returns an HTML *string*, and the converter wants an element.
  // Parsed into a fresh detached document for the same reason as everywhere
  // else here: nothing is attached, so nothing runs.
  const holder = new DOMParser().parseFromString(parsed.content, 'text/html');
  const element = holder.body.firstElementChild ?? holder.body;
  if (!element.textContent?.trim()) {
    return null;
  }

  return {
    element,
    title: clean(parsed.title),
    byline: clean(parsed.byline),
    siteName: clean(parsed.siteName),
  };
}

/** Trim, and treat an empty string as absent — Readability returns both. */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
