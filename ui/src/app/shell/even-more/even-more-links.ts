import { FeatureFlagId } from '../../platform/build/feature-flags';

/**
 * The "Even more" dialog's direct links, as data (spec/sprint/explore-2026-11.md,
 * Sprint 5). The `…` menu is full and locked; a feature that needs a door and
 * does not earn a `…` row gets a line here instead. One flat page of links on
 * purpose: no nested menus to build, maintain and make work on a phone.
 *
 * Every link must work wherever it shows: gate it with `flag`, `requires` or
 * `discovery` rather than leaving a door that can only fail.
 */
export interface EvenMoreLink {
  id: string;
  labelKey: string;
  link: string;
  queryParams?: Record<string, string>;
  /** Only when this feature flag is on. */
  flag?: FeatureFlagId;
  /** `signedIn`: hidden for Anonymous. `mastodon`: needs a Mastodon token. */
  requires?: 'signedIn' | 'mastodon';
  /** A discovery page: hidden while the Wellness discovery window is closed. */
  discovery?: boolean;
}

export interface EvenMoreSection {
  id: string;
  titleKey: string;
  links: readonly EvenMoreLink[];
}

// i18n evenMore.section.explore: Explore
// i18n evenMore.section.feeds: Feeds and writing
// i18n evenMore.section.diagnostics: Diagnostics
// i18n evenMore.link.feedCheckup: Feed checkup
// i18n evenMore.link.kits: Starter kits
// i18n evenMore.link.people: Find people
// i18n evenMore.link.hashtags: Find hashtags
// i18n evenMore.link.lists: Lists
// i18n evenMore.link.followedTags: Followed hashtags
// i18n evenMore.link.feedDoctor: Feed Doctor
// i18n evenMore.link.drafts: Drafts
// i18n evenMore.link.pastes: Pastes
// i18n evenMore.link.links: Links
// i18n evenMore.link.apiCalls: API calls
// i18n evenMore.link.logs: Logs
// i18n evenMore.link.storage: Storage diagnostics

export const EVEN_MORE_SECTIONS: readonly EvenMoreSection[] = [
  {
    id: 'explore',
    titleKey: 'evenMore.section.explore',
    links: [
      { id: 'feed', labelKey: 'evenMore.link.feedCheckup', link: '/explore/feed', discovery: true },
      { id: 'kits', labelKey: 'evenMore.link.kits', link: '/explore/kits', discovery: true },
      { id: 'people', labelKey: 'evenMore.link.people', link: '/explore/people', discovery: true },
      { id: 'tags', labelKey: 'evenMore.link.hashtags', link: '/explore/tags', discovery: true },
    ],
  },
  {
    // Rows squeezed out of `…` over time (see the comments in shell.html).
    id: 'feeds',
    titleKey: 'evenMore.section.feeds',
    links: [
      { id: 'lists', labelKey: 'evenMore.link.lists', link: '/feeds/lists' },
      { id: 'followed-tags', labelKey: 'evenMore.link.followedTags', link: '/feeds/tags' },
      { id: 'feed-doctor', labelKey: 'evenMore.link.feedDoctor', link: '/feed-doctor' },
      { id: 'drafts', labelKey: 'evenMore.link.drafts', link: '/drafts' },
      { id: 'pastes', labelKey: 'evenMore.link.pastes', link: '/pastes', flag: 'pastebin' },
      { id: 'links', labelKey: 'evenMore.link.links', link: '/links', flag: 'links' },
    ],
  },
  {
    id: 'diagnostics',
    titleKey: 'evenMore.section.diagnostics',
    links: [
      { id: 'api', labelKey: 'evenMore.link.apiCalls', link: '/observability/api' },
      { id: 'logs', labelKey: 'evenMore.link.logs', link: '/observability/logs' },
      { id: 'storage', labelKey: 'evenMore.link.storage', link: '/storage-diagnostics' },
    ],
  },
];
