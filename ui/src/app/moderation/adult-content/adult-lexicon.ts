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
 * 2026-11-22). They are advertising vocabulary, not general slang.
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
  'minors dni',
  'minors do not interact',
  'no minors',
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

/** Sex-work advertising in Indonesian and Malay posts and bios. Phrases only. */
const SEX_WORK_ID_MS = words([
  'open bo',
  'ready bo',
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
]);

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
    firstMatch(SELF_DECLARED_WORDS, text) ??
    firstMatch(SEX_WORK_ID_MS, text) ??
    firstMatch(ADULT_PLATFORM_LINK, text)
  );
}

/** A sex-work or adult-platform marker in a post body, or null. */
export function postTextMarker(text: string): string | null {
  return firstMatch(SEX_WORK_ID_MS, text) ?? firstMatch(ADULT_PLATFORM_LINK, text);
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
