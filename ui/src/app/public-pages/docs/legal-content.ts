/** English source for the public legal page and the in-app legal hub. */
// i18n docs.overview: Mawkingbird is an open-source client for Mastodon, Bluesky, and RSS. The web app runs in your browser; Native runs on your computer. You choose the social servers and connected services it contacts.
// i18n docs.rulesOverview: Each Mastodon server sets its own rules and terms. Open the app to see those published by your selected server. Credits & Privacy explains the software Mawkingbird ships and what data its connections receive.
export const LEGAL_OVERVIEW =
  'Mawkingbird is an open-source client for Mastodon, Bluesky, and RSS. The web app runs in your browser; Native runs on your computer. You choose the social servers and connected services it contacts.';

export const LEGAL_RULES_OVERVIEW =
  'Each Mastodon server sets its own rules and terms. Open the app to see those published by your selected server. Credits & Privacy explains the software Mawkingbird ships and what data its connections receive.';

export const LEGAL_LINKS = [
  {
    path: '/tools',
    titleKey: 'docs.tools.title',
    detailKey: 'docs.tools.detail',
    title: 'Tools',
    detail:
      'Free single-purpose tools: pick a handle, find your friends, schedule posts, tidy up your account.',
  },
  {
    path: '/communities',
    titleKey: 'docs.communities.title',
    detailKey: 'docs.communities.detail',
    title: 'Mastodon communities by interest',
    detail:
      'Hashtags, people and servers for one interest at a time: science fiction, math, gardening and more.',
  },
  {
    path: '/about',
    appPath: '/app/about',
    titleKey: 'docs.design.title',
    detailKey: 'docs.design.detail',
    title: 'Design',
    detail: 'Why this client exists.',
  },
  {
    path: '/funding',
    appPath: '/app/funding',
    titleKey: 'docs.funding.title',
    detailKey: 'docs.funding.detail',
    title: 'Funding',
    detail: "What this costs, who pays for it, and where it's going.",
  },
  {
    path: '/credits',
    titleKey: 'docs.credits.title',
    detailKey: 'docs.credits.detail',
    title: 'Credits & Privacy',
    detail: 'The software this client ships, and how it handles data.',
  },
] as const;
