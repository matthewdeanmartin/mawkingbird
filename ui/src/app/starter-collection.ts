import { Account } from './models';
import { BUNDLED_STARTER_KITS } from './bundled-starter-kits.generated';
import catalog from './starter-catalog.generated.json';

/** A code-shipped account snapshot used to make Anonymous follows instant and offline-first. */
export interface StarterAccount {
  name: string;
  handle: string;
  account: Account;
}

/** A developer-curated starter kit backed by home-instance account snapshots. */
export interface StarterKit {
  slug: string;
  title: string;
  blurb: string;
  accounts: readonly StarterAccount[];
  lang?: string;
  titles?: Readonly<Partial<Record<string, string>>>;
  blurbs?: Readonly<Partial<Record<string, string>>>;
}

function starter(name: string, handle: string, id: string): StarterAccount {
  const [username, domain] = handle.split('@');
  return {
    name,
    handle,
    account: {
      id,
      username,
      acct: handle,
      display_name: name,
      note: '',
      url: `https://${domain}/@${username}`,
      avatar: '',
      avatar_static: '',
      header: '',
      header_static: '',
      followers_count: 0,
      following_count: 0,
      statuses_count: 0,
      bot: false,
      locked: false,
      fields: [],
    },
  };
}

/**
 * Canonical account ids were refreshed from each account's home instance on 2026-07-22.
 * They let Anonymous follow and begin loading public posts without a preliminary search.
 * Authenticated users still resolve handles on their own instance before a real follow.
 */
export const STARTER_COLLECTION: readonly StarterAccount[] = [
  starter('Eugen Rochko', 'Gargron@mastodon.social', '1'),
  starter('Mastodon', 'Mastodon@mastodon.social', '13179'),
  starter('Mastodon Engineering', 'MastodonEngineering@mastodon.social', '110752047556790864'),
  starter('Foone', 'foone@digipres.club', '109388102040291211'),
  starter('The Retroist', 'retroist@mastodon.social', '108193834673661187'),
  starter('FediTips', 'FediTips@social.growyourown.services', '111589347315890061'),
  starter('Electronic Frontier Foundation', 'eff@mastodon.social', '41055'),
  starter('Cory Doctorow / Pluralistic', 'pluralistic@mamot.fr', '303320'),
  starter('Internet Archive', 'internetarchive@mastodon.archive.org', '109326087888226666'),
  starter('Molly White', 'molly0xfff@hachyderm.io', '109332059958892971'),
  starter('Ars Technica', 'arstechnica@mastodon.social', '110266162634306901'),
  starter('ProPublica', 'ProPublica@newsie.social', '109365798068322628'),
  starter('Dan Gillmor', 'dangillmor@mastodon.social', '109208442152198181'),
  starter('Prof. Sam Lawler', 'sundogplanets@mastodon.social', '108194428751240116'),
  starter('David Fox', 'DavidBFox@mastodon.social', '108194549983680128'),
  starter('Stephen Coles', 'stewf@mastodon.social', '452349'),
  starter('Krita', 'krita@mastodon.art', '55816'),
  starter('Blender', 'blender@mastodon.social', '284692'),
  starter('OpenStreetMap', 'openstreetmap@en.osm.town', '2'),
  starter('Derek Powazek', 'fraying@xoxo.zone', '31335'),
  starter('Cats of Yore', 'CatsOfYore@mastodon.social', '114531277983931693'),
  starter('Medieval Illumination', 'medieval_illuminations@mastodon.social', '111014458979366278'),
  starter('LucasArts Places', 'lucasarts_places@mastodon.social', '113427937216241635'),
];

export const STARTER_KITS: readonly StarterKit[] = [
  ...catalog.packs.map(
    (pack): StarterKit => ({
      slug: `catalog-${pack.lang}-${pack.slug}`,
      lang: pack.lang,
      title: pack.title.en,
      blurb: pack.blurb.en,
      titles: pack.title,
      blurbs: pack.blurb,
      accounts: pack.accounts.map((profile) => ({
        name: profile.displayName || profile.acct.split('@')[0],
        handle: profile.acct,
        account: {
          ...starter(profile.displayName, profile.acct, profile.id).account,
          note: profile.note,
          url: profile.url,
          avatar: profile.avatar,
          avatar_static: profile.avatar,
          followers_count: profile.followers,
          bot: profile.bot,
        },
      })),
    }),
  ),
  {
    slug: 'starter',
    title: 'Universal starter kit',
    blurb:
      'A general-purpose mix of projects, reporting, art, history, science, and delightful bots — the one to take if you have no idea where to begin.',
    accounts: STARTER_COLLECTION,
  },
  ...BUNDLED_STARTER_KITS.map((kit) => ({
    slug: kit.slug,
    title: kit.title,
    blurb: kit.blurb,
    accounts: kit.accounts.map((account) => ({
      name: account.display_name || account.username,
      handle: account.acct,
      account,
    })),
  })),
];

export const STARTER_CATALOG_UPDATED_AT = catalog.generatedAt;

export function starterKitText(kit: StarterKit, locale: string): { title: string; blurb: string } {
  // A pack's content language wins even when the app's chrome is in English.
  const language = (kit.lang ?? locale).toLowerCase().split(/[-_]/)[0];
  return {
    title: kit.titles?.[language] ?? kit.title,
    blurb: kit.blurbs?.[language] ?? kit.blurb,
  };
}

export function starterKit(slug: string): StarterKit | null {
  return STARTER_KITS.find((kit) => kit.slug === slug) ?? null;
}
