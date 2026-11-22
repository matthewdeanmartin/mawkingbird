/**
 * Every language a Mastodon post can be tagged with, and the two ways a picker
 * should offer them (spec/moderation-facets.md §1).
 *
 * A select that lists 180 languages (or 3000, or 195 countries) is a bad
 * experience. So a picker shows a **short list** ({@link suggestedLanguages}:
 * the reader's own languages and the languages the app is localized into),
 * and a **separate finder** ({@link searchLanguages}) where typing "Malay",
 * "Melayu" or "ms" finds Malay.
 *
 * Names come from `Intl.DisplayNames`, so no name table ships: the reader's
 * locale, the language's own name (endonym) and English are all searchable.
 */

/** ISO 639-1, as Mastodon's LanguagesHelper::ISO_639_1 accepts them. */
const ISO_639_1 = (
  'aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv ' +
  'cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ' +
  'ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ' +
  'ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ' +
  'ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ' +
  'ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi ' +
  'yo za zh zu'
).split(' ');

/** Mastodon's ISO 639-3 additions (LanguagesHelper::ISO_639_3). */
const ISO_639_3 =
  'ast chr ckb cnr csb gsw jbo kab ldn lfn moh nds pdc sco sma smj szl tok vai xal zba zgh'.split(
    ' ',
  );

/** Every code a post may carry, in no particular order. */
export const LANGUAGE_CODES: readonly string[] = [...ISO_639_1, ...ISO_639_3];

/** Names Intl does not know (constructed languages, mostly). English only. */
const FALLBACK_NAMES: Record<string, string> = {
  jbo: 'Lojban',
  ldn: 'Láadan',
  lfn: 'Lingua Franca Nova',
  tok: 'Toki Pona',
  zba: 'Balaibalan',
  cnr: 'Montenegrin',
  bh: 'Bihari',
};

/** Lower-case, accent-free, so "melayu" finds "Melayu" and "espanol" finds "español". */
export function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Normalize a tag ("pt-BR", "zh_Hant", "EN") to a bare lower-case code. */
export function bareLanguageCode(code: string | null | undefined): string {
  return (code ?? '').trim().toLowerCase().split(/[-_]/)[0];
}

const displayNamesCache = new Map<string, Intl.DisplayNames | null>();

function displayNames(locale: string): Intl.DisplayNames | null {
  if (!displayNamesCache.has(locale)) {
    let names: Intl.DisplayNames | null;
    try {
      names = new Intl.DisplayNames([locale, 'en'], { type: 'language', fallback: 'none' });
    } catch {
      names = null;
    }
    displayNamesCache.set(locale, names);
  }
  return displayNamesCache.get(locale)!;
}

function nameIn(code: string, locale: string): string | undefined {
  try {
    const name = displayNames(locale)?.of(code);
    return name && name.toLowerCase() !== code ? name : undefined;
  } catch {
    return undefined;
  }
}

/** The language's name in `locale`, falling back to English, then to the code. */
export function languageName(code: string, locale: string): string {
  return nameIn(code, locale) ?? nameIn(code, 'en') ?? FALLBACK_NAMES[code] ?? code;
}

/** The language's name in itself ("Bahasa Melayu", "Deutsch"), when Intl knows it. */
export function languageEndonym(code: string): string | undefined {
  return nameIn(code, code);
}

export interface LanguageOption {
  code: string;
  /** Name in the reader's locale. */
  name: string;
  /** Name in the language itself, when different from {@link name}. */
  endonym?: string;
}

export function languageOption(code: string, locale: string): LanguageOption {
  const name = languageName(code, locale);
  const endonym = languageEndonym(code);
  return endonym && endonym.toLowerCase() !== name.toLowerCase()
    ? { code, name, endonym }
    : { code, name };
}

/**
 * Languages whose code, local name, endonym or English name matches `query`.
 * Prefix matches rank first, then substring matches; ties sort by name. An
 * empty query returns nothing: the finder shows its short list instead.
 */
export function searchLanguages(query: string, locale: string, limit = 12): LanguageOption[] {
  const q = foldForSearch(query);
  if (!q) return [];
  const scored: { option: LanguageOption; score: number }[] = [];
  for (const code of LANGUAGE_CODES) {
    const option = languageOption(code, locale);
    const english = languageName(code, 'en');
    const haystack = [option.name, option.endonym ?? '', english].map(foldForSearch);
    let score = -1;
    if (code === q) score = 0;
    else if (haystack.some((h) => h === q)) score = 1;
    else if (
      haystack.some((h) => h.startsWith(q) || h.split(/[\s(,]+/).some((w) => w.startsWith(q)))
    )
      score = 2;
    else if (code.startsWith(q)) score = 3;
    else if (q.length >= 3 && haystack.some((h) => h.includes(q))) score = 4;
    if (score >= 0) scored.push({ option, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.option.name.localeCompare(b.option.name, locale))
    .slice(0, limit)
    .map((s) => s.option);
}

/** A group of options for a short picker list. */
export interface LanguageGroup {
  kind: 'current' | 'yours' | 'app';
  options: LanguageOption[];
}

/**
 * The short list a select may show: the current choice when it came from
 * elsewhere, the reader's own languages, then the app's localizations. Each
 * code appears once, in the first group that has it. Codes are bare
 * ("zh-Hant" → "zh") because that is what Mastodon's `language:` takes.
 */
export function suggestedLanguages(
  current: string,
  userLanguages: Iterable<string>,
  appLanguages: Iterable<string>,
  locale: string,
): LanguageGroup[] {
  const seen = new Set<string>();
  const take = (codes: Iterable<string>): LanguageOption[] => {
    const out: LanguageOption[] = [];
    for (const raw of codes) {
      const code = bareLanguageCode(raw);
      if (!code || code === 'und' || seen.has(code)) continue;
      seen.add(code);
      out.push(languageOption(code, locale));
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, locale));
  };
  const yours = take(userLanguages);
  const app = take(appLanguages);
  const currentCode = bareLanguageCode(current);
  const groups: LanguageGroup[] = [];
  if (currentCode && !seen.has(currentCode)) {
    groups.push({ kind: 'current', options: [languageOption(currentCode, locale)] });
  }
  if (yours.length) groups.push({ kind: 'yours', options: yours });
  if (app.length) groups.push({ kind: 'app', options: app });
  return groups;
}
