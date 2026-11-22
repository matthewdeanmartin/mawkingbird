import { stripHtml } from '../../lib/sentiment';
import { Account, Status } from '../platform/api/models';
import { bareLanguageCode } from './language-catalog';
import { confidentLanguage } from './language-detect';

/**
 * Which language(s) a person writes in, from what is loaded
 * (spec/moderation-facets.md §4). On Mastodon this is about the only way to
 * find people near you.
 *
 * Evidence, per post: its `language` tag, unless our detector is confident
 * the text is in another language (tags are often just the app's default).
 * Plus the bio, when detection is confident. Every vote is one post or the
 * bio, so a person with one stray English post among ten Malay ones is Malay.
 *
 * Malay and Indonesian are close enough that the detector only knows
 * Indonesian. A detected `id` is therefore "Malay or Indonesian" (`ms-id`)
 * unless the person's own tags settle it; such a person matches a search for
 * either, and the UI says the split is uncertain.
 */

/** Malay or Indonesian, undecided. */
export const MS_ID = 'ms-id';

export interface AccountLanguages {
  /** Language → share of the evidence (0–1), most-used first. */
  shares: { lang: string; share: number }[];
  /** The most-used language, or null when nothing could be told. */
  primary: string | null;
  /** Votes counted (posts with a language, plus the bio). */
  votes: number;
}

/** A person "writes in" a language once it makes up at least this share. */
export const LANGUAGE_SHARE = 0.25;

/**
 * One post's language: its tag, unless detection is confident it is another
 * language; `ms-id` when detection says Indonesian and the tag doesn't settle it.
 */
export function postLanguage(status: Status): string | null {
  const tag = bareLanguageCode(status.language);
  const detected = confidentLanguage(stripHtml(status.content ?? ''));
  if (detected && detected !== 'und') {
    // Detection only knows `id` for the Malay/Indonesian pair.
    if (detected === 'id') return tag === 'ms' || tag === 'id' ? tag : MS_ID;
    if (detected !== tag) return detected;
  }
  return tag && tag !== 'und' ? tag : null;
}

export function inferAccountLanguages(
  account: Account,
  posts: readonly Status[] = [],
): AccountLanguages {
  const votes: string[] = [];
  for (const post of posts) {
    const own = post.reblog ?? post;
    if (own.account.id !== account.id || post.reblog) continue;
    const lang = postLanguage(own);
    if (lang) votes.push(lang);
  }
  const bio = confidentLanguage(stripHtml(account.note ?? ''));
  if (bio && bio !== 'und') votes.push(bio === 'id' ? MS_ID : bio);

  // The person's own ms/id tags settle undecided detections.
  const tagged = new Set(votes.filter((v) => v === 'ms' || v === 'id'));
  const settle = tagged.size === 1 ? [...tagged][0] : null;
  const counts = new Map<string, number>();
  for (const vote of votes) {
    const lang = vote === MS_ID && settle ? settle : vote;
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  const shares = [...counts]
    .map(([lang, n]) => ({ lang, share: n / votes.length }))
    .sort((a, b) => b.share - a.share || a.lang.localeCompare(b.lang));
  return { shares, primary: shares[0]?.lang ?? null, votes: votes.length };
}

/** Whether a person writes in `language` (bare code), by the share rule. */
export function writesIn(languages: AccountLanguages, language: string): boolean {
  const want = bareLanguageCode(language);
  return languages.shares.some((s) => s.share >= LANGUAGE_SHARE && languageMatches(s.lang, want));
}

/** Whether a language from {@link postLanguage} counts as `wanted` (bare code). */
export function languageMatches(lang: string | null, wanted: string): boolean {
  const want = bareLanguageCode(wanted);
  return lang === want || (lang === MS_ID && (want === 'ms' || want === 'id'));
}
