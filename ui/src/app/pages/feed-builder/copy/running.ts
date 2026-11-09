import { PageLanguage } from '../../../focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  en: {
    title: 'Running on Mastodon: runners, races and community',
    description:
      'Find runners, race reports and training conversations on Mastodon. Preview community accounts and running hashtags, then build your own feed.',
    heading: 'Running on Mastodon',
    listTitle: 'Running',
    intro: [
      'Find company for the easy miles, your next parkrun or a race you have been training for. These community runners share training experiences, race reports and everyday life on the run.',
      'Choose people and hashtags, then preview the feed. Hashtags are open conversations: Marathon can also mean a video game, and trail tags can include hiking. Keep only the sources you enjoy.',
    ],
    faq: [
      {
        q: 'Do I need an account?',
        a: 'You can browse the selection and public posts without an account. Sign in with your Mastodon account to follow people and hashtags or make a list.',
      },
      {
        q: 'Is this just for experienced runners?',
        a: 'No. Recreational runners and parkrun volunteers belong here alongside race enthusiasts. Personal experiences are not individual coaching advice. Some hashtags are quiet; preview them to see what people are posting.',
      },
      {
        q: 'How do I get onto this list?',
        a: 'Community accounts can qualify at any follower count when they opt into discovery, pass the privacy checks and regularly post useful running content. Repetitive automated activity logs and sales-only feeds are not included. For questions or removal, contact @mawkingbird@mastodon.social.',
      },
    ],
  },
  de: {
    title: 'Laufen auf Mastodon: Laufberichte und Gemeinschaft',
    description:
      'Entdecke Laufberichte, Trainingserfahrungen und Parkrun auf Mastodon. Wähle deutschsprachige Laufkonten und Hashtags für deinen Feed.',
    heading: 'Laufen auf Mastodon',
    listTitle: 'Laufen',
    intro: [
      'Eine entspannte Runde, der nächste Parkrun oder die Vorbereitung auf einen Marathon: Hier teilen Läuferinnen und Läufer ihre Erfahrungen, Trainingsgeschichten und Wettkampfberichte.',
      'Wähle Konten und Hashtags aus und schau dir ihren Feed an. Hashtags sind offene Gesprächsräume und können auch andere Themen enthalten. Manche Laufsport-Tags sind noch ruhig; englische Tags ergänzen die deutschsprachige Auswahl.',
    ],
    faq: [
      {
        q: 'Brauche ich ein Konto?',
        a: 'Du kannst die Auswahl und öffentliche Beiträge ohne Konto ansehen. Melde dich mit deinem Mastodon-Konto an, um Konten und Hashtags zu folgen oder eine Liste anzulegen.',
      },
      {
        q: 'Ist die Auswahl nur für erfahrene Läufer gedacht?',
        a: 'Nein. Freizeitläufer, Parkrun-Begeisterte und Wettkampffans sind willkommen. Persönliche Trainingserfahrungen ersetzen keine individuelle Beratung. Schau dir die Beiträge vorher an und wähle aus, was zu dir passt.',
      },
      {
        q: 'Wie komme ich auf diese Liste?',
        a: 'Auch kleine Community-Konten können dabei sein, wenn sie der Auffindbarkeit zustimmen, die Datenschutzprüfung bestehen und regelmäßig interessante Laufbeiträge veröffentlichen. Reine automatische Trainingsprotokolle und Verkaufsfeeds gehören nicht zur Auswahl. Bei Fragen oder für eine Entfernung erreichst du @mawkingbird@mastodon.social.',
      },
    ],
  },
};
