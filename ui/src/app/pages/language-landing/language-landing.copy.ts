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
  target: 'de' | 'en' | 'ja';
  /** A language offered as "learning", when the page has one. */
  learning?: 'de' | 'en' | 'ja';
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
};
