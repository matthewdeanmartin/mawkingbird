import { array as profanityWords } from 'badwords-list';

import { Status } from './models';

/**
 * A tiny VADER-style "rage" detector for the Algo feed's sentiment filter.
 *
 * Engagement-ranked feeds reward inflammatory posts (outrage travels), so the
 * Algo page offers a client-side toggle that hides posts scoring above
 * {@link HEATED_THRESHOLD}. This is deliberately a lexicon, not a model:
 * `@tensorflow-models/toxicity` costs ~25 MB of network and seconds of warm-up,
 * while a word list is a few KB and synchronous. It will misfire sometimes —
 * that's the accepted trade, and the filter is opt-in and reversible.
 *
 * Scoring: weighted keyword hits, an established 450-word English profanity
 * list (whole-token matches only), plus small boosts for shouting (many
 * ALL-CAPS words) and exclamation pile-ups — the classic cheap VADER cues.
 */

/** Rage/inflammation lexicon. Weights: 1 = heated, 2 = openly hostile. */
const RAGE_WEIGHTS = new Map<string, number>([
  // insults / contempt
  ['idiot', 2],
  ['idiots', 2],
  ['moron', 2],
  ['morons', 2],
  ['stupid', 2],
  ['dumb', 1],
  ['fool', 1],
  ['fools', 1],
  ['clown', 1],
  ['clowns', 1],
  ['loser', 2],
  ['losers', 2],
  ['pathetic', 2],
  ['scum', 2],
  ['trash', 1],
  ['garbage', 1],
  ['worthless', 2],
  // anger
  ['hate', 2],
  ['hates', 2],
  ['hatred', 2],
  ['furious', 2],
  ['rage', 2],
  ['enraged', 2],
  ['angry', 1],
  ['outrage', 2],
  ['outraged', 2],
  ['outrageous', 2],
  ['disgusting', 2],
  ['disgusted', 2],
  ['sick of', 1],
  ['fed up', 1],
  // hostility / accusation
  ['liar', 2],
  ['liars', 2],
  ['lies', 1],
  ['lying', 1],
  ['fraud', 2],
  ['corrupt', 2],
  ['corruption', 1],
  ['criminal', 1],
  ['criminals', 1],
  ['traitor', 2],
  ['traitors', 2],
  ['treason', 2],
  ['evil', 2],
  ['vile', 2],
  ['despicable', 2],
  ['shameful', 1],
  ['disgrace', 2],
  ['disgraceful', 2],
  // doom / escalation
  ['destroy', 1],
  ['destroyed', 1],
  ['destroying', 1],
  ['ruin', 1],
  ['ruined', 1],
  ['ruining', 1],
  ['attack', 1],
  ['attacks', 1],
  ['war on', 1],
  ['disaster', 1],
  ['catastrophe', 1],
  ['nightmare', 1],
  ['insane', 1],
  ['insanity', 1],
  ['unhinged', 2],
  ['toxic', 1],
  ['terrible', 1],
  ['horrible', 1],
  ['awful', 1],
  ['worst', 1],
  // profanity-adjacent intensity
  ['damn', 1],
  ['hell', 1],
  ['wtf', 2],
  ['screwed', 1],
  ['bullshit', 2],
]);

/**
 * Entries in `badwords-list` that are ordinary English words, proper nouns
 * ("God", "Cox", "Hoare"), British mild intensifiers, or clinical/anatomical
 * terms. Any of these can headline a perfectly calm post ("bloody brilliant",
 * "pawn to e4", "sex education"), so they are excluded from the profanity rule.
 * Genuinely heated words among them ("damn", "hell") still score via
 * {@link RAGE_WEIGHTS}.
 */
const BENIGN_COLLISIONS = new Set([
  'anal',
  'anus',
  'balls',
  'bloody',
  'boner',
  'boob',
  'boobs',
  'breasts',
  'bugger',
  'bum',
  'butt',
  'cox',
  'crap',
  'damn',
  'dink',
  'dinks',
  'ejaculate',
  'ejaculated',
  'ejaculates',
  'ejaculating',
  'ejaculatings',
  'ejaculation',
  'ejakulate',
  'fanny',
  'flange',
  'god',
  'hell',
  'hoar',
  'hoare',
  'hoer',
  'hore',
  'horniest',
  'horny',
  'knob',
  'labia',
  'lust',
  'lusting',
  'masochist',
  'muff',
  'orgasim',
  'orgasims',
  'orgasm',
  'orgasms',
  'pawn',
  'penis',
  'poop',
  'pube',
  'rectum',
  'sadist',
  'screwing',
  'scrotum',
  'semen',
  'sex',
  'shag',
  'snatch',
  'spac',
  'spunk',
  'teets',
  'teez',
  'testical',
  'testicle',
  'vagina',
  'vulva',
  'wang',
  'willies',
  'willy',
]);

/**
 * English profanity terms from `badwords-list` (MIT, zero runtime dependencies).
 *
 * This remains separate from the rage lexicon: profanity is an explicit product
 * rule, rather than a context-dependent sentiment signal. Matching tokens rather
 * than substrings avoids false positives such as "shitake" or "button".
 *
 * Sanitized on load: only plain single words of 3+ letters survive. One- and
 * two-letter strings are never profanity ("as" is not "ass"), and the list's
 * multi-word / symbol entries ("s.o.b.", "f u c k") could never match a token
 * anyway — dropping them also keeps the disemvowelled set honest.
 */
const PROFANITY_WORDS = new Set(
  [...profanityWords, 'dogshit']
    .map((word) => word.toLowerCase())
    .filter((word) => /^[a-z]{3,}$/.test(word) && !BENIGN_COLLISIONS.has(word)),
);

/** Consonant skeletons allow asterisks to stand in for omitted vowels (for example, "f*ck"). */
const DISEMVOWELLED_PROFANITY_WORDS = new Set(
  [...PROFANITY_WORDS]
    .filter((word) => /^[a-z]+$/.test(word))
    .map((word) => word.replace(/[aeiou]/g, ''))
    .filter((word) => word.length >= 3),
);

/** Strongly negative emoji are an explicit Calm mode signal, not a general sentiment classifier. */
const NEGATIVE_EMOJIS = ['🤬', '😡', '😠', '🤮', '💩', '🖕', '👎'] as const;

/** Posts scoring at or above this are considered heated. */
export const HEATED_THRESHOLD = 2;

/** Crude tag stripper for status HTML — good enough for word matching. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Rage score for a plain-text snippet: words, obfuscation, emoji, and shouting cues. */
export function rageScore(text: string): number {
  const lower = text.toLowerCase();
  const tokens = lower.split(/[^a-z']+/).filter(Boolean);
  let score = 0;

  const seen = new Set<string>();
  for (const token of tokens) {
    // A whole-word profanity hit is always considered heated on its own.
    if (PROFANITY_WORDS.has(token) && !seen.has(token)) {
      seen.add(token);
      score += HEATED_THRESHOLD;
      continue;
    }
    const weight = RAGE_WEIGHTS.get(token);
    // Count each distinct word once — repetition is covered by the caps/bang cues.
    if (weight && !seen.has(token)) {
      seen.add(token);
      score += weight;
    }
  }

  // Asterisks commonly replace vowels in profanity ("f*ck", "sh*t").
  // Only star-containing, whole-token candidates are considered, so regular
  // Markdown emphasis or a normal word cannot trigger this path.
  const obfuscatedTokens = lower.match(/[a-z*]+/g) ?? [];
  for (const token of obfuscatedTokens) {
    const consonantSkeleton = token.replace(/[aeiou*]/g, '');
    if (
      token.includes('*') &&
      consonantSkeleton.length >= 3 &&
      DISEMVOWELLED_PROFANITY_WORDS.has(consonantSkeleton)
    ) {
      score += HEATED_THRESHOLD;
      break;
    }
  }

  // Calm mode is opt-in, so treat these unambiguously negative emoji as heated.
  if (NEGATIVE_EMOJIS.some((emoji) => text.includes(emoji))) {
    score += HEATED_THRESHOLD;
  }

  // Two-word phrases ("sick of", "war on", "fed up").
  for (const [phrase, weight] of RAGE_WEIGHTS) {
    if (phrase.includes(' ') && lower.includes(phrase)) {
      score += weight;
    }
  }

  // Shouting: three or more ALL-CAPS words (4+ letters) reads as yelling.
  const capsWords = text.match(/\b[A-Z]{4,}\b/g) ?? [];
  if (capsWords.length >= 3) {
    score += 1;
  }
  // Exclamation pile-ups: "!!" or worse, or many sentences ending in "!".
  const bangs = (text.match(/!/g) ?? []).length;
  if (/!{2,}/.test(text) || bangs >= 3) {
    score += 1;
  }
  return score;
}

/**
 * Whether a status (or the status it boosts) reads as inflammatory.
 *
 * Beyond the lexicon, two structural signals count as negative sentiment
 * outright: a content warning (the author flagged it themselves), and a match
 * on any of the viewer's own content filters (the viewer already said "less
 * of this, please").
 */
export function isHeated(status: Status): boolean {
  const target = status.reblog ?? status;
  if (target.spoiler_text.trim()) {
    return true;
  }
  if ((status.filtered?.length ?? 0) > 0 || (target.filtered?.length ?? 0) > 0) {
    return true;
  }
  const text = stripHtml(target.content);
  return rageScore(text) >= HEATED_THRESHOLD;
}

/** The ratio rule needs at least this many replies — small posts aren't "ratioed". */
export const RATIO_MIN_REPLIES = 5;
/** Ratioed = replies at least this many times the endorsements (favs + boosts). */
export const RATIO_FACTOR = 2;

/**
 * Whether a status (or its boost target) is being "ratioed": far more replies
 * than endorsements. Lots of comments over few likes/boosts almost always
 * means people are angry AT the post, not into it — pure engagement metrics
 * can't tell the difference, but this shape can.
 */
export function isRatioed(status: Status): boolean {
  const target = status.reblog ?? status;
  return (
    target.replies_count >= RATIO_MIN_REPLIES &&
    target.replies_count >= RATIO_FACTOR * (target.favourites_count + target.reblogs_count)
  );
}

/**
 * Whether a status (or its boost target) reads as a dunk: quoting someone
 * else's post with commentary of your own that carries any rage signal at
 * all. Quoting per se is fine — sharing with added context is the honest use
 * — so only the quote + negativity combination counts.
 */
export function isDunk(status: Status): boolean {
  const target = status.reblog ?? status;
  if (!target.quote) {
    return false;
  }
  return rageScore(stripHtml(target.content)) >= 1;
}

/**
 * Everything Calm mode hides: heated text ({@link isHeated}), dunks
 * ({@link isDunk}), and ratioed posts ({@link isRatioed}). The lexicon reads
 * the words; the other two read the shape of the engagement — outrage that
 * stays politely worded still gets caught by how people responded to it.
 */
export function isCalmHidden(status: Status): boolean {
  return isHeated(status) || isDunk(status) || isRatioed(status);
}
