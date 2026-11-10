/**
 * Word lookup (sprint L1): the language-neutral contracts.
 *
 * A language plugs in with three parts, wired in `dictionary-registry.ts`:
 *
 * - a {@link DictionarySource}: where entries come from (today a sharded
 *   static file built by `scripts/build-dictionaries.mjs`; tomorrow perhaps
 *   Wiktionary, or a server);
 * - a {@link Deinflector}: how a surface form maps back to dictionary forms
 *   (食べた → 食べる). Chinese needs none; Korean and English will need their own;
 * - a word length limit for longest-match lookup.
 *
 * Nothing here knows about Japanese or Chinese, so adding a language is a new
 * file under `languages/` and one registry line.
 */

/** One meaning of an entry. */
export interface DictSense {
  /** Part-of-speech tags, as the source spells them (`v1`, `adj-i`); describe with the source. */
  pos: string[];
  glosses: string[];
  /** Usage tags (`uk` usually kana, `sl` slang, `col` colloquial…). */
  misc: string[];
}

/** One dictionary entry. */
export interface DictEntry {
  /** Written forms, preferred first (kanji for Japanese; simplified then traditional for Chinese). */
  forms: string[];
  /** Readings (kana; pinyin). */
  readings: string[];
  senses: DictSense[];
  /** Marked common by the source. */
  common: boolean;
}

/** Who made a dictionary and under which licence: shown on every lookup. */
export interface DictAttribution {
  name: string;
  publisher: string;
  licence: string;
  licenceUrl: string;
  projectUrl: string;
}

/** Facts about the loaded data, for the credits and the popup footer. */
export interface DictManifest {
  id: string;
  language: string;
  version: string;
  date: string | null;
  commonOnly: boolean;
  entries: number;
  shards: number;
  licence: string;
  /** Tag → description, for the tags the data uses. */
  tags: Record<string, string>;
}

/** Where entries for one language come from. */
export interface DictionarySource {
  readonly id: string;
  readonly language: string;
  readonly attribution: DictAttribution;
  /** Entries whose written form or reading is exactly `word`. */
  lookup(word: string): Promise<DictEntry[]>;
  /** A tag's description, or the tag itself. */
  describeTag(tag: string): Promise<string>;
  manifest(): Promise<DictManifest>;
}

/** One way a surface form could be a dictionary form plus inflections. */
export interface Deinflection {
  /** The candidate dictionary form. */
  word: string;
  /** What was undone, outermost last (`past`, `negative`). Empty for the surface form itself. */
  reasons: string[];
  /** Word classes the candidate must belong to, as a bit mask; see the language's deinflector. */
  classes: number;
}

/** Maps surface forms back to dictionary forms, for one language. */
export interface Deinflector {
  deinflect(surface: string): Deinflection[];
  /** Whether `entry` is a word of a class this deinflection allows. */
  accepts(entry: DictEntry, deinflection: Deinflection): boolean;
}

/** Everything word lookup needs for one language. */
export interface LanguageDictionary {
  language: string;
  source: DictionarySource;
  deinflector: Deinflector;
  /** The longest headword worth trying, in characters. */
  maxWordLength: number;
  /** A fuller dictionary site for "More", or null. */
  moreUrl(word: string): string | null;
}

/** The shard a headword lives in. Must match `shardOf` in `scripts/build-dictionaries.mjs`. */
export function dictionaryShard(word: string, shards: number): number {
  return (word.codePointAt(0) ?? 0) % shards;
}

/** The identity deinflector, for languages without inflection (Chinese). */
export const NO_DEINFLECTION: Deinflector = {
  deinflect: (surface) => [{ word: surface, reasons: [], classes: ~0 }],
  accepts: () => true,
};
