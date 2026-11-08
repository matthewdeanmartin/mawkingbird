import { PageLanguage } from '../../../focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  en: {
    title: 'War in Ukraine on Mastodon: people and tags to follow',
    description:
      'Follow reporting, analysis and civilian perspectives on the war in Ukraine. Choose Mastodon accounts and hashtags, preview posts and build your feed.',
    heading: 'War in Ukraine on Mastodon',
    listTitle: 'War in Ukraine',
    intro: [
      'Follow the war in Ukraine through reporting, analysis and accounts of its impact on civilians. Find people sharing sustained coverage of the invasion, humanitarian needs, human rights and reconstruction.',
      'Choose accounts and hashtags, then preview their public posts to find your mix. Relevant tags remain useful even when quiet. War coverage can include distressing images, and open hashtag feeds can contain misleading claims: check sources and attribution before sharing.',
    ],
    faq: [
      {
        q: 'Do I need an account?',
        a: 'You can browse and preview public posts without an account. Sign in with your Mastodon account to follow people and hashtags or create a list.',
      },
      {
        q: 'What coverage belongs here?',
        a: 'Regular reporting, sourced analysis, civilian experiences, humanitarian relief and documentation of the war. The selection excludes Russian state-controlled media and promotion of pro-invasion propaganda. Independent Russian journalism can belong here. Inclusion does not verify every claim, and public hashtag feeds are not curated.',
      },
      {
        q: 'How do I get onto this list?',
        a: 'Post regularly and substantively about the war and allow your server to suggest your profile. A flag or location alone is not enough; recent posts need to show a sustained focus. For help or removal, contact @mawkingbird@mastodon.social.',
      },
    ],
  },
};
