import { PageLanguage } from '../../../public-pages/focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  en: {
    title: 'US politics on Mastodon: journalists and civic news to follow',
    description:
      'Build a US politics feed with journalists, civic explainers and public-interest reporting. Preview Mastodon accounts and hashtags before following.',
    heading: 'US politics on Mastodon',
    listTitle: 'US Politics',
    intro: [
      'Follow US politics through reporting on elections, government, public policy and civic life. Start with established journalists, investigative newsrooms and people explaining how public institutions work.',
      'Choose the accounts and hashtags that interest you, then preview their recent posts. The account selection favors substantive reporting over constant outrage. Hashtags are open streams and can include posts outside that selection; leave them unchecked if you prefer a feed built only from selected accounts.',
    ],
    faq: [
      {
        q: 'Do I need an account?',
        a: 'You can browse and preview public posts without an account. Sign in with your Mastodon account to follow people and hashtags or create a list.',
      },
      {
        q: 'What kind of political coverage is included?',
        a: 'Reporting, investigations and civic explanation, including state and local government. The selection excludes extremist advocacy, hate and party recruitment. It is an editorial selection, not a guarantee of equal representation across political viewpoints or a filter on future posts.',
      },
      {
        q: 'How do I get onto this list?',
        a: 'This topic focuses on established public voices and organizations with sustained, substantive coverage. Small personal accounts are left out for privacy, and account discovery preferences are respected. For help or removal, contact @mawkingbird@mastodon.social.',
      },
    ],
  },
};
