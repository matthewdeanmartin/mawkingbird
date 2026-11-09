import { PageLanguage } from '../../../focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  en: {
    title: 'Canadian politics on Mastodon: journalists and civic news',
    description:
      'Follow Canadian politics through journalism, public policy and civic news. Preview English-language accounts and hashtags before building your Mastodon feed.',
    heading: 'Canadian politics on Mastodon',
    listTitle: 'Canadian Politics',
    intro: [
      'Follow Canadian politics through reporting on Parliament, provincial and municipal government, public policy and civic life. Start with established journalists, independent newsrooms and people explaining how public institutions work.',
      'Choose accounts and hashtags, then preview their recent posts. The selection favors substantive reporting over constant outrage. Hashtags are open streams; leave them unchecked if you prefer a feed built only from selected accounts. A separate French edition is also available.',
    ],
    faq: [
      {
        q: 'Do I need an account?',
        a: 'You can browse and preview public posts without an account. Sign in with your Mastodon account to follow people and hashtags or create a list.',
      },
      {
        q: 'What kind of political coverage is included?',
        a: 'Canadian civic reporting and policy explanation, including regional and Indigenous affairs. Extremist advocacy, hate, party recruitment and promotion of provincial independence are outside the selection. Neutral reporting on those subjects remains eligible. This selection does not guarantee equal representation across political viewpoints or filter future posts.',
      },
      {
        q: 'How do I get onto this list?',
        a: 'This topic focuses on established public voices and organizations with sustained, substantive coverage. Small personal accounts are left out for privacy, and discovery preferences are checked. For help or removal, contact @mawkingbird@mastodon.social.',
      },
    ],
  },
  fr: {
    title: 'Politique canadienne sur Mastodon\u00a0: actualités et voix à suivre',
    description:
      'Explore la politique canadienne en français\u00a0: journalisme, vie civique et débats publics. Choisis des comptes et des hashtags pour ton fil Mastodon.',
    heading: 'La politique canadienne sur Mastodon',
    listTitle: 'Politique canadienne',
    intro: [
      'Que se passe-t-il à Ottawa, à Québec et dans les municipalités\u202f? Retrouve des reportages, des analyses et des explications sur les décisions qui touchent la vie quotidienne. Cette sélection en français privilégie les sources publiques établies et les échanges de fond.',
      'Choisis tes comptes et tes hashtags, puis consulte un aperçu du fil. Les hashtags sont des flux ouverts\u00a0: décoche-les si tu préfères suivre uniquement les comptes sélectionnés. Trois comptes relaient automatiquement les articles de Radio-Canada, de La Presse et de L’Actualité\u202f; ils ne sont pas affiliés à ces médias.',
    ],
    faq: [
      {
        q: 'Faut-il un compte\u202f?',
        a: 'Tu peux parcourir la sélection et lire les publications publiques sans compte. Connecte-toi avec ton compte Mastodon pour suivre des personnes et des hashtags ou créer une liste.',
      },
      {
        q: 'Comment les sources sont-elles choisies\u202f?',
        a: 'Nous cherchons des reportages et des explications sur la vie civique canadienne, sans extrémisme, haine ni promotion de l’indépendance provinciale. Couvrir un débat constitutionnel ne signifie pas soutenir une cause. La sélection ne promet ni un équilibre parfait entre les opinions ni un contrôle des publications futures. Le hashtag PolitiqueCanadienne est encore peu utilisé.',
      },
      {
        q: 'Comment figurer dans cette liste\u202f?',
        a: 'Cette sélection privilégie les voix publiques établies et les organisations qui traitent régulièrement du sujet. Les petits comptes personnels sont laissés de côté pour préserver leur tranquillité. Pour une question ou une demande de retrait, contacte @mawkingbird@mastodon.social.',
      },
    ],
  },
};
