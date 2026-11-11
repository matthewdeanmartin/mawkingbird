import { Deinflection, DictEntry, LanguageDictionary } from './dictionary';

/** A piece of text, as the reader taps it. */
export interface TextToken {
  text: string;
  /** Offset in the source text. */
  index: number;
  /** A word (tappable), rather than spaces or punctuation. */
  word: boolean;
}

/** One entry found, and how the tapped text inflects it. */
export interface LookupHit {
  entry: DictEntry;
  deinflection: Deinflection;
}

/** The longest word found at a tapped position. */
export interface LookupMatch {
  /** The text that matched, as written in the post. */
  surface: string;
  index: number;
  hits: LookupHit[];
}

/**
 * Split text into tappable words with the browser's own segmenter, which
 * knows Japanese, Chinese and Thai word boundaries. Without `Intl.Segmenter`,
 * every character is its own token (still tappable; lookup finds the longest
 * word from there anyway).
 */
export function segmentWords(text: string, language: string): TextToken[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(language, { granularity: 'word' });
    return [...segmenter.segment(text)].map((s) => ({
      text: s.segment,
      index: s.index,
      word: !!s.isWordLike,
    }));
  }
  return [...text].map((ch, index) => ({ text: ch, index, word: /\p{L}/u.test(ch) }));
}

/** Characters that end a word: spaces, punctuation, symbols. */
const BREAK = /[\s\p{P}\p{S}]/u;

/**
 * The longest dictionary word starting at `index`, as Rikaichan does it: try
 * the next `maxWordLength` characters, then one fewer, and so on, each through
 * the deinflector; the first length with an entry wins. So a tap on 食 in
 * 食べなかった finds 食べる (negative, past), not just 食.
 *
 * Hits for the text as written come first, then common words.
 */
export async function lookupAt(
  dictionary: LanguageDictionary,
  text: string,
  index: number,
): Promise<LookupMatch | null> {
  let end = index;
  while (end < text.length && end - index < dictionary.maxWordLength && !BREAK.test(text[end])) {
    end++;
  }
  for (let length = end - index; length > 0; length--) {
    const surface = text.slice(index, index + length);
    const hits: LookupHit[] = [];
    // Entries are rebuilt per lookup, so dedupe by what they say, not identity.
    const seen = new Set<string>();
    for (const deinflection of dictionary.deinflector.deinflect(surface)) {
      const entries = await dictionary.source.lookup(deinflection.word);
      for (const entry of entries) {
        const key = `${entry.forms.join(',')}|${entry.readings.join(',')}`;
        if (seen.has(key) || !dictionary.deinflector.accepts(entry, deinflection)) continue;
        seen.add(key);
        hits.push({ entry, deinflection });
      }
    }
    if (hits.length) {
      hits.sort(
        (a, b) =>
          a.deinflection.reasons.length - b.deinflection.reasons.length ||
          Number(b.entry.common) - Number(a.entry.common),
      );
      return { surface, index, hits };
    }
  }
  return null;
}
