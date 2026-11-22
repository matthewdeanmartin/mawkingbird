/**
 * Very common words per language, for "People who post in X"
 * (spec/sprint/moderation-facets-2026-11.md, Sprint 5).
 *
 * Mastodon refuses `language:ms` on its own: a search needs at least one
 * positive word, and words are ANDed, never ORed. So the mode searches
 * `<seed> language:xx` once per seed and merges the authors. A seed has to be
 * frequent in ordinary posts, and not be a word in a neighbouring language
 * that would dominate (`language:` filters those posts out anyway, but each
 * query only returns 40 posts).
 *
 * Each call costs one request from the search budget, so lists are short and
 * ordered most-useful first. CJK seeds are single characters because
 * Mastodon's index splits CJK text per character.
 */
const SEEDS: Record<string, readonly string[]> = {
  ms: ['yang', 'dan', 'saya', 'ini', 'tak', 'untuk', 'dengan', 'kita'],
  id: ['yang', 'dan', 'di', 'ini', 'tidak', 'saya', 'aku', 'untuk'],
  en: ['the', 'and', 'you', 'that', 'with', 'this', 'have', 'from'],
  de: ['und', 'die', 'der', 'ich', 'nicht', 'das', 'ist', 'mit'],
  fr: ['les', 'et', 'est', 'pas', 'pour', 'une', 'que', 'dans'],
  es: ['que', 'los', 'por', 'una', 'para', 'con', 'pero', 'como'],
  pt: ['que', 'não', 'uma', 'para', 'com', 'mais', 'mas', 'isso'],
  it: ['che', 'non', 'per', 'una', 'sono', 'della', 'anche', 'questo'],
  nl: ['het', 'een', 'niet', 'van', 'dat', 'ik', 'maar', 'voor'],
  sv: ['och', 'det', 'att', 'inte', 'som', 'jag', 'för', 'med'],
  da: ['og', 'det', 'ikke', 'jeg', 'til', 'som', 'med', 'har'],
  no: ['og', 'det', 'ikke', 'jeg', 'til', 'som', 'med', 'har'],
  nb: ['og', 'det', 'ikke', 'jeg', 'til', 'som', 'med', 'har'],
  fi: ['ja', 'on', 'ei', 'että', 'se', 'mutta', 'kun', 'niin'],
  pl: ['nie', 'się', 'jest', 'że', 'jak', 'ale', 'tak', 'czy'],
  cs: ['je', 'se', 'na', 'že', 'to', 'ale', 'jsem', 'jak'],
  ca: ['que', 'els', 'amb', 'per', 'una', 'les', 'però', 'més'],
  ro: ['și', 'nu', 'care', 'pentru', 'este', 'mai', 'dar', 'cu'],
  tr: ['bir', 've', 'bu', 'için', 'çok', 'ama', 'ne', 'daha'],
  eo: ['kaj', 'la', 'estas', 'ne', 'mi', 'por', 'kun', 'sed'],
  vi: ['và', 'của', 'là', 'không', 'có', 'một', 'những', 'được'],
  tl: ['ang', 'ng', 'sa', 'mga', 'na', 'ako', 'hindi', 'ko'],
  ru: ['и', 'не', 'что', 'на', 'это', 'как', 'но', 'все'],
  uk: ['і', 'не', 'що', 'на', 'це', 'як', 'але', 'та'],
  el: ['και', 'το', 'να', 'δεν', 'η', 'για', 'με', 'που'],
  ja: ['の', 'は', 'に', 'を', 'が', 'た', 'て', 'で'],
  zh: ['的', '是', '我', '了', '不', '在', '有', '人'],
  ar: ['في', 'من', 'على', 'أن', 'لا', 'ما', 'هذا', 'مع'],
  fa: ['و', 'در', 'به', 'از', 'که', 'این', 'را', 'با'],
  he: ['של', 'את', 'לא', 'על', 'זה', 'עם', 'אני', 'גם'],
  hi: ['है', 'के', 'में', 'की', 'और', 'से', 'को', 'नहीं'],
};

/** Seeds for a language (bare code), most useful first; empty when unknown. */
export function seedWordsFor(language: string): readonly string[] {
  return SEEDS[language.toLowerCase().split(/[-_]/)[0]] ?? [];
}
