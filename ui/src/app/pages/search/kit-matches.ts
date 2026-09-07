import { SHIPPED_STARTER_KITS } from '../../starter-kits';
import { STARTER_KITS, starterKitText } from '../../starter-collection';

/**
 * One curated set of accounts that matched a search, whichever kind it is.
 *
 * `kind` is carried but is deliberately *not* a filter or a heading: a reader
 * searching for "science" wants people to follow, and "is this a developer-built
 * starter kit or a snapshot of someone else's collection" is our distinction,
 * not theirs. It exists so a card can label itself quietly if it needs to.
 */
export interface KitMatch {
  kind: 'kit' | 'collection';
  title: string;
  blurb: string;
  accountCount: number;
  /** In-app route to open it. */
  link: string;
}

/**
 * Curated sets whose name or description matches a query.
 *
 * ## Why search touches this at all
 *
 * Starter kits and bundled collections are the fastest route from "no timeline"
 * to "a timeline worth reading" — one press follows the whole set — and until
 * now the only way to reach either was a specific page linked from the Find
 * Friends hub. Nothing surfaced them by name. So a reader who saw a kit once
 * and wanted it back had no way to ask for it, and a reader searching "photography"
 * was never told that a hand-picked set of photographers ships with the app.
 *
 * Both corpora are compiled in (`starter-collection.ts`,
 * `starter-kits.ts`), so this costs no API call and cannot fail. That is what
 * makes it safe to run alongside every account search rather than behind
 * a fourth entry in the type dropdown.
 *
 * Matching is deliberately plain substring, case-insensitive, over title and
 * blurb. A fuzzy matcher would be a worse trade here: the corpus is a few dozen
 * items, the cost of a false positive is one extra row above the real results,
 * and the cost of a false negative is the feature not existing for that reader.
 */
export function kitMatchesFor(
  query: string,
  limit = 3,
  languages?: ReadonlySet<string>,
  locale = 'en',
): KitMatch[] {
  const needle = query.trim().toLowerCase().replace(/^[#@]/, '');
  if (needle.length < 2) {
    return [];
  }
  const matches: KitMatch[] = [];
  for (const kit of STARTER_KITS) {
    if (kit.lang && languages && !languages.has(kit.lang)) continue;
    const text = starterKitText(kit, locale);
    if (hits(needle, text.title, text.blurb, kit.title, kit.blurb)) {
      matches.push({
        kind: 'kit',
        title: kit.lang ? `${text.title} · ${kit.lang}` : text.title,
        blurb: text.blurb,
        accountCount: kit.accounts.length,
        link: kit.slug === 'starter' ? '/collections/starter' : `/collections/starter/${kit.slug}`,
      });
    }
  }
  for (const collection of SHIPPED_STARTER_KITS) {
    if (hits(needle, collection.title, collection.description)) {
      matches.push({
        kind: 'collection',
        title: collection.title,
        blurb: collection.description,
        accountCount: collection.accounts.length,
        link: `/collections/${collection.id}`,
      });
    }
  }
  return matches.slice(0, limit);
}

function hits(needle: string, ...fields: (string | undefined)[]): boolean {
  return fields.some((field) => (field ?? '').toLowerCase().includes(needle));
}
