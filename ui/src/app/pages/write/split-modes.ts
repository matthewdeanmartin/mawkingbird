import { DEFAULT_URL_WEIGHT, findUrls, postLength } from '../../compose/post-length';

/**
 * How a body of writing becomes a thread.
 *
 * The composer has always had one answer: the user makes thread boxes by hand.
 * That works, but it is the wrong shape for the writing workspace, where you
 * write continuous prose first and decide where it breaks afterwards.
 *
 * - `rule`   — a line that is exactly `---` is a boundary. The default: explicit,
 *              predictable, and the same mental model as Markdown and blog
 *              front-matter, so there is nothing new to learn.
 * - `demand` — no automatic boundaries at all. The body is one segment, and the
 *              user splits at the caret when they want to. This is today's
 *              manual behaviour, generalised.
 * - `auto`   — chunk continuous prose to fit the limit, preferring paragraph,
 *              then sentence, then word boundaries.
 * - `boxes`  — one editor box per post, added with [+], the way the compact
 *              composer has always worked. More on screen than a `---` line,
 *              and the only mode where a post is a thing you can point at —
 *              which is what per-post attachments and polls need.
 *
 * `boxes` shares its storage with `rule`: the body is still one string with
 * `---` boundaries, so switching between the two is lossless and a draft saved
 * in either opens correctly in the other. The difference is entirely in how the
 * editor renders it.
 */
export type SplitMode = 'rule' | 'demand' | 'auto' | 'boxes';

export const SPLIT_MODES: readonly SplitMode[] = ['rule', 'demand', 'auto', 'boxes'];

export const DEFAULT_SPLIT_MODE: SplitMode = 'rule';

/** The marker line for {@link SplitMode} `rule`, as the user types it. */
export const SPLIT_RULE = '---';

/** A parsed segment, with the measurement the editor shows beside it. */
export interface Segment {
  /** The segment's text, with surrounding blank lines trimmed off. */
  text: string;
  /** Length as the server counts it — URL-weighted, not `text.length`. */
  length: number;
  /** True when this segment alone would be refused by the instance. */
  overLimit: boolean;
}

export interface SplitOptions {
  /** The instance's per-post character limit. */
  limit: number;
  /** The instance's reserved width for any URL. */
  urlWeight?: number;
}

/**
 * True when split review cannot help: one short physical line with no marker.
 *
 * Strictly below the limit follows the product rule; a post exactly at the
 * boundary still gets reviewed because a server-specific count can differ.
 */
export function isObviousSingleton(text: string, limit: number): boolean {
  const body = text.trim();
  return (
    body !== '' && !/[\r\n]/.test(body) && !body.includes(SPLIT_RULE) && postLength(body) < limit
  );
}

/**
 * Whether a line is the `---` boundary marker.
 *
 * Deliberately exact rather than "three or more dashes": `----` and `-----` are
 * things people type as decoration inside a post, and a rule that swallowed them
 * would silently break somebody's ASCII art into two posts. Surrounding
 * whitespace is allowed because trailing spaces are invisible.
 */
export function isSplitRule(line: string): boolean {
  return line.trim() === SPLIT_RULE;
}

/**
 * Split on `---` lines.
 *
 * Empty segments are dropped rather than preserved. A body that opens with
 * `---`, or that has two rules in a row, is someone mid-edit — not someone
 * asking to publish an empty post.
 */
export function splitOnRule(text: string): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  for (const line of text.split('\n')) {
    if (isSplitRule(line)) {
      segments.push(current.join('\n'));
      current = [];
    } else {
      current.push(line);
    }
  }
  segments.push(current.join('\n'));
  return segments.map((s) => s.trim()).filter((s) => s !== '');
}

/**
 * Chunk continuous prose to fit `limit`.
 *
 * Boundaries are preferred in descending order of how much the reader notices
 * them: paragraph break, then sentence end, then a space. Only when a single
 * unbroken run is itself over the limit does this cut mid-word, and even then it
 * will not cut inside a URL — a severed link is worse than an over-long post,
 * because the post is merely ugly while the link is broken.
 *
 * Measured with {@link postLength} throughout, so a paragraph of links chunks by
 * what the server will actually count rather than by how wide the text looks.
 */
export function autoSplit(text: string, options: SplitOptions): string[] {
  const limit = Math.max(1, options.limit);
  const urlWeight = options.urlWeight ?? DEFAULT_URL_WEIGHT;
  const body = text.trim();
  if (!body) {
    return [];
  }
  if (postLength(body, urlWeight) <= limit) {
    return [body];
  }

  const segments: string[] = [];
  let rest = body;
  while (rest) {
    if (postLength(rest, urlWeight) <= limit) {
      segments.push(rest);
      break;
    }
    const cut = findCut(rest, limit, urlWeight);
    segments.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  return segments.filter((s) => s !== '');
}

/**
 * The index to cut `text` at so the head fits within `limit`.
 *
 * Always returns at least 1, so a caller looping on the remainder cannot spin
 * forever on a string it fails to shorten.
 */
function findCut(text: string, limit: number, urlWeight: number): number {
  // The furthest index whose head still fits. Walked from the limit outward
  // rather than computed, because URL weighting makes the mapping from index to
  // length non-linear.
  let fits = 0;
  for (let i = 1; i <= text.length; i++) {
    if (postLength(text.slice(0, i), urlWeight) <= limit) {
      fits = i;
    } else {
      break;
    }
  }
  if (fits <= 0) {
    return 1;
  }

  // Never cut inside a URL: pull back to where the URL starts, so the whole link
  // moves to the next segment intact.
  const spanning = findUrls(text).find((url) => url.start < fits && url.end > fits);
  if (spanning && spanning.start > 0) {
    fits = spanning.start;
  }

  const head = text.slice(0, fits);
  const paragraph = head.lastIndexOf('\n\n');
  if (paragraph > 0) {
    return paragraph;
  }
  const sentence = lastSentenceEnd(head);
  if (sentence > 0) {
    return sentence;
  }
  const space = head.search(/\s+\S*$/);
  if (space > 0) {
    return space;
  }
  return Math.max(1, fits);
}

/** Index just past the last sentence-ending punctuation followed by a space. */
function lastSentenceEnd(text: string): number {
  let found = 0;
  for (const match of text.matchAll(/[.!?]["')\]]?\s/g)) {
    found = (match.index ?? 0) + match[0].length;
  }
  return found;
}

/** Split `text` into raw segment strings for the given mode. */
export function splitText(text: string, mode: SplitMode, options: SplitOptions): string[] {
  switch (mode) {
    case 'rule':
      return splitOnRule(text);
    case 'auto':
      return autoSplit(text, options);
    case 'demand': {
      const body = text.trim();
      return body ? [body] : [];
    }
    // Same storage as `rule` — see {@link SplitMode}.
    case 'boxes':
      return splitOnRule(text);
  }
}

/**
 * Split and measure in one step — what the editor renders beside the box.
 *
 * Kept separate from {@link splitText} so the raw strings can be handed to
 * `DraftSnapshot.segments` without carrying measurements the draft has no field
 * for.
 */
export function segmentsFor(text: string, mode: SplitMode, options: SplitOptions): Segment[] {
  const urlWeight = options.urlWeight ?? DEFAULT_URL_WEIGHT;
  return splitText(text, mode, options).map((segment) => {
    const length = postLength(segment, urlWeight);
    return { text: segment, length, overLimit: length > options.limit };
  });
}

/**
 * Insert a boundary at `caret`, for the `demand` mode's "split here" control.
 *
 * Returns the new body and where the caret should land — after the marker, so
 * typing continues in the segment the user just created rather than the one
 * they just closed.
 */
export function insertSplitAt(text: string, caret: number): { text: string; caret: number } {
  const at = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, at).replace(/\s+$/, '');
  const after = text.slice(at).replace(/^\s+/, '');
  const marker = `\n\n${SPLIT_RULE}\n\n`;
  return { text: `${before}${marker}${after}`, caret: before.length + marker.length };
}

// i18n pages.write.splitMode.rule.label: Split on ---
// i18n pages.write.splitMode.demand.label: Split on demand
// i18n pages.write.splitMode.auto.label: Autosplit
// i18n pages.write.splitMode.boxes.label: A box per post
/** Translation key for a mode's label, for the picker. */
export function splitModeLabel(mode: SplitMode): string {
  switch (mode) {
    case 'rule':
      return 'pages.write.splitMode.rule.label';
    case 'demand':
      return 'pages.write.splitMode.demand.label';
    case 'auto':
      return 'pages.write.splitMode.auto.label';
    case 'boxes':
      return 'pages.write.splitMode.boxes.label';
  }
}

// i18n pages.write.splitMode.rule.noun: split on ---
// i18n pages.write.splitMode.demand.noun: split on demand
// i18n pages.write.splitMode.auto.noun: autosplit
// i18n pages.write.splitMode.boxes.noun: a box per post
/**
 * Translation key for a mode's name as it reads mid-sentence ("split by …").
 *
 * A separate key rather than `| lowercase` on {@link splitModeLabel}: casing a
 * translated string in the pipeline assumes an alphabet with case at all, which
 * is not true generally, and a German noun stays capitalised regardless of
 * where it sits in the sentence.
 */
export function splitModeNoun(mode: SplitMode): string {
  switch (mode) {
    case 'rule':
      return 'pages.write.splitMode.rule.noun';
    case 'demand':
      return 'pages.write.splitMode.demand.noun';
    case 'auto':
      return 'pages.write.splitMode.auto.noun';
    case 'boxes':
      return 'pages.write.splitMode.boxes.noun';
  }
}

// i18n pages.write.splitMode.rule.hint: A line containing only --- starts a new post.
// i18n pages.write.splitMode.demand.hint: One post, until you split it yourself.
// i18n pages.write.splitMode.auto.hint: Broken up to fit, at paragraph or sentence breaks.
// i18n pages.write.splitMode.boxes.hint: One box per post. Needed to give a post its own poll or images.
/** Translation key for a mode's help text, shown under the picker. */
export function splitModeHint(mode: SplitMode): string {
  switch (mode) {
    case 'rule':
      return 'pages.write.splitMode.rule.hint';
    case 'demand':
      return 'pages.write.splitMode.demand.hint';
    case 'auto':
      return 'pages.write.splitMode.auto.hint';
    case 'boxes':
      return 'pages.write.splitMode.boxes.hint';
  }
}

/**
 * The body as a list of boxes, for the editor that renders one per post.
 *
 * Unlike {@link splitOnRule} this preserves empty boxes, because an empty box
 * the user just added with [+] has to stay on screen long enough to type into.
 * Publishing drops them again — {@link splitText} is what decides that.
 */
export function bodyToBoxes(text: string): string[] {
  const boxes: string[] = [];
  let current: string[] = [];
  for (const line of text.split('\n')) {
    if (isSplitRule(line)) {
      boxes.push(current.join('\n').trim());
      current = [];
    } else {
      current.push(line);
    }
  }
  boxes.push(current.join('\n').trim());
  return boxes.length ? boxes : [''];
}

/**
 * Boxes back into one stored body.
 *
 * Empty trailing boxes are kept so the caret does not jump out of a box the
 * user is about to type in; {@link splitOnRule} filters them at publish time.
 */
export function boxesToBody(boxes: readonly string[]): string {
  return boxes.map((box) => box.trim()).join(`\n\n${SPLIT_RULE}\n\n`);
}
