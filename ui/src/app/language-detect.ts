/**
 * Dependency-free, bounded language identification for social prose.
 * Script evidence narrows the candidates first. Shared scripts need lexical
 * clues; Latin text needs several distinct clues with a clear winning margin.
 * Repeated words, shared accents and identifiers cannot manufacture confidence.
 *
 * Unresolved text is attributed to und. Shares describe attributed prose, not
 * calibrated probabilities. Warnings and filters use confidentLanguage(); an
 * account's mix aggregates these shares across posts. No model, API or network.
 * The Python port and shared adversarial corpus live in mawkingbird_starters.
 */

/** ISO 639-1 codes this module can name. `und` = undetermined. */
export type LangCode =
  | 'en'
  | 'de'
  | 'fr'
  | 'es'
  | 'pt'
  | 'it'
  | 'nl'
  | 'sv'
  | 'da'
  | 'no'
  | 'fi'
  | 'pl'
  | 'tr'
  | 'ru'
  | 'uk'
  | 'el'
  | 'ja'
  | 'ko'
  | 'zh'
  | 'ar'
  | 'he'
  | 'hi'
  | 'th'
  | 'eo'
  | 'cs'
  | 'ca'
  | 'id'
  | 'vi'
  | 'bn'
  | 'ta'
  | 'te'
  | 'fa'
  | 'ro'
  // Nameable and selectable, but with no lexical rules below: the detector has never
  // claimed to identify it, and adding the name does not change that. An Icelandic post
  // therefore stays "undetermined" unless it declares `is` — which is the safe way
  // round, since undetermined is never hidden.
  | 'is'
  | 'und';

/** One language's share of a text, 0–1. */
export interface LangShare {
  lang: LangCode;
  /** Fraction of the analyzed text attributed to this language (0–1). */
  share: number;
}

/** Human-facing names for the codes we emit, for UI labels. */
export const LANG_NAMES: Record<LangCode, string> = {
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  pt: 'Portuguese',
  it: 'Italian',
  nl: 'Dutch',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  pl: 'Polish',
  tr: 'Turkish',
  ru: 'Russian',
  uk: 'Ukrainian',
  el: 'Greek',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  he: 'Hebrew',
  hi: 'Hindi',
  th: 'Thai',
  eo: 'Esperanto',
  cs: 'Czech',
  ca: 'Catalan',
  id: 'Indonesian',
  vi: 'Vietnamese',
  bn: 'Bengali',
  ta: 'Tamil',
  te: 'Telugu',
  fa: 'Persian',
  ro: 'Romanian',
  is: 'Icelandic',
  und: 'Unknown',
};

/** Named languages that can be selected as a posting default. */
export const POSTING_LANGUAGE_OPTIONS = (Object.entries(LANG_NAMES) as [LangCode, string][])
  .filter(([code]) => code !== 'und')
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

// ---------------------------------------------------------------------------
// Tier 1: script detection (Unicode ranges)
// ---------------------------------------------------------------------------

/**
 * Unicode script buckets. Their labels are internal hints, not language
 * verdicts: refineScript resolves shared alphabets or returns und.
 */
const SCRIPT_RANGES: { lang: LangCode; re: RegExp }[] = [
  { lang: 'ja', re: /[぀-ゟ゠-ヿ]/ }, // Hiragana + Katakana ⇒ Japanese
  { lang: 'ko', re: /[가-힯ᄀ-ᇿ㄰-㆏]/ }, // Hangul
  { lang: 'el', re: /[Ͱ-Ͽ]/ }, // Greek
  { lang: 'ru', re: /[Ѐ-ӿ]/ }, // Cyrillic (defaults to Russian; uk refined below)
  { lang: 'ar', re: /[؀-ۿ]/ }, // Arabic
  { lang: 'he', re: /[֐-׿]/ }, // Hebrew
  { lang: 'hi', re: /[ऀ-ॿ]/ }, // Devanagari ⇒ Hindi
  { lang: 'bn', re: /[ঀ-৿]/ },
  { lang: 'ta', re: /[஀-௿]/ },
  { lang: 'te', re: /[ఀ-౿]/ },
  { lang: 'th', re: /[฀-๿]/ }, // Thai
];

const HAN_RE = /\p{Script=Han}/u; // CJK Unified Ideographs
const KANA_RE = /[぀-ゟ゠-ヿ]/;
/** Cyrillic letters unique to Ukrainian (ї, і, є, ґ) disambiguate ru vs uk. */
const UKRAINIAN_RE = /[іїєґ]/i;

/**
 * Classify a single non-Latin character run's script. Returns null if the
 * character is Latin/ASCII/punctuation (handled by the Latin path instead).
 */
function scriptFor(ch: string): LangCode | null {
  if (!/\p{L}/u.test(ch)) return null;
  if (KANA_RE.test(ch)) {
    return 'ja';
  }
  if (HAN_RE.test(ch)) {
    // The Han bucket is resolved with context by refineScript.
    return 'zh';
  }
  for (const { lang, re } of SCRIPT_RANGES) {
    if (re.test(ch)) {
      return lang;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tier 2: diacritic fingerprints (Latin scripts)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tier 3: stop-word tables (top function words per Latin-script language)
// ---------------------------------------------------------------------------

/**
 * The highest-frequency function words per language. Seeing many of these is
 * the classic cheap signal ("lots of the/of/and ⇒ English"). Kept compact —
 * ~20–30 words each — because this runs per post.
 *
 * **A word that appears in more than one table does not vote.** See
 * {@link DISCRIMINATING_WORDS}. These tables may therefore contain collisions
 * freely: "in" can stay under both `en` and `de`, and simply stops counting. That
 * keeps each table a readable list of a language's common words rather than a
 * hand-pruned set that must be re-audited whenever a language is added.
 */
const STOP_WORDS: Partial<Record<LangCode, string[]>> = {
  cs: 'je jsou jsem jsme není nebo protože který která také velmi dnes tento tato všechno ještě'.split(
    ' ',
  ),
  ca: 'els les amb per una que aquest aquesta això però perquè també nosaltres vosaltres molt avui'.split(
    ' ',
  ),
  id: 'yang dan untuk dengan adalah dari ini itu tidak saya kami kita mereka karena juga dalam akan sudah bisa'.split(
    ' ',
  ),
  vi: 'và là của tôi bạn những một không được người trong có cho với này chúng đang tiếng rất'.split(
    ' ',
  ),
  ro: 'și în este sunt pentru care că nu din cu această acesta aceasta avem foarte astăzi mai noi voi'.split(
    ' ',
  ),
  fi: 'ja on ei että se hän mutta kun niin kuin myös tämä ovat minä sinä meidän kanssa koska tänään'.split(
    ' ',
  ),
  no: 'og er det en et som på ikke jeg vi til med den har men også dette denne fordi fra eller noe noen mye gjøre etter'.split(
    ' ',
  ),
  da: 'og er det en et som på ikke jeg vi til med den har men også dette denne fordi fra eller'.split(
    ' ',
  ),
  tr: 'bir bu ve için ile değil çok daha ben sen biz olan olarak ama gibi bugün çünkü var'.split(
    ' ',
  ),
  en: [
    'there',
    'their',
    'them',
    'our',
    'will',
    'would',
    'could',
    'should',
    'about',
    'these',
    'those',
    'which',
    'into',
    'been',
    'being',
    'does',
    'doing',
    'did',
    'some',
    'any',
    'only',
    'each',
    'other',
    'than',
    'then',
    'here',
    'where',
    'how',
    'why',
    'who',
    'had',
    'more',
    'most',
    'while',
    'cannot',
    'another',
    'never',
    'after',
    'before',
    'because',
    'the',
    'of',
    'and',
    'to',
    'in',
    'is',
    'you',
    'that',
    'it',
    'for',
    'was',
    'on',
    'are',
    'with',
    'as',
    'this',
    'have',
    'from',
    'they',
    'be',
    'at',
    'not',
    'but',
    'what',
    'all',
    'were',
    'we',
    'when',
    'your',
    'can',
  ],
  de: [
    'ihm',
    'doch',
    'worden',
    'einer',
    'einem',
    'einen',
    'diese',
    'dieser',
    'wird',
    'der',
    'die',
    'und',
    'in',
    'den',
    'von',
    'zu',
    'das',
    'mit',
    'sich',
    'des',
    'auf',
    'für',
    'ist',
    'im',
    'dem',
    'nicht',
    'ein',
    'eine',
    'als',
    'auch',
    'es',
    'an',
    'werden',
    'aus',
    'er',
    'hat',
    'dass',
    'sie',
    'nach',
  ],
  fr: [
    'suis',
    'sont',
    'était',
    'étaient',
    'le',
    'la',
    'les',
    'de',
    'des',
    'un',
    'une',
    'et',
    'est',
    'que',
    'qui',
    'dans',
    'pour',
    'pas',
    'sur',
    'au',
    'avec',
    'ne',
    'se',
    'ce',
    'il',
    'elle',
    'nous',
    'vous',
    'plus',
    'par',
    'je',
    'mais',
    'ou',
    'son',
  ],
  es: [
    'mucho',
    'todo',
    'esto',
    'estoy',
    'estamos',
    'donde',
    'el',
    'la',
    'los',
    'las',
    'de',
    'que',
    'y',
    'en',
    'un',
    'una',
    'por',
    'con',
    'no',
    'una',
    'su',
    'para',
    'es',
    'se',
    'del',
    'al',
    'lo',
    'como',
    'más',
    'pero',
    'sus',
    'le',
    'ya',
    'este',
    'sí',
    'porque',
  ],
  pt: [
    'tudo',
    'isso',
    'pouco',
    'de',
    'que',
    'não',
    'os',
    'as',
    'um',
    'uma',
    'para',
    'com',
    'por',
    'se',
    'na',
    'no',
    'dos',
    'das',
    'mais',
    'como',
    'mas',
    'ao',
    'ele',
    'das',
    'seu',
    'sua',
    'ou',
    'quando',
    'muito',
    'já',
    'está',
    'também',
    'pelo',
  ],
  it: [
    'molto',
    'mio',
    'oggi',
    'perché',
    'siamo',
    'il',
    'di',
    'che',
    'la',
    'le',
    'un',
    'una',
    'in',
    'per',
    'con',
    'non',
    'sono',
    'gli',
    'del',
    'della',
    'da',
    'si',
    'come',
    'più',
    'ma',
    'anche',
    'lo',
    'se',
    'ci',
    'ha',
    'al',
    'nel',
    'sono',
    'questo',
    'io',
  ],
  nl: [
    'de',
    'het',
    'een',
    'van',
    'en',
    'in',
    'te',
    'dat',
    'op',
    'voor',
    'met',
    'zijn',
    'niet',
    'aan',
    'er',
    'maar',
    'om',
    'ook',
    'als',
    'dan',
    'ze',
    'zo',
    'door',
    'over',
    'ze',
    'nog',
    'wordt',
    'naar',
    'is',
    'ik',
  ],
  sv: [
    'och',
    'att',
    'det',
    'som',
    'en',
    'på',
    'är',
    'av',
    'för',
    'med',
    'till',
    'den',
    'har',
    'de',
    'inte',
    'om',
    'ett',
    'men',
    'var',
    'jag',
    'sig',
    'så',
    'kan',
    'man',
    'care',
    'ten',
    'son',
    'hat',
    'van',
    'door',
    'den',
    'när',
    'vi',
    'nu',
    'han',
    'från',
    'eller',
  ],
  pl: [
    'nie',
    'to',
    'się',
    'na',
    'że',
    'jest',
    'do',
    'co',
    'jak',
    'ale',
    'tak',
    'za',
    'od',
    'być',
    'czy',
    'już',
    'tylko',
    'przez',
    'dla',
    'ten',
    'oraz',
    'jego',
    'jej',
    'tego',
    'ich',
    'przy',
    'bardzo',
    'gdy',
    'więc',
    'lub',
  ],
  // Esperanto. Chosen for *discrimination*, not raw frequency: "la", "de",
  // "en", "por", "kun", "al" are all shared with Spanish, French or Italian and
  // would hand those languages free votes. The high-value entries are the ones
  // no Romance language has — the -as/-is/-os verb endings of esti, the
  // ki-/ti-/ĉi- correlatives, and the accusative pronouns in -n.
  eo: [
    'ĉu',
    'saluton',
    'hodiaŭ',
    'hodiaux',
    'kaj',
    'estas',
    'estis',
    'estos',
    'oni',
    'ĉi',
    'tio',
    'tiu',
    'kiu',
    'kio',
    'kiel',
    'kiam',
    'kie',
    'ĉiu',
    'ĉio',
    'ankaŭ',
    'nur',
    'sed',
    'aŭ',
    'ne',
    'jes',
    'mi',
    'vi',
    'li',
    'ŝi',
    'ĝi',
    'ni',
    'ili',
    'min',
    'lin',
    'ĝin',
    'ilin',
    'sia',
    'siaj',
    'esti',
    'havas',
    'povas',
    'devas',
    'iĝas',
    'pri',
    'per',
    'sen',
    'tre',
    'jam',
    'nun',
    'tamen',
    'ĉar',
    'ke',
    'ol',
  ],
};

/**
 * Words that belong to exactly one language's table, mapped to that language.
 *
 * ## Why ambiguous words are dropped rather than shared
 *
 * The previous scheme gave a full vote to *every* language containing a word, on the
 * theory that the right answer would still collect the most hits. It does win — but the
 * losers keep their votes, and shares are computed from the total, so a correct answer
 * arrives diluted and surrounded by languages that were never plausible.
 *
 * Measured on this app's own tables, that was not a rounding error. Of 269 stop words,
 * 36 collide, and they are concentrated in the highest-frequency slots: "de" is in five
 * tables, "in" in four, "la"/"le"/"un"/"que"/"se" across the Romance block. The effect
 * on real text:
 *
 *   "this is a good example of what we can do with it"  →  en:80 **nl:10 pl:10**
 *   "el gato esta en la casa y no se por que..."        →  es:44 **pt:19 fr:15 it:11**
 *
 * A fifth of a plainly-English sentence attributed to Dutch and Polish is not a
 * cosmetic problem: `FeedLanguageFilter` gates on a 0.6 share, so dilution turns
 * confident text into "uncertain" and the analytics page reports languages the user has
 * never written a word of.
 *
 * A word in two tables cannot discriminate between them — that is what ambiguity means —
 * so counting it adds noise to both and information to neither. Dropping it costs only
 * the words that were never evidence. What remains is each language's *exclusive*
 * vocabulary, which is what a vote should be counted on.
 *
 * The cost is real and accepted: a language whose common words are mostly shared (the
 * Romance block) has fewer signals left, so short Romance texts more often come back
 * undetermined. That is the trade the user asked for and the right one for this app —
 * "we don't know" is a safe answer everywhere it is consumed (undetermined text is never
 * hidden and never auto-translated), while "this English is Dutch" is not.
 */
/**
 * Words that are common in a language whose table does not happen to list them.
 *
 * Comparing tables catches a word claimed by two languages, but not a word claimed by
 * one and merely *frequent* in another. Those are the more damaging case, because the
 * table comparison certifies them as exclusive evidence:
 *
 *   "do"   is a Polish preposition, and one of the commonest verbs in English
 *   "an"   is a German article, and the English indefinite article
 *   "over" is Dutch, and an everyday English word
 *   "come" is Italian, and an everyday English word
 *   "man"  is Swedish, and an everyday English word
 *
 * Each was voting for a language the text was not in — "do" alone put ~10% Polish on
 * every English sentence containing it, because English's own table omits it.
 *
 * Listing them here rather than adding them to the English table is deliberate: they
 * should count for *nobody*. Adding "do" to `en` would make it ambiguous and drop it,
 * which is the same outcome by a longer route — but it would also imply "do" is useful
 * English evidence, and the next person to prune the English table might re-remove it
 * and silently restore this bug.
 *
 * This list is necessarily incomplete; it holds the cases measured against real text.
 * The rule for adding one: a word that a language's table claims exclusively, but that
 * a reader of another language would use without noticing.
 */
const HOMOGRAPHS = new Set([
  // Claimed by another table, common in English.
  'do',
  'an',
  'over',
  'come',
  'man',
  // Polish "ich" (their) is also the German word for "I" — one of the most frequent
  // words in German, and absent from its table, so it was scoring German text as
  // partly Polish.
  'ich',
]);

const DISCRIMINATING_WORDS = (() => {
  const owners = new Map<string, Set<LangCode>>();
  for (const [lang, words] of Object.entries(STOP_WORDS) as [LangCode, string[]][]) {
    for (const w of words) {
      const set = owners.get(w);
      if (set) {
        set.add(lang);
      } else {
        owners.set(w, new Set([lang]));
      }
    }
  }
  const map = new Map<string, LangCode>();
  for (const [word, langs] of owners) {
    if (langs.size === 1 && !HOMOGRAPHS.has(word)) {
      map.set(word, [...langs][0]);
    }
  }
  return map;
})();

// ---------------------------------------------------------------------------
// Tier 2b: language-exclusive letters (for short strings like hashtags)
// ---------------------------------------------------------------------------

/** Distinctive spelling among supported languages, usable with context.
 * Shared marks (é, ö, ã, õ) are deliberately absent. Portuguese needs ç plus
 * its nasal ending because Vietnamese shares the tilde vowels. Conflicting
 * spellings never use first-match-wins. Borrowed names still need prose clues.
 */
const EXCLUSIVE_LETTERS: { lang: LangCode; re: RegExp }[] = [
  { lang: 'de', re: /ß/ },
  { lang: 'es', re: /[ñ¿¡]/i },
  { lang: 'pt', re: /ç(?:ão|ões)/i },
  { lang: 'cs', re: /[řů]/i },
  { lang: 'ro', re: /[șț]/i },
  { lang: 'vi', re: /[ắằẳẵặấầẩẫậếềểễệốồổỗộớờởỡợứừửữựỳỷỹỵạẹịọụảẻỉỏủ]/i },
  { lang: 'pl', re: /[łżźąę]/i },
  { lang: 'tr', re: /[ıİğĞ]/ }, // dotless ı, dotted İ, soft ğ/Ğ — all Turkish
  // Esperanto's circumflexed consonants and the breve ŭ. No other language
  // here uses them; ĝ is distinct from Turkish ğ (circumflex vs breve), and ĥ
  // has no counterpart at all. A single one settles a lone hashtag.
  { lang: 'eo', re: /[ĉĝĥĵŝŭ]/i },
];

/** Esperanto transliteration requires a following vowel and grammar support.
 * ux is excluded: Linux, jeux and animaux are not Esperanto evidence.
 */
const X_SYSTEM_RE = /\b[a-z]*(?:cx|gx|hx|jx|sx)[aeiou][a-z]*\b/gi;

/** Plural/case endings only corroborate independent Esperanto word clues. */
const EO_STRONG_ENDING_RE = /^[a-z]{2,}(?:ojn|ajn|oj|aj)$/;

/** Normalize a possibly-regioned ISO code ("en-US", "pt_BR") to a bare code. */
function normalizeIso(code: string | null | undefined): LangCode | null {
  if (!code) {
    return null;
  }
  const base = code.toLowerCase().split(/[-_]/)[0];
  return Object.hasOwn(LANG_NAMES, base) ? (base as LangCode) : null;
}

/** A share measures supported text, never a probability of being correct. */
export const CONFIDENT_LANGUAGE_SHARE = 0.85;
const MIN_DISTINCT_WORDS = 3;

/** Bound work, normalize composed/compatibility letters, and remove non-prose. */
function detectionText(text: string): string {
  return text
    .slice(0, 12000)
    .normalize('NFKC')
    .replace(/\x60\x60\x60[\s\S]*?(?:\x60\x60\x60|$)|\x60[^\x60\n]*\x60/g, ' ')
    .replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|@[\p{L}\p{N}_.@-]+/giu, ' ')
    .replace(/:[a-z0-9_+-]+:/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];
}

/** Only corroborated evidence names a Latin language. Repetition adds nothing. */
function latinLanguage(text: string): LangCode | null {
  const unique = new Set(words(text));
  const evidence = new Map<LangCode, Set<string>>();
  const add = (lang: LangCode, word: string) => {
    const hits = evidence.get(lang) ?? new Set<string>();
    hits.add(word);
    evidence.set(lang, hits);
  };
  for (const token of unique) {
    const lang = DISCRIMINATING_WORDS.get(token);
    if (lang) add(lang, token);
  }
  // Morphology corroborates Esperanto grammar. It cannot establish a language
  // from an identifier or coincidental English/Romance word endings.
  if ((evidence.get('eo')?.size ?? 0) >= 1) {
    for (const token of unique) {
      X_SYSTEM_RE.lastIndex = 0;
      if (X_SYSTEM_RE.test(token) || EO_STRONG_ENDING_RE.test(token)) add('eo', token);
    }
  }
  X_SYSTEM_RE.lastIndex = 0;
  const ranked = [...evidence].sort((a, b) => b[1].size - a[1].size);
  const [leader, runner] = ranked;
  const best = leader?.[1].size ?? 0;
  const total = ranked.reduce((sum, [, hits]) => sum + hits.size, 0);
  if (
    leader &&
    best >= MIN_DISTINCT_WORDS &&
    best >= 3 * (runner?.[1].size ?? 0) &&
    best / total >= 0.75 &&
    best / Math.max(1, unique.size) >= 0.15
  )
    return leader[0];

  // A borrowed name does not establish the language of a whole sentence.
  const marked = new Map<LangCode, number>();
  for (const token of unique) {
    for (const { lang, re } of EXCLUSIVE_LETTERS) {
      if (re.test(token)) marked.set(lang, (marked.get(lang) ?? 0) + 1);
    }
  }
  if (marked.size === 1) {
    const [lang, count] = [...marked][0];
    const hits = evidence.get(lang)?.size ?? 0;
    const other = ranked
      .filter(([candidate]) => candidate !== lang)
      .reduce((sum, [, set]) => sum + set.size, 0);
    if (
      other === 0 &&
      ((unique.size <= 2 && count >= 1) ||
        (hits >= 2 && count >= 1) ||
        (count >= 2 && count / unique.size >= 0.3))
    )
      return lang;
  }
  return null;
}

/** Shared alphabets still need language clues. */
function refineScript(script: LangCode, text: string, meta: LangCode | null): LangCode {
  const lower = script === 'ar' ? text.toLowerCase().replace(/\p{M}/gu, '') : text.toLowerCase();
  const tokens = new Set(words(lower));
  const hits = (list: string) => list.split(' ').filter((word) => tokens.has(word)).length;
  if (script === 'el' && !/[Ͱ-Ͽ]{3}/.test(lower)) return 'und';
  if (script === 'zh') {
    // Common grammatical sequences, Traditional and Simplified alike.
    const chinese =
      /(這是|这是|我們|我们|他們|他们|這個|这个|沒有|没有|因為|因为|什麼|什么|謝謝|谢谢|中文|漢語|汉语)/.test(
        text,
      );
    if (KANA_RE.test(text)) return chinese ? 'und' : 'ja';
    if (/[가-힯ᄀ-ᇿ㄰-㆏]/.test(text)) return chinese ? 'und' : 'ko';
    if (chinese) return 'zh';
    return meta === 'zh' || meta === 'ja' || meta === 'ko' ? meta : 'und';
  }
  if (script === 'ru') {
    if (/[ўјљњћђџқңүұөҳҷ]/u.test(lower)) return 'und';
    const ukrainian =
      /[їєґ]/.test(lower) ||
      (UKRAINIAN_RE.test(lower) &&
        hits('це як світ привіт для що та український українською') >= 1);
    const russianHits = hits(
      'это этот что как сегодня привет русском русский языке мы вы его она есть',
    );
    const russian = russianHits >= 2 || (russianHits >= 1 && /[ыэё]/.test(lower));
    if (ukrainian && russian) return 'und';
    if (ukrainian) return 'uk';
    if (russian) return 'ru';
    return meta === 'ru' || meta === 'uk' ? meta : 'und';
  }
  if (script === 'ar') {
    if (/[ٹڈڑںھہے]/.test(lower)) return 'und';
    const persian = hits('این است برای که را از یک') >= 2;
    const arabic = hits(
      'هذا هذه ذلك تلك الذي التي الذين نحن أن إن على إلى في مع عربي العربية مرحبا',
    );
    const arabicEvidence = arabic >= 2 || (arabic >= 1 && /ال/.test(lower));
    if (persian && arabicEvidence) return 'und';
    if (persian) return 'fa';
    if (/[پچژگ]/.test(lower)) return meta === 'fa' ? 'fa' : 'und';
    if (arabicEvidence) return 'ar';
    return meta === 'ar' || meta === 'fa' ? meta : 'und';
  }
  if (script === 'bn' && /[ৰৱ]/.test(lower)) return 'und';
  if (script === 'hi' && hits('आहे आणि नाही आम्ही छ छन्') > 0) return 'und';
  return script;
}

/**
 * Attribute supported prose to languages; ambiguous text stays undetermined.
 * Metadata is a fallback, not a competing vote or a way around script evidence.
 */
export function detectLanguage(text: string, metaHint?: string | null): LangShare[] {
  const clean = detectionText(text);
  const meta = normalizeIso(metaHint);
  const totals = new Map<LangCode, number>();
  const add = (lang: LangCode, n: number) => totals.set(lang, (totals.get(lang) ?? 0) + n);
  for (const line of clean.split(/\n+/)) {
    const scripts = new Map<LangCode, number>();
    let latin = '';
    let latinCount = 0;
    for (const ch of line) {
      if (!/\p{L}/u.test(ch)) {
        latin += ch;
        continue;
      }
      const script = scriptFor(ch);
      if (script) {
        scripts.set(script, (scripts.get(script) ?? 0) + 1);
        latin += ' ';
      } else if (/\p{Script=Latin}/u.test(ch)) {
        latin += ch;
        latinCount++;
      } else {
        add('und', 1);
        latin += ' ';
      }
    }
    for (const [script, count] of scripts) add(refineScript(script, line, meta), count);
    if (latinCount) {
      add(latinLanguage(latin) ?? (!scripts.size ? meta : null) ?? 'und', latinCount);
    }
  }
  const total = [...totals.values()].reduce((a, b) => a + b, 0);
  if (!total) return [{ lang: 'und', share: 1 }];
  return [...totals]
    .map(([lang, count]) => ({ lang, share: count / total }))
    .sort((a, b) => b.share - a.share || a.lang.localeCompare(b.lang));
}

/** For warnings and filters, supported evidence must dominate actual prose. */
export function confidentLanguage(text: string): LangCode | null {
  const [top] = detectLanguage(text);
  return top.lang !== 'und' && top.share >= CONFIDENT_LANGUAGE_SHARE ? top.lang : null;
}

/**
 * Aggregate a language distribution across many texts (e.g. a post sample),
 * each optionally carrying its own metadata hint. Returns shares that sum to ~1,
 * sorted most-used first, with tiny slivers below `minShare` folded into `und`.
 */
export function detectLanguageMix(
  items: { text: string; meta?: string | null }[],
  minShare = 0.01,
): LangShare[] {
  const totals = new Map<LangCode, number>();
  let counted = 0;
  for (const { text, meta } of items) {
    if (!text.trim()) {
      continue;
    }
    counted += 1;
    // Weight each item equally: take its top language's full vote, spread the
    // rest — but simplest and stable is to add each item's normalized shares.
    for (const { lang, share } of detectLanguage(text, meta)) {
      totals.set(lang, (totals.get(lang) ?? 0) + share);
    }
  }
  if (!counted) {
    return [{ lang: 'und', share: 1 }];
  }

  const grand = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
  let undShare = 0;
  const kept: LangShare[] = [];
  for (const [lang, sum] of totals) {
    const share = sum / grand;
    if (lang === 'und' || share < minShare) {
      undShare += share;
    } else {
      kept.push({ lang, share });
    }
  }
  if (undShare > 0) {
    kept.push({ lang: 'und', share: undShare });
  }
  return kept.sort((a, b) => b.share - a.share);
}

/** Format a share (0–1) as a whole percent, never showing 0% for a present language. */
export function sharePct(share: number): number {
  return Math.max(1, Math.round(share * 100));
}

/** A short-string verdict only when script/spelling leaves one supported language. */
export function detectScriptLanguage(text: string): LangCode | null {
  const candidates = detectScriptCandidates(text);
  // A single candidate is a committed guess. Multiple candidates (only bare Han,
  // which is zh/ja-ambiguous) stay undetermined for this single-answer API —
  // callers that must decide between them use detectScriptCandidates directly.
  return candidates.length === 1 ? candidates[0] : null;
}

/** Script/spelling candidates; ambiguous Han and mixed scripts stay explicit. */
export function detectScriptCandidates(text: string): LangCode[] {
  const clean = detectionText(text);
  const scripts = new Set<LangCode>();
  for (const ch of clean) {
    const script = scriptFor(ch);
    if (script) scripts.add(script);
  }
  if (!scripts.size) {
    const matches = EXCLUSIVE_LETTERS.filter(({ re }) => re.test(clean));
    return matches.length === 1 ? [matches[0].lang] : [];
  }
  const candidates = new Set<LangCode>();
  for (const script of scripts) {
    const lang = refineScript(script, clean, null);
    if (lang !== 'und') candidates.add(lang);
    else if (script === 'zh') {
      candidates.add('zh');
      candidates.add('ja');
    } else return [];
  }
  return [...candidates];
}
