import { PageLanguage } from '../../../public-pages/focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  en: {
    title: 'Romance books on Mastodon: readers, authors and hashtags',
    description:
      'Find romance readers, authors and book conversations on Mastodon. Choose people and hashtags across romance genres, then preview your feed.',
    heading: 'Romance books on Mastodon',
    listTitle: 'Romance books',
    intro: [
      'Find your next love story and people to talk about it with. Explore romance novels, reader recommendations, reviews and authors sharing their work, from contemporary and historical romance to romantasy and queer love stories.',
      'Choose people and hashtags, then preview their posts before following. Relevant tags remain available even when quiet: small reading communities need somewhere to start. Book content and author updates matter more than a genre word in a profile.',
    ],
    faq: [
      {
        q: 'Do I need an account?',
        a: 'Browse and preview public posts without an account. Sign in with your Mastodon account to follow your selection or create a list.',
      },
      {
        q: 'Which kinds of romance belong here?',
        a: 'Romance across subgenres belongs here, including contemporary, historical, paranormal, romantic suspense, romantasy, New Adult and LGBTQ+ romance. Reading, reviewing, translating and writing romance all count. Hashtags are open conversations and may include mature themes, so preview the posts and choose what suits you.',
      },
      {
        q: 'How do I get onto this list?',
        a: 'Share romance book content regularly and allow your server to suggest your profile. Substantive author updates count too; a bio keyword alone does not. For help or removal, contact @mawkingbird@mastodon.social.',
      },
    ],
  },
  de: {
    title: 'Liebesromane auf Mastodon: Menschen und Hashtags entdecken',
    description:
      'Entdecke Menschen, die Liebesromane lesen und schreiben. Wähle Profile und Hashtags von Romance bis Romantasy und sieh dir deinen Feed vorab an.',
    heading: 'Liebesromane auf Mastodon',
    listTitle: 'Liebesromane',
    intro: [
      'Entdecke deine nächste Liebesgeschichte und Menschen, mit denen du darüber sprechen kannst. Hier findest du Lesetipps, Rezensionen und Einblicke ins Schreiben: von zeitgenössischen und historischen Liebesromanen bis zu Romantasy und queeren Liebesgeschichten.',
      'Wähle Profile und Hashtags aus und schau dir die Beiträge in der Vorschau an. Auch passende Hashtags mit wenigen oder noch gar keinen Beiträgen bleiben dabei: Kleine Lesegemeinschaften brauchen einen Anfang. Entscheidend sind Beiträge über Bücher, nicht bloß ein Genre im Profiltext.',
    ],
    faq: [
      {
        q: 'Brauche ich ein Konto?',
        a: 'Du kannst die Auswahl und öffentliche Beiträge ohne Konto ansehen. Melde dich mit deinem Mastodon-Konto an, um Profilen und Hashtags zu folgen oder eine Liste anzulegen.',
      },
      {
        q: 'Welche Liebesromane gehören dazu?',
        a: 'Alle Spielarten sind willkommen: zeitgenössische und historische Liebesromane, Paranormal Romance, Romantic Suspense, Romantasy, New Adult und LGBTQ+-Romance. Lesen, Rezensieren, Übersetzen und Schreiben gehören gleichermaßen dazu. Hashtags sind offene Gespräche und können auch Inhalte für Erwachsene enthalten. Schau deshalb in die Vorschau und wähle, was zu dir passt.',
      },
      {
        q: 'Wie komme ich auf diese Liste?',
        a: 'Teile regelmäßig Beiträge über Liebesromane und erlaube deinem Server, dein Profil vorzuschlagen. Inhaltliche Einblicke in eigene Bücher zählen ebenfalls; ein Schlagwort im Profil allein reicht nicht. Für Hilfe oder eine Entfernung kontaktiere @mawkingbird@mastodon.social.',
      },
    ],
  },
};
