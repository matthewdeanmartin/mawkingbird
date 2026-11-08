import { PageLanguage } from '../../../focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  en: {
    title: 'Historical fiction on Mastodon: people and hashtags to follow',
    description:
      'Explore historical novels, reader recommendations and authors on Mastodon. Choose people and hashtags, then preview your historical fiction feed.',
    heading: 'Historical fiction on Mastodon',
    listTitle: 'Historical fiction',
    intro: [
      'Find stories that bring the past to life and people to discuss them with. Explore historical fiction through book recommendations, reviews and authors sharing their work, across eras and regions.',
      'Choose people and hashtags, then preview their posts before following. Historical mysteries, romances and other genre blends belong here when the historical setting matters. Relevant tags remain available even when quiet, helping small reading communities grow.',
    ],
    faq: [
      {
        q: 'Do I need an account?',
        a: 'Browse and preview public posts without an account. Sign in with your Mastodon account to follow your selection or create a list.',
      },
      {
        q: 'Which books and conversations belong here?',
        a: 'Fiction with a meaningful historical setting, including novels, short stories, historical mysteries and historical romance. Reading, reviewing, translating and writing these books all count, as does research tied to a fictional work. General history and nonfiction alone do not qualify, and a classic is not historical fiction just because it is old. Hashtags are open conversations, so preview their posts before choosing.',
      },
      {
        q: 'How do I get onto this list?',
        a: 'Share historical-fiction book content regularly and allow your server to suggest your profile. Substantive author updates count too; a bio keyword alone does not. For help or removal, contact @mawkingbird@mastodon.social.',
      },
    ],
  },
};
