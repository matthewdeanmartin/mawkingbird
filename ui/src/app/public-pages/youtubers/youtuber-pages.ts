import HUBS from './youtuber-hubs.json';
import { YOUTUBER_DATA } from './youtuber-data.generated';
import { clipDescription, youtuberCopy, YoutuberCopy } from './youtuber-copy';
import type { YoutuberPack, YoutuberPaths } from './youtuber-types';
import PATHS from './youtuber-paths.generated.json';

const YOUTUBER_PATHS = PATHS as YoutuberPaths;
import { breadcrumbList } from '../breadcrumbs';

/**
 * The public YouTuber kit pages' model: everything a hub or a kit page renders,
 * resolved before it renders (and before prerendering). Imported lazily by the
 * routes; kit data loads per language.
 */
export interface YoutuberHub {
  lang: string;
  path: string;
  label: string;
}

const HUB_ENTRIES = Object.entries(HUBS as Record<string, unknown>)
  .filter(([key]) => key !== '$comment')
  .map(([lang, hub]) => ({ lang, ...(hub as { path: string; label: string }) }));

export function youtuberHubFor(lang: string): YoutuberHub | undefined {
  return HUB_ENTRIES.find((hub) => hub.lang === lang);
}

/** Another language's edition of the same page, named in its own language. */
export interface PageVersion {
  lang: string;
  path: string;
  name: string;
}

/** A language's name in that language (Deutsch, Français, 日本語). */
export function nativeName(lang: string): string {
  try {
    const name = new Intl.DisplayNames([lang], { type: 'language' }).of(lang) ?? lang;
    return name.charAt(0).toLocaleUpperCase(lang) + name.slice(1);
  } catch {
    return lang;
  }
}

export interface KitLink {
  title: string;
  icon: string | null;
  path: string;
  count: number;
}

export interface YoutuberHubPage {
  lang: string;
  hub: YoutuberHub;
  copy: YoutuberCopy;
  kits: KitLink[];
  versions: PageVersion[];
}

export interface YoutuberKitPage {
  lang: string;
  hub: YoutuberHub;
  copy: YoutuberCopy;
  pack: YoutuberPack;
  title: string;
  heading: string;
  description: string;
  others: KitLink[];
  versions: PageVersion[];
}

async function packsFor(lang: string): Promise<YoutuberPack[]> {
  const load = YOUTUBER_DATA[lang];
  return load ? (await load()).packs : [];
}

const titleOf = (pack: YoutuberPack, lang: string) => pack.title[lang] ?? pack.title['en'];

function linkTo(pack: YoutuberPack, lang: string): KitLink {
  return {
    title: titleOf(pack, lang),
    icon: pack.icon,
    path: pack.path,
    count: pack.members.length,
  };
}

export async function loadHub(lang: string): Promise<YoutuberHubPage | null> {
  const hub = youtuberHubFor(lang);
  if (!hub) return null;
  const packs = await packsFor(lang);
  const versions = HUB_ENTRIES.filter(
    (other) => other.lang !== lang && YOUTUBER_PATHS.languages[other.lang],
  ).map((other) => ({ lang: other.lang, path: other.path, name: nativeName(other.lang) }));
  return {
    lang,
    hub,
    copy: youtuberCopy(lang),
    kits: packs.map((pack) => linkTo(pack, lang)),
    versions,
  };
}

export async function loadKit(category: string, lang: string): Promise<YoutuberKitPage | null> {
  const hub = youtuberHubFor(lang);
  if (!hub) return null;
  const packs = await packsFor(lang);
  const pack = packs.find((candidate) => candidate.category === category);
  if (!pack) return null;
  const copy = youtuberCopy(lang);
  const title = titleOf(pack, lang);
  return {
    lang,
    hub,
    copy,
    pack,
    title,
    heading: copy.kitHeading(title, pack.members.length),
    description: clipDescription(copy.kitDescription(title, pack.members.length)),
    others: packs.filter((other) => other !== pack).map((other) => linkTo(other, lang)),
    versions: Object.entries(YOUTUBER_PATHS.kits[category] ?? {})
      .filter(([other]) => other !== lang && youtuberHubFor(other))
      .map(([other, path]) => ({ lang: other, path, name: nativeName(other) })),
  };
}

const SITE = 'https://mawkingbird.com';

/** schema.org: the hub lists its kits. */
export function hubStructuredData(page: YoutuberHubPage): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: page.copy.hubHeading,
    description: page.copy.hubDescription,
    url: `${SITE}/${page.hub.path}/`,
    inLanguage: page.lang,
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

/** schema.org: a kit page lists its creators, in page order. */
export function kitStructuredData(page: YoutuberKitPage): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: page.heading,
    description: page.description,
    url: `${SITE}/${page.pack.path}/`,
    inLanguage: page.lang,
    breadcrumb: breadcrumbList([
      { name: 'Mawkingbird', path: '' },
      { name: page.hub.label, path: page.hub.path },
      { name: page.heading, path: page.pack.path },
    ]),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: page.pack.members.length,
      itemListElement: page.pack.members.map((member, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: member.displayName,
        url: member.url ?? `https://www.youtube.com/channel/${member.channel.id}`,
      })),
    },
  };
}
