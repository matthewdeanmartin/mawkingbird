/**
 * Words that mark *sexual* content (spec/moderation-facets.md §2). Adult here
 * means sexual only: porn, nudity, sex work, kink. Gore, drugs and every other
 * content warning stay under Mastodon's own "sensitive" flag.
 *
 * Kept deliberately small and specific. A wrong "adult" costs a person their
 * place in a language search, so ambiguous words ("spicy", "BO", "VCS" on its
 * own, "ayam") are left out or only count in a phrase. Each list says where it
 * applies; the tests pin the false friends.
 *
 * Sources for the Indonesian/Malay sex-work markers: the phrases that dominate
 * `language:id` / `language:ms` post search on large servers (owner review,
 * 2026-11-22). They are advertising vocabulary, not general slang. The other
 * languages' lists are drafts awaiting native-speaker review; see
 * {@link SEX_WORK_PHRASES}.
 */

/** Letters or digits either side mean "inside a word": no match. */
const B = '(?<![\\p{L}\\p{N}])';
const E = '(?![\\p{L}\\p{N}])';

function words(list: readonly string[]): RegExp {
  const body = list
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*'))
    .join('|');
  return new RegExp(`${B}(?:${body})${E}`, 'iu');
}

/** Symbols and number forms, which have no word boundary of their own. */
const AGE_MARKER =
  /🔞|(?<![\p{N}])(?:18\s*\+|\+\s*18)(?![\p{N}])|(?<![\p{L}\p{N}])r-?18(?![\p{L}\p{N}])/iu;

/**
 * A person saying, in their name, bio or profile fields, that their account is
 * for adults. Strongest evidence there is: it is their own words.
 */
const SELF_DECLARED_WORDS = words([
  'nsfw',
  'mdni',
  'adults only',
  'adult content',
  'adult creator',
  'onlyfans',
  'fansly',
  'sex worker',
  'sexworker',
  'escort',
  'camgirl',
  'cam girl',
  'cam model',
  'porn',
  'lewd',
  'lewds',
  'hentai',
]);

/**
 * "Minors, keep out", however it is phrased: a word for minors, then within a
 * few words a word for keeping away. Covers "minors do not interact", "minors
 * DNI", "no minors", "under 18s don't follow", "kids: go away", "minors are not
 * welcome here". One pattern, not a phrase list, because people write this a
 * thousand ways. Plain "no kids" (a parenting bio) does not match: it needs
 * both halves.
 */
const MINORS_KEEP_OUT =
  /(?<![\p{L}\p{N}])(?:no\s+(?:minors|under\s*-?\s*18s?)|(?:minors?|under\s*-?\s*18s?|kids|children|teens?)(?:[\s\p{P}]+[\p{L}']+){0,3}?[\s\p{P}]+(?:dni|do\s*n[o']?t\s+(?:interact|follow)|don['’]?t\s+(?:interact|follow)|not\s+welcome|stay\s+away|go\s+away|keep\s+out|please\s+leave|block\s+me))(?![\p{L}\p{N}])/iu;

/**
 * Sex-work and paid-sexual-content advertising, per language Mawkingbird is
 * translated into. Advertising phrases only: each entry should be something
 * an ordinary bio or post would not say. Words that are innocent on their own
 * ("massage", "booking", "BO", "VCS", "sponsoring", "ayam") only appear inside
 * a phrase. Lists other than Indonesian/Malay are drafted, not yet reviewed by
 * native speakers (2026-11-22): extend or correct them per language.
 */
export const SEX_WORK_PHRASES: Readonly<Record<string, readonly string[]>> = {
  en: [
    'escort service',
    'escort services',
    'incall',
    'outcall',
    'incalls',
    'outcalls',
    'girlfriend experience',
    'buy my nudes',
    'nudes for sale',
    'selling nudes',
    'sexting service',
    'cam shows',
  ],
  de: [
    'escortservice',
    'escort service',
    'erotikmassage',
    'erotische massage',
    'sexkontakte',
    'taschengeldtreffen',
    'taschengeld treffen',
  ],
  fr: [
    'escort girl',
    'massage érotique',
    'massage naturiste',
    'plan cul',
    'rencontre coquine',
    'rencontres coquines',
    'nudes à vendre',
  ],
  es: [
    'servicio de escort',
    'masaje erótico',
    'masajes eróticos',
    'chica de compañía',
    'acompañante vip',
    'vendo packs',
    'vendo contenido',
  ],
  pt: [
    'garota de programa',
    'acompanhante de luxo',
    'massagem erótica',
    'vendo packs',
    'vendo conteúdo',
  ],
  it: ['massaggio erotico', 'massaggi erotici', 'incontri piccanti', 'vendo contenuti'],
  nl: ['escortservice', 'erotische massage', 'sexdate', 'sexdates'],
  sv: ['eskortservice', 'erotisk massage'],
  ro: ['masaj erotic', 'masaje erotice', 'servicii sexuale'],
  da: ['erotisk massage', 'eskortservice'],
  lv: ['erotiska masāža', 'seksuālie pakalpojumi'],
  lt: ['erotinis masažas', 'seksualinės paslaugos'],
  et: ['erootiline massaaž', 'seksuaalteenused'],
  hu: ['erotikus masszázs', 'szexuális szolgáltatások'],
  el: ['ερωτικό μασάζ', 'σεξουαλικές υπηρεσίες'],
  pl: ['agencja towarzyska', 'masaż erotyczny', 'sex za pieniądze'],
  ru: ['интим услуги', 'интим-услуги', 'эскорт услуги', 'эротический массаж', 'досуг для мужчин'],
  uk: ['інтим послуги', 'інтим-послуги', 'ескорт послуги', 'еротичний масаж'],
  tr: ['escort bayan', 'eskort bayan', 'erotik masaj', 'ücretli görüşme'],
  id: [
    'open bo',
    'ready bo',
    'cewek bo',
    'cewe bo',
    'open vcs',
    'jasa vcs',
    'ready vcs',
    'vcs ready',
    'real vcs',
    'pijat plus',
    'pijat plus plus',
    'ayam kampus',
    'bokep',
    'colmek',
    'ngewe',
    'konten lendir',
    'video lendir',
    'konten dewasa',
  ],
  ms: ['gadis panggilan', 'perempuan panggilan', 'urut plus', 'servis urut plus'],
  vi: ['gái gọi', 'dịch vụ tình dục', 'massage kích dục', 'gái bao'],
  hi: ['कॉल गर्ल', 'एस्कॉर्ट सर्विस', 'call girl service', 'call girls'],
};

/**
 * The same, for languages written without spaces. Matched as plain
 * substrings: a CJK phrase has letters on both sides inside any sentence, so
 * the word-boundary rule above would never let it match.
 */
export const SEX_WORK_PHRASES_CJK: Readonly<Record<string, readonly string[]>> = {
  ja: ['パパ活', 'デリヘル', '援交', '援助交際', 'エロ垢', '裏垢女子'],
  zh: ['援交', '約砲', '约炮', '外送茶', '全套服務', '全套服务', '包養', '包养'],
  ko: ['조건만남', '출장마사지', '야한 사진 판매'],
};

const SEX_WORK = words(Object.values(SEX_WORK_PHRASES).flat());
const SEX_WORK_CJK = new RegExp(
  Object.values(SEX_WORK_PHRASES_CJK)
    .flat()
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'u',
);

/** Links to subscription porn platforms. */
const ADULT_PLATFORM_LINK = /(?:^|[\s/.@"'(])(?:onlyfans\.com|fansly\.com|justfor\.fans)\b/i;

/** A content warning that is about sex. */
const SEXUAL_CW = words([
  'nsfw',
  'lewd',
  'lewds',
  'nude',
  'nudes',
  'nudity',
  'naked',
  'porn',
  'sexual',
  'sex',
  'explicit',
  'kink',
  'kinky',
  'horny',
  'fetish',
  'bdsm',
  'boobs',
  'tits',
  'nipples',
  'thirst trap',
  'suggestive',
  'hentai',
  'erotic',
  'erotica',
]);

/**
 * Words that turn a sexual-looking CW into something else: "nsfw language" is
 * swearing, "sexual assault" is a trauma warning, "sex ed" is education.
 * These are sensitive, never adult.
 */
const NOT_ADULT_CW = words([
  'language',
  'swearing',
  'profanity',
  'assault',
  'abuse',
  'harassment',
  'violence',
  'rape',
  'csa',
  'sa mention',
  'sex ed',
  'sex education',
  'sexual health',
  'sti',
  'std',
]);

/** Hashtags (without #) that mark a post as sexual. Lower case. */
export const SEXUAL_HASHTAGS: ReadonlySet<string> = new Set([
  'nsfw',
  'nsfwart',
  'porn',
  'lewd',
  'lewds',
  'nude',
  'nudes',
  'nudity',
  'onlyfans',
  'fansly',
  'bokep',
  'sexwork',
  'sexworker',
  'r18',
  'hentai',
  'adultcontent',
  'kink',
  'bdsm',
  '18plus',
]);

/** Bluesky label values that mean sexual content (graphic-media is not sexual). */
export const SEXUAL_BSKY_LABELS: ReadonlySet<string> = new Set(['porn', 'sexual', 'nudity']);

function firstMatch(re: RegExp, text: string): string | null {
  const m = re.exec(text);
  return m ? m[0].trim() : null;
}

/** The self-declaration in profile text, or null. */
export function selfDeclaredMarker(text: string): string | null {
  return (
    firstMatch(AGE_MARKER, text) ??
    firstMatch(MINORS_KEEP_OUT, text) ??
    firstMatch(SELF_DECLARED_WORDS, text) ??
    firstMatch(SEX_WORK, text) ??
    firstMatch(SEX_WORK_CJK, text) ??
    firstMatch(ADULT_PLATFORM_LINK, text)
  );
}

/** A sex-work or adult-platform marker in a post body, or null. */
export function postTextMarker(text: string): string | null {
  return (
    firstMatch(SEX_WORK, text) ??
    firstMatch(SEX_WORK_CJK, text) ??
    firstMatch(ADULT_PLATFORM_LINK, text)
  );
}

/**
 * Classify a content warning: `sexual` when it names sexual content and
 * nothing that makes it a different kind of warning; `other` for any other
 * non-empty CW ("food", "uspol", "sexual assault"); `none` when empty.
 */
export function classifyContentWarning(cw: string): {
  kind: 'sexual' | 'other' | 'none';
  match?: string;
} {
  const text = cw.trim();
  if (!text) return { kind: 'none' };
  if (NOT_ADULT_CW.test(text)) return { kind: 'other' };
  const match = firstMatch(AGE_MARKER, text) ?? firstMatch(SEXUAL_CW, text);
  return match ? { kind: 'sexual', match } : { kind: 'other' };
}
