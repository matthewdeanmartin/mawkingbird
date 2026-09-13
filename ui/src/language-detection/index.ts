/**
 * Dependency-free, bounded language identification for social prose.
 * Script evidence narrows the candidates first. Shared scripts need lexical
 * clues; Latin text needs corroborating clues without competing evidence.
 * Repeated words, shared accents and identifiers cannot manufacture confidence.
 *
 * Unresolved text is attributed to und. Shares describe attributed prose, not
 * calibrated probabilities. Warnings and filters use confidentLanguage(); an
 * account's mix aggregates these shares across posts. No model, API or network.
 * The independent Python implementation needs reconciliation after rule changes.
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
  { lang: 'ja', re: /[\p{Script=Hiragana}\p{Script=Katakana}]/u },
  { lang: 'ko', re: /\p{Script=Hangul}/u },
  { lang: 'el', re: /\p{Script=Greek}/u },
  { lang: 'ru', re: /\p{Script=Cyrillic}/u },
  { lang: 'ar', re: /\p{Script=Arabic}/u },
  { lang: 'he', re: /\p{Script=Hebrew}/u },
  { lang: 'hi', re: /\p{Script=Devanagari}/u },
  { lang: 'bn', re: /\p{Script=Bengali}/u },
  { lang: 'ta', re: /\p{Script=Tamil}/u },
  { lang: 'te', re: /\p{Script=Telugu}/u },
  { lang: 'th', re: /\p{Script=Thai}/u },
];

const HAN_RE = /\p{Script=Han}/u;
const KANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
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
export const STOP_WORDS: Partial<Record<LangCode, string[]>> = {
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
    'weil',
    'wir',
    'ihren',
    'ihrem',
    'welche',
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
    'pourquoi',
    'lorsque',
    'avec',
    'sais',
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
    'qué',
    'así',
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

/** Only words with one owner and no known homograph may supply lexical evidence. */
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
export const HOMOGRAPHS = new Set([
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
  // Cross-language words missing from the compact function-word tables.
  // German noun/verb, English noun; Dutch/English; Romance/Esperanto.
  'will',
  'hat',
  'was',
  'die',
  'also',
  'of',
  'for',
  'all',
  'not',
  'a',
  'i',
  'o',
  'y',
  'da',
  'si',
  'non',
  'qui',
  'est',
  'estas',
  'era',
  'son',
  'ten',
  'care',
  'van',
  'door',
  'nu',
  'min',
  'porque',
  'co',
  'um',
  'kun',
  'está',
  'là', // French adverb and Vietnamese copula.
]);

export const DISCRIMINATING_WORDS = (() => {
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
function latinEvidence(text: string): {
  unique: Set<string>;
  evidence: Map<LangCode, Set<string>>;
} {
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
  return { unique, evidence };
}

function latinLanguage(text: string): LangCode | null {
  const { unique, evidence } = latinEvidence(text);
  const ranked = [...evidence].sort((a, b) => b[1].size - a[1].size);
  const [leader] = ranked;
  const best = leader?.[1].size ?? 0;

  if (
    leader &&
    (best >= MIN_DISTINCT_WORDS || (leader[0] === 'de' && best >= 2 && /[äöü]/i.test(text))) &&
    ranked.length === 1 &&
    // Accents can veto English; they never have to prove a different language.
    !(leader[0] === 'en' && /[äöüß]/i.test(text))
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
    if (other === 0 && ((unique.size <= 2 && count >= 1) || (hits >= 2 && count >= 1))) return lang;
  }
  return null;
}

/** Shared alphabets still need language clues. */
function refineScript(script: LangCode, text: string, meta: LangCode | null): LangCode {
  const lower = script === 'ar' ? text.toLowerCase().replace(/\p{M}/gu, '') : text.toLowerCase();
  const tokens = new Set(words(lower));
  const hits = (list: string) => list.split(' ').filter((word) => tokens.has(word)).length;
  // Isolated Greek mathematical variables are not prose; include extended Greek.
  if (script === 'el' && !/\p{Script=Greek}{3}/u.test(lower.normalize('NFC'))) return 'und';

  if (script === 'zh') {
    // Common grammatical sequences, Traditional and Simplified alike.
    const chinese =
      /(這是|这是|我們|我们|他們|他们|這個|这个|沒有|没有|因為|因为|什麼|什么|謝謝|谢谢|中文|漢語|汉语)/.test(
        text,
      );
    if (KANA_RE.test(text)) return chinese ? 'und' : 'ja';
    if (/\p{Script=Hangul}/u.test(text)) return chinese ? 'und' : 'ko';
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
function detectPlainLanguage(text: string, metaHint?: string | null): LangShare[] {
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

/** Attribute prose and quotations separately; peripheral labels cannot relabel prose. */
export function detectLanguage(text: string, metaHint?: string | null): LangShare[] {
  const segments = relevantSegments(segmentLanguageText(text));
  const totals = new Map<LangCode, number>();
  let size = 0;
  for (const segment of segments) {
    const letters = detectionText(segment.text).match(/\p{L}/gu)?.length ?? 0;
    size += letters;
    for (const { lang, share } of detectPlainLanguage(segment.text, metaHint)) {
      totals.set(lang, (totals.get(lang) ?? 0) + share * letters);
    }
  }
  if (!size) return [{ lang: 'und', share: 1 }];
  return [...totals]
    .map(([lang, count]) => ({ lang, share: count / size }))
    .sort((a, b) => b.share - a.share || a.lang.localeCompare(b.lang));
}

export type LanguageSegmentKind = 'prose' | 'quote' | 'link' | 'hashtag';

export interface LanguageSegment {
  kind: LanguageSegmentKind;
  text: string;
}

export type LanguageReason =
  | 'no-text'
  | 'insufficient-clues'
  | 'conflicting-clues'
  | 'shared-script'
  | 'unsupported-script'
  | 'mixed-languages'
  | 'truncated';

export interface LanguageEvidence {
  kind: 'script' | 'word' | 'spelling';
  value: string;
  candidates: LangCode[];
}

export interface LanguageDecision {
  /** A single established language, otherwise null. Never inferred from user preferences. */
  language: LangCode | null;
  /** Unranked possibilities or languages present. These are not probabilities. */
  candidates: LangCode[];
  /** False means these clues do not rule out additional languages. */
  candidatesComplete: boolean;
  reasons: LanguageReason[];
  evidence: LanguageEvidence[];
}

export interface LanguageAnalysis extends LanguageDecision {
  /** The author's prose, independently of quotations and peripheral labels. */
  prose: LanguageDecision;
  segments: (LanguageSegment & LanguageDecision & { included: boolean })[];
}

/**
 * Plain text / Markdown segmentation. HTML callers supply structured segments
 * from their own parser, keeping the library independent of browser APIs.
 * Explicit quotations remain readable content; single apostrophes are not quotes.
 */
export function segmentLanguageText(text: string): LanguageSegment[] {
  const extras: LanguageSegment[] = [];
  const extract = (kind: LanguageSegmentKind, value: string) => {
    if (value.trim()) extras.push({ kind, text: value.trim() });
    return ' ';
  };
  const clean = text
    .slice(0, 12000)
    .replace(/\x60\x60\x60[\s\S]*?(?:\x60\x60\x60|$)|\x60[^\x60\n]*\x60/g, ' ')
    // Keep link labels out of the word-clue pool, including hashtag links.
    .replace(/!?\[([^\]\n]*)\]\([^\n)]*\)/g, (_, label: string) =>
      extract(label.startsWith('#') ? 'hashtag' : 'link', label),
    )
    // URL fragments and account names are identifiers, not hashtags or quotations.
    .replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|@[\p{L}\p{N}_.@-]+/giu, ' ')
    .replace(/^\s*>[^\n]*(?:\n\s*>[^\n]*)*/gm, (quote) =>
      extract('quote', quote.replace(/^\s*>\s?/gm, '')),
    )
    .replace(
      /"([^"\n]+)"|“([^”\n]+)”|«([^»\n]+)»|「([^」\n]+)」/g,
      (_, a: string, b: string, c: string, d: string) => extract('quote', a ?? b ?? c ?? d),
    )
    .replace(/(^|[^\p{L}\p{N}_])#[\p{L}\p{M}\p{N}_]+/gu, (tag, prefix: string) => {
      extract('hashtag', tag.slice(prefix.length));
      return prefix + ' ';
    });
  const prose = clean
    .split(/\n+/)
    .filter((line) => line.trim())
    .map((line): LanguageSegment => ({
      kind: 'prose',
      text: line.trim(),
    }));
  return [...prose, ...extras];
}

function hasLetters(segment: LanguageSegment): boolean {
  return /\p{L}/u.test(detectionText(segment.text));
}

function relevantSegments(segments: readonly LanguageSegment[]): LanguageSegment[] {
  const substantive = segments.filter(
    (s) => (s.kind === 'prose' || s.kind === 'quote') && hasLetters(s),
  );
  // A link-only or hashtag-only post has no author prose to contaminate.
  return substantive.length ? substantive : segments.filter(hasLetters);
}

function unknownDecision(reason: LanguageReason): LanguageDecision {
  return {
    language: null,
    candidates: [],
    candidatesComplete: false,
    reasons: [reason],
    evidence: [],
  };
}

function combineDecisions(parts: LanguageDecision[]): LanguageDecision {
  if (!parts.length) return unknownDecision('no-text');
  const candidates = [...new Set(parts.flatMap((p) => p.candidates))].sort();
  const candidatesComplete = parts.every((p) => p.candidatesComplete) && candidates.length > 0;
  const reasons = new Set(parts.flatMap((p) => p.reasons));
  if (candidates.length > 1 && parts.filter((p) => p.language).length > 1)
    reasons.add('mixed-languages');
  return {
    language: candidatesComplete && candidates.length === 1 ? candidates[0] : null,
    candidates,
    candidatesComplete,
    reasons: [...reasons],
    evidence: parts.flatMap((p) => p.evidence),
  };
}

const SCRIPT_NAMES: Partial<Record<LangCode, string>> = {
  ja: 'Kana',
  ko: 'Hangul',
  zh: 'Han',
  ru: 'Cyrillic',
  ar: 'Arabic',
  el: 'Greek',
  he: 'Hebrew',
  hi: 'Devanagari',
  bn: 'Bengali',
  ta: 'Tamil',
  te: 'Telugu',
  th: 'Thai',
};

/** Shared spelling is a narrowing hint, never sufficient proof about whole prose. */
const SHARED_SPELLINGS: { re: RegExp; candidates: LangCode[] }[] = [
  { re: /ä/i, candidates: ['de', 'sv', 'fi', 'is'] },
  { re: /ö/i, candidates: ['de', 'sv', 'fi', 'tr', 'is'] },
  { re: /ü/i, candidates: ['de', 'tr', 'es', 'fr', 'ca', 'pt'] },
];

function explainLatin(text: string): LanguageDecision {
  const { evidence: clues } = latinEvidence(text);
  const evidence: LanguageEvidence[] = [...clues].flatMap(([lang, tokens]) =>
    [...tokens].map((value) => ({ kind: 'word' as const, value, candidates: [lang] })),
  );
  const marks = EXCLUSIVE_LETTERS.filter(({ re }) => re.test(text));
  for (const { lang, re } of marks)
    evidence.push({ kind: 'spelling', value: text.match(re)![0], candidates: [lang] });
  for (const { re, candidates } of SHARED_SPELLINGS) {
    if (re.test(text))
      evidence.push({ kind: 'spelling', value: text.match(re)![0], candidates: [...candidates] });
  }
  const language = latinLanguage(text);
  if (language)
    return { language, candidates: [language], candidatesComplete: true, reasons: [], evidence };
  const englishVeto = /[äöüß]/i.test(text);
  const candidates = [...new Set([...clues.keys(), ...marks.map(({ lang }) => lang)])]
    .filter((lang) => lang !== 'en' || !englishVeto)
    .sort();
  const conflict =
    clues.size > 1 ||
    marks.some(({ lang }) => clues.size && !clues.has(lang)) ||
    (clues.has('en') && /[äöüß]/i.test(text));
  // Multiple independently corroborated languages can establish readability for
  // a multilingual reader without claiming a single language. Weak clues cannot.
  const complete =
    clues.size > 1 &&
    [...clues.values()].every((hits) => hits.size >= MIN_DISTINCT_WORDS) &&
    marks.every(({ lang }) => clues.has(lang)) &&
    !(clues.has('en') && /[äöüß]/i.test(text));
  const shared = SHARED_SPELLINGS.filter(({ re }) => re.test(text));
  if (!candidates.length && shared.length) {
    const intersection = shared[0].candidates.filter((lang) =>
      shared.every((rule) => rule.candidates.includes(lang)),
    );
    candidates.push(...intersection);
  }
  return {
    language: null,
    candidates,
    candidatesComplete: complete,
    reasons: [conflict ? 'conflicting-clues' : 'insufficient-clues'],
    evidence,
  };
}

function explainSegment(text: string): LanguageDecision {
  const clean = detectionText(text);
  const scripts = new Set<LangCode>();
  let latin = '';
  let unsupported = false;
  for (const ch of clean) {
    if (!/\p{L}/u.test(ch)) {
      latin += ch;
      continue;
    }
    const script = scriptFor(ch);
    if (script) {
      scripts.add(script);
      latin += ' ';
    } else if (/\p{Script=Latin}/u.test(ch)) latin += ch;
    else {
      unsupported = true;
      latin += ' ';
    }
  }
  const decisions: LanguageDecision[] = [];
  if (/\p{L}/u.test(latin)) decisions.push(explainLatin(latin));
  for (const script of scripts) {
    const lang = refineScript(script, clean, null);
    const lower = clean.toLowerCase();
    const unsupportedOrthography =
      (script === 'ru' && /[ўјљњћђџқңүұөҳҷ]/u.test(lower)) ||
      (script === 'ar' && /[ٹڈڑںھہے]/u.test(lower)) ||
      (script === 'bn' && /[ৰৱ]/u.test(lower)) ||
      (script === 'hi' &&
        words(lower).some((word) => ['आहे', 'आणि', 'नाही', 'आम्ही', 'छ', 'छन्'].includes(word)));
    let candidates: LangCode[] = lang !== 'und' ? [lang] : [];
    if (lang === 'und') {
      if (script === 'zh') candidates = ['ja', 'ko', 'zh'];
      if (script === 'ru') candidates = ['ru', 'uk'];
      if (script === 'ar') candidates = ['ar', 'fa'];
    }
    if (unsupportedOrthography) candidates = [];
    const evidence: LanguageEvidence[] = [
      { kind: 'script', value: SCRIPT_NAMES[script]!, candidates },
    ];
    // Shared alphabets may belong to unsupported languages too. Their candidate
    // lists remain open until the refining rules corroborate a language.
    decisions.push({
      language: lang === 'und' ? null : lang,
      candidates,
      candidatesComplete: lang !== 'und',
      reasons: unsupportedOrthography
        ? ['unsupported-script']
        : lang === 'und'
          ? [candidates.length ? 'shared-script' : 'insufficient-clues']
          : [],
      evidence,
    });
  }
  if (unsupported) decisions.push(unknownDecision('unsupported-script'));
  return combineDecisions(decisions);
}

/**
 * Explain detection without metadata or user preferences. The candidate set is
 * unranked; `candidatesComplete` must be checked before drawing an all-candidates
 * conclusion. Quotations participate in the full result and have their own result.
 */
export function analyzeLanguage(
  input: string | readonly LanguageSegment[],
  truncated = false,
): LanguageAnalysis {
  const all = typeof input === 'string' ? segmentLanguageText(input) : input;
  const source = all.slice(0, 512);
  let remaining = 12000;
  const bounded: LanguageSegment[] = [];
  let wasTruncated =
    truncated ||
    all.length > source.length ||
    (typeof input === 'string' && input.length > remaining);
  for (const segment of source) {
    if (segment.text.length > remaining) wasTruncated = true;
    const text = segment.text.slice(0, remaining);
    remaining -= text.length;
    if (text.trim()) bounded.push({ kind: segment.kind, text });
    if (!remaining) break;
  }
  if (bounded.length < source.length && remaining === 0) wasTruncated = true;
  const relevant = new Set(relevantSegments(bounded));
  const segments = bounded.map((segment) => ({
    ...segment,
    ...explainSegment(segment.text),
    included: relevant.has(segment),
  }));
  const combined = combineDecisions(segments.filter((s) => s.included));
  const prose = combineDecisions(segments.filter((s) => s.kind === 'prose' && hasLetters(s)));
  if (wasTruncated) {
    for (const decision of [combined, prose]) {
      decision.language = null;
      decision.candidatesComplete = false;
      decision.reasons = [...new Set([...decision.reasons, 'truncated' as const])];
    }
  }
  return { ...combined, prose, segments };
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
