import type { DictionaryHost, LanguageDictionary } from '../../../lib/dictionary';

/**
 * The languages word lookup supports, each loaded on first use: a language's
 * code and data stay out of every bundle until a reader taps a word in it.
 *
 * To add a language: write `src/lib/dictionary/languages/<name>.ts` returning a
 * {@link LanguageDictionary} (a source, a deinflector), build its data with
 * `scripts/build-dictionaries.mjs`, credit it on the Credits page, and add a
 * line here (and list the file under `entries` in the library's `lib.json`). Korean is next (owner decision 8: English ↔ Chinese, Japanese,
 * Korean in both directions).
 */
const LOADERS: Record<string, () => Promise<LanguageDictionary>> = {
  ja: () => import('../../../lib/dictionary/languages/japanese').then((m) => m.japanese(host())),
  zh: () => import('../../../lib/dictionary/languages/chinese').then((m) => m.chinese(host())),
};

/** Dictionary data is served as static shards under `dict/` beside the app. */
function host(): DictionaryHost {
  return { baseUrl: new URL('dict/', document.baseURI).href, fetchJson };
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Dictionary file unavailable (HTTP ${response.status}).`);
  return response.json();
}

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
    // A failed load (offline, a deploy in progress) may be retried later.
    dictionary.catch(() => loaded.delete(code));
  }
  return dictionary;
}

/** Forget loaded languages. For tests, which must not share a load between environments. */
export function forgetLoadedDictionaries(): void {
  loaded.clear();
}
