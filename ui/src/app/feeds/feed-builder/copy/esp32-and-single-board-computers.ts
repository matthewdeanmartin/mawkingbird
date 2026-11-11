import { PageLanguage } from '../../../public-pages/focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  en: {
    title: 'ESP32 and single-board computers on Mastodon: people and tags',
    description:
      'Find ESP32, Raspberry Pi and other board projects on Mastodon. Follow makers, board companies and useful hashtags, and preview their public posts.',
    heading: 'ESP32 and single-board computers on Mastodon',
    listTitle: 'ESP32 and single-board computers',
    intro: [
      'From an ESP32 sensor to a Raspberry Pi project: discover people building with microcontrollers and single-board computers, alongside the companies and communities making the boards and their software.',
      'Choose people and hashtags, then preview their public posts. Relevant tags stay available even with no posts: following and using the right tag helps a community grow.',
    ],
    faq: [
      {
        q: 'Do I need an account?',
        a: 'You can browse and preview public posts without an account. Sign in with your Mastodon account to follow people and hashtags or create a list.',
      },
      {
        q: 'Which boards and projects belong here?',
        a: 'ESP32, ESP8266, Raspberry Pi, Pico, Arduino and other development boards belong here, along with firmware, MicroPython, CircuitPython and projects built around them. General technology, Linux or smart-home posts need a clear connection to board projects. Some tags are quiet and others contain unrelated posts or ads; preview them to choose your mix.',
      },
      {
        q: 'How do I get onto this list?',
        a: 'Share board projects regularly and allow your server to suggest your profile. Recent activity, sustained topic fit and review determine the selection. For help or removal, contact @mawkingbird@mastodon.social.',
      },
    ],
  },
  de: {
    title: 'ESP32 und Einplatinencomputer auf Mastodon: Wem folgen?',
    description:
      'Entdecke ESP32, Raspberry Pi und andere Boards auf Mastodon. Folge Menschen mit eigenen Projekten, Herstellern und passenden Hashtags.',
    heading: 'ESP32 und Einplatinencomputer auf Mastodon',
    listTitle: 'ESP32 und Einplatinencomputer',
    intro: [
      'Ein Sensor mit ESP32, ein Projekt mit Raspberry Pi oder eigene Firmware: Hier findest du Menschen, die mit Mikrocontrollern und Einplatinencomputern bauen, sowie Hersteller und Communitys rund um die Boards.',
      'Wähle Menschen und Hashtags aus und schau dir ihre öffentlichen Beiträge in der Vorschau an. Passende Hashtags bleiben auch ohne Beiträge dabei. Wenn du ihnen folgst und sie selbst verwendest, kann daraus eine Community wachsen.',
    ],
    faq: [
      {
        q: 'Brauche ich ein Konto?',
        a: 'Zum Stöbern und für die Vorschau öffentlicher Beiträge brauchst du kein Konto. Um Menschen und Hashtags zu folgen oder eine Liste anzulegen, meldest du dich mit deinem Mastodon-Konto an.',
      },
      {
        q: 'Welche Boards und Projekte gehören dazu?',
        a: 'ESP32, ESP8266, Raspberry Pi, Pico, Arduino und weitere Entwicklungsboards sind dabei, ebenso Firmware, MicroPython, CircuitPython und Projekte damit. Allgemeine Technik, Linux und Smart Home gehören nur mit klarem Bezug zu solchen Boards dazu. Unter manchen Hashtags ist wenig los, andere enthalten Werbung oder fremde Themen. Die Vorschau hilft dir bei der Auswahl.',
      },
      {
        q: 'Wie komme ich auf diese Liste?',
        a: 'Schreib regelmäßig über deine Board-Projekte und erlaube deinem Server, dein Profil vorzuschlagen. Aktuelle Aktivität, dauerhafter Themenbezug und die Prüfung zählen. Bei Fragen oder für eine Entfernung erreichst du @mawkingbird@mastodon.social.',
      },
    ],
  },
};
