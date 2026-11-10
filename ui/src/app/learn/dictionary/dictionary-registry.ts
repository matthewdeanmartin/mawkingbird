import { LanguageDictionary } from './dictionary';

/**
 * The languages word lookup supports, each loaded on first use: a language's
 * code and data stay out of every bundle until a reader taps a word in it.
 *
 * To add a language: write `languages/<name>.ts` returning a
 * {@link LanguageDictionary} (a source, a deinflector), build its data with
 * `scripts/build-dictionaries.mjs`, credit it on the Credits page, and add a
 * line here. Korean is next (owner decision 8: English ↔ Chinese, Japanese,
 * Korean in both directions).
 */
const LOADERS: Record<string, () => Promise<LanguageDictionary>> = {
  ja: () => import('./languages/japanese').then((m) => m.japanese()),
  zh: () => import('./languages/chinese').then((m) => m.chinese()),
};

const loaded = new Map<string, Promise<LanguageDictionary>>();

/** The bare language code (`zh-Hant` → `zh`). */
function bare(language: string): string {
  return language.toLowerCase().split(/[-_]/)[0];
}

/** Whether word lookup exists for this language at all. */
export function hasDictionary(language: string | null | undefined): boolean {
  return !!language && bare(language) in LOADERS;
}

/** The dictionary for a language, loading its code on first ask. */
export function dictionaryFor(language: string): Promise<LanguageDictionary> | null {
  const code = bare(language);
  const loader = LOADERS[code];
  if (!loader) return null;
  let dictionary = loaded.get(code);
  if (!dictionary) {
    dictionary = loader();
    loaded.set(code, dictionary);
  }
  return dictionary;
}
