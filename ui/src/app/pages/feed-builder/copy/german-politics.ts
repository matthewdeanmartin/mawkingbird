import { PageLanguage } from '../../../focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  de: {
    title: 'Deutsche Politik auf Mastodon: Nachrichten und Stimmen',
    description:
      'Entdecke Journalismus, Parlamentsberichte und politische Bildung auf Mastodon. Wähle deutschsprachige Konten und Hashtags für deinen Feed.',
    heading: 'Deutsche Politik auf Mastodon',
    listTitle: 'Deutsche Politik',
    intro: [
      'Was wird im Bundestag beschlossen, was bewegt die Kommunen und wie kannst du dich einbringen? Hier findest du deutschsprachige Nachrichten, Parlamentsberichte, politische Bildung und Einordnungen zu öffentlichen Entscheidungen.',
      'Wähle Konten und Hashtags aus und schau dir ihren Feed an. Die Auswahl setzt auf sachliche Information und demokratische Debatten. Hashtags sind offene Gesprächsräume: Wenn du nur ausgewählte Quellen lesen möchtest, lass die Hashtags abgewählt.',
    ],
    faq: [
      {
        q: 'Brauche ich ein Konto?',
        a: 'Du kannst die Auswahl und öffentliche Beiträge ohne Konto ansehen. Melde dich mit deinem Mastodon-Konto an, um Konten und Hashtags zu folgen oder eine Liste anzulegen.',
      },
      {
        q: 'Welche politischen Inhalte finde ich hier?',
        a: 'Im Mittelpunkt stehen deutsche Politik und gesellschaftliche Mitgestaltung. Extremistische oder antisemitische Inhalte, Werbung für die AfD und dauernde Empörung gehören nicht zur Auswahl. Sachliche Berichte über Parteien sind keine Unterstützung dieser Parteien. Konten, die vorwiegend über den Nahostkonflikt schreiben, passen nicht zu diesem Thema. Die Auswahl garantiert weder ein gleichmäßiges Meinungsspektrum noch die Prüfung zukünftiger Beiträge.',
      },
      {
        q: 'Wie komme ich auf diese Liste?',
        a: 'Diese Auswahl richtet sich an etablierte öffentliche Stimmen und Organisationen, die regelmäßig zum Thema beitragen. Kleine persönliche Konten bleiben aus Rücksicht auf ihre Privatsphäre außen vor. Wünsche zur Auffindbarkeit werden berücksichtigt. Bei Fragen oder für eine Entfernung erreichst du @mawkingbird@mastodon.social.',
      },
    ],
  },
};
