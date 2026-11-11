/**
 * The pure ELIZA brain — no Angular, no storage, no clock.
 *
 * Given a line of user text, {@link elizaReply} produces Eliza's answer by the
 * classic 1966 recipe: try the FAQ (keyword help answers) first, then the
 * pronoun-reflecting reflection rules, then a deflecting fallback. Selection
 * among equally-good responses is deterministic given a `seed`, so tests can
 * pin exact output (see `eliza-engine.spec.ts`) — the service passes a rolling
 * seed at call time to keep live conversation varied.
 *
 * Content (rules, FAQ, fallbacks) lives in `eliza-content.ts`; this file is the
 * matching machinery only.
 */

import { ELIZA_FALLBACK, ELIZA_FAQ, ELIZA_RULES, FaqPair } from './eliza-content';

/**
 * First-person ⇄ second-person swaps, applied to a matched fragment so it reads
 * back naturally ("I am sad" → reflected "you are sad" → "How long have you
 * been sad?"). Order-independent because we tokenise and map word-by-word.
 */
const REFLECTIONS = new Map<string, string>([
  ['am', 'are'],
  ['was', 'were'],
  ['i', 'you'],
  ["i'm", 'you are'],
  ['i’d', 'you would'],
  ["i'd", 'you would'],
  ['i’ve', 'you have'],
  ["i've", 'you have'],
  ['my', 'your'],
  ['me', 'you'],
  ['mine', 'yours'],
  ['myself', 'yourself'],
  ['you', 'I'],
  ['your', 'my'],
  ['yours', 'mine'],
  ['yourself', 'myself'],
  ['are', 'am'],
]);

/** Swap first/second-person pronouns in `fragment` so a matched clause reads
 *  back as Eliza addressing the user. Whitespace and punctuation are preserved. */
export function reflect(fragment: string): string {
  return fragment
    .split(/\b/)
    .map((token) => {
      const swapped = REFLECTIONS.get(token.toLowerCase());
      return swapped ?? token;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trim a matched clause of trailing sentence punctuation so it splices cleanly
 *  into a template ("...you got $1?" shouldn't become "...you got sad.?"). */
function tidy(fragment: string): string {
  return fragment.replace(/[.!?,;:]+\s*$/, '').trim();
}

/** Whole-word, case-insensitive test that `token` appears in `text`. */
function containsWord(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

/** The first FAQ pair whose any keyword appears in `text`, or null. Earlier
 *  entries win (they're ordered most-specific-first in the datafile). */
export function faqMatch(text: string): FaqPair | null {
  for (const pair of ELIZA_FAQ) {
    if (pair.keywords.some((kw) => containsWord(text, kw))) {
      return pair;
    }
  }
  return null;
}

/** Deterministically pick one of `options` from a non-negative integer `seed`.
 *  A stable hash keeps identical (text, seed) pairs reproducible for tests. */
function pick<T>(options: readonly T[], seed: number): T {
  if (options.length === 0) {
    throw new Error('pick() requires at least one option');
  }
  const index = Math.abs(Math.trunc(seed)) % options.length;
  return options[index];
}

/**
 * Eliza's reply to one line of user text.
 *
 * @param text  The raw user message.
 * @param seed  Any integer; selects among equally-valid responses
 *              deterministically. The service advances it per turn so a live
 *              chat varies while tests stay pinned.
 */
export function elizaReply(text: string, seed = 0): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return pick(ELIZA_FALLBACK, seed);
  }

  // 1. FAQ — if they're plainly asking about a feature, help instead of deflect.
  const faq = faqMatch(trimmed);
  if (faq) {
    return faq.answer;
  }

  // 2. Reflection rules — the pronoun-swapping ELIZA core.
  for (const rule of ELIZA_RULES) {
    const match = rule.pattern.exec(trimmed);
    if (match) {
      const captured = match[1] ? tidy(reflect(match[1])) : '';
      const template = pick(rule.responses, seed);
      return template.replace('$1', captured);
    }
  }

  // 3. Nothing matched — the eternal deflection.
  return pick(ELIZA_FALLBACK, seed);
}
