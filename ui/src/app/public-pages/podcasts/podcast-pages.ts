import { breadcrumbList } from '../breadcrumbs';
import { PODCAST_COPY, PodcastCopy } from './podcast-copy';
import HUBS from './podcast-hubs.json';
import PATHS from './podcast-paths.generated.json';

/**
 * Podcasts on Mastodon: the model behind the public, prerendered pages. Reviewed
 * kits come from `mawkingbird_starters`, bundled by `npm run podcasts:update`
 * (scripts/import-podcasts.mjs); the same kits feed the in-app
 * `/singles/starter-kits`. See ops/engineering/seo.md.
 */
export interface PodcastShow {
  acct: string;
  url: string | null;
  displayName: string;
  avatar: string | null;
  bot: boolean;
  bio: string;
  showUrl: string | null;
  /** Where the show shares episodes, by name. */
  sources: string[];
}

export interface PublicPodcastKit {
  category: string;
  title: string;
  icon: string | null;
  path: string;
  members: PodcastShow[];
}

export interface PodcastHub {
  lang: string;
  path: string;
  label: string;
}

/** Another language's edition of the same page, named in its own language. */
export interface PodcastVersion {
  lang: string;
  path: string;
  name: string;
}

export interface PodcastHubPage {
  hub: PodcastHub;
  copy: PodcastCopy;
  kits: { title: string; icon: string | null; path: string; count: number }[];
  shows: number;
  versions: PodcastVersion[];
}

export interface PodcastKitPage {
  hub: PodcastHub;
  copy: PodcastCopy;
  kit: PublicPodcastKit;
  heading: string;
  description: string;
  others: { title: string; path: string }[];
  versions: PodcastVersion[];
}

/** Public page path by category, then language. */
export const PODCAST_PATHS: Record<string, Record<string, string>> = PATHS.kits;

export const PODCAST_HUBS: PodcastHub[] = Object.entries(HUBS as Record<string, unknown>)
  .filter(([key]) => key !== '$comment')
  .map(([lang, hub]) => ({ lang, ...(hub as { path: string; label: string }) }));

const DATA: Record<string, () => Promise<{ packs: PublicPodcastKit[] }>> = {
  en: () => import('./data/en.json').then((m) => m.default),
  de: () => import('./data/de.json').then((m) => m.default),
};

/** A language's name in that language (Deutsch, English). */
function nativeName(lang: string): string {
  const name = new Intl.DisplayNames([lang], { type: 'language' }).of(lang) ?? lang;
  return name.charAt(0).toLocaleUpperCase(lang) + name.slice(1);
}

const hubFor = (lang: string) => PODCAST_HUBS.find((hub) => hub.lang === lang);

export async function loadPodcastHub(lang: string): Promise<PodcastHubPage | null> {
  const hub = hubFor(lang);
  if (!hub) return null;
  const { packs } = await DATA[lang]();
  return {
    hub,
    copy: PODCAST_COPY[lang],
    kits: packs.map((kit) => ({
      title: kit.title,
      icon: kit.icon,
      path: kit.path,
      count: kit.members.length,
    })),
    shows: new Set(packs.flatMap((kit) => kit.members.map((show) => show.acct))).size,
    versions: PODCAST_HUBS.filter((other) => other.lang !== lang).map((other) => ({
      lang: other.lang,
      path: other.path,
      name: nativeName(other.lang),
    })),
  };
}

export async function loadPodcastKit(
  category: string,
  lang: string,
): Promise<PodcastKitPage | null> {
  const hub = hubFor(lang);
  if (!hub) return null;
  const { packs } = await DATA[lang]();
  const kit = packs.find((candidate) => candidate.category === category);
  if (!kit) return null;
  const copy = PODCAST_COPY[lang];
  const count = kit.members.length;
  return {
    hub,
    copy,
    kit,
    heading: copy.kitHeading(kit.title, count),
    description: copy.kitDescription(kit.title, count),
    others: packs
      .filter((other) => other !== kit)
      .map((other) => ({ title: other.title, path: other.path })),
    versions: Object.entries(PODCAST_PATHS[category] ?? {})
      .filter(([other]) => other !== lang)
      .map(([other, path]) => ({ lang: other, path, name: nativeName(other) })),
  };
}

const SITE = 'https://mawkingbird.com';

/** schema.org: the hub lists its kits. */
export function podcastHubStructuredData(page: PodcastHubPage): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: page.copy.hubHeading,
    description: page.copy.hubDescription,
    url: `${SITE}/${page.hub.path}/`,
    inLanguage: page.hub.lang,
    breadcrumb: breadcrumbList([
      { name: 'Mawkingbird', path: '' },
      { name: page.hub.label, path: page.hub.path },
    ]),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: page.kits.length,
      itemListElement: page.kits.map((kit, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: kit.title,
        url: `${SITE}/${kit.path}/`,
      })),
    },
  };
}

/** schema.org: a kit page lists its shows, in page order. */
export function podcastKitStructuredData(page: PodcastKitPage): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: page.heading,
    description: page.description,
    url: `${SITE}/${page.kit.path}/`,
    inLanguage: page.hub.lang,
    breadcrumb: breadcrumbList([
      { name: 'Mawkingbird', path: '' },
      { name: page.hub.label, path: page.hub.path },
      { name: page.heading, path: page.kit.path },
    ]),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: page.kit.members.length,
      itemListElement: page.kit.members.map((show, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: show.displayName,
        ...(show.url ? { url: show.url } : {}),
      })),
    },
  };
}
