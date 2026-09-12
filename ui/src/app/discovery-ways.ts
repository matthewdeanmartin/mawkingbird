export interface DiscoveryWay {
  id: string;
  level: 'basic' | 'advanced';
  title: string;
  description: string;
  route: string;
  query?: Record<string, string>;
  fragment?: string;
}

// i18n discovery.starterPacks.title: Starter packs
// i18n discovery.starterPacks.description: Pick an interest and meet a ready-made group of people to follow.
// i18n discovery.collections.title: Collections
// i18n discovery.collections.description: Discover groups of accounts curated by other people.
// i18n discovery.invites.title: Invite your friends
// i18n discovery.invites.description: Bring the people you already enjoy talking with into your feed.

/** Shared by the discovery hub and Home's invitation cards, in onboarding order. */
export const DISCOVERY_WAYS: readonly DiscoveryWay[] = [
  {
    id: 'starter-packs',
    level: 'basic',
    title: 'discovery.starterPacks.title',
    description: 'discovery.starterPacks.description',
    route: '/bundled-starter-kits',
    query: { kind: 'packs' },
  },
  {
    id: 'collections',
    level: 'basic',
    title: 'discovery.collections.title',
    description: 'discovery.collections.description',
    route: '/bundled-starter-kits',
    query: { kind: 'collections' },
  },
  {
    id: 'invites',
    level: 'basic',
    title: 'discovery.invites.title',
    description: 'discovery.invites.description',
    route: '/invites',
  },
  {
    id: 'offsite-directories',
    level: 'basic',
    title: 'pages.findFriends.offsiteDirectories.title',
    description: 'pages.findFriends.offsiteDirectories.desc',
    route: '/offsite-directories',
  },
  {
    id: 'account-search',
    level: 'advanced',
    title: 'pages.findFriends.searchByName.title',
    description: 'pages.findFriends.searchByName.desc',
    route: '/search',
    query: { type: 'accounts' },
  },
  {
    id: 'post-search',
    level: 'advanced',
    title: 'pages.findFriends.searchAnything.title',
    description: 'pages.findFriends.searchAnything.desc',
    route: '/search',
    query: { type: 'statuses' },
  },
  {
    id: 'profile-directory',
    level: 'advanced',
    title: 'pages.findFriends.profileDirectory.title',
    description: 'pages.findFriends.profileDirectory.desc',
    route: '/directory',
  },
  {
    id: 'contacts',
    level: 'advanced',
    title: 'pages.findFriends.contacts.title',
    description: 'pages.findFriends.contacts.descUpload',
    route: '/settings/import-export',
    fragment: 'contacts',
  },
  {
    id: 'import',
    level: 'advanced',
    title: 'pages.findFriends.importFollowList.title',
    description: 'pages.findFriends.importFollowList.desc',
    route: '/settings/import-export',
  },
];

export const DISCOVERY_CARD_INTERVAL = 20;

export function discoveryCardAfter(postIndex: number): DiscoveryWay | null {
  if ((postIndex + 1) % DISCOVERY_CARD_INTERVAL !== 0) return null;
  return DISCOVERY_WAYS[((postIndex + 1) / DISCOVERY_CARD_INTERVAL - 1) % DISCOVERY_WAYS.length];
}
