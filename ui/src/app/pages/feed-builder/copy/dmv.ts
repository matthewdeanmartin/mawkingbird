import { PageLanguage } from '../../../focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  en: {
    title: 'DC, Maryland and Virginia on Mastodon: people and tags to follow',
    description:
      'Build a local Mastodon feed for DC, Maryland and Virginia. Find people posting about the region, from neighborhoods and transit to food, arts and events.',
    heading: 'DC, Maryland and Virginia on Mastodon',
    listTitle: 'DMV: DC, Maryland and Virginia',
    intro: [
      'Find the DMV in your feed: neighborhood stories, local events, transit, arts, food and life around DC, Maryland and Virginia. This selection is for people who regularly post about the region, not simply people who live here.',
      'Choose people and hashtags, then preview their public posts. Useful local tags remain available even when they have no posts, so you can follow and help grow the conversations you want to see.',
    ],
    faq: [
      {
        q: 'Do I need an account?',
        a: 'You can browse and preview public posts without an account. Sign in with your Mastodon account to follow people and hashtags or create a list.',
      },
      {
        q: 'Which places and posts belong here?',
        a: 'DC, Maryland and Virginia are all included, with the Washington metro area at the center. Baltimore, Richmond and other communities across the two states belong too. Posts need a local connection: national politics using Washington as shorthand does not qualify. Some tags also contain unrelated posts or ads; use the preview to choose your mix.',
      },
      {
        q: 'How do I get onto this list?',
        a: 'Post regularly about the region and allow your server to suggest your profile. A location in your bio or membership of a local server is not enough: recent posts need to show a sustained local focus. For help or removal, contact @mawkingbird@mastodon.social.',
      },
    ],
  },
};
