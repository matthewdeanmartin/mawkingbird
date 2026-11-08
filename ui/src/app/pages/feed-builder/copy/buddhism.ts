import { PageLanguage } from '../../../focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  en: {
    title: 'Buddhism on Mastodon: people and hashtags to follow',
    description:
      'Explore Buddhist practice, teachings, scholarship and community life on Mastodon. Choose people and hashtags across traditions and preview your feed.',
    heading: 'Buddhism on Mastodon',
    listTitle: 'Buddhism',
    intro: [
      'Bring Buddhist practice, teachings, scholarship and community life into your feed. This broad selection welcomes all traditions, including Theravada, Mahayana, Vajrayana, Zen, Pure Land, Nichiren and secular approaches.',
      'Choose people and hashtags, then preview their posts. Useful Buddhist tags remain available even when quiet, helping small conversations grow. Accounts are selected for recurring Buddhist content; a word in a bio is not enough.',
    ],
    faq: [
      {
        q: 'Do I need an account?',
        a: 'You can browse and preview public posts without an account. Sign in with your Mastodon account to follow people and hashtags or create a list.',
      },
      {
        q: 'Which traditions and kinds of posts belong here?',
        a: 'All Buddhist traditions and secular approaches are welcome, including practice, texts, philosophy, history, art and community life. The focus is substantive Buddhist content. Respectful debate and socially engaged practice belong here; feeds dominated by political grievances or hostility do not. Hashtags are open conversations, so preview their posts before choosing.',
      },
      {
        q: 'How do I get onto this list?',
        a: 'Post regularly about Buddhism and allow your server to suggest your profile. A Buddhist identity in your bio alone does not qualify: recent posts need to show a sustained connection to the topic. For help or removal, contact @mawkingbird@mastodon.social.',
      },
    ],
  },
};
