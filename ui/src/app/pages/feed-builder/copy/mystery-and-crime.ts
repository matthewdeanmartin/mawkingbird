import { PageLanguage } from '../../../focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  en: {
    title: 'Mystery and crime books on Mastodon: people and hashtags',
    description:
      'Find mystery and crime readers, authors and book discussions on Mastodon. Choose people and hashtags, then preview your next reading community.',
    heading: 'Mystery and crime books on Mastodon',
    listTitle: 'Mystery and crime',
    intro: [
      'Find your next puzzling case and people to discuss it with. Explore mystery and crime fiction through reader recommendations, reviews and authors sharing their work, from cozy mysteries and detective novels to noir and crime thrillers.',
      'Choose people and hashtags, then preview their posts before following. Useful genre tags remain available even when quiet. Accounts are selected for recurring book content and substantive author updates, not just a keyword in a profile.',
    ],
    faq: [
      {
        q: 'Do I need an account?',
        a: 'Browse and preview public posts without an account. Sign in with your Mastodon account to follow your selection or create a list.',
      },
      {
        q: 'Which kinds of books belong here?',
        a: 'Mystery and crime fiction across subgenres: detective stories, cozy mysteries, police procedurals, noir, historical mysteries and crime thrillers. Reading, reviewing, translating and writing these books all count. True crime, current crime news and screen-only fandom are separate topics. Hashtags are open conversations, so preview them before choosing.',
      },
      {
        q: 'How do I get onto this list?',
        a: 'Share mystery or crime book content regularly and allow your server to suggest your profile. Substantive updates about your own books qualify too; a genre in your bio alone does not. For help or removal, contact @mawkingbird@mastodon.social.',
      },
    ],
  },
  de: {
    title: 'Krimis auf Mastodon: Menschen und Hashtags entdecken',
    description:
      'Entdecke Menschen, die Krimis lesen und schreiben. Wähle Profile und Hashtags von Cosy Crime bis Noir und schau dir deinen Feed vorab an.',
    heading: 'Krimis auf Mastodon',
    listTitle: 'Krimis',
    intro: [
      'Entdecke deinen nächsten spannenden Fall und Menschen, mit denen du darüber sprechen kannst. Hier findest du Lesetipps, Rezensionen und Einblicke ins Schreiben: von Cosy Crime und Detektivromanen bis zu Noir und Kriminalthrillern.',
      'Wähle Profile und Hashtags aus und schau dir die Beiträge in der Vorschau an. Auch passende Hashtags mit wenigen oder noch gar keinen Beiträgen bleiben dabei. Entscheidend sind regelmäßige Beiträge über Krimis und inhaltliche Einblicke in eigene Bücher, nicht bloß ein Schlagwort im Profil.',
    ],
    faq: [
      {
        q: 'Brauche ich ein Konto?',
        a: 'Du kannst die Auswahl und öffentliche Beiträge ohne Konto ansehen. Melde dich mit deinem Mastodon-Konto an, um Profilen und Hashtags zu folgen oder eine Liste anzulegen.',
      },
      {
        q: 'Welche Bücher gehören dazu?',
        a: 'Kriminalliteratur in ihren verschiedenen Formen: Detektivgeschichten, Cosy Crime, Polizeikrimis, Noir, historische Krimis und Kriminalthriller. Lesen, Rezensieren, Übersetzen und Schreiben gehören gleichermaßen dazu. True Crime, aktuelle Kriminalnachrichten und reine Film- oder Serienbeiträge sind andere Themen. Hashtags sind offene Gespräche. Schau deshalb vor dem Folgen in die Vorschau.',
      },
      {
        q: 'Wie komme ich auf diese Liste?',
        a: 'Teile regelmäßig Beiträge über Krimis und erlaube deinem Server, dein Profil vorzuschlagen. Inhaltliche Einblicke in eigene Bücher zählen ebenfalls; ein Schlagwort im Profil allein reicht nicht. Für Hilfe oder eine Entfernung kontaktiere @mawkingbird@mastodon.social.',
      },
    ],
  },
};
