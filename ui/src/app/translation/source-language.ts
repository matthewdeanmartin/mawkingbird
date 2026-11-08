import { bareLanguage } from './language-codes';

/** What the local detector concluded about a post. */
export interface DetectedLanguage {
  /** A single established language, or null when the detector is not confident. */
  language: string | null;
  /** Unranked possibilities, best first where the detector can tell. */
  candidates: readonly string[];
}

/**
 * Which language to translate from, or why we cannot say.
 *
 * - `source`: translate from this. `fromTag` says whether it is the post's declared
 *   language — the only source Mastodon's endpoint will ever use, so the server is
 *   only worth asking when it is true.
 * - `same`: the post is confidently already in the target language.
 * - `ask`: nothing trustworthy; a reader who pressed the button picks the language,
 *   automatic translation skips the post.
 */
export type SourceDecision =
  | { kind: 'source'; source: string; fromTag: boolean }
  | { kind: 'same'; language: string }
  | { kind: 'ask'; candidates: string[] };

/**
 * Decide the source language from the declared tag and the local detector.
 *
 * Detection wins over a contradicting tag: clients routinely stamp posts with the
 * composer's UI locale, so "a German post declared `en`" is common, and Mastodon
 * would translate it from English — i.e. hand it back unchanged, or refuse it.
 */
export function resolveSource(
  declared: string | null | undefined,
  detected: DetectedLanguage,
  target: string,
): SourceDecision {
  const tag = bareLanguage(declared);
  const want = bareLanguage(target);
  const found = bareLanguage(detected.language);
  const declaredUsable = !!tag && tag !== 'und';

  if (found && found !== 'und') {
    if (found === want) return { kind: 'same', language: found };
    return { kind: 'source', source: found, fromTag: declaredUsable && found === tag };
  }
  if (declaredUsable && tag !== want) {
    return { kind: 'source', source: tag, fromTag: true };
  }
  const candidates = [
    ...new Set(
      detected.candidates
        .map(bareLanguage)
        .filter((code) => code && code !== 'und' && code !== want),
    ),
  ];
  return { kind: 'ask', candidates };
}
