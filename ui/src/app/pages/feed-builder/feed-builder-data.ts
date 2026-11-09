import { PageLanguage } from '../../focused-tools';
import { FeedTopic } from './feed-builder-registry';
import { breadcrumbList, Crumb } from '../../breadcrumbs';

/** One topic page's data, as exported by mawkingbird_starters and checked by the importer. */
export interface FeedPageData {
  version: 1;
  topic: string;
  lang: string;
  status: 'reviewed' | 'draft';
  generatedAt: string;
  tags: FeedTag[];
  people: FeedPerson[];
  servers: { domain: string }[];
}

export interface FeedTag {
  name: string;
  /** The language most of the tag's posts are in. */
  lang: string;
  /** `future`: a local tag proposed beside a busy English one, to help start it. */
  kind: 'tag' | 'future';
  source?: string;
  status?: 'starting' | 'new';
  /** The model's sample flagged the tag; readers should preview it first. */
  caution?: 'spam' | 'off-topic';
}

export type Shelf = 'youtube' | 'notable' | 'community';
export type FameCode =
  'wikidata' | 'wikipedia' | 'youtube-10k' | 'followers-2500' | 'followers-625';
export type Elsewhere = 'bluesky' | 'youtube' | 'twitch' | 'patreon' | 'podcast' | 'website';

export interface FeedPerson {
  acct: string;
  id: string;
  url: string;
  displayName: string;
  avatar: string;
  bio: string;
  shelf: Shelf;
  rank: number;
  fame: FameCode[];
  elsewhere: Elsewhere[];
  youtube?: { channelId: string; band?: string; lastUpload?: string; native: boolean };
}

export const SHELF_ORDER: readonly Shelf[] = ['youtube', 'notable', 'community'];

type Loader = () => Promise<{ default: unknown }>;

/**
 * Lazy loaders, one chunk per page. A new topic or language adds lines here;
 * `feed-builder-data.spec.ts` fails when a routed page has no loader.
 */
export const DATA_LOADERS: Record<string, Loader> = {
  'dutch-politics.nl': () => import('./data/dutch-politics.nl.json'),
  'dutch-culture.nl': () => import('./data/dutch-culture.nl.json'),
  'vietnam.vi': () => import('./data/vietnam.vi.json'),
  'malaysia.ms': () => import('./data/malaysia.ms.json'),
  'bicycling.en': () => import('./data/bicycling.en.json'),
  'bicycling.de': () => import('./data/bicycling.de.json'),
  'bicycling.fr': () => import('./data/bicycling.fr.json'),
  'running.en': () => import('./data/running.en.json'),
  'running.de': () => import('./data/running.de.json'),
  'literary-fiction.en': () => import('./data/literary-fiction.en.json'),
  'historical-fiction.en': () => import('./data/historical-fiction.en.json'),
  'mystery-and-crime.en': () => import('./data/mystery-and-crime.en.json'),
  'mystery-and-crime.de': () => import('./data/mystery-and-crime.de.json'),
  'romance-books.en': () => import('./data/romance-books.en.json'),
  'romance-books.de': () => import('./data/romance-books.de.json'),
  'buddhism.en': () => import('./data/buddhism.en.json'),
  'war-in-ukraine.en': () => import('./data/war-in-ukraine.en.json'),
  'german-politics.de': () => import('./data/german-politics.de.json'),
  'canadian-politics.en': () => import('./data/canadian-politics.en.json'),
  'canadian-politics.fr': () => import('./data/canadian-politics.fr.json'),
  'uspol.en': () => import('./data/uspol.en.json'),
  'dmv.en': () => import('./data/dmv.en.json'),
  'retrocomputing.en': () => import('./data/retrocomputing.en.json'),
  'retrocomputing.de': () => import('./data/retrocomputing.de.json'),
  'retrocomputing.fr': () => import('./data/retrocomputing.fr.json'),
  'retrocomputing.es': () => import('./data/retrocomputing.es.json'),
  'esp32-and-single-board-computers.en': () =>
    import('./data/esp32-and-single-board-computers.en.json'),
  'esp32-and-single-board-computers.de': () =>
    import('./data/esp32-and-single-board-computers.de.json'),
  'gardening-and-houseplants.en': () => import('./data/gardening-and-houseplants.en.json'),
  'gardening-and-houseplants.de': () => import('./data/gardening-and-houseplants.de.json'),
  'gardening-and-houseplants.fr': () => import('./data/gardening-and-houseplants.fr.json'),
  'math.en': () => import('./data/math.en.json'),
  'math.de': () => import('./data/math.de.json'),
  'math.fr': () => import('./data/math.fr.json'),
  'plant-based-living.en': () => import('./data/plant-based-living.en.json'),
  'plant-based-living.de': () => import('./data/plant-based-living.de.json'),
  'science-fiction.en': () => import('./data/science-fiction.en.json'),
  'science-fiction.de': () => import('./data/science-fiction.de.json'),
  'science-fiction.fr': () => import('./data/science-fiction.fr.json'),
  'science-fiction.es': () => import('./data/science-fiction.es.json'),
  'science-fiction.it': () => import('./data/science-fiction.it.json'),
  'science-fiction.ja': () => import('./data/science-fiction.ja.json'),
  'space-and-astronomy.en': () => import('./data/space-and-astronomy.en.json'),
  'space-and-astronomy.de': () => import('./data/space-and-astronomy.de.json'),
  'space-and-astronomy.fr': () => import('./data/space-and-astronomy.fr.json'),
  'space-and-astronomy.es': () => import('./data/space-and-astronomy.es.json'),
  'space-and-astronomy.it': () => import('./data/space-and-astronomy.it.json'),
};

export async function loadPageData(topic: FeedTopic, lang: PageLanguage): Promise<FeedPageData> {
  const loader = DATA_LOADERS[`${topic}.${lang}`];
  if (!loader) throw new Error(`No Feed Builder data for ${topic}/${lang}`);
  return (await loader()).default as FeedPageData;
}

/** People grouped by shelf in rank order; empty shelves are left out. */
export function shelves(people: readonly FeedPerson[]): { shelf: Shelf; people: FeedPerson[] }[] {
  return SHELF_ORDER.map((shelf) => ({
    shelf,
    people: people.filter((person) => person.shelf === shelf).sort((a, b) => a.rank - b.rank),
  })).filter((group) => group.people.length > 0);
}

/** schema.org: the page is a collection whose main entity is the list of people shown. */
export function collectionPage(
  data: FeedPageData,
  copy: { title: string; description: string },
  url: string,
  /** Front page › hub › this page; see breadcrumbs.ts. */
  crumbs: readonly Crumb[] = [],
): object {
  const people = shelves(data.people).flatMap((group) => group.people);
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: copy.title,
    description: copy.description,
    url,
    inLanguage: data.lang,
    ...(crumbs.length ? { breadcrumb: breadcrumbList(crumbs) } : {}),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: people.length,
      itemListElement: people.map((person, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: person.displayName,
        url: person.url,
      })),
    },
  };
}
