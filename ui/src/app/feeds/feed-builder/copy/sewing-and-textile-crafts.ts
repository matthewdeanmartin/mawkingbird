import { PageLanguage } from '../../../public-pages/focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  en: {
    title: 'Sewing and textile crafts on Mastodon: who and what to follow',
    description:
      'Explore sewing and textile crafts on Mastodon. Find accounts and hashtags to follow, and browse before creating an account.',
    heading: 'Sewing and textile crafts on Mastodon',
    listTitle: 'Sewing and textile crafts',
    intro: [
      'Find sewing, knitting, crochet and embroidery projects, with makers sharing their progress, techniques and finished work.',
      'Start with the accounts and tags below, preview their posts and choose what belongs in your timeline. Some tags are starting points for quieter conversations.',
    ],
    faq: [
      {
        q: 'Do I need an account?',
        a: 'You can browse this page and preview public posts without an account. To follow people or hashtags, sign in with a Mastodon account.',
      },
      {
        q: 'Where should I start?',
        a: 'Preview a few accounts and tags before following. Accounts may discuss other subjects too, and activity under a tag can vary.',
      },
      {
        q: 'How do I get onto this list?',
        a: 'Share public posts about the topic and use relevant hashtags. Profiles must meet the catalogue’s activity and inclusion criteria; using a tag does not guarantee inclusion.',
      },
    ],
  },
  de: {
    title: 'Nähen und textile Handarbeiten auf Mastodon: wem du folgen kannst',
    description:
      'Nähen und textile Handarbeiten auf Mastodon: Entdecke Profile und passende Hashtags. Lies erst einmal mit, bevor du ein Konto anlegst.',
    heading: 'Nähen und textile Handarbeiten auf Mastodon',
    listTitle: 'Nähen und textile Handarbeiten',
    intro: [
      'Nähen, Stricken, Häkeln und Sticken: Entdecke Projekte, Techniken und fertige Arbeiten von Menschen, die gern mit Stoff und Garn gestalten.',
      'Schau dir die Profile und Hashtags an und entscheide, was in deine Startseite passt. Einige Tags sind auch ein Ausgangspunkt für kleinere, ruhigere Gespräche.',
    ],
    faq: [
      {
        q: 'Brauche ich ein Konto?',
        a: 'Diese Seite und öffentliche Beiträge kannst du ohne Konto ansehen. Zum Folgen von Profilen oder Hashtags meldest du dich mit einem Mastodon-Konto an.',
      },
      {
        q: 'Wo fange ich am besten an?',
        a: 'Lies zunächst bei ein paar Profilen und Tags mit. Auch andere Themen können vorkommen, und nicht unter jedem Hashtag ist gleich viel los.',
      },
      {
        q: 'Wie komme ich auf diese Liste?',
        a: 'Teile öffentliche Beiträge zum Thema und nutze passende Hashtags. Profile müssen die Aktivitäts- und Aufnahmekriterien des Katalogs erfüllen. Ein Hashtag allein garantiert keine Aufnahme.',
      },
    ],
  },
};
