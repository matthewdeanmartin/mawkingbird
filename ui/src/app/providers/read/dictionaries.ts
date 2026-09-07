import { LangCode } from '../../language-detect';

/**
 * Where "Define" sends a word.
 *
 * ## The lookup is an intent, not an API
 *
 * Per the brief: selecting a word opens a dictionary in a new tab. There is no
 * key, no quota, no CORS proxy and no request of our own — so there is nothing
 * to fail, nothing to rate-limit, and nothing about the reader's vocabulary
 * that reaches us. A dictionary API would buy an inline definition card and
 * cost all four of those.
 *
 * Inert data, the way `cors-proxy-catalog.ts` and `shortener-catalog.ts` are
 * inert: enough to choose a service, nothing about how the choice is stored.
 */
export interface DictionaryProvider {
  id: DictionaryId;
  label: string;
  /**
   * The lookup URL, with `{word}` where the term goes.
   *
   * Empty for `custom`, whose template is supplied by the reader and validated
   * by {@link isValidDictionaryTemplate} before it is saved.
   */
  url: string;
  /**
   * Per-language hosts, when the service runs one site per language.
   *
   * Wiktionary does: `de.wiktionary.org` is a German dictionary written in
   * German, and sending a reader of a German document to the English entry is
   * the wrong answer to the question they asked. Absent means the provider is
   * monolingual and the language is ignored.
   */
  byLanguage?: Partial<Record<LangCode, string>>;
}

export type DictionaryId = 'wiktionary' | 'merriam' | 'dictionary-com' | 'custom';

/**
 * Wiktionary subdomains we are confident exist and are worth sending people to.
 *
 * Deliberately not "every language the detector can name": a subdomain with a
 * few thousand entries is a worse destination than the English one, and a
 * reader who lands on an empty page learns nothing except that the feature is
 * broken. These are the large editions.
 */
const WIKTIONARY_BY_LANGUAGE: Partial<Record<LangCode, string>> = {
  en: 'https://en.wiktionary.org/wiki/{word}',
  de: 'https://de.wiktionary.org/wiki/{word}',
  fr: 'https://fr.wiktionary.org/wiki/{word}',
  es: 'https://es.wiktionary.org/wiki/{word}',
  pt: 'https://pt.wiktionary.org/wiki/{word}',
  it: 'https://it.wiktionary.org/wiki/{word}',
  nl: 'https://nl.wiktionary.org/wiki/{word}',
  sv: 'https://sv.wiktionary.org/wiki/{word}',
  pl: 'https://pl.wiktionary.org/wiki/{word}',
  ru: 'https://ru.wiktionary.org/wiki/{word}',
  el: 'https://el.wiktionary.org/wiki/{word}',
  fi: 'https://fi.wiktionary.org/wiki/{word}',
  tr: 'https://tr.wiktionary.org/wiki/{word}',
  ja: 'https://ja.wiktionary.org/wiki/{word}',
  ko: 'https://ko.wiktionary.org/wiki/{word}',
  zh: 'https://zh.wiktionary.org/wiki/{word}',
};

/**
 * The dictionaries on offer.
 *
 * Wiktionary is the default: free, no paywall, no account, and — the reason it
 * wins rather than merely qualifies — it has editions in the reader's own
 * language, which the others do not.
 */
export const DICTIONARIES: readonly DictionaryProvider[] = [
  {
    id: 'wiktionary',
    label: 'Wiktionary',
    url: WIKTIONARY_BY_LANGUAGE.en!,
    byLanguage: WIKTIONARY_BY_LANGUAGE,
  },
  {
    id: 'merriam',
    label: 'Merriam-Webster',
    url: 'https://www.merriam-webster.com/dictionary/{word}',
  },
  {
    id: 'dictionary-com',
    label: 'Dictionary.com',
    url: 'https://www.dictionary.com/browse/{word}',
  },
  { id: 'custom', label: 'Custom…', url: '' },
];

export const DEFAULT_DICTIONARY: DictionaryId = 'wiktionary';

/** The provider with this id, or the default when the id is unknown or stale. */
export function dictionaryById(id: string | null | undefined): DictionaryProvider {
  return (
    DICTIONARIES.find((entry) => entry.id === id) ??
    DICTIONARIES.find((entry) => entry.id === DEFAULT_DICTIONARY)!
  );
}

/**
 * Whether a reader-supplied template is safe to save.
 *
 * Two requirements, both load-bearing. It must be `http(s)` — a `javascript:`
 * template would be a self-inflicted XSS on a page that is otherwise careful
 * never to build HTML from user text. And it must contain `{word}`, because a
 * template without it silently ignores the selection and opens the same page
 * every time, which looks like a broken feature rather than a bad setting.
 */
export function isValidDictionaryTemplate(template: string): boolean {
  if (!template.includes('{word}')) {
    return false;
  }
  try {
    const url = new URL(template.replace('{word}', 'word'));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The URL to open for `word`.
 *
 * `{word}` is percent-encoded at substitution: a term can legitimately contain
 * characters that mean something in a URL, and Wiktionary titles in particular
 * are full of them.
 *
 * Returns null when there is nothing usable — an unset custom template, or one
 * that fails validation because it was saved by an older build.
 */
export function dictionaryUrl(
  provider: DictionaryProvider,
  word: string,
  language: LangCode | null = null,
  customTemplate = '',
): string | null {
  const template =
    provider.id === 'custom'
      ? customTemplate
      : (language && provider.byLanguage?.[language]) || provider.url;
  if (!template || !isValidDictionaryTemplate(template)) {
    return null;
  }
  return template.replace('{word}', encodeURIComponent(word));
}

/**
 * Whether a selection is a single word worth offering `Define` for.
 *
 * "One word" is stricter than "no spaces", and each clause pays for itself:
 *
 * - **No whitespace**, so a phrase goes to the highlight tool instead. Offering
 *   both on every selection makes each one harder to hit.
 * - **At least two characters**, because a stray click that catches one letter
 *   is not a lookup anyone asked for.
 * - **Letters only**, under a Unicode letter class, so accented and non-Latin
 *   words qualify while a selected number, URL or code fragment does not.
 *   Hyphens and apostrophes are allowed *inside* the word — "well-being" and
 *   "l'école" are words — but not at either end, where they are punctuation
 *   the selection happened to catch.
 */
export function isSingleWord(selection: string): boolean {
  const word = selection.trim();
  return word.length >= 2 && /^\p{L}[\p{L}\p{M}'’-]*\p{L}$/u.test(word);
}
