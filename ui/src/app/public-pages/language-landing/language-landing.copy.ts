import { PageLanguage } from '../focused-tools';

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
  target:
    | 'de'
    | 'en'
    | 'es'
    | 'fr'
    | 'hi'
    | 'id'
    | 'it'
    | 'ja'
    | 'ko'
    | 'nl'
    | 'pl'
    | 'pt'
    | 'ru'
    | 'sv'
    | 'vi'
    | 'tr'
    | 'uk'
    | 'zh-Hant';
  /**
   * The code posts and the language filters use for it, when not `target`:
   * Mastodon tags Chinese posts `zh`, while the interface locale is `zh-Hant`.
   */
  content?: string;
  /** A language offered as "learning", when the page has one. */
  learning?:
    | 'de'
    | 'en'
    | 'es'
    | 'fr'
    | 'hi'
    | 'id'
    | 'it'
    | 'ja'
    | 'ko'
    | 'nl'
    | 'pl'
    | 'pt'
    | 'ru'
    | 'sv'
    | 'vi'
    | 'tr'
    | 'uk'
    | 'zh-Hant';
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
  'de/mastodon-auf-deutsch': {
    path: 'de/mastodon-auf-deutsch',
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
  'es/mastodon-en-espanol': {
    path: 'es/mastodon-en-espanol',
    lang: 'es',
    target: 'es',
    learning: 'en',
    openApp: 'Abrir la app',
    eyebrow: 'Mastodon en español',
    heading: 'Mastodon en español',
    intro:
      'Mawkingbird hace más que la propia app de Mastodon por quienes hablan español, por quienes viven entre dos idiomas y por quienes aprenden uno. Inicia sesión y lo configuramos para los idiomas que lees y los que aprendes. Tu inicio quedará mucho mejor.',
    loading: 'Cargando…',
    claims: [
      {
        title: 'Toda la app en español',
        body: 'Menús, ajustes y ayuda en tu idioma.',
      },
      {
        title: 'Solo los idiomas que lees',
        body: 'Las publicaciones en otros idiomas se ocultan de tu inicio. El idioma se detecta aunque una publicación lo indique mal.',
      },
      {
        title: 'Hoy, solo en español',
        body: 'Deja tu línea de tiempo en un solo idioma por un rato, sin dejar de seguir a nadie.',
      },
      {
        title: 'Traducciones para el idioma que aprendes',
        body: 'Las publicaciones en el idioma que aprendes nunca se ocultan, con una traducción debajo si la quieres. La traducción la hace tu servidor o tu propia clave de IA.',
      },
      {
        title: 'Tendencias que puedes leer',
        body: 'Se filtran los hashtags en tendencia escritos en otros alfabetos.',
      },
      {
        title: 'Tus publicaciones llegan a quienes leen español',
        body: 'Tu idioma de publicación por defecto queda en español en tu servidor. Los filtros de idioma de los demás se basan en él.',
      },
      {
        title: 'Paquetes de inicio en español',
        body: 'Listas seleccionadas de cuentas para seguir, dentro de la app.',
      },
    ],
    signIn: 'Iniciar sesión con Mastodon',
    questionsTitle: 'Preguntas',
    questions: [
      {
        q: '¿Mastodon está en español?',
        a: 'Sí. Mastodon está traducido al español, y Mawkingbird también, de principio a fin. Además, Mawkingbird puede limitar tu línea de tiempo a los idiomas que lees.',
      },
      {
        q: '¿Dónde me registro?',
        a: 'mastodon.social es lo más fácil para empezar. También hay muchos servidores en español, que encontrarás en directorios como joinmastodon.org. Mawkingbird funciona con todos.',
      },
      {
        q: '¿Qué cambia cuando inicio sesión?',
        a: 'Nada al principio. Ves una lista de ajustes y eliges cuáles aplicar. Solo el idioma de publicación se guarda en tu servidor; lo demás se guarda en este navegador.',
      },
      {
        q: '¿Cuesta algo?',
        a: 'No. Mawkingbird es gratis y funciona en tu navegador.',
      },
    ],
    checklist: {
      title: 'Configurar Mawkingbird en español',
      intro: 'Elige qué aplicar. Nada cambia hasta que pulses “Aplicar”.',
      items: [
        {
          setting: 'interface',
          label: 'Ver la app en español',
          hint: 'Toda la app pasa a español.',
          checked: true,
        },
        {
          setting: 'known',
          label: 'Leo español',
          hint: 'Los idiomas que lees se usan en los filtros de abajo.',
          checked: true,
        },
        {
          setting: 'alsoEnglish',
          label: 'También leo inglés',
          hint: 'Así las publicaciones en inglés siguen visibles.',
          checked: true,
        },
        {
          setting: 'posting',
          label: 'Publico en español',
          hint: 'El idioma por defecto de las publicaciones nuevas. Se guarda en tu servidor de Mastodon.',
          checked: true,
        },
        {
          setting: 'hideForeign',
          label: 'Ocultar publicaciones en idiomas que no leo',
          hint: 'En Inicio y Algo. Las publicaciones de idioma dudoso siguen visibles.',
          checked: true,
        },
        {
          setting: 'trends',
          label: 'Solo tendencias en mi alfabeto',
          hint: 'Filtra los hashtags en tendencia escritos en otros alfabetos.',
          checked: true,
        },
        {
          setting: 'learning',
          label: 'Estoy aprendiendo inglés',
          hint: 'Las publicaciones en inglés siempre se ven, con una traducción debajo.',
          checked: false,
        },
      ],
      where: { browser: 'este navegador', server: 'tu servidor' },
      apply: 'Aplicar',
      applying: 'Aplicando…',
      failed:
        'No se pudo guardar el idioma de publicación en tu servidor. Lo demás ya está aplicado.',
      doneTitle: 'Listo',
      doneNothing: 'No había nada marcado, así que no cambió nada.',
      home: 'Ir al inicio',
      starterPacks: 'Ver los paquetes de inicio',
      settingsLink: 'Todos los ajustes de idioma',
    },
  },
  'es/aprender-ingles-con-mastodon': {
    path: 'es/aprender-ingles-con-mastodon',
    lang: 'es',
    target: 'es',
    learning: 'en',
    openApp: 'Abrir la app',
    eyebrow: 'Aprender idiomas',
    heading: 'Aprender inglés con Mastodon',
    intro:
      'Lee cada día publicaciones reales de gente que habla inglés, con una traducción debajo cuando la necesites. Inicia sesión y configuramos Mawkingbird para aprender inglés, sin tocar los idiomas que ya lees.',
    loading: 'Cargando…',
    claims: [
      {
        title: 'El inglés siempre se ve',
        body: 'El idioma que aprendes nunca se oculta, ni siquiera con el filtro que esconde los idiomas que no lees.',
      },
      {
        title: 'La traducción debajo, no en lugar del original',
        body: 'El original y la traducción juntos: aprendes con el texto real.',
      },
      {
        title: 'Automática o cuando la pidas',
        body: 'Traduce automáticamente al desplazarte, o solo cuando pulses Traducir. La traducción la hace tu servidor o tu propia clave de IA.',
      },
      {
        title: 'Gente a quien seguir',
        body: 'Paquetes de inicio de cuentas que publican en inglés, por temas.',
      },
    ],
    signIn: 'Iniciar sesión con Mastodon',
    questionsTitle: 'Preguntas',
    questions: [
      {
        q: '¿Mastodon sirve para aprender inglés?',
        a: 'Está lleno de inglés corto y cotidiano escrito por personas reales, sobre cualquier tema. Sigue a gente que habla de lo que te gusta y leer se vuelve un hábito.',
      },
      {
        q: '¿Quién hace la traducción?',
        a: 'Tu servidor de Mastodon, si ofrece traducción, o un modelo de IA con tu propia clave de OpenRouter. Mawkingbird nunca traduce en servidores propios.',
      },
      {
        q: '¿Cambia el idioma de la app?',
        a: 'No. Esta página solo añade el inglés como idioma que aprendes; el idioma de la app y los idiomas que lees no cambian.',
      },
    ],
    checklist: {
      title: 'Configurar Mawkingbird para aprender inglés',
      intro: 'Elige qué aplicar. Nada cambia hasta que pulses “Aplicar”.',
      items: [
        {
          setting: 'learning',
          label: 'Estoy aprendiendo inglés',
          hint: 'Las publicaciones en inglés nunca se ocultan, con una traducción debajo.',
          checked: true,
        },
      ],
      where: { browser: 'este navegador', server: 'tu servidor' },
      apply: 'Aplicar',
      applying: 'Aplicando…',
      failed: 'No se pudo guardar un ajuste. Inténtalo de nuevo.',
      doneTitle: 'Listo',
      doneNothing: 'No había nada marcado, así que no cambió nada.',
      home: 'Ir al inicio',
      starterPacks: 'Ver los paquetes de inicio',
      settingsLink: 'Todos los ajustes de idioma',
    },
  },
  'fr/mastodon-en-francais': {
    path: 'fr/mastodon-en-francais',
    lang: 'fr',
    target: 'fr',
    learning: 'en',
    openApp: 'Ouvrir l’appli',
    eyebrow: 'Mastodon en français',
    heading: 'Mastodon en français',
    intro:
      'Mawkingbird en fait plus que l’appli Mastodon elle-même pour les francophones, les bilingues et ceux qui apprennent une langue. Connecte-toi, et on le règle pour les langues que tu lis et celles que tu apprends. Ton fil d’accueil n’en sera que meilleur.',
    loading: 'Chargement…',
    claims: [
      {
        title: 'Toute l’appli en français',
        body: 'Menus, réglages et aide dans ta langue.',
      },
      {
        title: 'Seulement les langues que tu lis',
        body: 'Les messages dans d’autres langues sont masqués de ton fil d’accueil. La langue est détectée, même quand un message l’indique mal.',
      },
      {
        title: 'Aujourd’hui, que du français',
        body: 'Réduis ton fil à une seule langue pour un moment, sans te désabonner de personne.',
      },
      {
        title: 'Des traductions pour la langue que tu apprends',
        body: 'Les messages dans la langue que tu apprends ne sont jamais masqués, avec une traduction en dessous si tu veux. La traduction vient de ton serveur ou de ta propre clé d’IA.',
      },
      {
        title: 'Des tendances que tu peux lire',
        body: 'Les hashtags tendance écrits dans d’autres alphabets sont filtrés.',
      },
      {
        title: 'Tes messages atteignent les lecteurs francophones',
        body: 'La langue de publication par défaut est réglée sur le français sur ton serveur. Les filtres de langue des autres s’appuient dessus.',
      },
      {
        title: 'Des packs de démarrage en français',
        body: 'Des listes choisies de comptes à suivre, dans l’appli.',
      },
    ],
    signIn: 'Se connecter avec Mastodon',
    questionsTitle: 'Questions',
    questions: [
      {
        q: 'Mastodon existe-t-il en français ?',
        a: 'Oui. Mastodon lui-même est traduit en français, et Mawkingbird aussi, de bout en bout. En plus, Mawkingbird peut limiter ton fil aux langues que tu lis.',
      },
      {
        q: 'Où m’inscrire ?',
        a: 'mastodon.social est le plus simple pour commencer. Il existe aussi beaucoup de serveurs francophones, que tu trouveras dans des annuaires comme joinmastodon.org. Mawkingbird fonctionne avec tous.',
      },
      {
        q: 'Qu’est-ce qui change quand je me connecte ?',
        a: 'Rien au début. Tu vois une liste de réglages et tu choisis ceux à appliquer. Seule la langue de publication est enregistrée sur ton serveur ; le reste est gardé dans ce navigateur.',
      },
      {
        q: 'Est-ce que c’est payant ?',
        a: 'Non. Mawkingbird est gratuit et fonctionne dans ton navigateur.',
      },
    ],
    checklist: {
      title: 'Régler Mawkingbird pour le français',
      intro:
        'Choisis ce qu’il faut appliquer. Rien ne change avant que tu appuies sur « Appliquer ».',
      items: [
        {
          setting: 'interface',
          label: 'Afficher l’appli en français',
          hint: 'Toute l’appli passe en français.',
          checked: true,
        },
        {
          setting: 'known',
          label: 'Je lis le français',
          hint: 'Les langues que tu lis servent aux filtres ci-dessous.',
          checked: true,
        },
        {
          setting: 'alsoEnglish',
          label: 'Je lis aussi l’anglais',
          hint: 'Les messages en anglais restent alors visibles.',
          checked: true,
        },
        {
          setting: 'posting',
          label: 'Je publie en français',
          hint: 'La langue par défaut des nouveaux messages. Enregistrée sur ton serveur Mastodon.',
          checked: true,
        },
        {
          setting: 'hideForeign',
          label: 'Masquer les messages dans des langues que je ne lis pas',
          hint: 'Sur l’accueil et Algo. Les messages dont la langue est incertaine restent visibles.',
          checked: true,
        },
        {
          setting: 'trends',
          label: 'Seulement les tendances dans mon alphabet',
          hint: 'Filtre les hashtags tendance écrits dans d’autres alphabets.',
          checked: true,
        },
        {
          setting: 'learning',
          label: 'J’apprends l’anglais',
          hint: 'Les messages en anglais restent toujours visibles, avec une traduction en dessous.',
          checked: false,
        },
      ],
      where: { browser: 'ce navigateur', server: 'ton serveur' },
      apply: 'Appliquer',
      applying: 'Application…',
      failed:
        'La langue de publication n’a pas pu être enregistrée sur ton serveur. Le reste est appliqué.',
      doneTitle: 'C’est fait',
      doneNothing: 'Rien n’était coché, donc rien n’a changé.',
      home: 'Aller à l’accueil',
      starterPacks: 'Voir les packs de démarrage',
      settingsLink: 'Tous les réglages de langue',
    },
  },
  'fr/apprendre-l-anglais-avec-mastodon': {
    path: 'fr/apprendre-l-anglais-avec-mastodon',
    lang: 'fr',
    target: 'fr',
    learning: 'en',
    openApp: 'Ouvrir l’appli',
    eyebrow: 'Apprendre une langue',
    heading: 'Apprendre l’anglais avec Mastodon',
    intro:
      'Lis chaque jour de vrais messages d’anglophones, avec une traduction en dessous quand tu en as besoin. Connecte-toi, et on règle Mawkingbird pour apprendre l’anglais, sans toucher aux langues que tu lis déjà.',
    loading: 'Chargement…',
    claims: [
      {
        title: 'Les messages en anglais restent visibles',
        body: 'La langue que tu apprends n’est jamais masquée, même par le filtre qui cache les langues que tu ne lis pas.',
      },
      {
        title: 'La traduction en dessous, pas à la place',
        body: 'L’original et la traduction côte à côte : tu apprends à partir du vrai texte.',
      },
      {
        title: 'Automatique ou à la demande',
        body: 'Traduis automatiquement en faisant défiler, ou seulement quand tu appuies sur Traduire. La traduction vient de ton serveur ou de ta propre clé d’IA.',
      },
      {
        title: 'Des gens à suivre',
        body: 'Des packs de démarrage de comptes anglophones, classés par centres d’intérêt.',
      },
    ],
    signIn: 'Se connecter avec Mastodon',
    questionsTitle: 'Questions',
    questions: [
      {
        q: 'Mastodon est-il bien pour apprendre l’anglais ?',
        a: 'On y trouve énormément d’anglais court et courant, écrit par de vraies personnes, sur tous les sujets. Suis des gens qui parlent de ce qui te plaît, et la lecture devient une habitude.',
      },
      {
        q: 'Qui fait la traduction ?',
        a: 'Ton serveur Mastodon, s’il propose la traduction, ou un modèle d’IA avec ta propre clé OpenRouter. Mawkingbird ne traduit jamais sur ses propres serveurs.',
      },
      {
        q: 'Est-ce que ça change la langue de l’appli ?',
        a: 'Non. Cette page ajoute seulement l’anglais comme langue que tu apprends ; la langue de l’appli et les langues que tu lis ne bougent pas.',
      },
    ],
    checklist: {
      title: 'Régler Mawkingbird pour apprendre l’anglais',
      intro:
        'Choisis ce qu’il faut appliquer. Rien ne change avant que tu appuies sur « Appliquer ».',
      items: [
        {
          setting: 'learning',
          label: 'J’apprends l’anglais',
          hint: 'Les messages en anglais ne sont jamais masqués, avec une traduction en dessous.',
          checked: true,
        },
      ],
      where: { browser: 'ce navigateur', server: 'ton serveur' },
      apply: 'Appliquer',
      applying: 'Application…',
      failed: 'Un réglage n’a pas pu être enregistré. Réessaie.',
      doneTitle: 'C’est fait',
      doneNothing: 'Rien n’était coché, donc rien n’a changé.',
      home: 'Aller à l’accueil',
      starterPacks: 'Voir les packs de démarrage',
      settingsLink: 'Tous les réglages de langue',
    },
  },
  'ja/mastodon-in-japanese': {
    path: 'ja/mastodon-in-japanese',
    lang: 'ja',
    target: 'ja',
    learning: 'en',
    openApp: 'アプリを開く',
    eyebrow: 'マストドン（Mastodon）を日本語で',
    heading: 'マストドン（Mastodon）を日本語で快適に',
    intro:
      'Mawkingbird は、日本語で使う人、複数の言語を使う人、語学を学ぶ人のための機能が、Mastodon 公式アプリよりも充実しています。ログインすると、読める言語と学習中の言語にあわせて設定します。ホームのタイムラインがぐっと読みやすくなります。',
    loading: '読み込み中…',
    claims: [
      {
        title: 'アプリ全体が日本語',
        body: 'メニューも設定もヘルプも日本語で表示されます。',
      },
      {
        title: '読める言語だけを表示',
        body: '読めない言語の投稿をホームから非表示にします。投稿の言語設定が間違っていても、本文から言語を判定します。',
      },
      {
        title: '今日は日本語だけ',
        body: '誰のフォローも外さずに、しばらくのあいだタイムラインを 1 つの言語に絞れます。',
      },
      {
        title: '学習中の言語には翻訳を',
        body: '学習中の言語の投稿は非表示にならず、必要なら下に翻訳を表示します。翻訳はお使いのサーバー、または自分の AI キーで行います。',
      },
      {
        title: '読めるトレンドだけ',
        body: '読めない文字で書かれたトレンドのハッシュタグを除外します。',
      },
      {
        title: '投稿が日本語の読者に届く',
        body: '投稿の既定の言語をサーバーに日本語として設定します。ほかの人の言語フィルターはこの設定を使います。',
      },
      {
        title: '日本語のおすすめパック',
        body: 'フォローする人を探せる、厳選されたリストをアプリ内で用意しています。',
      },
    ],
    signIn: 'Mastodon でログイン',
    questionsTitle: 'よくある質問',
    questions: [
      {
        q: 'マストドンは日本語で使えますか？',
        a: 'はい。Mastodon 本体も日本語に対応しており、Mawkingbird ではアプリ全体を日本語で使えます。さらに、タイムラインを読める言語に絞るフィルターもあります。',
      },
      {
        q: 'どこで登録すればいいですか？',
        a: 'まずは mastodon.social がいちばん簡単です。ほかにも多くのサーバーがあり、joinmastodon.org などの一覧で探せます。Mawkingbird はどのサーバーでも使えます。',
      },
      {
        q: 'ログインすると何が変わりますか？',
        a: '最初は何も変わりません。設定の一覧が表示され、反映するものをあなたが選びます。サーバーに保存されるのは投稿の既定の言語だけで、ほかはこのブラウザーに保存されます。',
      },
      {
        q: '料金はかかりますか？',
        a: 'いいえ。Mawkingbird は無料で、ブラウザーで動きます。',
      },
    ],
    checklist: {
      title: '日本語向けに設定する',
      intro: '反映する項目を選んでください。「反映する」を押すまで何も変わりません。',
      items: [
        {
          setting: 'interface',
          label: 'アプリを日本語で表示',
          hint: 'アプリ全体を日本語にします。',
          checked: true,
        },
        {
          setting: 'known',
          label: '日本語が読める',
          hint: '読める言語の設定が、下のフィルターに使われます。',
          checked: true,
        },
        {
          setting: 'alsoEnglish',
          label: '英語も読める',
          hint: 'オンにすると英語の投稿も表示されたままになります。',
          checked: true,
        },
        {
          setting: 'posting',
          label: '投稿は日本語で書く',
          hint: '新しい投稿の既定の言語。Mastodon サーバーに保存されます。',
          checked: true,
        },
        {
          setting: 'hideForeign',
          label: '読めない言語の投稿を非表示にする',
          hint: 'ホームと Algo が対象です。言語がはっきりしない投稿は表示されたままです。',
          checked: true,
        },
        {
          setting: 'trends',
          label: '読める文字のトレンドだけ表示',
          hint: 'ほかの文字で書かれたトレンドのハッシュタグを除外します。',
          checked: true,
        },
        {
          setting: 'learning',
          label: '英語を勉強している',
          hint: '英語の投稿は常に表示され、下に翻訳が付きます。',
          checked: false,
        },
      ],
      where: { browser: 'このブラウザー', server: 'あなたのサーバー' },
      apply: '反映する',
      applying: '反映しています…',
      failed: '投稿の既定の言語をサーバーに保存できませんでした。ほかの設定は反映済みです。',
      doneTitle: '完了しました',
      doneNothing: '何も選ばれていないため、変更はありません。',
      home: 'ホームのタイムラインへ',
      starterPacks: 'おすすめパックを見る',
      settingsLink: '言語の設定をすべて見る',
    },
  },
  'ja/learn-english-with-mastodon': {
    path: 'ja/learn-english-with-mastodon',
    lang: 'ja',
    target: 'ja',
    learning: 'en',
    openApp: 'アプリを開く',
    eyebrow: '英語学習',
    heading: 'マストドン（Mastodon）で英語を学ぶ',
    intro:
      '英語を話す人たちのリアルな投稿を毎日読み、わからないときは下に翻訳を表示できます。ログインすると、今読める言語はそのままに、英語学習向けに Mawkingbird を設定します。',
    loading: '読み込み中…',
    claims: [
      {
        title: '英語の投稿は常に表示',
        body: '学習中の言語は、読めない言語を非表示にするフィルターでも決して隠されません。',
      },
      {
        title: '翻訳は「置き換え」ではなく「下に表示」',
        body: '英文と日本語訳を並べて表示するので、原文から学べます。',
      },
      {
        title: '自動でも、ボタンでも',
        body: 'スクロールして表示されたときに自動で翻訳することも、翻訳ボタンを押したときだけにすることもできます。翻訳はお使いのサーバー、または自分の AI キーで行います。',
      },
      {
        title: 'フォローする人も見つかる',
        body: '英語で投稿する人たちのおすすめパックを、興味ごとに用意しています。',
      },
    ],
    signIn: 'Mastodon でログイン',
    questionsTitle: 'よくある質問',
    questions: [
      {
        q: 'マストドンは英語の勉強に向いていますか？',
        a: 'あらゆる話題について、実際の人が書いた短い日常英語があふれています。好きなことを投稿する人をフォローすれば、無理なく続けられる読む練習になります。',
      },
      {
        q: '翻訳は誰がしますか？',
        a: '翻訳に対応していればあなたの Mastodon サーバー、または自分の OpenRouter キーを使った AI モデルです。Mawkingbird 独自のサーバーで翻訳することはありません。',
      },
      {
        q: 'アプリの表示言語は変わりますか？',
        a: 'いいえ。このページは英語を学習中の言語として追加するだけで、表示言語や読める言語はそのままです。',
      },
    ],
    checklist: {
      title: '英語学習向けに設定する',
      intro: '反映する項目を選んでください。「反映する」を押すまで何も変わりません。',
      items: [
        {
          setting: 'learning',
          label: '英語を勉強している',
          hint: '英語の投稿は非表示にならず、下に翻訳が付きます。',
          checked: true,
        },
      ],
      where: { browser: 'このブラウザー', server: 'あなたのサーバー' },
      apply: '反映する',
      applying: '反映しています…',
      failed: '保存できない項目がありました。もう一度お試しください。',
      doneTitle: '完了しました',
      doneNothing: '何も選ばれていないため、変更はありません。',
      home: 'ホームのタイムラインへ',
      starterPacks: 'おすすめパックを見る',
      settingsLink: '言語の設定をすべて見る',
    },
  },
  'zh-hant/mastodon-in-chinese': {
    path: 'zh-hant/mastodon-in-chinese',
    lang: 'zh-Hant',
    target: 'zh-Hant',
    content: 'zh',
    learning: 'en',
    openApp: '開啟 App',
    eyebrow: '中文的 Mastodon',
    heading: '用中文暢玩 Mastodon（長毛象）',
    intro:
      '對使用中文、在多種語言間切換或正在學語言的人來說，Mawkingbird 比 Mastodon 官方 App 更好用。登入後，我們會依照您看得懂與正在學的語言幫您設定好，您的首頁時間軸會清爽許多。',
    loading: '載入中……',
    claims: [
      {
        title: '整個 App 都是中文',
        body: '選單、設定與說明都使用您的語言。',
      },
      {
        title: '只顯示您看得懂的語言',
        body: '其他語言的嘟文會從首頁隱藏。就算嘟文標錯語言，也會從內容判斷。',
      },
      {
        title: '今天只看中文',
        body: '暫時把時間軸限定為一種語言，不必取消跟隨任何人。',
      },
      {
        title: '學習中的語言附上翻譯',
        body: '您正在學的語言永遠不會被隱藏，需要時會在下方附上翻譯。翻譯由您的伺服器或您自己的 AI 金鑰完成。',
      },
      {
        title: '只看讀得懂的熱門話題',
        body: '過濾掉以其他文字書寫的熱門主題標籤。',
      },
      {
        title: '讓中文讀者看到您的嘟文',
        body: '把伺服器上的預設發文語言設為中文，別人的語言過濾器就會依此判斷。',
      },
      {
        title: '中文入門清單',
        body: 'App 內精選的跟隨名單，幫您找到值得跟隨的人。',
      },
    ],
    signIn: '用 Mastodon 登入',
    questionsTitle: '常見問題',
    questions: [
      {
        q: 'Mastodon 有中文版嗎？',
        a: '有。Mastodon 本身有中文介面，Mawkingbird 也全面中文化。此外，Mawkingbird 還能把時間軸限定為您看得懂的語言。',
      },
      {
        q: '要在哪裡註冊？',
        a: 'mastodon.social 是最簡單的起點。也有許多中文伺服器，可以在 joinmastodon.org 等目錄中找到。Mawkingbird 適用於任何伺服器。',
      },
      {
        q: '登入後會改變什麼？',
        a: '一開始什麼都不會變。您會看到一份設定清單，自己選擇要套用哪些。只有發文語言會存到您的伺服器，其他都存在這個瀏覽器裡。',
      },
      {
        q: '要付費嗎？',
        a: '不用。Mawkingbird 免費，而且在您的瀏覽器中執行。',
      },
    ],
    checklist: {
      title: '把 Mawkingbird 設定成中文',
      intro: '選擇要套用的項目。按下「套用」之前，什麼都不會改變。',
      items: [
        {
          setting: 'interface',
          label: '以中文顯示 App',
          hint: '整個 App 改為繁體中文。',
          checked: true,
        },
        {
          setting: 'known',
          label: '我看得懂中文',
          hint: '下方的過濾器會依據您看得懂的語言。',
          checked: true,
        },
        {
          setting: 'alsoEnglish',
          label: '我也看得懂英文',
          hint: '勾選後，英文嘟文也會繼續顯示。',
          checked: true,
        },
        {
          setting: 'posting',
          label: '我用中文發嘟',
          hint: '新嘟文的預設語言，會存到您的 Mastodon 伺服器。',
          checked: true,
        },
        {
          setting: 'hideForeign',
          label: '隱藏我看不懂的語言的嘟文',
          hint: '適用於首頁與 Algo。語言不明的嘟文仍會顯示。',
          checked: true,
        },
        {
          setting: 'trends',
          label: '只顯示我看得懂的文字的熱門話題',
          hint: '過濾掉以其他文字書寫的熱門主題標籤。',
          checked: true,
        },
        {
          setting: 'learning',
          label: '我正在學英文',
          hint: '英文嘟文永遠顯示，並在下方附上翻譯。',
          checked: false,
        },
      ],
      where: { browser: '這個瀏覽器', server: '您的伺服器' },
      apply: '套用',
      applying: '套用中……',
      failed: '無法把發文語言存到您的伺服器。其他設定已經套用。',
      doneTitle: '完成',
      doneNothing: '沒有勾選任何項目，所以沒有變更。',
      home: '前往首頁',
      starterPacks: '查看入門清單',
      settingsLink: '所有語言設定',
    },
  },
  'zh-hant/learn-english-with-mastodon': {
    path: 'zh-hant/learn-english-with-mastodon',
    lang: 'zh-Hant',
    target: 'zh-Hant',
    content: 'zh',
    learning: 'en',
    openApp: '開啟 App',
    eyebrow: '學語言',
    heading: '用 Mastodon（長毛象）學英文',
    intro:
      '每天讀英語使用者寫的真實嘟文，需要時在下方附上翻譯。登入後，我們會幫您把 Mawkingbird 設定成適合學英文，不會動到您已經看得懂的語言。',
    loading: '載入中……',
    claims: [
      {
        title: '英文嘟文永遠顯示',
        body: '您正在學的語言永遠不會被隱藏，就算開啟了隱藏看不懂語言的過濾器也一樣。',
      },
      {
        title: '翻譯附在下方，而不是取代原文',
        body: '原文與翻譯並列，讓您從真正的英文中學習。',
      },
      {
        title: '自動翻譯或手動翻譯',
        body: '捲動時自動翻譯，或只在按下「翻譯」時才翻譯。翻譯由您的伺服器或您自己的 AI 金鑰完成。',
      },
      {
        title: '找到值得跟隨的人',
        body: '依主題分類的入門清單，都是用英文發嘟的帳號。',
      },
    ],
    signIn: '用 Mastodon 登入',
    questionsTitle: '常見問題',
    questions: [
      {
        q: 'Mastodon 適合學英文嗎？',
        a: '這裡充滿真人寫的簡短日常英文，什麼話題都有。跟隨談論您喜歡的事情的人，閱讀就會變成習慣。',
      },
      {
        q: '翻譯是誰做的？',
        a: '如果您的 Mastodon 伺服器提供翻譯，就由伺服器翻譯；或是用您自己的 OpenRouter 金鑰呼叫 AI 模型。Mawkingbird 從不在自己的伺服器上翻譯。',
      },
      {
        q: '會改變 App 的語言嗎？',
        a: '不會。這個頁面只會把英文加為學習中的語言，App 的語言與您看得懂的語言都不會改變。',
      },
    ],
    checklist: {
      title: '把 Mawkingbird 設定成適合學英文',
      intro: '選擇要套用的項目。按下「套用」之前，什麼都不會改變。',
      items: [
        {
          setting: 'learning',
          label: '我正在學英文',
          hint: '英文嘟文永遠不會被隱藏，並在下方附上翻譯。',
          checked: true,
        },
      ],
      where: { browser: '這個瀏覽器', server: '您的伺服器' },
      apply: '套用',
      applying: '套用中……',
      failed: '有一項設定無法儲存，請再試一次。',
      doneTitle: '完成',
      doneNothing: '沒有勾選任何項目，所以沒有變更。',
      home: '前往首頁',
      starterPacks: '查看入門清單',
      settingsLink: '所有語言設定',
    },
  },
  'ko/mastodon-in-korean': {
    path: 'ko/mastodon-in-korean',
    lang: 'ko',
    target: 'ko',
    learning: 'en',
    openApp: '앱 열기',
    eyebrow: '한국어 마스토돈',
    heading: '마스토돈(Mastodon)을 한국어로',
    intro:
      'Mawkingbird는 한국어 사용자, 여러 언어를 쓰는 사람, 외국어를 배우는 사람에게 Mastodon 공식 앱보다 더 많은 기능을 제공합니다. 로그인하면 읽을 수 있는 언어와 배우는 언어에 맞춰 설정해 드립니다. 홈 타임라인이 훨씬 깔끔해집니다.',
    loading: '불러오는 중…',
    claims: [
      {
        title: '앱 전체가 한국어',
        body: '메뉴, 설정, 도움말이 모두 한국어로 나옵니다.',
      },
      {
        title: '읽을 수 있는 언어만 표시',
        body: '다른 언어로 된 게시물은 홈에서 숨깁니다. 게시물의 언어 표시가 틀려도 내용으로 언어를 판단합니다.',
      },
      {
        title: '오늘은 한국어만',
        body: '아무도 언팔로우하지 않고 잠시 타임라인을 한 언어로만 볼 수 있습니다.',
      },
      {
        title: '배우는 언어에는 번역을',
        body: '배우는 언어의 게시물은 절대 숨기지 않고, 원하면 아래에 번역을 붙입니다. 번역은 회원님의 서버나 직접 가진 AI 키로 합니다.',
      },
      {
        title: '읽을 수 있는 트렌드만',
        body: '다른 문자로 쓰인 트렌드 해시태그를 걸러 냅니다.',
      },
      {
        title: '한국어 독자에게 닿는 게시물',
        body: '서버의 기본 게시 언어를 한국어로 설정합니다. 다른 사람들의 언어 필터가 이 값을 사용합니다.',
      },
      {
        title: '한국어 스타터 팩',
        body: '팔로우할 사람을 고른 목록이 앱 안에 있습니다.',
      },
    ],
    signIn: 'Mastodon으로 로그인',
    questionsTitle: '자주 묻는 질문',
    questions: [
      {
        q: '마스토돈을 한국어로 쓸 수 있나요?',
        a: '네. Mastodon 자체도 한국어를 지원하고, Mawkingbird도 앱 전체를 한국어로 쓸 수 있습니다. 게다가 타임라인을 읽을 수 있는 언어로만 거르는 기능도 있습니다.',
      },
      {
        q: '어디에서 가입하나요?',
        a: '처음이라면 mastodon.social이 가장 쉽습니다. 한국어 서버도 여럿 있으며 joinmastodon.org 같은 목록에서 찾을 수 있습니다. Mawkingbird는 어느 서버에서나 작동합니다.',
      },
      {
        q: '로그인하면 무엇이 바뀌나요?',
        a: '처음에는 아무것도 바뀌지 않습니다. 설정 목록이 나오고, 적용할 항목은 회원님이 고릅니다. 게시 언어만 서버에 저장되고 나머지는 이 브라우저에 저장됩니다.',
      },
      {
        q: '요금이 있나요?',
        a: '아니요. Mawkingbird는 무료이며 브라우저에서 작동합니다.',
      },
    ],
    checklist: {
      title: '한국어에 맞게 Mawkingbird 설정하기',
      intro: '적용할 항목을 고르세요. “적용”을 누르기 전에는 아무것도 바뀌지 않습니다.',
      items: [
        {
          setting: 'interface',
          label: '앱을 한국어로 표시',
          hint: '앱 전체가 한국어로 바뀝니다.',
          checked: true,
        },
        {
          setting: 'known',
          label: '한국어를 읽을 수 있음',
          hint: '읽을 수 있는 언어가 아래 필터에 쓰입니다.',
          checked: true,
        },
        {
          setting: 'alsoEnglish',
          label: '영어도 읽을 수 있음',
          hint: '켜면 영어 게시물도 계속 보입니다.',
          checked: true,
        },
        {
          setting: 'posting',
          label: '한국어로 게시',
          hint: '새 게시물의 기본 언어입니다. Mastodon 서버에 저장됩니다.',
          checked: true,
        },
        {
          setting: 'hideForeign',
          label: '읽을 수 없는 언어의 게시물 숨기기',
          hint: '홈과 Algo에 적용됩니다. 언어가 불분명한 게시물은 계속 보입니다.',
          checked: true,
        },
        {
          setting: 'trends',
          label: '읽을 수 있는 문자의 트렌드만',
          hint: '다른 문자로 쓰인 트렌드 해시태그를 걸러 냅니다.',
          checked: true,
        },
        {
          setting: 'learning',
          label: '영어를 배우는 중',
          hint: '영어 게시물은 항상 보이고 아래에 번역이 붙습니다.',
          checked: false,
        },
      ],
      where: { browser: '이 브라우저', server: '회원님의 서버' },
      apply: '적용',
      applying: '적용하는 중…',
      failed: '게시 언어를 서버에 저장하지 못했습니다. 나머지 설정은 적용되었습니다.',
      doneTitle: '완료',
      doneNothing: '선택한 항목이 없어 바뀐 것이 없습니다.',
      home: '홈으로',
      starterPacks: '스타터 팩 보기',
      settingsLink: '모든 언어 설정',
    },
  },
  'ko/learn-english-with-mastodon': {
    path: 'ko/learn-english-with-mastodon',
    lang: 'ko',
    target: 'ko',
    learning: 'en',
    openApp: '앱 열기',
    eyebrow: '외국어 공부',
    heading: '마스토돈(Mastodon)으로 영어 공부',
    intro:
      '영어 사용자가 쓴 진짜 게시물을 매일 읽고, 필요할 때는 아래에 번역을 붙여 보세요. 로그인하면 지금 읽는 언어는 그대로 두고 영어 공부에 맞게 Mawkingbird를 설정해 드립니다.',
    loading: '불러오는 중…',
    claims: [
      {
        title: '영어 게시물은 항상 표시',
        body: '배우는 언어는 읽을 수 없는 언어를 숨기는 필터를 켜도 절대 숨기지 않습니다.',
      },
      {
        title: '번역은 원문 대신이 아니라 아래에',
        body: '원문과 번역을 나란히 보며 진짜 영어로 배웁니다.',
      },
      {
        title: '자동으로, 또는 원할 때만',
        body: '스크롤하면 자동으로 번역하거나, 번역 버튼을 누를 때만 번역합니다. 번역은 회원님의 서버나 직접 가진 AI 키로 합니다.',
      },
      {
        title: '팔로우할 사람',
        body: '영어로 게시하는 계정을 주제별로 모은 스타터 팩이 있습니다.',
      },
    ],
    signIn: 'Mastodon으로 로그인',
    questionsTitle: '자주 묻는 질문',
    questions: [
      {
        q: '마스토돈은 영어 공부에 좋나요?',
        a: '온갖 주제에 대해 실제 사람이 쓴 짧은 일상 영어가 가득합니다. 좋아하는 것에 대해 쓰는 사람을 팔로우하면 읽기가 습관이 됩니다.',
      },
      {
        q: '번역은 누가 하나요?',
        a: '번역을 지원한다면 회원님의 Mastodon 서버가, 아니면 회원님의 OpenRouter 키로 AI 모델이 합니다. Mawkingbird가 자체 서버에서 번역하는 일은 없습니다.',
      },
      {
        q: '앱 언어가 바뀌나요?',
        a: '아니요. 이 페이지는 영어를 배우는 언어로 추가할 뿐이며, 앱 언어와 읽을 수 있는 언어는 그대로입니다.',
      },
    ],
    checklist: {
      title: '영어 공부에 맞게 Mawkingbird 설정하기',
      intro: '적용할 항목을 고르세요. “적용”을 누르기 전에는 아무것도 바뀌지 않습니다.',
      items: [
        {
          setting: 'learning',
          label: '영어를 배우는 중',
          hint: '영어 게시물은 절대 숨기지 않고 아래에 번역을 붙입니다.',
          checked: true,
        },
      ],
      where: { browser: '이 브라우저', server: '회원님의 서버' },
      apply: '적용',
      applying: '적용하는 중…',
      failed: '저장하지 못한 설정이 있습니다. 다시 시도해 주세요.',
      doneTitle: '완료',
      doneNothing: '선택한 항목이 없어 바뀐 것이 없습니다.',
      home: '홈으로',
      starterPacks: '스타터 팩 보기',
      settingsLink: '모든 언어 설정',
    },
  },
  'pt/mastodon-em-portugues': {
    path: 'pt/mastodon-em-portugues',
    lang: 'pt',
    target: 'pt',
    learning: 'en',
    openApp: 'Abrir o app',
    eyebrow: 'Mastodon em português',
    heading: 'Mastodon em português',
    intro:
      'O Mawkingbird faz mais que o próprio app do Mastodon por quem fala português, por quem vive entre dois idiomas e por quem está aprendendo um. Entre, e a gente configura tudo para os idiomas que você lê e os que você aprende. Seu início fica bem melhor.',
    loading: 'Carregando…',
    claims: [
      {
        title: 'O app inteiro em português',
        body: 'Menus, ajustes e ajuda no seu idioma.',
      },
      {
        title: 'Só os idiomas que você lê',
        body: 'Publicações em outros idiomas somem do seu início. O idioma é detectado mesmo quando a publicação informa errado.',
      },
      {
        title: 'Hoje, só português',
        body: 'Deixe sua linha do tempo num idioma só por um tempo, sem deixar de seguir ninguém.',
      },
      {
        title: 'Tradução para o idioma que você aprende',
        body: 'Publicações no idioma que você aprende nunca somem, com tradução embaixo se quiser. Quem traduz é o seu servidor ou a sua própria chave de IA.',
      },
      {
        title: 'Assuntos do momento que você consegue ler',
        body: 'Hashtags em alta escritas em outros alfabetos são filtradas.',
      },
      {
        title: 'Suas publicações chegam a quem lê português',
        body: 'O idioma padrão das suas publicações fica em português no seu servidor. Os filtros de idioma dos outros usam esse ajuste.',
      },
      {
        title: 'Pacotes iniciais em português',
        body: 'Listas escolhidas a dedo de contas para seguir, dentro do app.',
      },
    ],
    signIn: 'Entrar com o Mastodon',
    questionsTitle: 'Perguntas',
    questions: [
      {
        q: 'O Mastodon tem versão em português?',
        a: 'Tem. O Mastodon é traduzido para o português, e o Mawkingbird também, de ponta a ponta. Além disso, o Mawkingbird consegue limitar sua linha do tempo aos idiomas que você lê.',
      },
      {
        q: 'Onde eu me cadastro?',
        a: 'O mastodon.social é o jeito mais fácil de começar. Também existem muitos servidores brasileiros e em português, que você encontra em diretórios como o joinmastodon.org. O Mawkingbird funciona com todos.',
      },
      {
        q: 'O que muda quando eu entro?',
        a: 'Nada, no começo. Você vê uma lista de ajustes e escolhe quais aplicar. Só o idioma de publicação é salvo no seu servidor; o resto fica neste navegador.',
      },
      {
        q: 'É pago?',
        a: 'Não. O Mawkingbird é grátis e roda no seu navegador.',
      },
    ],
    checklist: {
      title: 'Configurar o Mawkingbird para português',
      intro: 'Escolha o que aplicar. Nada muda até você tocar em “Aplicar”.',
      items: [
        {
          setting: 'interface',
          label: 'Mostrar o app em português',
          hint: 'O app inteiro passa para português.',
          checked: true,
        },
        {
          setting: 'known',
          label: 'Eu leio português',
          hint: 'Os idiomas que você lê são usados nos filtros abaixo.',
          checked: true,
        },
        {
          setting: 'alsoEnglish',
          label: 'Também leio inglês',
          hint: 'Assim as publicações em inglês continuam aparecendo.',
          checked: true,
        },
        {
          setting: 'posting',
          label: 'Eu publico em português',
          hint: 'O idioma padrão das publicações novas. Fica salvo no seu servidor do Mastodon.',
          checked: true,
        },
        {
          setting: 'hideForeign',
          label: 'Ocultar publicações em idiomas que eu não leio',
          hint: 'No Início e no Algo. Publicações de idioma incerto continuam aparecendo.',
          checked: true,
        },
        {
          setting: 'trends',
          label: 'Só assuntos do momento no meu alfabeto',
          hint: 'Filtra as hashtags em alta escritas em outros alfabetos.',
          checked: true,
        },
        {
          setting: 'learning',
          label: 'Estou aprendendo inglês',
          hint: 'As publicações em inglês sempre aparecem, com tradução embaixo.',
          checked: false,
        },
      ],
      where: { browser: 'este navegador', server: 'seu servidor' },
      apply: 'Aplicar',
      applying: 'Aplicando…',
      failed:
        'Não deu para salvar o idioma de publicação no seu servidor. O resto já foi aplicado.',
      doneTitle: 'Pronto',
      doneNothing: 'Nada estava marcado, então nada mudou.',
      home: 'Ir para o início',
      starterPacks: 'Ver os pacotes iniciais',
      settingsLink: 'Todos os ajustes de idioma',
    },
  },
  'pt/aprender-ingles-com-mastodon': {
    path: 'pt/aprender-ingles-com-mastodon',
    lang: 'pt',
    target: 'pt',
    learning: 'en',
    openApp: 'Abrir o app',
    eyebrow: 'Aprender idiomas',
    heading: 'Aprender inglês com o Mastodon',
    intro:
      'Leia todo dia publicações de verdade de quem fala inglês, com tradução embaixo quando precisar. Entre, e a gente configura o Mawkingbird para aprender inglês, sem mexer nos idiomas que você já lê.',
    loading: 'Carregando…',
    claims: [
      {
        title: 'O inglês sempre aparece',
        body: 'O idioma que você aprende nunca some, nem com o filtro que esconde os idiomas que você não lê.',
      },
      {
        title: 'A tradução embaixo, não no lugar',
        body: 'O original e a tradução lado a lado: você aprende com o texto de verdade.',
      },
      {
        title: 'Automática ou quando você pedir',
        body: 'Traduza automaticamente ao rolar, ou só quando tocar em Traduzir. Quem traduz é o seu servidor ou a sua própria chave de IA.',
      },
      {
        title: 'Gente para seguir',
        body: 'Pacotes iniciais de contas que publicam em inglês, por assunto.',
      },
    ],
    signIn: 'Entrar com o Mastodon',
    questionsTitle: 'Perguntas',
    questions: [
      {
        q: 'O Mastodon é bom para aprender inglês?',
        a: 'Ele está cheio de inglês curto e do dia a dia, escrito por pessoas de verdade, sobre qualquer assunto. Siga quem fala do que você gosta, e ler vira hábito.',
      },
      {
        q: 'Quem faz a tradução?',
        a: 'O seu servidor do Mastodon, se ele oferecer tradução, ou um modelo de IA com a sua própria chave do OpenRouter. O Mawkingbird nunca traduz em servidores próprios.',
      },
      {
        q: 'Isso muda o idioma do app?',
        a: 'Não. Esta página só adiciona o inglês como idioma que você aprende; o idioma do app e os idiomas que você lê continuam iguais.',
      },
    ],
    checklist: {
      title: 'Configurar o Mawkingbird para aprender inglês',
      intro: 'Escolha o que aplicar. Nada muda até você tocar em “Aplicar”.',
      items: [
        {
          setting: 'learning',
          label: 'Estou aprendendo inglês',
          hint: 'As publicações em inglês nunca somem, e ganham tradução embaixo.',
          checked: true,
        },
      ],
      where: { browser: 'este navegador', server: 'seu servidor' },
      apply: 'Aplicar',
      applying: 'Aplicando…',
      failed: 'Um ajuste não pôde ser salvo. Tente de novo.',
      doneTitle: 'Pronto',
      doneNothing: 'Nada estava marcado, então nada mudou.',
      home: 'Ir para o início',
      starterPacks: 'Ver os pacotes iniciais',
      settingsLink: 'Todos os ajustes de idioma',
    },
  },
  'it/mastodon-in-italiano': {
    path: 'it/mastodon-in-italiano',
    lang: 'it',
    target: 'it',
    learning: 'en',
    openApp: 'Apri l’app',
    eyebrow: 'Mastodon in italiano',
    heading: 'Mastodon in italiano',
    intro:
      'Mawkingbird fa più dell’app di Mastodon per chi parla italiano, per chi vive tra due lingue e per chi ne sta imparando una. Accedi e lo impostiamo per le lingue che leggi e per quelle che stai imparando. La tua home ne guadagnerà.',
    loading: 'Caricamento…',
    claims: [
      {
        title: 'Tutta l’app in italiano',
        body: 'Menu, impostazioni e guida nella tua lingua.',
      },
      {
        title: 'Solo le lingue che leggi',
        body: 'I post in altre lingue spariscono dalla tua home. La lingua viene riconosciuta anche quando un post la indica male.',
      },
      {
        title: 'Oggi solo italiano',
        body: 'Limita per un po’ la tua timeline a una sola lingua, senza smettere di seguire nessuno.',
      },
      {
        title: 'Traduzioni per la lingua che stai imparando',
        body: 'I post nella lingua che stai imparando non vengono mai nascosti, con una traduzione sotto se vuoi. A tradurre è il tuo server o la tua chiave IA.',
      },
      {
        title: 'Tendenze che puoi leggere',
        body: 'Gli hashtag di tendenza scritti in altri alfabeti vengono filtrati.',
      },
      {
        title: 'I tuoi post arrivano a chi legge l’italiano',
        body: 'La lingua predefinita dei tuoi post diventa l’italiano sul tuo server. I filtri di lingua degli altri si basano su questa.',
      },
      {
        title: 'Starter pack in italiano',
        body: 'Elenchi scelti a mano di account da seguire, dentro l’app.',
      },
    ],
    signIn: 'Accedi con Mastodon',
    questionsTitle: 'Domande',
    questions: [
      {
        q: 'Mastodon è in italiano?',
        a: 'Sì. Mastodon è tradotto in italiano, e anche Mawkingbird lo è, dall’inizio alla fine. In più, Mawkingbird può limitare la tua timeline alle lingue che leggi.',
      },
      {
        q: 'Dove mi iscrivo?',
        a: 'mastodon.social è il modo più semplice per iniziare. Ci sono anche molti server italiani, che trovi in directory come joinmastodon.org. Mawkingbird funziona con tutti.',
      },
      {
        q: 'Cosa cambia quando accedo?',
        a: 'All’inizio niente. Vedi un elenco di impostazioni e scegli tu quali applicare. Solo la lingua dei post viene salvata sul tuo server; il resto resta in questo browser.',
      },
      {
        q: 'È a pagamento?',
        a: 'No. Mawkingbird è gratuito e funziona nel tuo browser.',
      },
    ],
    checklist: {
      title: 'Imposta Mawkingbird per l’italiano',
      intro: 'Scegli cosa applicare. Non cambia niente finché non tocchi “Applica”.',
      items: [
        {
          setting: 'interface',
          label: 'Mostra l’app in italiano',
          hint: 'Tutta l’app passa all’italiano.',
          checked: true,
        },
        {
          setting: 'known',
          label: 'Leggo l’italiano',
          hint: 'Le lingue che leggi vengono usate dai filtri qui sotto.',
          checked: true,
        },
        {
          setting: 'alsoEnglish',
          label: 'Leggo anche l’inglese',
          hint: 'Così i post in inglese restano visibili.',
          checked: true,
        },
        {
          setting: 'posting',
          label: 'Pubblico in italiano',
          hint: 'La lingua predefinita dei nuovi post. Salvata sul tuo server Mastodon.',
          checked: true,
        },
        {
          setting: 'hideForeign',
          label: 'Nascondi i post nelle lingue che non leggo',
          hint: 'In Home e in Algo. I post di lingua incerta restano visibili.',
          checked: true,
        },
        {
          setting: 'trends',
          label: 'Solo tendenze nel mio alfabeto',
          hint: 'Filtra gli hashtag di tendenza scritti in altri alfabeti.',
          checked: true,
        },
        {
          setting: 'learning',
          label: 'Sto imparando l’inglese',
          hint: 'I post in inglese restano sempre visibili, con una traduzione sotto.',
          checked: false,
        },
      ],
      where: { browser: 'questo browser', server: 'il tuo server' },
      apply: 'Applica',
      applying: 'Applicazione in corso…',
      failed:
        'Non è stato possibile salvare la lingua dei post sul tuo server. Il resto è applicato.',
      doneTitle: 'Fatto',
      doneNothing: 'Non era selezionato niente, quindi non è cambiato niente.',
      home: 'Vai alla home',
      starterPacks: 'Guarda gli starter pack',
      settingsLink: 'Tutte le impostazioni della lingua',
    },
  },
  'it/imparare-inglese-con-mastodon': {
    path: 'it/imparare-inglese-con-mastodon',
    lang: 'it',
    target: 'it',
    learning: 'en',
    openApp: 'Apri l’app',
    eyebrow: 'Imparare le lingue',
    heading: 'Imparare l’inglese con Mastodon',
    intro:
      'Leggi ogni giorno post veri di chi parla inglese, con una traduzione sotto quando ti serve. Accedi e impostiamo Mawkingbird per imparare l’inglese, senza toccare le lingue che leggi già.',
    loading: 'Caricamento…',
    claims: [
      {
        title: 'L’inglese resta sempre visibile',
        body: 'La lingua che stai imparando non viene mai nascosta, nemmeno dal filtro che nasconde le lingue che non leggi.',
      },
      {
        title: 'La traduzione sotto, non al posto dell’originale',
        body: 'Originale e traduzione affiancati: impari dal testo vero.',
      },
      {
        title: 'Automatica o quando la chiedi',
        body: 'Traduci in automatico mentre scorri, o solo quando tocchi Traduci. A tradurre è il tuo server o la tua chiave IA.',
      },
      {
        title: 'Persone da seguire',
        body: 'Starter pack di account che pubblicano in inglese, per argomento.',
      },
    ],
    signIn: 'Accedi con Mastodon',
    questionsTitle: 'Domande',
    questions: [
      {
        q: 'Mastodon va bene per imparare l’inglese?',
        a: 'È pieno di inglese breve e quotidiano, scritto da persone vere, su ogni argomento. Segui chi parla di quello che ti piace, e leggere diventa un’abitudine.',
      },
      {
        q: 'Chi fa la traduzione?',
        a: 'Il tuo server Mastodon, se offre la traduzione, oppure un modello di IA con la tua chiave OpenRouter. Mawkingbird non traduce mai sui propri server.',
      },
      {
        q: 'Cambia la lingua dell’app?',
        a: 'No. Questa pagina aggiunge solo l’inglese come lingua che stai imparando; la lingua dell’app e le lingue che leggi restano uguali.',
      },
    ],
    checklist: {
      title: 'Imposta Mawkingbird per imparare l’inglese',
      intro: 'Scegli cosa applicare. Non cambia niente finché non tocchi “Applica”.',
      items: [
        {
          setting: 'learning',
          label: 'Sto imparando l’inglese',
          hint: 'I post in inglese non vengono mai nascosti, e hanno una traduzione sotto.',
          checked: true,
        },
      ],
      where: { browser: 'questo browser', server: 'il tuo server' },
      apply: 'Applica',
      applying: 'Applicazione in corso…',
      failed: 'Un’impostazione non è stata salvata. Riprova.',
      doneTitle: 'Fatto',
      doneNothing: 'Non era selezionato niente, quindi non è cambiato niente.',
      home: 'Vai alla home',
      starterPacks: 'Guarda gli starter pack',
      settingsLink: 'Tutte le impostazioni della lingua',
    },
  },
  'pl/mastodon-po-polsku': {
    path: 'pl/mastodon-po-polsku',
    lang: 'pl',
    target: 'pl',
    learning: 'en',
    openApp: 'Otwórz aplikację',
    eyebrow: 'Mastodon po polsku',
    heading: 'Mastodon po polsku',
    intro:
      'Mawkingbird potrafi więcej niż sama aplikacja Mastodona dla osób mówiących po polsku, żyjących między dwoma językami i uczących się nowego. Zaloguj się, a ustawimy go dla języków, które czytasz, i tych, których się uczysz. Twoja oś główna od razu zrobi się lepsza.',
    loading: 'Wczytywanie…',
    claims: [
      {
        title: 'Cała aplikacja po polsku',
        body: 'Menu, ustawienia i pomoc w Twoim języku.',
      },
      {
        title: 'Tylko języki, które czytasz',
        body: 'Wpisy w innych językach znikają z Twojej osi głównej. Język jest rozpoznawany, nawet gdy wpis podaje go błędnie.',
      },
      {
        title: 'Dziś tylko po polsku',
        body: 'Na chwilę ogranicz oś czasu do jednego języka, bez przestawania obserwowania kogokolwiek.',
      },
      {
        title: 'Tłumaczenia dla języka, którego się uczysz',
        body: 'Wpisy w języku, którego się uczysz, nigdy nie są ukrywane, a pod spodem może pojawić się tłumaczenie. Tłumaczy Twój serwer albo Twój własny klucz AI.',
      },
      {
        title: 'Popularne tematy, które przeczytasz',
        body: 'Popularne hashtagi zapisane innymi alfabetami są odfiltrowywane.',
      },
      {
        title: 'Twoje wpisy trafiają do czytelników po polsku',
        body: 'Domyślny język Twoich wpisów zostaje na serwerze ustawiony na polski. Filtry językowe innych osób z niego korzystają.',
      },
      {
        title: 'Polskie paczki startowe',
        body: 'Wybrane ręcznie listy kont do obserwowania, w aplikacji.',
      },
    ],
    signIn: 'Zaloguj się przez Mastodona',
    questionsTitle: 'Pytania',
    questions: [
      {
        q: 'Czy Mastodon jest po polsku?',
        a: 'Tak. Mastodon ma polskie tłumaczenie, a Mawkingbird również, od początku do końca. Do tego Mawkingbird potrafi ograniczyć oś czasu do języków, które czytasz.',
      },
      {
        q: 'Gdzie się zarejestrować?',
        a: 'Najprościej zacząć od mastodon.social. Jest też wiele polskich serwerów, które znajdziesz w katalogach takich jak joinmastodon.org. Mawkingbird działa z każdym z nich.',
      },
      {
        q: 'Co się zmieni po zalogowaniu?',
        a: 'Na początku nic. Zobaczysz listę ustawień i wybierzesz, które zastosować. Tylko język wpisów trafia na Twój serwer; reszta zostaje w tej przeglądarce.',
      },
      {
        q: 'Czy to kosztuje?',
        a: 'Nie. Mawkingbird jest darmowy i działa w Twojej przeglądarce.',
      },
    ],
    checklist: {
      title: 'Ustaw Mawkingbird po polsku',
      intro: 'Wybierz, co zastosować. Nic się nie zmieni, dopóki nie stukniesz „Zastosuj”.',
      items: [
        {
          setting: 'interface',
          label: 'Pokaż aplikację po polsku',
          hint: 'Cała aplikacja przechodzi na polski.',
          checked: true,
        },
        {
          setting: 'known',
          label: 'Czytam po polsku',
          hint: 'Języki, które czytasz, są używane przez filtry poniżej.',
          checked: true,
        },
        {
          setting: 'alsoEnglish',
          label: 'Czytam też po angielsku',
          hint: 'Wtedy wpisy po angielsku też zostają widoczne.',
          checked: true,
        },
        {
          setting: 'posting',
          label: 'Piszę po polsku',
          hint: 'Domyślny język nowych wpisów. Zapisywany na Twoim serwerze Mastodona.',
          checked: true,
        },
        {
          setting: 'hideForeign',
          label: 'Ukryj wpisy w językach, których nie czytam',
          hint: 'Na osi głównej i w Algo. Wpisy o niepewnym języku zostają widoczne.',
          checked: true,
        },
        {
          setting: 'trends',
          label: 'Tylko popularne tematy w moim alfabecie',
          hint: 'Odfiltrowuje popularne hashtagi zapisane innymi alfabetami.',
          checked: true,
        },
        {
          setting: 'learning',
          label: 'Uczę się angielskiego',
          hint: 'Wpisy po angielsku są zawsze widoczne, z tłumaczeniem pod spodem.',
          checked: false,
        },
      ],
      where: { browser: 'ta przeglądarka', server: 'Twój serwer' },
      apply: 'Zastosuj',
      applying: 'Stosowanie…',
      failed: 'Nie udało się zapisać języka wpisów na Twoim serwerze. Reszta została zastosowana.',
      doneTitle: 'Gotowe',
      doneNothing: 'Nic nie było zaznaczone, więc nic się nie zmieniło.',
      home: 'Przejdź do osi głównej',
      starterPacks: 'Zobacz paczki startowe',
      settingsLink: 'Wszystkie ustawienia języka',
    },
  },
  'pl/nauka-angielskiego-z-mastodonem': {
    path: 'pl/nauka-angielskiego-z-mastodonem',
    lang: 'pl',
    target: 'pl',
    learning: 'en',
    openApp: 'Otwórz aplikację',
    eyebrow: 'Nauka języków',
    heading: 'Nauka angielskiego z Mastodonem',
    intro:
      'Czytaj codziennie prawdziwe wpisy osób mówiących po angielsku, z tłumaczeniem pod spodem, gdy go potrzebujesz. Zaloguj się, a ustawimy Mawkingbird do nauki angielskiego, nie ruszając języków, które już czytasz.',
    loading: 'Wczytywanie…',
    claims: [
      {
        title: 'Angielski zawsze widoczny',
        body: 'Język, którego się uczysz, nigdy nie jest ukrywany, nawet przez filtr chowający języki, których nie czytasz.',
      },
      {
        title: 'Tłumaczenie pod spodem, nie zamiast',
        body: 'Oryginał i tłumaczenie obok siebie: uczysz się z prawdziwego tekstu.',
      },
      {
        title: 'Automatycznie albo na żądanie',
        body: 'Tłumacz automatycznie podczas przewijania albo tylko po stuknięciu Przetłumacz. Tłumaczy Twój serwer albo Twój własny klucz AI.',
      },
      {
        title: 'Ludzie do obserwowania',
        body: 'Paczki startowe kont piszących po angielsku, według tematów.',
      },
    ],
    signIn: 'Zaloguj się przez Mastodona',
    questionsTitle: 'Pytania',
    questions: [
      {
        q: 'Czy Mastodon nadaje się do nauki angielskiego?',
        a: 'Jest pełen krótkiej, codziennej angielszczyzny pisanej przez prawdziwych ludzi, na każdy temat. Obserwuj osoby piszące o tym, co lubisz, a czytanie stanie się nawykiem.',
      },
      {
        q: 'Kto tłumaczy?',
        a: 'Twój serwer Mastodona, jeśli oferuje tłumaczenia, albo model AI z Twoim własnym kluczem OpenRouter. Mawkingbird nigdy nie tłumaczy na własnych serwerach.',
      },
      {
        q: 'Czy to zmienia język aplikacji?',
        a: 'Nie. Ta strona tylko dodaje angielski jako język, którego się uczysz; język aplikacji i języki, które czytasz, zostają bez zmian.',
      },
    ],
    checklist: {
      title: 'Ustaw Mawkingbird do nauki angielskiego',
      intro: 'Wybierz, co zastosować. Nic się nie zmieni, dopóki nie stukniesz „Zastosuj”.',
      items: [
        {
          setting: 'learning',
          label: 'Uczę się angielskiego',
          hint: 'Wpisy po angielsku nigdy nie są ukrywane i mają tłumaczenie pod spodem.',
          checked: true,
        },
      ],
      where: { browser: 'ta przeglądarka', server: 'Twój serwer' },
      apply: 'Zastosuj',
      applying: 'Stosowanie…',
      failed: 'Nie udało się zapisać jednego ustawienia. Spróbuj ponownie.',
      doneTitle: 'Gotowe',
      doneNothing: 'Nic nie było zaznaczone, więc nic się nie zmieniło.',
      home: 'Przejdź do osi głównej',
      starterPacks: 'Zobacz paczki startowe',
      settingsLink: 'Wszystkie ustawienia języka',
    },
  },
  'uk/mastodon-in-ukrainian': {
    openApp: 'Відкрити застосунок',
    loading: 'Завантаження…',
    signIn: 'Увійти через Mastodon',
    questionsTitle: 'Запитання',
    path: 'uk/mastodon-in-ukrainian',
    lang: 'uk',
    target: 'uk',
    learning: 'en',
    eyebrow: 'Ваші мови',
    heading: 'Mastodon українською',
    intro:
      'Читайте Mastodon українською. Налаштуйте мову застосунку, залиште у стрічці мови, які читаєте, і додайте переклад для тих, які вивчаєте. Увійдіть, щоб переглянути й застосувати налаштування за один раз.',
    claims: [
      {
        title: 'Застосунок українською',
        body: 'Меню, кнопки й налаштування Mawkingbird українською.',
      },
      {
        title: 'Лише мови, які ви читаєте',
        body: 'Приховуйте дописи мовами, яких не розумієте, у домашній стрічці й Algo. Дописи з невизначеною мовою залишаються видимими.',
      },
      {
        title: 'Навчайтеся, читаючи',
        body: 'Додайте мову, яку вивчаєте: дописи нею завжди видно, а переклад з’являється під оригіналом.',
      },
      {
        title: 'Теми вашою абеткою',
        body: 'Фільтруйте популярні хештеги за системою письма.',
      },
    ],
    questions: [
      {
        q: 'Чи є Mastodon українською?',
        a: 'Так. Mastodon має український переклад, як і Mawkingbird. Крім того, Mawkingbird може обмежити стрічку мовами, які ви читаєте.',
      },
      {
        q: 'Де зареєструватися?',
        a: 'Почати можна з mastodon.social. Інші сервери можна знайти в каталогах на зразок joinmastodon.org. Mawkingbird працює з будь-яким із них.',
      },
      {
        q: 'Що зміниться після входу?',
        a: 'Спочатку нічого. Ви побачите список налаштувань і виберете, які застосувати. Лише мова дописів зберігається на сервері; решта — у цьому браузері.',
      },
      {
        q: 'Це платно?',
        a: 'Ні. Mawkingbird безкоштовний і працює у вашому браузері.',
      },
    ],
    checklist: {
      title: 'Налаштуйте Mawkingbird українською',
      intro: 'Виберіть, що застосувати. Нічого не зміниться, доки ви не натиснете «Застосувати».',
      items: [
        {
          setting: 'interface',
          label: 'Показувати застосунок українською',
          hint: 'Увесь застосунок переходить на українську.',
          checked: true,
        },
        {
          setting: 'known',
          label: 'Читаю українською',
          hint: 'Мови, які ви читаєте, використовуються у фільтрах нижче.',
          checked: true,
        },
        {
          setting: 'alsoEnglish',
          label: 'Також читаю англійською',
          hint: 'Тоді дописи англійською теж залишаються видимими.',
          checked: true,
        },
        {
          setting: 'posting',
          label: 'Пишу українською',
          hint: 'Мова нових дописів за замовчуванням. Зберігається на вашому сервері Mastodon.',
          checked: true,
        },
        {
          setting: 'hideForeign',
          label: 'Приховувати дописи мовами, яких не читаю',
          hint: 'У домашній стрічці й Algo. Дописи з невизначеною мовою залишаються видимими.',
          checked: true,
        },
        {
          setting: 'trends',
          label: 'Лише популярні теми моєю абеткою',
          hint: 'Відфільтровує популярні хештеги іншими системами письма.',
          checked: true,
        },
        {
          setting: 'learning',
          label: 'Вивчаю англійську',
          hint: 'Дописи англійською завжди видно, з перекладом під ними.',
          checked: false,
        },
      ],
      where: {
        browser: 'цей браузер',
        server: 'ваш сервер',
      },
      apply: 'Застосувати',
      applying: 'Застосування…',
      failed: 'Не вдалося зберегти мову дописів на вашому сервері. Решту змін застосовано.',
      doneTitle: 'Готово',
      doneNothing: 'Нічого не вибрано, тому нічого не змінилося.',
      home: 'Перейти до домашньої стрічки',
      starterPacks: 'Переглянути добірки для початку',
      settingsLink: 'Усі мовні налаштування',
    },
  },
  'uk/learn-english-with-mastodon': {
    openApp: 'Відкрити застосунок',
    loading: 'Завантаження…',
    signIn: 'Увійти через Mastodon',
    questionsTitle: 'Запитання',
    path: 'uk/learn-english-with-mastodon',
    lang: 'uk',
    target: 'uk',
    learning: 'en',
    eyebrow: 'Вивчення мов',
    heading: 'Вивчайте англійську з Mastodon',
    intro:
      'Щодня читайте справжні дописи англомовних людей із перекладом під ними, коли він потрібен. Увійдіть, щоб налаштувати Mawkingbird для вивчення англійської, зберігши мови, які ви вже читаєте.',
    claims: [
      {
        title: 'Англійську завжди видно',
        body: 'Мова, яку ви вивчаєте, ніколи не приховується, навіть фільтром незнайомих мов.',
      },
      {
        title: 'Переклад під оригіналом',
        body: 'Оригінал і переклад разом: навчайтеся на справжньому тексті.',
      },
      {
        title: 'Автоматично або на запит',
        body: 'Перекладайте під час прокручування або після натискання «Перекласти». Перекладає ваш сервер або модель ШІ з вашим ключем.',
      },
      {
        title: 'Люди, за якими варто стежити',
        body: 'Добірки для початку з англомовними обліковими записами за темами.',
      },
    ],
    questions: [
      {
        q: 'Чи підходить Mastodon для вивчення англійської?',
        a: 'Тут багато коротких повсякденних дописів справжніх людей на будь-яку тему. Стежте за людьми, які пишуть про ваші інтереси, і читання стане звичкою.',
      },
      {
        q: 'Хто перекладає?',
        a: 'Ваш сервер Mastodon, якщо він підтримує переклад, або модель ШІ з вашим ключем OpenRouter. Mawkingbird не перекладає на власних серверах.',
      },
      {
        q: 'Чи зміниться мова застосунку?',
        a: 'Ні. Сторінка лише додає англійську як мову, яку ви вивчаєте. Мова застосунку й мови, які ви читаєте, не змінюються.',
      },
    ],
    checklist: {
      title: 'Налаштуйте Mawkingbird для вивчення англійської',
      intro: 'Виберіть, що застосувати. Нічого не зміниться, доки ви не натиснете «Застосувати».',
      items: [
        {
          setting: 'learning',
          label: 'Вивчаю англійську',
          hint: 'Дописи англійською ніколи не приховуються й мають переклад під ними.',
          checked: true,
        },
      ],
      where: {
        browser: 'цей браузер',
        server: 'ваш сервер',
      },
      apply: 'Застосувати',
      applying: 'Застосування…',
      failed: 'Не вдалося зберегти одне налаштування. Спробуйте ще раз.',
      doneTitle: 'Готово',
      doneNothing: 'Нічого не вибрано, тому нічого не змінилося.',
      home: 'Перейти до домашньої стрічки',
      starterPacks: 'Переглянути добірки для початку',
      settingsLink: 'Усі мовні налаштування',
    },
  },
  'hi/mastodon-in-hindi': {
    lang: 'hi',
    target: 'hi',
    learning: 'en',
    openApp: 'ऐप खोलें',
    loading: 'लोड हो रहा है…',
    signIn: 'Mastodon से साइन इन करें',
    questionsTitle: 'सवाल',
    path: 'hi/mastodon-in-hindi',
    eyebrow: 'आपकी भाषाएँ',
    heading: 'Mastodon हिन्दी में',
    intro:
      'Mastodon पर हिन्दी पढ़ें और लिखें। अपनी पढ़ने वाली भाषाएँ चुनें और सीखने वाली भाषा के लिए अनुवाद जोड़ें। साइन इन करके सेटिंग की समीक्षा करें और एक साथ लागू करें।',
    claims: [
      {
        title: 'हिन्दी में टूल',
        body: 'यह पेज और इसके टूल हिन्दी में हैं। पूरे ऐप का हिन्दी अनुवाद अभी प्रीव्यू में है; सार्वजनिक ऐप की भाषा यहाँ नहीं बदलती।',
      },
      {
        title: 'केवल वे भाषाएँ जिन्हें आप पढ़ते हैं',
        body: 'होम और Algo में अनजानी भाषाओं की पोस्ट छिपाएँ। अनिश्चित भाषा वाली पोस्ट दिखती रहती हैं।',
      },
      {
        title: 'पढ़ते-पढ़ते सीखें',
        body: 'सीखने वाली भाषा जोड़ें: उसकी पोस्ट कभी नहीं छिपतीं और अनुवाद मूल टेक्स्ट के नीचे मिलता है।',
      },
      {
        title: 'अपनी लिपि के विषय',
        body: 'लोकप्रिय हैशटैग को लिपि के हिसाब से छाँटें।',
      },
    ],
    questions: [
      {
        q: 'क्या Mastodon पर हिन्दी इस्तेमाल कर सकते हैं?',
        a: 'हाँ। हिन्दी पोस्ट पढ़ और लिख सकते हैं और पोस्ट की भाषा हिन्दी चुन सकते हैं। इस पेज से पढ़ने वाली भाषाएँ और फ़िल्टर सेट करें।',
      },
      {
        q: 'क्या पूरा Mawkingbird ऐप हिन्दी में है?',
        a: 'ऐप का हिन्दी अनुवाद अभी प्रीव्यू में है। यह सार्वजनिक पेज और इसके टूल हिन्दी में हैं। यह सूची पूरे ऐप की भाषा नहीं बदलती।',
      },
      {
        q: 'कहाँ पंजीकरण करें?',
        a: 'mastodon.social से शुरुआत कर सकते हैं। joinmastodon.org जैसी डायरेक्टरी में दूसरे सर्वर भी मिलते हैं। Mawkingbird किसी भी Mastodon सर्वर के साथ काम करता है।',
      },
      {
        q: 'साइन इन करने पर क्या बदलेगा?',
        a: 'शुरू में कुछ नहीं। आप चुनते हैं कि कौन सी सेटिंग लागू करनी है। केवल पोस्ट की भाषा सर्वर पर जाती है; बाकी इसी ब्राउज़र में रहती हैं।',
      },
      {
        q: 'क्या यह मुफ़्त है?',
        a: 'हाँ। Mawkingbird मुफ़्त है और आपके ब्राउज़र में चलता है।',
      },
    ],
    checklist: {
      title: 'हिन्दी पढ़ने के लिए Mawkingbird सेट करें',
      intro: 'चुनें क्या लागू करना है। लागू करें दबाने तक कुछ नहीं बदलेगा।',
      items: [
        {
          setting: 'known',
          label: 'हिन्दी पढ़नी है',
          hint: 'आपकी पढ़ने वाली भाषाएँ नीचे के फ़िल्टर में इस्तेमाल होती हैं।',
          checked: true,
        },
        {
          setting: 'alsoEnglish',
          label: 'अंग्रेज़ी भी पढ़नी है',
          hint: 'अंग्रेज़ी पोस्ट भी दिखती रहेंगी।',
          checked: true,
        },
        {
          setting: 'posting',
          label: 'हिन्दी में पोस्ट करना है',
          hint: 'नई पोस्ट की डिफ़ॉल्ट भाषा। आपके Mastodon सर्वर पर सहेजी जाती है।',
          checked: true,
        },
        {
          setting: 'hideForeign',
          label: 'अनजानी भाषाओं की पोस्ट छिपाएँ',
          hint: 'होम और Algo पर। अनिश्चित भाषा वाली पोस्ट दिखती रहेंगी।',
          checked: true,
        },
        {
          setting: 'trends',
          label: 'मेरी लिपि के लोकप्रिय विषय ही दिखाएँ',
          hint: 'दूसरी लिपियों के लोकप्रिय हैशटैग हटाता है।',
          checked: true,
        },
        {
          setting: 'learning',
          label: 'अंग्रेज़ी सीखनी है',
          hint: 'अंग्रेज़ी पोस्ट हमेशा दिखती हैं और नीचे अनुवाद मिलता है।',
          checked: false,
        },
      ],
      where: {
        browser: 'यह ब्राउज़र',
        server: 'आपका सर्वर',
      },
      apply: 'लागू करें',
      applying: 'लागू हो रहा है…',
      failed: 'सर्वर पर पोस्ट की भाषा सहेज नहीं सके। बाकी बदलाव लागू हो गए।',
      doneTitle: 'हो गया',
      doneNothing: 'कुछ चुना नहीं था, इसलिए कुछ नहीं बदला।',
      home: 'होम फ़ीड खोलें',
      starterPacks: 'स्टार्टर किट देखें',
      settingsLink: 'भाषा की सभी सेटिंग',
    },
  },
  'hi/learn-english-with-mastodon': {
    lang: 'hi',
    target: 'hi',
    learning: 'en',
    openApp: 'ऐप खोलें',
    loading: 'लोड हो रहा है…',
    signIn: 'Mastodon से साइन इन करें',
    questionsTitle: 'सवाल',
    path: 'hi/learn-english-with-mastodon',
    eyebrow: 'भाषा सीखना',
    heading: 'Mastodon से अंग्रेज़ी सीखें',
    intro:
      'हर दिन असली लोगों की अंग्रेज़ी पोस्ट पढ़ें और ज़रूरत पर नीचे अनुवाद पाएँ। साइन इन करके अंग्रेज़ी सीखने की सेटिंग लागू करें; पहले से पढ़ने वाली भाषाएँ नहीं बदलेंगी।',
    claims: [
      {
        title: 'अंग्रेज़ी हमेशा दिखती है',
        body: 'सीखने वाली भाषा की पोस्ट अनजानी भाषा वाले फ़िल्टर से भी नहीं छिपतीं।',
      },
      {
        title: 'मूल टेक्स्ट के नीचे अनुवाद',
        body: 'मूल टेक्स्ट और अनुवाद साथ देखें और असली भाषा से सीखें।',
      },
      {
        title: 'अपने-आप या माँग पर',
        body: 'स्क्रॉल करते हुए अपने-आप अनुवाद लें या अनुवाद करें दबाएँ। अनुवाद आपका सर्वर या आपकी अपनी AI कुंजी करती है।',
      },
      {
        title: 'फ़ॉलो करने के लिए लोग',
        body: 'विषय के अनुसार अंग्रेज़ी पोस्ट करने वाले अकाउंट की स्टार्टर किट खोजें।',
      },
    ],
    questions: [
      {
        q: 'क्या Mastodon अंग्रेज़ी सीखने के लिए उपयोगी है?',
        a: 'यहाँ हर विषय पर असली लोगों की छोटी रोज़मर्रा की अंग्रेज़ी पोस्ट हैं। अपनी रुचि के लोगों को फ़ॉलो करें और पढ़ने की आदत बनाएँ।',
      },
      {
        q: 'अनुवाद कौन करता है?',
        a: 'आपका Mastodon सर्वर, यदि वह अनुवाद देता है, या आपकी OpenRouter कुंजी वाला AI मॉडल। Mawkingbird अपने सर्वर पर अनुवाद नहीं करता।',
      },
      {
        q: 'क्या ऐप की भाषा बदलेगी?',
        a: 'नहीं। यह पेज केवल अंग्रेज़ी को सीखने वाली भाषा बनाता है। ऐप की भाषा और पढ़ने वाली भाषाएँ नहीं बदलतीं।',
      },
    ],
    checklist: {
      title: 'अंग्रेज़ी सीखने के लिए Mawkingbird सेट करें',
      intro: 'चुनें क्या लागू करना है। लागू करें दबाने तक कुछ नहीं बदलेगा।',
      items: [
        {
          setting: 'learning',
          label: 'अंग्रेज़ी सीखनी है',
          hint: 'अंग्रेज़ी पोस्ट कभी नहीं छिपतीं और नीचे अनुवाद मिलता है।',
          checked: true,
        },
      ],
      where: {
        browser: 'यह ब्राउज़र',
        server: 'आपका सर्वर',
      },
      apply: 'लागू करें',
      applying: 'लागू हो रहा है…',
      failed: 'एक सेटिंग सहेज नहीं सके। फिर कोशिश करें।',
      doneTitle: 'हो गया',
      doneNothing: 'कुछ चुना नहीं था, इसलिए कुछ नहीं बदला।',
      home: 'होम फ़ीड खोलें',
      starterPacks: 'स्टार्टर किट देखें',
      settingsLink: 'भाषा की सभी सेटिंग',
    },
  },
  'nl/mastodon-in-het-nederlands': {
    lang: 'nl',
    target: 'nl',
    learning: 'en',
    openApp: 'Open de app',
    loading: 'Laden…',
    signIn: 'Log in met Mastodon',
    questionsTitle: 'Vragen',
    path: 'nl/mastodon-in-het-nederlands',
    eyebrow: 'Je talen',
    heading: 'Mastodon in het Nederlands',
    intro:
      'Lees Mastodon in het Nederlands. Zet de app in je eigen taal, kies welke talen je leest en voeg vertaling toe voor de talen die je leert. Log in om de instellingen in één keer te bekijken en toe te passen.',
    claims: [
      {
        title: 'De app in het Nederlands',
        body: 'Menu’s, knoppen en instellingen van Mawkingbird in het Nederlands.',
      },
      {
        title: 'Alleen de talen die je leest',
        body: 'Verberg berichten in onbekende talen op Home en Algo. Berichten met een onzekere taal blijven zichtbaar.',
      },
      {
        title: 'Leren door te lezen',
        body: 'Voeg een taal toe die je leert: berichten in die taal blijven altijd zichtbaar, met de vertaling onder het origineel.',
      },
      {
        title: 'Trends in je eigen schrift',
        body: 'Filter populaire hashtags op schrift.',
      },
    ],
    questions: [
      {
        q: 'Is Mastodon er in het Nederlands?',
        a: 'Ja. Mastodon heeft een Nederlandse vertaling, net als Mawkingbird. Daarnaast kan Mawkingbird je tijdlijn beperken tot de talen die je leest.',
      },
      {
        q: 'Waar kan ik me aanmelden?',
        a: 'Je kunt beginnen op mastodon.social. In lijsten zoals joinmastodon.org vind je ook andere servers. Mawkingbird werkt met elke Mastodon-server.',
      },
      {
        q: 'Wat verandert er als ik inlog?',
        a: 'Eerst niets. Je ziet een lijst met instellingen en kiest welke je toepast. Alleen de berichttaal gaat naar je server; de rest blijft in deze browser.',
      },
      {
        q: 'Kost dit geld?',
        a: 'Nee. Mawkingbird is gratis en werkt in je browser.',
      },
    ],
    checklist: {
      title: 'Stel Mawkingbird in het Nederlands in',
      intro: 'Kies wat je wilt toepassen. Er verandert niets totdat je op Toepassen drukt.',
      items: [
        {
          setting: 'interface',
          label: 'Toon de app in het Nederlands',
          hint: 'De hele app schakelt over naar het Nederlands.',
          checked: true,
        },
        {
          setting: 'known',
          label: 'Ik lees Nederlands',
          hint: 'De talen die je leest worden door de filters hieronder gebruikt.',
          checked: true,
        },
        {
          setting: 'alsoEnglish',
          label: 'Ik lees ook Engels',
          hint: 'Engelstalige berichten blijven dan ook zichtbaar.',
          checked: true,
        },
        {
          setting: 'posting',
          label: 'Ik schrijf in het Nederlands',
          hint: 'De standaardtaal voor nieuwe berichten. Wordt op je Mastodon-server opgeslagen.',
          checked: true,
        },
        {
          setting: 'hideForeign',
          label: 'Verberg berichten in talen die ik niet lees',
          hint: 'Op Home en Algo. Berichten met een onzekere taal blijven zichtbaar.',
          checked: true,
        },
        {
          setting: 'trends',
          label: 'Alleen trends in mijn schrift',
          hint: 'Filtert populaire hashtags in andere schriften weg.',
          checked: true,
        },
        {
          setting: 'learning',
          label: 'Ik leer Engels',
          hint: 'Engelstalige berichten blijven altijd zichtbaar, met een vertaling eronder.',
          checked: false,
        },
      ],
      where: {
        browser: 'deze browser',
        server: 'je server',
      },
      apply: 'Toepassen',
      applying: 'Toepassen…',
      failed: 'De berichttaal kon niet op je server worden opgeslagen. De rest is wel toegepast.',
      doneTitle: 'Klaar',
      doneNothing: 'Er was niets aangevinkt, dus er is niets veranderd.',
      home: 'Naar je thuisfeed',
      starterPacks: 'Bekijk starterkits',
      settingsLink: 'Alle taalinstellingen',
    },
  },
  'nl/engels-leren-met-mastodon': {
    lang: 'nl',
    target: 'nl',
    learning: 'en',
    openApp: 'Open de app',
    loading: 'Laden…',
    signIn: 'Log in met Mastodon',
    questionsTitle: 'Vragen',
    path: 'nl/engels-leren-met-mastodon',
    eyebrow: 'Talen leren',
    heading: 'Leer Engels met Mastodon',
    intro:
      'Lees dagelijks echte berichten van Engelstalige mensen, met een vertaling eronder als je die nodig hebt. Log in om Mawkingbird voor Engels leren in te stellen, zonder je bestaande leestalen te veranderen.',
    claims: [
      {
        title: 'Engels blijft altijd zichtbaar',
        body: 'De taal die je leert wordt nooit verborgen, ook niet door een filter voor talen die je niet leest.',
      },
      {
        title: 'Vertaling eronder, niet in plaats ervan',
        body: 'Origineel en vertaling samen: je leert van echte tekst.',
      },
      {
        title: 'Automatisch of op verzoek',
        body: 'Laat tijdens het scrollen vertalen of druk zelf op Vertalen. Je server of je eigen AI-sleutel verzorgt de vertaling.',
      },
      {
        title: 'Mensen om te volgen',
        body: 'Starterkits met Engelstalige accounts, ingedeeld op onderwerp.',
      },
    ],
    questions: [
      {
        q: 'Is Mastodon handig om Engels te leren?',
        a: 'Er staan korte, alledaagse Engelse berichten van echte mensen over allerlei onderwerpen. Volg mensen met jouw interesses en maak lezen tot een gewoonte.',
      },
      {
        q: 'Wie vertaalt er?',
        a: 'Je Mastodon-server, als die vertaling aanbiedt, of een AI-model met je eigen OpenRouter-sleutel. Mawkingbird vertaalt nooit op eigen servers.',
      },
      {
        q: 'Verandert dit de taal van de app?',
        a: 'Nee. Deze pagina voegt alleen Engels toe als taal die je leert. De taal van de app en je leestalen veranderen niet.',
      },
    ],
    checklist: {
      title: 'Stel Mawkingbird in om Engels te leren',
      intro: 'Kies wat je wilt toepassen. Er verandert niets totdat je op Toepassen drukt.',
      items: [
        {
          setting: 'learning',
          label: 'Ik leer Engels',
          hint: 'Engelstalige berichten worden nooit verborgen en krijgen een vertaling eronder.',
          checked: true,
        },
      ],
      where: {
        browser: 'deze browser',
        server: 'je server',
      },
      apply: 'Toepassen',
      applying: 'Toepassen…',
      failed: 'Een instelling kon niet worden opgeslagen. Probeer het opnieuw.',
      doneTitle: 'Klaar',
      doneNothing: 'Er was niets aangevinkt, dus er is niets veranderd.',
      home: 'Naar je thuisfeed',
      starterPacks: 'Bekijk starterkits',
      settingsLink: 'Alle taalinstellingen',
    },
  },
  'id/mastodon-dalam-bahasa-indonesia': {
    lang: 'id',
    target: 'id',
    learning: 'en',
    openApp: 'Buka aplikasi',
    loading: 'Memuat…',
    signIn: 'Masuk dengan Mastodon',
    questionsTitle: 'Pertanyaan',
    path: 'id/mastodon-dalam-bahasa-indonesia',
    eyebrow: 'Bahasamu',
    heading: 'Mastodon dalam bahasa Indonesia',
    intro:
      'Baca Mastodon dalam bahasa Indonesia. Pilih bahasa antarmuka dan bahasa yang kamu baca, lalu tambahkan terjemahan untuk bahasa yang dipelajari. Masuk untuk meninjau dan menerapkan pengaturan sekaligus.',
    claims: [
      {
        title: 'Antarmuka bahasa Indonesia',
        body: 'Menu, tombol, dan pengaturan Mawkingbird dalam bahasa Indonesia.',
      },
      {
        title: 'Hanya bahasa yang kamu baca',
        body: 'Sembunyikan postingan dalam bahasa yang tidak dipahami di Beranda dan Algo. Postingan dengan bahasa yang belum pasti tetap terlihat.',
      },
      {
        title: 'Belajar sambil membaca',
        body: 'Tambahkan bahasa yang dipelajari. Postingannya tidak pernah disembunyikan dan terjemahan muncul di bawah teks asli.',
      },
      {
        title: 'Tren dalam aksaramu',
        body: 'Saring tagar populer berdasarkan aksara.',
      },
    ],
    questions: [
      {
        q: 'Apakah Mastodon tersedia dalam bahasa Indonesia?',
        a: 'Ya. Mastodon memiliki terjemahan bahasa Indonesia, begitu juga Mawkingbird. Mawkingbird juga bisa membatasi linimasa ke bahasa yang kamu baca.',
      },
      {
        q: 'Di mana aku bisa mendaftar?',
        a: 'Kamu bisa mulai di mastodon.social. Server lain bisa ditemukan di direktori seperti joinmastodon.org. Mawkingbird bekerja dengan server Mastodon mana pun.',
      },
      {
        q: 'Apa yang berubah setelah masuk?',
        a: 'Awalnya tidak ada. Kamu melihat daftar pengaturan dan memilih yang diterapkan. Hanya bahasa postingan yang dikirim ke server; sisanya tetap di browser ini.',
      },
      {
        q: 'Apakah berbayar?',
        a: 'Tidak. Mawkingbird gratis dan berjalan di browsermu.',
      },
    ],
    checklist: {
      title: 'Atur Mawkingbird dalam bahasa Indonesia',
      intro: 'Pilih yang ingin diterapkan. Tidak ada perubahan sebelum menekan Terapkan.',
      items: [
        {
          setting: 'interface',
          label: 'Tampilkan aplikasi dalam bahasa Indonesia',
          hint: 'Antarmuka aplikasi beralih ke bahasa Indonesia.',
          checked: true,
        },
        {
          setting: 'known',
          label: 'Aku membaca bahasa Indonesia',
          hint: 'Bahasa yang kamu baca dipakai oleh filter di bawah.',
          checked: true,
        },
        {
          setting: 'alsoEnglish',
          label: 'Aku juga membaca bahasa Inggris',
          hint: 'Postingan bahasa Inggris juga tetap terlihat.',
          checked: true,
        },
        {
          setting: 'posting',
          label: 'Aku menulis dalam bahasa Indonesia',
          hint: 'Bahasa bawaan postingan baru. Disimpan di server Mastodon-mu.',
          checked: true,
        },
        {
          setting: 'hideForeign',
          label: 'Sembunyikan postingan dalam bahasa yang tidak kubaca',
          hint: 'Di Beranda dan Algo. Postingan dengan bahasa yang belum pasti tetap terlihat.',
          checked: true,
        },
        {
          setting: 'trends',
          label: 'Hanya tren dalam aksaraku',
          hint: 'Menyaring tagar tren yang ditulis dalam aksara lain.',
          checked: true,
        },
        {
          setting: 'learning',
          label: 'Aku belajar bahasa Inggris',
          hint: 'Postingan bahasa Inggris selalu terlihat dengan terjemahan di bawahnya.',
          checked: false,
        },
      ],
      where: {
        browser: 'browser ini',
        server: 'servermu',
      },
      apply: 'Terapkan',
      applying: 'Menerapkan…',
      failed:
        'Bahasa postingan tidak bisa disimpan di servermu. Perubahan lainnya sudah diterapkan.',
      doneTitle: 'Selesai',
      doneNothing: 'Tidak ada yang dipilih, jadi tidak ada perubahan.',
      home: 'Buka feed beranda',
      starterPacks: 'Lihat paket awal',
      settingsLink: 'Semua pengaturan bahasa',
    },
  },
  'id/belajar-bahasa-inggris-dengan-mastodon': {
    lang: 'id',
    target: 'id',
    learning: 'en',
    openApp: 'Buka aplikasi',
    loading: 'Memuat…',
    signIn: 'Masuk dengan Mastodon',
    questionsTitle: 'Pertanyaan',
    path: 'id/belajar-bahasa-inggris-dengan-mastodon',
    eyebrow: 'Belajar bahasa',
    heading: 'Belajar bahasa Inggris dengan Mastodon',
    intro:
      'Baca postingan asli dari penutur bahasa Inggris setiap hari, dengan terjemahan di bawahnya saat dibutuhkan. Masuk untuk menyiapkan Mawkingbird bagi pembelajaran bahasa Inggris tanpa mengubah bahasa yang sudah kamu baca.',
    claims: [
      {
        title: 'Bahasa Inggris selalu terlihat',
        body: 'Bahasa yang dipelajari tidak pernah disembunyikan, bahkan oleh filter bahasa yang tidak kamu baca.',
      },
      {
        title: 'Terjemahan di bawah, bukan menggantikan',
        body: 'Teks asli dan terjemahan bersama agar kamu belajar dari bahasa yang nyata.',
      },
      {
        title: 'Otomatis atau saat diminta',
        body: 'Terjemahkan otomatis saat menggulir atau setelah menekan Terjemahkan. Terjemahan memakai servermu atau kunci AI milikmu sendiri.',
      },
      {
        title: 'Orang untuk diikuti',
        body: 'Paket awal akun berbahasa Inggris, dikelompokkan menurut topik.',
      },
    ],
    questions: [
      {
        q: 'Apakah Mastodon cocok untuk belajar bahasa Inggris?',
        a: 'Ada banyak postingan pendek sehari-hari dari orang sungguhan tentang berbagai topik. Ikuti orang dengan minat yang sama agar membaca menjadi kebiasaan.',
      },
      {
        q: 'Siapa yang menerjemahkan?',
        a: 'Server Mastodon-mu jika menyediakan terjemahan, atau model AI dengan kunci OpenRouter-mu sendiri. Mawkingbird tidak menerjemahkan di servernya sendiri.',
      },
      {
        q: 'Apakah bahasa aplikasi berubah?',
        a: 'Tidak. Halaman ini hanya menambahkan bahasa Inggris sebagai bahasa yang dipelajari. Bahasa aplikasi dan bahasa yang kamu baca tidak berubah.',
      },
    ],
    checklist: {
      title: 'Atur Mawkingbird untuk belajar bahasa Inggris',
      intro: 'Pilih yang ingin diterapkan. Tidak ada perubahan sebelum menekan Terapkan.',
      items: [
        {
          setting: 'learning',
          label: 'Aku belajar bahasa Inggris',
          hint: 'Postingan bahasa Inggris tidak pernah disembunyikan dan memiliki terjemahan di bawahnya.',
          checked: true,
        },
      ],
      where: {
        browser: 'browser ini',
        server: 'servermu',
      },
      apply: 'Terapkan',
      applying: 'Menerapkan…',
      failed: 'Satu pengaturan tidak bisa disimpan. Coba lagi.',
      doneTitle: 'Selesai',
      doneNothing: 'Tidak ada yang dipilih, jadi tidak ada perubahan.',
      home: 'Buka feed beranda',
      starterPacks: 'Lihat paket awal',
      settingsLink: 'Semua pengaturan bahasa',
    },
  },
  'ru/mastodon-in-russian': {
    lang: 'ru',
    target: 'ru',
    learning: 'en',
    openApp: 'Открыть приложение',
    loading: 'Загрузка…',
    signIn: 'Войти через Mastodon',
    questionsTitle: 'Вопросы',
    path: 'ru/mastodon-in-russian',
    eyebrow: 'Твои языки',
    heading: 'Mastodon на русском',
    intro:
      'Читай Mastodon на русском. Выбери язык интерфейса и языки, которые читаешь, добавь перевод для изучаемых языков. Войди, чтобы проверить и применить настройки за один раз.',
    claims: [
      {
        title: 'Интерфейс на русском',
        body: 'Меню, кнопки и настройки Mawkingbird на русском.',
      },
      {
        title: 'Только языки, которые ты читаешь',
        body: 'Скрывай посты на незнакомых языках в домашней ленте и Algo. Посты с неопределённым языком останутся видимыми.',
      },
      {
        title: 'Учись во время чтения',
        body: 'Добавь изучаемый язык: посты на нём никогда не скрываются, а перевод появляется под оригиналом.',
      },
      {
        title: 'Темы в твоём алфавите',
        body: 'Фильтруй популярные хештеги по системе письма.',
      },
    ],
    questions: [
      {
        q: 'Mastodon есть на русском?',
        a: 'Да. У Mastodon есть русский перевод, как и у Mawkingbird. Кроме того, Mawkingbird может ограничить ленту языками, которые ты читаешь.',
      },
      {
        q: 'Где зарегистрироваться?',
        a: 'Начать можно с mastodon.social. Другие серверы есть в каталогах вроде joinmastodon.org. Mawkingbird работает с любым сервером Mastodon.',
      },
      {
        q: 'Что изменится после входа?',
        a: 'Сначала ничего. Ты увидишь список настроек и выберешь, что применить. Только язык постов сохраняется на сервере; остальные настройки — в этом браузере.',
      },
      {
        q: 'Это платно?',
        a: 'Нет. Mawkingbird бесплатен и работает в браузере.',
      },
    ],
    checklist: {
      title: 'Настрой Mawkingbird на русском',
      intro: 'Выбери, что применить. Ничего не изменится до нажатия «Применить».',
      items: [
        {
          setting: 'interface',
          label: 'Показывать приложение на русском',
          hint: 'Интерфейс приложения перейдёт на русский.',
          checked: true,
        },
        {
          setting: 'known',
          label: 'Я читаю по-русски',
          hint: 'Языки, которые ты читаешь, используются фильтрами ниже.',
          checked: true,
        },
        {
          setting: 'alsoEnglish',
          label: 'Я также читаю по-английски',
          hint: 'Посты на английском тоже останутся видимыми.',
          checked: true,
        },
        {
          setting: 'posting',
          label: 'Я пишу по-русски',
          hint: 'Язык новых постов по умолчанию. Сохраняется на твоём сервере Mastodon.',
          checked: true,
        },
        {
          setting: 'hideForeign',
          label: 'Скрывать посты на языках, которые я не читаю',
          hint: 'В домашней ленте и Algo. Посты с неопределённым языком останутся видимыми.',
          checked: true,
        },
        {
          setting: 'trends',
          label: 'Только популярные темы в моём алфавите',
          hint: 'Отфильтровывает популярные хештеги в других системах письма.',
          checked: true,
        },
        {
          setting: 'learning',
          label: 'Я учу английский',
          hint: 'Посты на английском всегда видны, с переводом под ними.',
          checked: false,
        },
      ],
      where: {
        browser: 'этот браузер',
        server: 'твой сервер',
      },
      apply: 'Применить',
      applying: 'Применение…',
      failed: 'Не удалось сохранить язык постов на сервере. Остальные изменения применены.',
      doneTitle: 'Готово',
      doneNothing: 'Ничего не выбрано, поэтому ничего не изменилось.',
      home: 'Открыть домашнюю ленту',
      starterPacks: 'Посмотреть стартовые наборы',
      settingsLink: 'Все языковые настройки',
    },
  },
  'ru/learn-english-with-mastodon': {
    lang: 'ru',
    target: 'ru',
    learning: 'en',
    openApp: 'Открыть приложение',
    loading: 'Загрузка…',
    signIn: 'Войти через Mastodon',
    questionsTitle: 'Вопросы',
    path: 'ru/learn-english-with-mastodon',
    eyebrow: 'Изучение языков',
    heading: 'Учи английский с Mastodon',
    intro:
      'Каждый день читай настоящие посты англоязычных людей с переводом под ними, когда он нужен. Войди, чтобы настроить Mawkingbird для изучения английского, сохранив привычные языки чтения.',
    claims: [
      {
        title: 'Английский всегда виден',
        body: 'Изучаемый язык никогда не скрывается, даже фильтром незнакомых языков.',
      },
      {
        title: 'Перевод под оригиналом',
        body: 'Оригинал и перевод вместе: учись на настоящем тексте.',
      },
      {
        title: 'Автоматически или по запросу',
        body: 'Переводи при прокрутке или после нажатия «Перевести». Перевод выполняет твой сервер или ИИ с твоим собственным ключом.',
      },
      {
        title: 'Люди для подписки',
        body: 'Стартовые наборы англоязычных учётных записей по темам.',
      },
    ],
    questions: [
      {
        q: 'Mastodon подходит для изучения английского?',
        a: 'Здесь много коротких повседневных постов настоящих людей на любые темы. Подпишись на тех, кто пишет о твоих интересах, и чтение станет привычкой.',
      },
      {
        q: 'Кто переводит?',
        a: 'Твой сервер Mastodon, если он поддерживает перевод, или модель ИИ с твоим ключом OpenRouter. Mawkingbird не переводит на собственных серверах.',
      },
      {
        q: 'Язык приложения изменится?',
        a: 'Нет. Страница только добавляет английский как изучаемый язык. Язык приложения и языки, которые ты читаешь, не меняются.',
      },
    ],
    checklist: {
      title: 'Настрой Mawkingbird для изучения английского',
      intro: 'Выбери, что применить. Ничего не изменится до нажатия «Применить».',
      items: [
        {
          setting: 'learning',
          label: 'Я учу английский',
          hint: 'Посты на английском никогда не скрываются, а перевод появляется под ними.',
          checked: true,
        },
      ],
      where: {
        browser: 'этот браузер',
        server: 'твой сервер',
      },
      apply: 'Применить',
      applying: 'Применение…',
      failed: 'Не удалось сохранить одну настройку. Попробуй ещё раз.',
      doneTitle: 'Готово',
      doneNothing: 'Ничего не выбрано, поэтому ничего не изменилось.',
      home: 'Открыть домашнюю ленту',
      starterPacks: 'Посмотреть стартовые наборы',
      settingsLink: 'Все языковые настройки',
    },
  },
  'sv/mastodon-pa-svenska': {
    lang: 'sv',
    target: 'sv',
    learning: 'en',
    openApp: 'Öppna appen',
    loading: 'Laddar…',
    signIn: 'Logga in med Mastodon',
    questionsTitle: 'Frågor',
    path: 'sv/mastodon-pa-svenska',
    eyebrow: 'Dina språk',
    heading: 'Mastodon på svenska',
    intro:
      'Läs och skriv svenska på Mastodon. Välj språken du läser och lägg till översättning för språk du lär dig. Logga in för att granska och använda inställningarna samtidigt.',
    claims: [
      {
        title: 'Verktyg på svenska',
        body: 'Den här sidan och dess verktyg är på svenska. Appens svenska översättning finns ännu bara i förhandsversionen. Den här listan ändrar inte den offentliga appens språk.',
      },
      {
        title: 'Bara språken du läser',
        body: 'Dölj inlägg på okända språk på Hem och Algo. Inlägg med osäkert språk visas fortfarande.',
      },
      {
        title: 'Lär dig genom att läsa',
        body: 'Lägg till ett språk du lär dig. Inlägg på språket döljs aldrig och översättningen visas under originalet.',
      },
      {
        title: 'Trender i ditt skriftsystem',
        body: 'Filtrera populära hashtaggar efter skriftsystem.',
      },
    ],
    questions: [
      {
        q: 'Kan jag använda svenska på Mastodon?',
        a: 'Ja. Du kan läsa och skriva svenska inlägg och ange svenska som inläggsspråk. På den här sidan väljer du lässpråk och filter.',
      },
      {
        q: 'Finns hela Mawkingbird på svenska?',
        a: 'Appens svenska översättning finns ännu bara i förhandsversionen. Den här offentliga sidan och dess verktyg är på svenska, men listan ändrar inte hela appens språk.',
      },
      {
        q: 'Var registrerar jag mig?',
        a: 'Du kan börja på mastodon.social. Fler servrar finns i kataloger som joinmastodon.org. Mawkingbird fungerar med alla Mastodon-servrar.',
      },
      {
        q: 'Vad ändras när jag loggar in?',
        a: 'Först ingenting. Du ser inställningarna och väljer vad som ska tillämpas. Bara inläggsspråket sparas på servern; resten stannar i webbläsaren.',
      },
      {
        q: 'Kostar det något?',
        a: 'Nej. Mawkingbird är gratis och körs i din webbläsare.',
      },
    ],
    checklist: {
      title: 'Ställ in Mawkingbird för att läsa svenska',
      intro: 'Välj vad du vill använda. Inget ändras förrän du trycker på Tillämpa.',
      items: [
        {
          setting: 'known',
          label: 'Jag läser svenska',
          hint: 'Språken du läser används av filtren nedan.',
          checked: true,
        },
        {
          setting: 'alsoEnglish',
          label: 'Jag läser också engelska',
          hint: 'Då fortsätter även engelska inlägg att visas.',
          checked: true,
        },
        {
          setting: 'posting',
          label: 'Jag skriver på svenska',
          hint: 'Standardspråk för nya inlägg. Sparas på din Mastodon-server.',
          checked: true,
        },
        {
          setting: 'hideForeign',
          label: 'Dölj inlägg på språk jag inte läser',
          hint: 'På Hem och Algo. Inlägg med osäkert språk visas fortfarande.',
          checked: true,
        },
        {
          setting: 'trends',
          label: 'Bara trender i mitt skriftsystem',
          hint: 'Filtrerar bort populära hashtaggar i andra skriftsystem.',
          checked: true,
        },
        {
          setting: 'learning',
          label: 'Jag lär mig engelska',
          hint: 'Engelska inlägg visas alltid, med översättning under.',
          checked: false,
        },
      ],
      where: {
        browser: 'den här webbläsaren',
        server: 'din server',
      },
      apply: 'Tillämpa',
      applying: 'Tillämpar…',
      failed: 'Inläggsspråket kunde inte sparas på din server. Resten har tillämpats.',
      doneTitle: 'Klart',
      doneNothing: 'Inget var markerat, så inget ändrades.',
      home: 'Öppna hemflödet',
      starterPacks: 'Visa startpaket',
      settingsLink: 'Alla språkinställningar',
    },
  },
  'sv/lar-dig-engelska-med-mastodon': {
    lang: 'sv',
    target: 'sv',
    learning: 'en',
    openApp: 'Öppna appen',
    loading: 'Laddar…',
    signIn: 'Logga in med Mastodon',
    questionsTitle: 'Frågor',
    path: 'sv/lar-dig-engelska-med-mastodon',
    eyebrow: 'Språkinlärning',
    heading: 'Lär dig engelska med Mastodon',
    intro:
      'Läs riktiga engelska inlägg varje dag, med en översättning under när du behöver den. Logga in för att ställa in Mawkingbird för att lära dig engelska utan att ändra språken du redan läser.',
    claims: [
      {
        title: 'Engelska syns alltid',
        body: 'Språket du lär dig döljs aldrig, inte ens av filtret för språk du inte läser.',
      },
      {
        title: 'Översättning under, inte i stället för',
        body: 'Original och översättning tillsammans, så att du lär dig från riktig text.',
      },
      {
        title: 'Automatiskt eller på begäran',
        body: 'Översätt när du rullar eller först när du trycker på Översätt. Din server eller en AI med din egen nyckel översätter.',
      },
      {
        title: 'Personer att följa',
        body: 'Startpaket med engelskspråkiga konton, ordnade efter ämne.',
      },
    ],
    questions: [
      {
        q: 'Är Mastodon bra för att lära sig engelska?',
        a: 'Det finns korta vardagliga engelska inlägg från riktiga människor om alla möjliga ämnen. Följ personer med dina intressen och gör läsningen till en vana.',
      },
      {
        q: 'Vem översätter?',
        a: 'Din Mastodon-server, om den erbjuder översättning, eller en AI-modell med din egen OpenRouter-nyckel. Mawkingbird översätter aldrig på egna servrar.',
      },
      {
        q: 'Ändras appens språk?',
        a: 'Nej. Sidan lägger bara till engelska som ett språk du lär dig. Appens språk och språken du läser ändras inte.',
      },
    ],
    checklist: {
      title: 'Ställ in Mawkingbird för att lära dig engelska',
      intro: 'Välj vad du vill använda. Inget ändras förrän du trycker på Tillämpa.',
      items: [
        {
          setting: 'learning',
          label: 'Jag lär mig engelska',
          hint: 'Engelska inlägg döljs aldrig och får en översättning under.',
          checked: true,
        },
      ],
      where: {
        browser: 'den här webbläsaren',
        server: 'din server',
      },
      apply: 'Tillämpa',
      applying: 'Tillämpar…',
      failed: 'En inställning kunde inte sparas. Försök igen.',
      doneTitle: 'Klart',
      doneNothing: 'Inget var markerat, så inget ändrades.',
      home: 'Öppna hemflödet',
      starterPacks: 'Visa startpaket',
      settingsLink: 'Alla språkinställningar',
    },
  },
  'vi/mastodon-in-vietnamese': {
    lang: 'vi',
    target: 'vi',
    learning: 'en',
    openApp: 'Mở ứng dụng',
    loading: 'Đang tải…',
    signIn: 'Đăng nhập bằng Mastodon',
    questionsTitle: 'Câu hỏi',
    path: 'vi/mastodon-in-vietnamese',
    eyebrow: 'Ngôn ngữ của bạn',
    heading: 'Mastodon bằng tiếng Việt',
    intro:
      'Đọc và viết tiếng Việt trên Mastodon. Chọn ngôn ngữ bạn đọc và thêm bản dịch cho ngôn ngữ đang học. Đăng nhập để xem trước và áp dụng các thiết lập cùng lúc.',
    claims: [
      {
        title: 'Công cụ bằng tiếng Việt',
        body: 'Trang này và các công cụ được viết bằng tiếng Việt. Bản dịch toàn ứng dụng còn ở giai đoạn xem trước. Danh sách này không đổi ngôn ngữ của ứng dụng công khai.',
      },
      {
        title: 'Chỉ ngôn ngữ bạn đọc',
        body: 'Ẩn bài bằng ngôn ngữ chưa biết trên bảng tin chính và Algo. Bài có ngôn ngữ không chắc chắn vẫn hiện.',
      },
      {
        title: 'Học qua việc đọc',
        body: 'Thêm ngôn ngữ đang học. Bài bằng ngôn ngữ đó không bao giờ bị ẩn và có bản dịch dưới bản gốc.',
      },
      {
        title: 'Xu hướng theo hệ chữ của bạn',
        body: 'Lọc hashtag thịnh hành theo hệ chữ.',
      },
    ],
    questions: [
      {
        q: 'Có thể dùng tiếng Việt trên Mastodon không?',
        a: 'Có. Bạn có thể đọc và viết bài tiếng Việt, đặt tiếng Việt làm ngôn ngữ bài đăng. Trang này giúp chọn ngôn ngữ đọc và bộ lọc.',
      },
      {
        q: 'Toàn bộ Mawkingbird đã có tiếng Việt chưa?',
        a: 'Bản dịch ứng dụng còn ở giai đoạn xem trước. Trang công khai này và các công cụ có tiếng Việt, nhưng danh sách không đổi ngôn ngữ toàn ứng dụng.',
      },
      {
        q: 'Đăng ký ở đâu?',
        a: 'Bạn có thể bắt đầu tại mastodon.social. Danh mục như joinmastodon.org có thêm máy chủ. Mawkingbird dùng được với mọi máy chủ Mastodon.',
      },
      {
        q: 'Đăng nhập sẽ đổi gì?',
        a: 'Ban đầu chưa có gì. Bạn xem thiết lập và chọn điều muốn áp dụng. Chỉ ngôn ngữ bài đăng được lưu trên máy chủ; phần còn lại ở trong trình duyệt.',
      },
      {
        q: 'Có mất phí không?',
        a: 'Không. Mawkingbird miễn phí và chạy trong trình duyệt.',
      },
    ],
    checklist: {
      title: 'Thiết lập Mawkingbird để đọc tiếng Việt',
      intro: 'Chọn điều bạn muốn dùng. Chưa có gì thay đổi cho đến khi nhấn Áp dụng.',
      items: [
        {
          setting: 'known',
          label: 'Tôi đọc tiếng Việt',
          hint: 'Các bộ lọc bên dưới dùng danh sách ngôn ngữ bạn đọc.',
          checked: true,
        },
        {
          setting: 'alsoEnglish',
          label: 'Tôi cũng đọc tiếng Anh',
          hint: 'Bài tiếng Anh vẫn tiếp tục hiển thị.',
          checked: true,
        },
        {
          setting: 'posting',
          label: 'Tôi viết bằng tiếng Việt',
          hint: 'Ngôn ngữ mặc định cho bài mới. Lưu trên máy chủ Mastodon.',
          checked: true,
        },
        {
          setting: 'hideForeign',
          label: 'Ẩn bài bằng ngôn ngữ tôi không đọc',
          hint: 'Trên bảng tin chính và Algo. Bài không rõ ngôn ngữ vẫn hiện.',
          checked: true,
        },
        {
          setting: 'trends',
          label: 'Chỉ xu hướng theo hệ chữ của tôi',
          hint: 'Lọc bỏ hashtag thịnh hành dùng hệ chữ khác.',
          checked: true,
        },
        {
          setting: 'learning',
          label: 'Tôi đang học tiếng Anh',
          hint: 'Bài tiếng Anh luôn hiện, kèm bản dịch bên dưới.',
          checked: false,
        },
      ],
      where: {
        browser: 'trình duyệt này',
        server: 'máy chủ của bạn',
      },
      apply: 'Áp dụng',
      applying: 'Đang áp dụng…',
      failed: 'Không lưu được ngôn ngữ bài đăng trên máy chủ. Các thiết lập còn lại đã áp dụng.',
      doneTitle: 'Xong',
      doneNothing: 'Không có mục nào được chọn nên chưa đổi gì.',
      home: 'Mở bảng tin chính',
      starterPacks: 'Xem gói khởi đầu',
      settingsLink: 'Mọi thiết lập ngôn ngữ',
    },
  },
  'vi/learn-english-with-mastodon': {
    lang: 'vi',
    target: 'vi',
    learning: 'en',
    openApp: 'Mở ứng dụng',
    loading: 'Đang tải…',
    signIn: 'Đăng nhập bằng Mastodon',
    questionsTitle: 'Câu hỏi',
    path: 'vi/learn-english-with-mastodon',
    eyebrow: 'Học ngôn ngữ',
    heading: 'Học tiếng Anh với Mastodon',
    intro:
      'Đọc bài tiếng Anh thực tế hằng ngày, có bản dịch bên dưới khi cần. Đăng nhập để thiết lập Mawkingbird cho việc học tiếng Anh mà không đổi ngôn ngữ bạn đang đọc.',
    claims: [
      {
        title: 'Luôn hiện tiếng Anh',
        body: 'Ngôn ngữ bạn đang học không bao giờ bị ẩn, kể cả bởi bộ lọc ngôn ngữ bạn không đọc.',
      },
      {
        title: 'Bản dịch bên dưới bản gốc',
        body: 'Giữ bản gốc và bản dịch cùng nhau để học từ văn bản thực tế.',
      },
      {
        title: 'Tự động hoặc theo yêu cầu',
        body: 'Dịch khi cuộn hoặc chỉ khi nhấn Dịch. Máy chủ của bạn hoặc AI dùng khóa riêng của bạn thực hiện bản dịch.',
      },
      {
        title: 'Người để theo dõi',
        body: 'Gói khởi đầu gồm tài khoản tiếng Anh, nhóm theo chủ đề.',
      },
    ],
    questions: [
      {
        q: 'Mastodon có phù hợp để học tiếng Anh không?',
        a: 'Có các bài ngắn hằng ngày bằng tiếng Anh từ người thật về nhiều chủ đề. Theo dõi người cùng sở thích và biến việc đọc thành thói quen.',
      },
      {
        q: 'Ai thực hiện bản dịch?',
        a: 'Máy chủ Mastodon nếu hỗ trợ, hoặc mô hình AI dùng khóa OpenRouter riêng của bạn. Mawkingbird không dịch trên máy chủ của mình.',
      },
      {
        q: 'Ngôn ngữ ứng dụng có đổi không?',
        a: 'Không. Trang chỉ thêm tiếng Anh làm ngôn ngữ đang học. Ngôn ngữ ứng dụng và ngôn ngữ bạn đọc không thay đổi.',
      },
    ],
    checklist: {
      title: 'Thiết lập Mawkingbird để học tiếng Anh',
      intro: 'Chọn điều bạn muốn dùng. Chưa có gì thay đổi cho đến khi nhấn Áp dụng.',
      items: [
        {
          setting: 'learning',
          label: 'Tôi đang học tiếng Anh',
          hint: 'Bài tiếng Anh không bao giờ bị ẩn và có bản dịch bên dưới.',
          checked: true,
        },
      ],
      where: {
        browser: 'trình duyệt này',
        server: 'máy chủ của bạn',
      },
      apply: 'Áp dụng',
      applying: 'Đang áp dụng…',
      failed: 'Không lưu được một thiết lập. Hãy thử lại.',
      doneTitle: 'Xong',
      doneNothing: 'Không có mục nào được chọn nên chưa đổi gì.',
      home: 'Mở bảng tin chính',
      starterPacks: 'Xem gói khởi đầu',
      settingsLink: 'Mọi thiết lập ngôn ngữ',
    },
  },
  'tr/turkce-mastodon': {
    lang: 'tr',
    target: 'tr',
    learning: 'en',
    openApp: 'Uygulamayı aç',
    loading: 'Yükleniyor…',
    signIn: 'Mastodon ile oturum aç',
    questionsTitle: 'Sorular',
    path: 'tr/turkce-mastodon',
    eyebrow: 'Dillerin',
    heading: 'Türkçe Mastodon',
    intro:
      "Mastodon'da Türkçe oku ve yaz. Arayüzünü ve okuduğun dilleri seç, öğrendiğin dillere çeviri ekle. Ayarları birlikte gözden geçirip uygulamak için oturum aç.",
    claims: [
      {
        title: 'Türkçe arayüz',
        body: "Mawkingbird'ün menülerini ve düğmelerini Türkçe kullan.",
      },
      {
        title: 'Yalnızca okuduğun diller',
        body: "Ana akış ve Algo'da bilmediğin dillerdeki gönderileri gizle. Dili belirsiz gönderiler görünmeye devam eder.",
      },
      {
        title: 'Okuyarak öğren',
        body: 'Öğrendiğin bir dil ekle. O dildeki gönderiler asla gizlenmez; çeviri özgün metnin altında görünür.',
      },
      {
        title: 'Kullandığın yazı sisteminde gündem',
        body: 'Gündemdeki etiketleri yazı sistemine göre süz.',
      },
    ],
    questions: [
      {
        q: "Mastodon'u Türkçe kullanabilir miyim?",
        a: 'Evet. Türkçe gönderiler okuyup yazabilir, Türkçeyi gönderi dili yapabilirsin. Bu sayfada arayüz dilini, okuma dillerini ve filtreleri seçersin.',
      },
      {
        q: 'Mawkingbird Türkçe mi?',
        a: 'Evet. Mawkingbird arayüzü Türkçe sunulur. Bu sayfadan Türkçeyi seçip diğer dil ayarlarıyla birlikte uygulayabilirsin.',
      },
      {
        q: 'Nereden kaydolurum?',
        a: 'mastodon.social ile başlayabilirsin. joinmastodon.org gibi dizinlerde başka sunucular da var. Mawkingbird tüm Mastodon sunucularıyla çalışır.',
      },
      {
        q: 'Oturum açınca ne değişir?',
        a: 'Başta hiçbir şey. Ayarları görüp hangilerini uygulayacağını seçersin. Yalnızca gönderi dili sunucuya kaydedilir; diğerleri tarayıcıda kalır.',
      },
      {
        q: 'Ücretli mi?',
        a: 'Hayır. Mawkingbird ücretsizdir ve tarayıcında çalışır.',
      },
    ],
    checklist: {
      title: "Mawkingbird'ü Türkçe okumak için ayarla",
      intro: "Kullanmak istediklerini seç. Uygula'ya basana kadar hiçbir şey değişmez.",
      items: [
        {
          setting: 'interface',
          label: 'Arayüzü Türkçe kullan',
          hint: 'Bu tarayıcıdaki menüler ve düğmeler.',
          checked: true,
        },
        {
          setting: 'known',
          label: 'Türkçe okuyorum',
          hint: 'Aşağıdaki filtreler okuduğun dilleri kullanır.',
          checked: true,
        },
        {
          setting: 'alsoEnglish',
          label: 'İngilizce de okuyorum',
          hint: 'İngilizce gönderiler de görünmeye devam eder.',
          checked: true,
        },
        {
          setting: 'posting',
          label: 'Türkçe yazıyorum',
          hint: 'Yeni gönderilerin varsayılan dili. Mastodon sunucuna kaydedilir.',
          checked: true,
        },
        {
          setting: 'hideForeign',
          label: 'Okumadığım dillerdeki gönderileri gizle',
          hint: "Ana akış ve Algo'da. Dili belirsiz gönderiler görünür.",
          checked: true,
        },
        {
          setting: 'trends',
          label: 'Yalnızca yazı sistemimdeki gündem',
          hint: 'Diğer yazı sistemlerindeki gündem etiketlerini süzer.',
          checked: true,
        },
        {
          setting: 'learning',
          label: 'İngilizce öğreniyorum',
          hint: 'İngilizce gönderiler çeviriyle birlikte her zaman görünür.',
          checked: false,
        },
      ],
      where: {
        browser: 'bu tarayıcı',
        server: 'sunucun',
      },
      apply: 'Uygula',
      applying: 'Uygulanıyor…',
      failed: 'Gönderi dili sunucuna kaydedilemedi. Diğer ayarlar uygulandı.',
      doneTitle: 'Bitti',
      doneNothing: 'Hiçbir şey seçilmedi; değişiklik yapılmadı.',
      home: 'Ana akışı aç',
      starterPacks: 'Başlangıç paketlerini gör',
      settingsLink: 'Tüm dil ayarları',
    },
  },
  'tr/mastodonla-ingilizce-ogren': {
    lang: 'tr',
    target: 'tr',
    learning: 'en',
    openApp: 'Uygulamayı aç',
    loading: 'Yükleniyor…',
    signIn: 'Mastodon ile oturum aç',
    questionsTitle: 'Sorular',
    path: 'tr/mastodonla-ingilizce-ogren',
    eyebrow: 'Dil öğrenme',
    heading: 'Mastodon ile İngilizce öğren',
    intro:
      "Her gün gerçek İngilizce gönderiler oku; gerektiğinde altında çeviri gör. Okuduğun dilleri değiştirmeden Mawkingbird'ü İngilizce öğrenmek için ayarlamak üzere oturum aç.",
    claims: [
      {
        title: 'İngilizce hep görünür',
        body: 'Öğrendiğin dil, okumadığın dilleri gizleyen filtreyle bile asla gizlenmez.',
      },
      {
        title: 'Çeviri altında, aslı yerine değil',
        body: 'Özgün metin ve çeviri birlikte; gerçek metinden öğrenmen için.',
      },
      {
        title: 'Otomatik veya isteğinle',
        body: "Kaydırırken veya yalnızca Çevir'e basınca çevir. Çeviriyi sunucun ya da kendi anahtarını kullanan yapay zekâ yapar.",
      },
      {
        title: 'Takip edilecek kişiler',
        body: 'Konuya göre gruplandırılmış İngilizce hesaplardan başlangıç paketleri.',
      },
    ],
    questions: [
      {
        q: 'Mastodon İngilizce öğrenmek için iyi mi?',
        a: 'Gerçek insanların her türlü konuda yazdığı kısa, günlük İngilizce gönderiler var. İlgi alanındaki kişileri takip et ve okumayı alışkanlık yap.',
      },
      {
        q: 'Çeviriyi kim yapar?',
        a: 'Destekliyorsa Mastodon sunucun veya kendi OpenRouter anahtarınla bir yapay zekâ modeli. Mawkingbird kendi sunucularında çeviri yapmaz.',
      },
      {
        q: 'Uygulamanın dili değişir mi?',
        a: 'Hayır. Sayfa yalnızca İngilizceyi öğrendiğin dil olarak ekler. Uygulama dili ve okuduğun diller değişmez.',
      },
    ],
    checklist: {
      title: "Mawkingbird'ü İngilizce öğrenmek için ayarla",
      intro: "Kullanmak istediklerini seç. Uygula'ya basana kadar hiçbir şey değişmez.",
      items: [
        {
          setting: 'learning',
          label: 'İngilizce öğreniyorum',
          hint: 'İngilizce gönderiler asla gizlenmez; altında çeviri gösterilir.',
          checked: true,
        },
      ],
      where: {
        browser: 'bu tarayıcı',
        server: 'sunucun',
      },
      apply: 'Uygula',
      applying: 'Uygulanıyor…',
      failed: 'Bir ayar kaydedilemedi. Yeniden dene.',
      doneTitle: 'Bitti',
      doneNothing: 'Hiçbir şey seçilmedi; değişiklik yapılmadı.',
      home: 'Ana akışı aç',
      starterPacks: 'Başlangıç paketlerini gör',
      settingsLink: 'Tüm dil ayarları',
    },
  },
};
