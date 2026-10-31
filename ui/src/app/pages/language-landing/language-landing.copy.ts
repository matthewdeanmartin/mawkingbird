import { PageLanguage } from '../../focused-tools';

/** One setting the signed-in checklist can apply. */
export type LanguageSetting =
  'interface' | 'known' | 'alsoEnglish' | 'posting' | 'hideForeign' | 'trends' | 'learning';

/**
 * The words of one language landing page: the pitch while signed out, the
 * checklist once signed in. One set per page, in that page's language only;
 * see the note in download-mastodon-images.copy.ts.
 */
export interface LanguageLandingCopy {
  /** The page's path without slashes, as in focused-tools.json. */
  path: string;
  /** The language the page is written in. */
  lang: PageLanguage;
  /** The language the page sets the reader up for (interface, known, posting). */
  target: 'de' | 'en';
  /** A language offered as "learning", when the page has one. */
  learning?: 'de' | 'en';
  openApp: string;
  eyebrow: string;
  heading: string;
  intro: string;
  loading: string;
  /** What Mawkingbird does for this language; each one a shipped feature. */
  claims: { title: string; body: string }[];
  signIn: string;
  questionsTitle: string;
  questions: { q: string; a: string }[];
  checklist: {
    title: string;
    intro: string;
    /** The settings offered, in order, with whether they start ticked. */
    items: { setting: LanguageSetting; label: string; hint: string; checked: boolean }[];
    where: { browser: string; server: string };
    apply: string;
    applying: string;
    failed: string;
    doneTitle: string;
    doneNothing: string;
    home: string;
    starterPacks: string;
    settingsLink: string;
  };
}

export const LANGUAGE_LANDING_COPY: Record<string, LanguageLandingCopy> = {
  'mastodon-auf-deutsch': {
    path: 'mastodon-auf-deutsch',
    lang: 'de',
    target: 'de',
    learning: 'en',
    openApp: 'App öffnen',
    eyebrow: 'Mastodon auf Deutsch',
    heading: 'Mastodon auf Deutsch',
    intro:
      'Mawkingbird kann für Deutschsprachige, Zweisprachige und Sprachlernende mehr als die Mastodon-App selbst. Melde dich an, und wir richten es für die Sprachen ein, die du liest, und die, die du lernst. Danach ist deine Startseite besser.',
    loading: 'Wird geladen…',
    claims: [
      {
        title: 'Die ganze App auf Deutsch',
        body: 'Menüs, Einstellungen und Hilfen in deiner Sprache.',
      },
      {
        title: 'Nur Sprachen, die du liest',
        body: 'Beiträge in anderen Sprachen werden auf deiner Startseite ausgeblendet. Die Sprache wird erkannt, auch wenn ein Beitrag sie falsch angibt.',
      },
      {
        title: 'Heute nur Deutsch',
        body: 'Schalte die Startseite für einen Tag auf eine Sprache um, ohne jemandem zu entfolgen.',
      },
      {
        title: 'Übersetzungen für Sprachen, die du lernst',
        body: 'Beiträge in einer Lernsprache bleiben sichtbar, auf Wunsch mit Übersetzung darunter. Übersetzt wird von deinem Server oder mit einem eigenen KI-Schlüssel.',
      },
      {
        title: 'Trends, die du lesen kannst',
        body: 'Angesagte Hashtags in Schriften, die du nicht liest, werden ausgefiltert.',
      },
      {
        title: 'Deine Beiträge erreichen deutsche Leser',
        body: 'Wir stellen die Standardsprache deiner Beiträge auf deinem Server ein. Danach richten sich die Sprachfilter anderer Leute.',
      },
      {
        title: '21 deutsche Startpakete',
        body: 'Handverlesene Listen von Leuten, denen du folgen kannst, in der App.',
      },
    ],
    signIn: 'Mit Mastodon anmelden',
    questionsTitle: 'Fragen',
    questions: [
      {
        q: 'Gibt es Mastodon auf Deutsch?',
        a: 'Ja. Mastodon selbst ist übersetzt, und in Mawkingbird ist die ganze App auf Deutsch. Dazu kommen Filter, die deine Startseite auf die Sprachen beschränken, die du liest.',
      },
      {
        q: 'Wo melde ich mich an?',
        a: 'Am einfachsten bei mastodon.social. Es gibt viele weitere Server; Verzeichnisse wie joinmastodon.org helfen bei der Suche. Mawkingbird funktioniert mit jedem davon.',
      },
      {
        q: 'Was ändert sich, wenn ich mich anmelde?',
        a: 'Zuerst nichts. Du siehst eine Liste der Einstellungen und entscheidest selbst, was wir übernehmen. Nur die Standardsprache deiner Beiträge wird auf deinem Server gespeichert, alles andere in diesem Browser.',
      },
      {
        q: 'Kostet das etwas?',
        a: 'Nein. Mawkingbird ist kostenlos und läuft in deinem Browser.',
      },
    ],
    checklist: {
      title: 'Für Deutsch einrichten',
      intro:
        'Wähle aus, was wir übernehmen sollen. Nichts ändert sich, bevor du auf „Übernehmen“ tippst.',
      items: [
        {
          setting: 'interface',
          label: 'Oberfläche auf Deutsch',
          hint: 'Die ganze App in deiner Sprache.',
          checked: true,
        },
        {
          setting: 'known',
          label: 'Ich lese Deutsch',
          hint: 'Deine bekannten Sprachen steuern die Filter unten.',
          checked: true,
        },
        {
          setting: 'alsoEnglish',
          label: 'Ich lese auch Englisch',
          hint: 'Dann bleiben englische Beiträge sichtbar.',
          checked: true,
        },
        {
          setting: 'posting',
          label: 'Meine Beiträge sind auf Deutsch',
          hint: 'Die Standardsprache neuer Beiträge, gespeichert auf deinem Mastodon-Server.',
          checked: true,
        },
        {
          setting: 'hideForeign',
          label: 'Beiträge in Sprachen ausblenden, die ich nicht lese',
          hint: 'Auf der Startseite und in Algo. Beiträge unbekannter Sprache bleiben sichtbar.',
          checked: true,
        },
        {
          setting: 'trends',
          label: 'Nur Trends in Schriften, die ich lese',
          hint: 'Filtert angesagte Hashtags in anderen Schriften aus.',
          checked: true,
        },
        {
          setting: 'learning',
          label: 'Ich lerne Englisch',
          hint: 'Englische Beiträge bleiben immer sichtbar, mit Übersetzung darunter.',
          checked: false,
        },
      ],
      where: { browser: 'In diesem Browser', server: 'Auf deinem Server' },
      apply: 'Übernehmen',
      applying: 'Wird übernommen…',
      failed:
        'Die Standardsprache konnte nicht auf deinem Server gespeichert werden. Alles andere ist übernommen.',
      doneTitle: 'Erledigt',
      doneNothing: 'Nichts ausgewählt, nichts geändert.',
      home: 'Zu deiner Startseite',
      starterPacks: 'Deutsche Startpakete ansehen',
      settingsLink: 'Alle Spracheinstellungen',
    },
  },
  'mastodon-in-english': {
    path: 'mastodon-in-english',
    lang: 'en',
    target: 'en',
    openApp: 'Open the app',
    eyebrow: 'Mastodon in English',
    heading: 'Mastodon in English, without the noise',
    intro:
      "Mawkingbird does more for the languages you read than Mastodon's own app. Sign in and we'll set it up for the languages you read and the ones you're learning. Then your home feed is better.",
    loading: 'Loading…',
    claims: [
      {
        title: 'Only languages you read',
        body: 'Posts in other languages are hidden from your home feed. The language is detected, even when a post labels it wrong.',
      },
      {
        title: 'One language for today',
        body: 'Switch your feed to one language for a while, without unfollowing anyone.',
      },
      {
        title: "Translations for languages you're learning",
        body: "Posts in a language you're learning stay visible, with a translation underneath if you like. Translation comes from your server, or from your own AI key.",
      },
      {
        title: 'Trends you can read',
        body: "Trending hashtags in scripts you don't read are filtered out.",
      },
      {
        title: 'Your posts reach the right readers',
        body: "We set your posts' default language on your server, which other people's language filters rely on.",
      },
      {
        title: 'Starter packs',
        body: 'Hand-picked lists of people to follow, in the app.',
      },
    ],
    signIn: 'Sign in with Mastodon',
    questionsTitle: 'Questions',
    questions: [
      {
        q: 'What changes when I sign in?',
        a: 'Nothing at first. You see a list of settings and choose which to apply. Only your posts’ default language is saved on your server; everything else stays in this browser.',
      },
      {
        q: 'Where do I sign up?',
        a: 'mastodon.social is the easiest place to start. Many other servers exist; directories such as joinmastodon.org help you find them. Mawkingbird works with all of them.',
      },
      {
        q: 'Does it cost anything?',
        a: 'No. Mawkingbird is free and runs in your browser.',
      },
    ],
    checklist: {
      title: 'Set up for English',
      intro: 'Choose what to apply. Nothing changes until you press Apply.',
      items: [
        {
          setting: 'interface',
          label: 'Interface in English',
          hint: 'The whole app in English.',
          checked: true,
        },
        {
          setting: 'known',
          label: 'I read English',
          hint: 'The languages you know drive the filters below.',
          checked: true,
        },
        {
          setting: 'posting',
          label: 'My posts are in English',
          hint: 'The default language of new posts, saved on your Mastodon server.',
          checked: true,
        },
        {
          setting: 'hideForeign',
          label: "Hide posts in languages I don't read",
          hint: 'On Home and Algo. Posts whose language is unclear stay visible.',
          checked: true,
        },
        {
          setting: 'trends',
          label: 'Only trends in scripts I read',
          hint: 'Filters out trending hashtags in other scripts.',
          checked: true,
        },
      ],
      where: { browser: 'In this browser', server: 'On your server' },
      apply: 'Apply',
      applying: 'Applying…',
      failed:
        "Your posts' default language couldn't be saved on your server. Everything else is applied.",
      doneTitle: 'Done',
      doneNothing: 'Nothing selected, nothing changed.',
      home: 'Go to your home feed',
      starterPacks: 'Browse starter packs',
      settingsLink: 'All language settings',
    },
  },
  'learn-english-with-mastodon': {
    path: 'learn-english-with-mastodon',
    lang: 'en',
    target: 'en',
    learning: 'en',
    openApp: 'Open the app',
    eyebrow: 'Language learning',
    heading: 'Learn English with Mastodon',
    intro:
      "Read real posts from English speakers every day, with a translation underneath when you need it. Sign in and we'll set Mawkingbird up for learning English, without changing the languages you already read.",
    loading: 'Loading…',
    claims: [
      {
        title: 'English posts, always visible',
        body: "A language you're learning is never hidden by the language filters, even when everything else you don't read is.",
      },
      {
        title: 'Translation underneath, not instead',
        body: 'See the English and a translation into your language together, so you learn from the original.',
      },
      {
        title: 'Automatic or on request',
        body: 'Translate posts as they scroll into view, or only when you press the translate button. Translation comes from your server, or from your own AI key.',
      },
      {
        title: 'People to follow',
        body: 'Starter packs of English-speaking accounts, grouped by interest.',
      },
    ],
    signIn: 'Sign in with Mastodon',
    questionsTitle: 'Questions',
    questions: [
      {
        q: 'Is Mastodon good for learning English?',
        a: 'It is full of short, everyday English on every topic, written by real people. Following people who post about things you like is reading practice you will actually do.',
      },
      {
        q: 'Who translates the posts?',
        a: 'Your Mastodon server, if it offers translation, or an AI model through your own OpenRouter key. Mawkingbird never translates through a server of its own.',
      },
      {
        q: 'Will this change my interface language?',
        a: 'No. This page only adds English as a language you are learning; your interface and the languages you read stay as they are.',
      },
    ],
    checklist: {
      title: 'Set up for learning English',
      intro: 'Choose what to apply. Nothing changes until you press Apply.',
      items: [
        {
          setting: 'learning',
          label: "I'm learning English",
          hint: 'English posts are never hidden, and show a translation underneath.',
          checked: true,
        },
      ],
      where: { browser: 'In this browser', server: 'On your server' },
      apply: 'Apply',
      applying: 'Applying…',
      failed: "Something couldn't be saved. Try again.",
      doneTitle: 'Done',
      doneNothing: 'Nothing selected, nothing changed.',
      home: 'Go to your home feed',
      starterPacks: 'Browse starter packs',
      settingsLink: 'All language settings',
    },
  },
};
