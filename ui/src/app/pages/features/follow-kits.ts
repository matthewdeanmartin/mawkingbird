import { BUNDLED_STARTER_KITS, BundledStarterKit } from '../../bundled-starter-kits.generated';
import { Account } from '../../models';

/**
 * Public, search-engine-facing copies of the hand-picked starter kits.
 *
 * Only the bundled kits are published: their importer records each account's
 * home-instance consent flags and the monthly starter-kit-consent workflow
 * re-checks them. The larger multilingual catalogue deliberately does not act
 * on `noindex`/`indexable` (see mawkingbird_starters/README.md) and its own site
 * is `noindex`, so it stays in-app only. Snapshots of other people's collections
 * are never published here.
 *
 * The rule here is stricter than in-app listing because these pages exist to be
 * crawled: a person must have asked to be discoverable, and must not have asked
 * search engines to leave them alone.
 */
export const MIN_PUBLIC_KIT_SIZE = 3;
const BIO_LIMIT = 220;
const DESCRIPTION_LIMIT = 160;

export interface PublicKitAccount {
  name: string;
  handle: string;
  url: string;
  avatar: string;
  bio: string;
  followers: number;
}

export interface PublicKit {
  slug: string;
  title: string;
  blurb: string;
  heading: string;
  description: string;
  accounts: readonly PublicKitAccount[];
}

export function searchListable(account: Account): boolean {
  return account.discoverable === true && account.noindex !== true && account.indexable !== false;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Profile notes arrive as Mastodon HTML; the public page shows a short plain-text bio. */
export function plainBio(note: string, limit = BIO_LIMIT): string {
  const text = note
    .replace(/<br\s*\/?>|<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? entity;
      const point = code[1] === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    })
    .replace(/\s+/g, ' ')
    .trim();
  return clip(text, limit);
}

function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), limit / 2)).replace(/[\s,;:.]+$/, '')}…`;
}

export function toPublicKits(kits: readonly BundledStarterKit[]): PublicKit[] {
  return kits
    .map((kit) => {
      const accounts = kit.accounts.filter(searchListable).map((account): PublicKitAccount => ({
        name: account.display_name || account.username,
        handle: `@${account.acct}`,
        url: account.url,
        avatar: account.avatar,
        bio: plainBio(account.note),
        followers: account.followers_count,
      }));
      return {
        slug: kit.slug,
        title: kit.title,
        blurb: kit.blurb,
        heading: `${kit.title} on Mastodon: ${accounts.length} accounts to follow`,
        description: clip(
          `${accounts.length} ${kit.title} accounts to follow on Mastodon, hand-picked by Mawkingbird. ${kit.blurb}`,
          DESCRIPTION_LIMIT,
        ),
        accounts,
      };
    })
    .filter((kit) => kit.accounts.length >= MIN_PUBLIC_KIT_SIZE);
}

export const PUBLIC_KITS: readonly PublicKit[] = toPublicKits(BUNDLED_STARTER_KITS);

export function publicKit(slug: string | null | undefined): PublicKit | null {
  return PUBLIC_KITS.find((kit) => kit.slug === slug) ?? null;
}

/** schema.org ItemList of the people a kit page shows, in the same order. */
export function kitItemList(kit: PublicKit): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: kit.heading,
    description: kit.description,
    numberOfItems: kit.accounts.length,
    itemListElement: kit.accounts.map((account, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: account.name,
      url: account.url,
    })),
  };
}
