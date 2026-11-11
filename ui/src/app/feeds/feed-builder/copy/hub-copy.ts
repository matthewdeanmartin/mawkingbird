import { PageLanguage } from '../../../public-pages/focused-tools';

/**
 * Words for each communities hub. Loaded by the hub routes' resolvers only, so
 * the startup bundle carries none of it (report-bundle.mjs). The English
 * hub's title and description are route constants in feed-builder-routes.ts;
 * every other hub's come from here.
 *
 * A new hub in feed-builder-hubs.json needs an entry here: the registry spec
 * fails otherwise.
 */
export interface HubCopy {
  title: string;
  description: string;
  eyebrow: string;
  openApp: string;
  heading: string;
  intro: string[];
  /** Other hubs' sections: links to the English hub and this language's tools. */
  moreHeading: string;
  allLanguages: string;
  tools: string;
  follow?: string;
  help: string;
  features: string;
}

export const HUB_COPY: Partial<Record<PageLanguage, HubCopy>> = {
  uk: {
    title: 'Спільноти Mastodon за інтересами',
    description:
      'Знайди україномовних авторів і теми на Mastodon. Переглянь публічні дописи та обери, на кого й на що підписатися.',
    eyebrow: 'Спільноти',
    openApp: 'Відкрити Mawkingbird',
    heading: 'Спільноти Mastodon за інтересами',
    intro: [
      'Знайди людей і теми на Mastodon, які тобі цікаві. Публічні дописи можна читати без реєстрації.',
      'Кожна добірка об’єднує акаунти й хештеги за темою. Обирай, що додати до своєї стрічки.',
    ],
    moreHeading: 'Більше можливостей',
    allLanguages: 'Усі теми й мови (англійською)',
    tools: 'Безкоштовні інструменти для Mastodon і Bluesky (англійською)',
    help: 'Допомога (англійською)',
    features: 'Про Mawkingbird (англійською)',
  },
  nl: {
    title: 'Mastodon-gemeenschappen per interesse',
    description:
      'Ontdek Nederlandstalige accounts en onderwerpen op Mastodon. Bekijk openbare berichten en kies wie en wat je wilt volgen.',
    eyebrow: 'Gemeenschappen',
    openApp: 'Mawkingbird openen',
    heading: 'Mastodon-gemeenschappen per interesse',
    intro: [
      'Ontdek mensen en onderwerpen op Mastodon die bij je interesses passen. Je kunt openbare berichten bekijken voordat je een account maakt.',
      'Elke pagina brengt accounts en hashtags rond een onderwerp samen. Kies zelf wat je wilt volgen.',
    ],
    moreHeading: 'Meer ontdekken',
    allLanguages: 'Alle onderwerpen en talen (in het Engels)',
    tools: 'Gratis tools voor Mastodon en Bluesky',
    help: 'Hulp (in het Engels)',
    features: 'Mawkingbird ontdekken (in het Engels)',
  },
  vi: {
    title: 'Cộng đồng Mastodon theo sở thích',
    description:
      'Khám phá cộng đồng và tài khoản để theo dõi trên Mastodon. Xem trước các bài viết công khai rồi chọn theo sở thích của bạn.',
    eyebrow: 'Cộng đồng',
    openApp: 'Mở Mawkingbird',
    heading: 'Cộng đồng Mastodon theo sở thích',
    intro: [
      'Khám phá cộng đồng Mastodon qua những tài khoản được chọn. Bạn có thể đọc bài viết công khai trước khi tạo tài khoản.',
      'Hướng dẫn này viết bằng tiếng Việt. Ngôn ngữ bài đăng tùy theo từng tài khoản; xem mô tả trên mỗi trang.',
    ],
    moreHeading: 'Khám phá thêm',
    allLanguages: 'Mọi chủ đề và ngôn ngữ (bằng tiếng Anh)',
    tools: 'Công cụ miễn phí cho Mastodon và Bluesky (bằng tiếng Anh)',
    help: 'Trợ giúp (bằng tiếng Anh)',
    features: 'Tính năng Mawkingbird (bằng tiếng Anh)',
  },
  ms: {
    title: 'Komuniti Mastodon mengikut minat',
    description:
      'Temui akaun dan komuniti untuk diikuti di Mastodon. Baca dahulu, kemudian pilih akaun yang sesuai dengan minat anda.',
    eyebrow: 'Komuniti',
    openApp: 'Buka Mawkingbird',
    heading: 'Komuniti Mastodon mengikut minat',
    intro: [
      'Temui komuniti di Mastodon melalui senarai akaun pilihan. Anda boleh membaca siaran awam sebelum membuka akaun.',
      'Panduan ini ditulis dalam bahasa Melayu. Bahasa siaran berbeza mengikut akaun; lihat penerangan pada setiap halaman.',
    ],
    moreHeading: 'Lagi',
    allLanguages: 'Semua topik dan bahasa (dalam bahasa Inggeris)',
    tools: 'Alat percuma untuk Mastodon dan Bluesky (dalam bahasa Inggeris)',
    help: 'Bantuan (dalam bahasa Inggeris)',
    features: 'Ciri Mawkingbird (dalam bahasa Inggeris)',
  },
  en: {
    title: '',
    description: '',
    eyebrow: 'Communities',
    openApp: 'Open Mawkingbird',
    heading: 'Mastodon communities by interest',
    intro: [
      'A new Mastodon account starts with an empty timeline. Each page gathers one interest: the hashtags people actually use, the people worth following, and the servers where the community meets. You can read all of it before you make an account.',
      "Every page is written for its readers' language, and offers new local hashtags beside the busy English ones, so smaller language communities can grow their own.",
    ],
    moreHeading: 'Just want people to follow?',
    allLanguages: '',
    tools: 'Free tools for Mastodon and Bluesky',
    follow: 'Who to follow on Mastodon',
    help: 'Help',
    features: 'Discover all Mawkingbird features',
  },
  de: {
    title: 'Mastodon-Communities nach Interessen: Hashtags, Leute und Server',
    description:
      'Finde Mastodon-Communities nach Interessen: die Hashtags und Leute, denen es sich zu folgen lohnt, und die Server, auf denen sich jede Community trifft.',
    eyebrow: 'Communities',
    openApp: 'Mawkingbird öffnen',
    heading: 'Mastodon-Communities nach Interessen',
    intro: [
      'Ein neues Mastodon-Konto beginnt mit einer leeren Zeitleiste. Jede Seite hier sammelt ein Interesse: die Hashtags, die Leute wirklich verwenden, die Leute, denen es sich zu folgen lohnt, und die Server, auf denen sich die Community trifft. Du kannst alles lesen, bevor du ein Konto anlegst.',
      'Jede Seite ist für deutschsprachige Leserinnen und Leser geschrieben und schlägt neben den großen englischen Hashtags auch deutsche vor, damit kleinere Sprachgemeinschaften wachsen können.',
    ],
    moreHeading: 'Mehr',
    allLanguages: 'Alle Themen in allen Sprachen (auf Englisch)',
    tools: 'Kostenlose Werkzeuge für Mastodon und Bluesky',
    help: 'Hilfe (auf Englisch)',
    features: 'Alles, was Mawkingbird kann (auf Englisch)',
  },
  fr: {
    title: 'Communautés Mastodon par centre d’intérêt : hashtags, comptes et serveurs',
    description:
      'Trouve les communautés Mastodon par centre d’intérêt : les hashtags et les comptes à suivre, et les serveurs où chaque communauté se retrouve.',
    eyebrow: 'Communautés',
    openApp: 'Ouvrir Mawkingbird',
    heading: 'Communautés Mastodon par centre d’intérêt',
    intro: [
      'Un nouveau compte Mastodon commence avec un fil vide. Chaque page rassemble un centre d’intérêt : les hashtags vraiment utilisés, les comptes à suivre et les serveurs où la communauté se retrouve. Tu peux tout lire avant de créer un compte.',
      'Chaque page est écrite pour les lecteurs francophones et propose des hashtags en français à côté des grands hashtags anglais, pour que les communautés francophones grandissent aussi.',
    ],
    moreHeading: 'Et aussi',
    allLanguages: 'Tous les sujets, dans toutes les langues (en anglais)',
    tools: 'Outils gratuits pour Mastodon et Bluesky',
    help: 'Aide (en anglais)',
    features: 'Tout ce que fait Mawkingbird (en anglais)',
  },
  es: {
    title: 'Comunidades de Mastodon por intereses: hashtags, personas y servidores',
    description:
      'Encuentra comunidades de Mastodon por intereses: los hashtags y las personas que vale la pena seguir, y los servidores donde se reúne cada comunidad.',
    eyebrow: 'Comunidades',
    openApp: 'Abrir Mawkingbird',
    heading: 'Comunidades de Mastodon por intereses',
    intro: [
      'Una cuenta nueva de Mastodon empieza con una cronología vacía. Cada página reúne un interés: los hashtags que la gente usa de verdad, las personas que vale la pena seguir y los servidores donde se reúne la comunidad. Puedes leerlo todo antes de crear una cuenta.',
      'Cada página está escrita para lectores en español y propone hashtags en español junto a los grandes hashtags en inglés, para que las comunidades hispanohablantes también crezcan.',
    ],
    moreHeading: 'Más',
    allLanguages: 'Todos los temas, en todos los idiomas (en inglés)',
    tools: 'Herramientas gratuitas para Mastodon y Bluesky',
    help: 'Ayuda (en inglés)',
    features: 'Todo lo que hace Mawkingbird (en inglés)',
  },
  it: {
    title: 'Comunità Mastodon per interesse: hashtag, persone e server',
    description:
      'Trova le comunità Mastodon per interesse: gli hashtag e le persone da seguire, e i server dove si ritrova ogni comunità.',
    eyebrow: 'Comunità',
    openApp: 'Apri Mawkingbird',
    heading: 'Comunità Mastodon per interesse',
    intro: [
      'Un nuovo account Mastodon parte con una timeline vuota. Ogni pagina raccoglie un interesse: gli hashtag che le persone usano davvero, le persone da seguire e i server dove si ritrova la comunità. Puoi leggere tutto prima di creare un account.',
      'Ogni pagina è scritta per chi legge in italiano e propone hashtag in italiano accanto ai grandi hashtag in inglese, così anche le comunità italiane possono crescere.',
    ],
    moreHeading: 'Altro',
    allLanguages: 'Tutti gli argomenti, in tutte le lingue (in inglese)',
    tools: 'Strumenti gratuiti per Mastodon e Bluesky',
    help: 'Aiuto (in inglese)',
    features: 'Tutto quello che fa Mawkingbird (in inglese)',
  },
  ja: {
    title: '興味別のMastodonコミュニティ：ハッシュタグ、人、サーバー',
    description:
      '興味からMastodonのコミュニティを見つけましょう。フォローする価値のあるハッシュタグと人、そして各コミュニティが集まるサーバーを紹介します。',
    eyebrow: 'コミュニティ',
    openApp: 'Mawkingbird を開く',
    heading: '興味別のMastodonコミュニティ',
    intro: [
      '新しいMastodonアカウントのタイムラインは空っぽから始まります。各ページはひとつの興味について、実際に使われているハッシュタグ、フォローする価値のある人、コミュニティが集まるサーバーをまとめています。アカウントを作る前にすべて読めます。',
      '各ページは日本語の読者向けに書かれており、英語の大きなハッシュタグに加えて日本語のハッシュタグも提案します。',
    ],
    moreHeading: 'ほかにも',
    allLanguages: 'すべてのテーマとすべての言語（英語）',
    tools: 'MastodonとBlueskyの無料ツール',
    help: 'ヘルプ（英語）',
    features: 'Mawkingbirdでできること（英語）',
  },
};

export function hubCopyFor(lang: PageLanguage): HubCopy {
  const copy = HUB_COPY[lang];
  if (!copy) throw new Error(`No communities hub copy for ${lang}`);
  return copy;
}
