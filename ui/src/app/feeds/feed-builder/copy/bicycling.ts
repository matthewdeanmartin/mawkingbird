import { PageLanguage } from '../../../public-pages/focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  en: {
    title: 'Bicycling on Mastodon: rides, touring and community',
    description:
      'Find cycling stories, practical bike advice and community rides on Mastodon. Choose people and hashtags, preview their posts and build your feed.',
    heading: 'Bicycling on Mastodon',
    listTitle: 'Bicycling',
    intro: [
      'A weekend tour, a gravel ride or the school run by cargo bike: these riders and cycling groups share routes, equipment experiences and everyday adventures on two wheels.',
      'Choose accounts and hashtags, then preview their posts. The selection includes recreational riding, practical bicycle care and constructive conversations about making cycling easier. Open hashtags can also contain unrelated posts.',
    ],
    faq: [
      {
        q: 'Do I need an account?',
        a: 'You can browse the selection and public posts without an account. Sign in with your Mastodon account to follow people and hashtags or make a list.',
      },
      {
        q: 'Is this only for competitive cyclists?',
        a: 'No. Commuting, family rides, touring, mountain biking and everyday bicycle care belong here too. Some hashtags are quiet, and people may discuss other interests. Preview the feed and keep what suits you.',
      },
      {
        q: 'How do I get onto this list?',
        a: 'Opted-in community accounts can qualify at any follower count when they pass the privacy checks and regularly share useful bicycling content. Sales-only feeds and automated ride logs without commentary are excluded. For questions or removal, contact @mawkingbird@mastodon.social.',
      },
    ],
  },
  de: {
    title: 'Radfahren auf Mastodon: Radtouren, Alltag und Gemeinschaft',
    description:
      'Entdecke Radtouren, Alltag auf dem Fahrrad und praktische Erfahrungen auf Mastodon. Wähle deutschsprachige Konten und passende Hashtags für deinen Feed.',
    heading: 'Radfahren auf Mastodon',
    listTitle: 'Radfahren',
    intro: [
      'Mit dem Faltrad durch die Stadt, auf Tour durchs Land oder mit dem Lastenrad zum Einkaufen: Hier teilen Radfahrende und Fahrradvereine ihre Erfahrungen, Strecken und Ideen.',
      'Wähle Konten und Hashtags und schau dir den Feed an. Neben Touren und Fahrradtechnik findest du praktische Angebote und konstruktive Gespräche über bessere Radwege. Hashtags sind offene Gesprächsräume; manche sind ruhig oder enthalten auch andere Themen.',
    ],
    faq: [
      {
        q: 'Brauche ich ein Konto?',
        a: 'Du kannst die Auswahl und öffentliche Beiträge ohne Konto ansehen. Melde dich mit deinem Mastodon-Konto an, um Konten und Hashtags zu folgen oder eine Liste anzulegen.',
      },
      {
        q: 'Geht es nur um Rennrad und Wettkämpfe?',
        a: 'Nein. Alltagswege, Touren, Falträder, Familienfahrten und Fahrradpflege gehören genauso dazu. Die Konten können auch andere Interessen teilen. Prüfe den Feed in der Vorschau und wähle aus, was dich anspricht.',
      },
      {
        q: 'Wie komme ich auf diese Liste?',
        a: 'Auch kleine Community-Konten können dabei sein, wenn sie der Auffindbarkeit zustimmen, die Datenschutzprüfung bestehen und regelmäßig interessante Fahrradbeiträge teilen. Reine Verkaufsfeeds und automatische Trainingsprotokolle ohne eigene Einordnung gehören nicht dazu. Bei Fragen oder für eine Entfernung erreichst du @mawkingbird@mastodon.social.',
      },
    ],
  },
  fr: {
    title: 'Le vélo sur Mastodon\u00a0: sorties, ateliers et communauté',
    description:
      'Découvre le vélo au quotidien sur Mastodon\u00a0: sorties, ateliers de réparation et voyages. Choisis des comptes francophones et des hashtags pour ton fil.',
    heading: 'Le vélo sur Mastodon',
    listTitle: 'Vélo',
    intro: [
      'Partir en balade, réparer son vélo ou trouver un atelier près de chez soi\u00a0: cette sélection réunit des cyclistes et des associations qui partagent leurs expériences et font vivre le vélo au quotidien.',
      'Choisis des comptes et des hashtags, puis consulte un aperçu du fil. Tu y trouveras aussi des initiatives concrètes pour faciliter les déplacements à vélo. Les hashtags sont ouverts\u00a0: certains sont peu actifs et peuvent accueillir des publications sans rapport avec le sujet.',
    ],
    faq: [
      {
        q: 'Faut-il un compte\u202f?',
        a: 'Tu peux parcourir la sélection et lire les publications publiques sans compte. Connecte-toi avec ton compte Mastodon pour suivre des personnes et des hashtags ou créer une liste.',
      },
      {
        q: 'Est-ce réservé aux cyclistes sportifs\u202f?',
        a: 'Non. Les trajets du quotidien, les balades en famille, le voyage à vélo et la réparation ont toute leur place. Cette sélection comprend plusieurs associations locales. Consulte leurs publications pour trouver celles qui te correspondent.',
      },
      {
        q: 'Comment figurer dans cette liste\u202f?',
        a: 'Les comptes qui acceptent d’être découverts peuvent être retenus quel que soit leur nombre d’abonnés, après vérification des préférences de confidentialité et de leurs publications sur le vélo. Les flux purement commerciaux et les relevés automatiques sans commentaire sont exclus. Pour une question ou un retrait, contacte @mawkingbird@mastodon.social.',
      },
    ],
  },
};
