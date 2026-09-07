import { longUrls, postLength } from '../../compose/post-length';
import { PkmVocabulary, pkmKinds, pkmLabel } from '../../pkm/pkm-tags';

/**
 * The wizard's quality step: cheap, local, explainable checks on a body about
 * to be published.
 *
 * Every check here is **advisory**. None of them blocks publishing, and none of
 * them is clever. That is deliberate: a check that fires on correct writing is
 * worse than one that misses something, because the first teaches people to
 * click past the whole step and the second merely fails to help once.
 *
 * Spelling is deliberately absent. The browser already draws squiggles in the
 * textarea (`spellcheck="true"`), and shipping a dictionary to do it worse and
 * bigger is not a trade worth making.
 */
export type QualitySeverity = 'info' | 'warn';

export interface QualityFinding {
  id: string;
  severity: QualitySeverity;
  /** Translation key for one line, in the user's terms, naming the thing rather than scolding. */
  messageKey: string;
  /** Interpolation parameters for {@link messageKey}. */
  messageParams?: Record<string, unknown>;
  /** The offending fragments, where naming them helps. */
  samples?: string[];
}

export interface QualityContext {
  /** The instance's per-post limit, for the over-length check. */
  limit: number;
  /** The segments the body will be split into. */
  segments: string[];
  vocab: PkmVocabulary;
  /** Whether any attached media lacks a description. */
  missingAltText?: boolean;
  /** Whether the user asked to be told about that. */
  requireAltText?: boolean;
  /**
   * Resolve a translation key to its text, for embedding inside another
   * finding's message. {@link readabilityBand} returns a key rather than
   * English, so the readability finding needs this to fill in `{{band}}`.
   * Defaults to the identity function, which is only correct in specs that
   * don't care about the rendered band text.
   */
  translateBand?: (key: string) => string;
}

/** Words per sentence and syllables per word, for the readability score. */
interface Prose {
  words: number;
  sentences: number;
  syllables: number;
}

const WORD_RE = /[\p{L}\p{N}']+/gu;

/** Hashtags and URLs are not prose and skew every reading score they touch. */
function proseOnly(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[@#][\p{L}\p{N}_]+/gu, ' ')
    .trim();
}

function measureProse(text: string): Prose {
  const body = proseOnly(text);
  const words = body.match(WORD_RE) ?? [];
  const sentences = body.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 0).length;
  let syllables = 0;
  for (const word of words) {
    syllables += countSyllables(word);
  }
  return { words: words.length, sentences: Math.max(sentences, 1), syllables };
}

/**
 * Approximate syllable count for one word.
 *
 * A vowel-group heuristic, not a dictionary: it gets ordinary English close
 * enough for a score that is only ever shown as a band ("plain", "dense"), and
 * it degrades harmlessly on other languages rather than refusing to run.
 */
export function countSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) {
    return 0;
  }
  if (clean.length <= 3) {
    return 1;
  }
  const trimmed = clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  return Math.max(1, (trimmed.match(/[aeiouy]{1,2}/g) ?? []).length);
}

/**
 * Flesch Reading Ease, 0–100. Higher is plainer.
 *
 * Returns null for anything too short to score — a two-sentence post has no
 * meaningful readability, and printing a number for it would invite people to
 * edit toward a statistic instead of toward a reader.
 */
export function readingEase(text: string): number | null {
  const { words, sentences, syllables } = measureProse(text);
  if (words < MIN_WORDS_FOR_READABILITY) {
    return null;
  }
  const score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
  return Math.round(Math.max(0, Math.min(100, score)));
}

/** Below this, a score says more about the sample size than the writing. */
export const MIN_WORDS_FOR_READABILITY = 60;

/** Where a reading-ease score stops being comfortable. */
export const DENSE_READING_EASE = 40;

// i18n pages.write.readability.plain: plain
// i18n pages.write.readability.ordinary: ordinary
// i18n pages.write.readability.firmGoing: firm going
// i18n pages.write.readability.dense: dense
/** Translation key for a reading-ease score's band. */
export function readabilityBand(score: number): string {
  if (score >= 70) {
    return 'pages.write.readability.plain';
  }
  if (score >= 50) {
    return 'pages.write.readability.ordinary';
  }
  if (score >= DENSE_READING_EASE) {
    return 'pages.write.readability.firmGoing';
  }
  return 'pages.write.readability.dense';
}

/** Consecutive repeats of the same word ("the the"). */
export function repeatedWords(text: string): string[] {
  const found: string[] = [];
  const words = proseOnly(text).match(WORD_RE) ?? [];
  for (let i = 1; i < words.length; i++) {
    if (words[i].toLowerCase() === words[i - 1].toLowerCase()) {
      found.push(words[i].toLowerCase());
    }
  }
  return [...new Set(found)];
}

/** Runs of shouted words. Acronyms are not shouting, so require length and a run. */
export const CAPS_RUN_MIN = 3;

export function capsRuns(text: string): string[] {
  const runs: string[] = [];
  let current: string[] = [];
  for (const word of proseOnly(text).split(/\s+/)) {
    const bare = word.replace(/[^\p{L}]/gu, '');
    if (bare.length > 2 && bare === bare.toUpperCase() && /\p{Lu}/u.test(bare)) {
      current.push(bare);
    } else {
      if (current.length >= CAPS_RUN_MIN) {
        runs.push(current.join(' '));
      }
      current = [];
    }
  }
  if (current.length >= CAPS_RUN_MIN) {
    runs.push(current.join(' '));
  }
  return runs;
}

/** Past this, tags stop being navigation and start being noise. */
export const TAG_NOISE_THRESHOLD = 6;

export function hashtagsIn(text: string): string[] {
  return (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.toLowerCase());
}

/**
 * Run every check over a body.
 *
 * Ordered most-actionable first, because the step is skimmed rather than read.
 */
// i18n pages.write.finding.overLimit.one: One post is over the length limit and will be refused.
// i18n pages.write.finding.overLimit.other: {{count}} posts are over the length limit and will be refused.
// i18n pages.write.finding.pkmTagged: This is tagged {{kinds}} — publishing sends it to your followers.
// i18n pages.write.finding.missingAlt: An attached image has no description.
// i18n pages.write.finding.repeatedWords: A word is repeated back to back.
// i18n pages.write.finding.longLinks: Some links are long enough to look untidy. They cost the same either way — shortening is cosmetic.
// i18n pages.write.finding.caps: A run of words is in capitals.
// i18n pages.write.finding.tagCount: {{count}} hashtags. Past about {{threshold}} they stop helping people find this.
// i18n pages.write.finding.readability: Reads as {{band}} ({{score}}/100). Shorter sentences would help.
export function runQualityChecks(text: string, context: QualityContext): QualityFinding[] {
  const findings: QualityFinding[] = [];

  const over = context.segments.filter((s) => postLength(s) > context.limit);
  if (over.length) {
    findings.push({
      id: 'over-limit',
      severity: 'warn',
      messageKey:
        over.length === 1
          ? 'pages.write.finding.overLimit.one'
          : 'pages.write.finding.overLimit.other',
      messageParams: { count: over.length },
    });
  }

  const pkm = pkmKinds(text, context.vocab);
  if (pkm.length) {
    findings.push({
      id: 'pkm-tagged',
      severity: 'warn',
      messageKey: 'pages.write.finding.pkmTagged',
      messageParams: { kinds: pkm.map((kind) => pkmLabel(kind, context.vocab)).join(' and ') },
    });
  }

  if (context.requireAltText && context.missingAltText) {
    findings.push({
      id: 'missing-alt',
      severity: 'warn',
      messageKey: 'pages.write.finding.missingAlt',
    });
  }

  const repeats = repeatedWords(text);
  if (repeats.length) {
    findings.push({
      id: 'repeated-words',
      severity: 'warn',
      messageKey: 'pages.write.finding.repeatedWords',
      samples: repeats.map((word) => `${word} ${word}`),
    });
  }

  const long = longUrls(text);
  if (long.length) {
    findings.push({
      id: 'long-links',
      severity: 'info',
      messageKey: 'pages.write.finding.longLinks',
      samples: long.map((entry) => entry.url),
    });
  }

  const shouting = capsRuns(text);
  if (shouting.length) {
    findings.push({
      id: 'caps',
      severity: 'info',
      messageKey: 'pages.write.finding.caps',
      samples: shouting,
    });
  }

  const tags = hashtagsIn(text);
  if (tags.length > TAG_NOISE_THRESHOLD) {
    findings.push({
      id: 'tag-count',
      severity: 'info',
      messageKey: 'pages.write.finding.tagCount',
      messageParams: { count: tags.length, threshold: TAG_NOISE_THRESHOLD },
    });
  }

  const ease = readingEase(text);
  if (ease !== null && ease < DENSE_READING_EASE) {
    const translateBand = context.translateBand ?? ((key: string) => key);
    findings.push({
      id: 'readability',
      severity: 'info',
      messageKey: 'pages.write.finding.readability',
      messageParams: { band: translateBand(readabilityBand(ease)), score: ease },
    });
  }

  return findings;
}
