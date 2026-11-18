/**
 * Page copy for the public YouTuber kit pages, one language each.
 *
 * Written here, not in the app dictionaries (ops/engineering/seo.md, "Pages in
 * other languages"): it is what search engines read, the prerender loads no
 * dictionaries, and each set serves one language's readers. Imported lazily by
 * the routes and pages, never with the app. Category names come from the
 * catalogue's localised taxonomy, inside each kit's data.
 */
export interface YoutuberCopy {
  /** The hub's <h1> and title. */
  hubHeading: string;
  hubDescription: string;
  hubIntro: string[];
  kitHeading: (category: string, count: number) => string;
  kitDescription: (category: string, count: number) => string;
  kitIntro: (category: string) => string;
  eyebrow: string;
  openKit: string;
  noAccount: string;
  openApp: string;
  lastVideo: string;
  videoFeed: string;
  channel: string;
  moreKits: string;
  allKits: string;
  creators: (count: number) => string;
  faqTitle: string;
  faq: { q: string; a: string }[];
  /** The link under the questions: ask Mawkingbird (help, removal). */
  contact: string;
  /** "Also in": other languages' editions of this page. */
  alsoIn: string;
}

const DESCRIPTION_LIMIT = 160;

/** At most 160 characters, cut at a word, for meta descriptions. */
export function clipDescription(text: string): string {
  if (text.length <= DESCRIPTION_LIMIT) return text;
  const cut = text.slice(0, DESCRIPTION_LIMIT - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), DESCRIPTION_LIMIT / 2)).replace(/[\s,;:.]+$/, '')}…`;
}

const EN: YoutuberCopy = {
  hubHeading: 'YouTubers on Mastodon: creators to follow, by topic',
  hubDescription:
    'Find YouTube creators who are on Mastodon, by topic: follow their Mastodon accounts and subscribe to their channels, no YouTube account needed.',
  hubIntro: [
    'Many YouTube creators also post on Mastodon. These kits list them by topic, each with their Mastodon account and their YouTube channel, so you can follow one, subscribe to the other, or both.',
    'A creator is listed when their YouTube channel and Mastodon account point to each other, they have been active recently, and they meet our listing rules: nothing adult, nothing extremist.',
  ],
  kitHeading: (category, count) => `${category} YouTubers on Mastodon: ${count} creators to follow`,
  kitDescription: (category, count) =>
    `${count} ${category.toLowerCase()} YouTube creators you can follow on Mastodon, with their channels. Follow or subscribe in Mawkingbird, no YouTube account needed.`,
  kitIntro: (category) =>
    `YouTube creators about ${category.toLowerCase()} who also post on Mastodon. Follow their accounts, subscribe to their channels, or both, in one click with Mawkingbird.`,
  eyebrow: 'YouTubers on Mastodon',
  openKit: 'Follow and subscribe in Mawkingbird',
  noAccount:
    'No Mastodon account yet? You can still subscribe to the channels and try the kit in your browser.',
  openApp: 'Open the app',
  lastVideo: 'Latest video',
  videoFeed: 'Video feed account',
  channel: 'YouTube channel',
  moreKits: 'More YouTuber kits',
  allKits: 'All YouTuber kits',
  creators: (count) => `${count} creators`,
  faqTitle: 'Questions',
  faq: [
    {
      q: 'Do I need a YouTube account?',
      a: 'No. Mawkingbird reads each channel’s public feed, so new videos show up in your subscriptions without signing in to YouTube.',
    },
    {
      q: 'Who is listed?',
      a: 'Creators whose YouTube channel and Mastodon account point to each other, through their profile, their channel or Wikidata, and who posted or uploaded recently. Some entries are accounts that repost a channel’s videos; they are marked as video feed accounts.',
    },
    {
      q: 'How do I get listed or removed?',
      a: 'The kits are refreshed regularly from public profiles. If you would rather not be listed, contact Mawkingbird and you will be left out of future refreshes.',
    },
  ],
  contact: 'Ask Mawkingbird on Mastodon',
  alsoIn: 'Also in',
};

const DE: YoutuberCopy = {
  hubHeading: 'YouTuber auf Mastodon: Creator zum Folgen, nach Thema',
  hubDescription:
    'YouTube-Creator auf Mastodon, nach Themen: Folge ihren Mastodon-Konten und abonniere ihre Kanäle – ganz ohne YouTube-Konto.',
  hubIntro: [
    'Viele YouTube-Creator posten auch auf Mastodon. Diese Listen ordnen sie nach Themen, jeweils mit Mastodon-Konto und YouTube-Kanal: Du kannst dem einen folgen, das andere abonnieren oder beides.',
    'Aufgenommen wird, wessen YouTube-Kanal und Mastodon-Konto aufeinander verweisen, wer zuletzt aktiv war und wer unsere Regeln erfüllt: nichts für Erwachsene, nichts Extremistisches.',
  ],
  kitHeading: (category, count) => `${category}: ${count} YouTuber auf Mastodon zum Folgen`,
  kitDescription: (category, count) =>
    `${count} YouTube-Creator zum Thema ${category}, denen du auf Mastodon folgen kannst – mit ihren Kanälen. Folgen oder abonnieren in Mawkingbird, ohne YouTube-Konto.`,
  kitIntro: (category) =>
    `YouTube-Creator zum Thema ${category}, die auch auf Mastodon posten. Folge ihren Konten, abonniere ihre Kanäle oder beides – mit einem Klick in Mawkingbird.`,
  eyebrow: 'YouTuber auf Mastodon',
  openKit: 'In Mawkingbird folgen und abonnieren',
  noAccount:
    'Noch kein Mastodon-Konto? Die Kanäle kannst du trotzdem abonnieren und die Liste im Browser ausprobieren.',
  openApp: 'App öffnen',
  lastVideo: 'Neuestes Video',
  videoFeed: 'Video-Feed-Konto',
  channel: 'YouTube-Kanal',
  moreKits: 'Weitere YouTuber-Listen',
  allKits: 'Alle YouTuber-Listen',
  creators: (count) => `${count} Creator`,
  faqTitle: 'Fragen',
  faq: [
    {
      q: 'Brauche ich ein YouTube-Konto?',
      a: 'Nein. Mawkingbird liest den öffentlichen Feed jedes Kanals, neue Videos erscheinen also in deinen Abos, ohne dass du dich bei YouTube anmeldest.',
    },
    {
      q: 'Wer steht hier?',
      a: 'Creator, deren YouTube-Kanal und Mastodon-Konto aufeinander verweisen – über ihr Profil, ihren Kanal oder Wikidata – und die zuletzt gepostet oder hochgeladen haben. Einige Einträge sind Konten, die die Videos eines Kanals weiterverbreiten; sie sind als Video-Feed-Konten markiert.',
    },
    {
      q: 'Wie komme ich auf die Liste oder wieder herunter?',
      a: 'Die Listen werden regelmäßig aus öffentlichen Profilen erneuert. Wer nicht aufgeführt werden möchte, meldet sich bei Mawkingbird und bleibt bei künftigen Aktualisierungen außen vor.',
    },
  ],
  contact: 'Mawkingbird auf Mastodon fragen',
  alsoIn: 'Auch auf',
};

const FR: YoutuberCopy = {
  hubHeading: 'Youtubeurs sur Mastodon : créateurs à suivre, par thème',
  hubDescription:
    'Trouvez les créateurs YouTube présents sur Mastodon, par thème : suivez leurs comptes Mastodon et abonnez-vous à leurs chaînes, sans compte YouTube.',
  hubIntro: [
    'Beaucoup de créateurs YouTube publient aussi sur Mastodon. Ces listes les regroupent par thème, chacun avec son compte Mastodon et sa chaîne YouTube : suivez l’un, abonnez-vous à l’autre, ou les deux.',
    'Y figurent les créateurs dont la chaîne YouTube et le compte Mastodon renvoient l’un à l’autre, actifs récemment et conformes à nos règles : rien pour adultes, rien d’extrémiste.',
  ],
  kitHeading: (category, count) => `${category} : ${count} youtubeurs à suivre sur Mastodon`,
  kitDescription: (category, count) =>
    `${count} créateurs YouTube (${category}) à suivre sur Mastodon, avec leurs chaînes. Suivez-les ou abonnez-vous dans Mawkingbird, sans compte YouTube.`,
  kitIntro: (category) =>
    `Des créateurs YouTube du thème « ${category} » qui publient aussi sur Mastodon. Suivez leurs comptes, abonnez-vous à leurs chaînes, ou les deux, en un clic avec Mawkingbird.`,
  eyebrow: 'Youtubeurs sur Mastodon',
  openKit: 'Suivre et s’abonner dans Mawkingbird',
  noAccount:
    'Pas encore de compte Mastodon ? Vous pouvez quand même vous abonner aux chaînes et essayer la liste dans votre navigateur.',
  openApp: 'Ouvrir l’application',
  lastVideo: 'Dernière vidéo',
  videoFeed: 'Compte de flux vidéo',
  channel: 'Chaîne YouTube',
  moreKits: 'Autres listes de youtubeurs',
  allKits: 'Toutes les listes de youtubeurs',
  creators: (count) => `${count} créateurs`,
  faqTitle: 'Questions',
  faq: [
    {
      q: 'Faut-il un compte YouTube ?',
      a: 'Non. Mawkingbird lit le flux public de chaque chaîne : les nouvelles vidéos apparaissent dans vos abonnements sans connexion à YouTube.',
    },
    {
      q: 'Qui figure ici ?',
      a: 'Des créateurs dont la chaîne YouTube et le compte Mastodon renvoient l’un à l’autre, par leur profil, leur chaîne ou Wikidata, et qui ont publié récemment. Certains comptes republient les vidéos d’une chaîne ; ils sont signalés comme comptes de flux vidéo.',
    },
    {
      q: 'Comment être ajouté ou retiré ?',
      a: 'Les listes sont régulièrement mises à jour à partir des profils publics. Pour ne plus y figurer, contactez Mawkingbird : vous serez exclu des mises à jour suivantes.',
    },
  ],
  contact: 'Contacter Mawkingbird sur Mastodon',
  alsoIn: 'Aussi en',
};

const ES: YoutuberCopy = {
  hubHeading: 'YouTubers en Mastodon: creadores para seguir, por tema',
  hubDescription:
    'Encuentra creadores de YouTube que están en Mastodon, por tema: sigue sus cuentas de Mastodon y suscríbete a sus canales, sin cuenta de YouTube.',
  hubIntro: [
    'Muchos creadores de YouTube también publican en Mastodon. Estas listas los agrupan por tema, cada uno con su cuenta de Mastodon y su canal de YouTube: sigue una, suscríbete al otro o ambas cosas.',
    'Aparecen los creadores cuyo canal de YouTube y cuenta de Mastodon se enlazan entre sí, que han tenido actividad reciente y que cumplen nuestras normas: nada para adultos, nada extremista.',
  ],
  kitHeading: (category, count) => `${category}: ${count} YouTubers para seguir en Mastodon`,
  kitDescription: (category, count) =>
    `${count} creadores de YouTube de ${category.toLowerCase()} que puedes seguir en Mastodon, con sus canales. Síguelos o suscríbete en Mawkingbird, sin cuenta de YouTube.`,
  kitIntro: (category) =>
    `Creadores de YouTube de ${category.toLowerCase()} que también publican en Mastodon. Sigue sus cuentas, suscríbete a sus canales o ambas cosas, con un clic en Mawkingbird.`,
  eyebrow: 'YouTubers en Mastodon',
  openKit: 'Seguir y suscribirse en Mawkingbird',
  noAccount:
    '¿Aún no tienes cuenta de Mastodon? Puedes suscribirte a los canales y probar la lista en tu navegador.',
  openApp: 'Abrir la app',
  lastVideo: 'Último vídeo',
  videoFeed: 'Cuenta de vídeos',
  channel: 'Canal de YouTube',
  moreKits: 'Más listas de YouTubers',
  allKits: 'Todas las listas de YouTubers',
  creators: (count) => `${count} creadores`,
  faqTitle: 'Preguntas',
  faq: [
    {
      q: '¿Necesito una cuenta de YouTube?',
      a: 'No. Mawkingbird lee el feed público de cada canal, así que los vídeos nuevos aparecen en tus suscripciones sin iniciar sesión en YouTube.',
    },
    {
      q: '¿Quién aparece aquí?',
      a: 'Creadores cuyo canal de YouTube y cuenta de Mastodon se enlazan entre sí, por su perfil, su canal o Wikidata, y que han publicado hace poco. Algunas entradas son cuentas que republican los vídeos de un canal; están marcadas como cuentas de vídeos.',
    },
    {
      q: '¿Cómo aparecer o dejar de aparecer?',
      a: 'Las listas se actualizan con regularidad a partir de perfiles públicos. Si no quieres aparecer, contacta con Mawkingbird y quedarás fuera de las próximas actualizaciones.',
    },
  ],
  contact: 'Escribir a Mawkingbird en Mastodon',
  alsoIn: 'También en',
};

const IT: YoutuberCopy = {
  hubHeading: 'YouTuber su Mastodon: creator da seguire, per argomento',
  hubDescription:
    'Trova i creator di YouTube presenti su Mastodon, per argomento: segui i loro account Mastodon e iscriviti ai loro canali, senza account YouTube.',
  hubIntro: [
    'Molti creator di YouTube pubblicano anche su Mastodon. Queste liste li raccolgono per argomento, ciascuno con il proprio account Mastodon e il proprio canale YouTube: segui l’uno, iscriviti all’altro, o entrambi.',
    'Sono inclusi i creator il cui canale YouTube e account Mastodon rimandano l’uno all’altro, attivi di recente e conformi alle nostre regole: niente contenuti per adulti, niente estremismi.',
  ],
  kitHeading: (category, count) => `${category}: ${count} YouTuber da seguire su Mastodon`,
  kitDescription: (category, count) =>
    `${count} creator di YouTube (${category}) da seguire su Mastodon, con i loro canali. Seguili o iscriviti in Mawkingbird, senza account YouTube.`,
  kitIntro: (category) =>
    `Creator di YouTube dell’argomento «${category}» che pubblicano anche su Mastodon. Segui i loro account, iscriviti ai loro canali, o entrambi, con un clic in Mawkingbird.`,
  eyebrow: 'YouTuber su Mastodon',
  openKit: 'Segui e iscriviti in Mawkingbird',
  noAccount:
    'Non hai ancora un account Mastodon? Puoi comunque iscriverti ai canali e provare la lista nel browser.',
  openApp: 'Apri l’app',
  lastVideo: 'Ultimo video',
  videoFeed: 'Account di video',
  channel: 'Canale YouTube',
  moreKits: 'Altre liste di YouTuber',
  allKits: 'Tutte le liste di YouTuber',
  creators: (count) => `${count} creator`,
  faqTitle: 'Domande',
  faq: [
    {
      q: 'Serve un account YouTube?',
      a: 'No. Mawkingbird legge il feed pubblico di ogni canale, quindi i nuovi video compaiono nelle tue iscrizioni senza accedere a YouTube.',
    },
    {
      q: 'Chi è in elenco?',
      a: 'Creator il cui canale YouTube e account Mastodon rimandano l’uno all’altro, tramite profilo, canale o Wikidata, e che hanno pubblicato di recente. Alcune voci sono account che ripubblicano i video di un canale; sono indicati come account di video.',
    },
    {
      q: 'Come entrare o uscire dall’elenco?',
      a: 'Le liste si aggiornano regolarmente dai profili pubblici. Per non comparire, contatta Mawkingbird: sarai escluso dagli aggiornamenti successivi.',
    },
  ],
  contact: 'Scrivere a Mawkingbird su Mastodon',
  alsoIn: 'Anche in',
};

const NL: YoutuberCopy = {
  hubHeading: 'YouTubers op Mastodon: makers om te volgen, per onderwerp',
  hubDescription:
    'Vind YouTube-makers die op Mastodon zitten, per onderwerp: volg hun Mastodon-accounts en abonneer je op hun kanalen, zonder YouTube-account.',
  hubIntro: [
    'Veel YouTube-makers posten ook op Mastodon. Deze lijsten zetten ze per onderwerp op een rij, elk met hun Mastodon-account en hun YouTube-kanaal: volg het een, abonneer je op het ander, of allebei.',
    'Opgenomen zijn makers van wie het YouTube-kanaal en het Mastodon-account naar elkaar verwijzen, die recent actief waren en die aan onze regels voldoen: niets voor volwassenen, niets extremistisch.',
  ],
  kitHeading: (category, count) => `${category}: ${count} YouTubers om te volgen op Mastodon`,
  kitDescription: (category, count) =>
    `${count} YouTube-makers over ${category.toLowerCase()} die je op Mastodon kunt volgen, met hun kanalen. Volg ze of abonneer je in Mawkingbird, zonder YouTube-account.`,
  kitIntro: (category) =>
    `YouTube-makers over ${category.toLowerCase()} die ook op Mastodon posten. Volg hun accounts, abonneer je op hun kanalen, of allebei, met één klik in Mawkingbird.`,
  eyebrow: 'YouTubers op Mastodon',
  openKit: 'Volgen en abonneren in Mawkingbird',
  noAccount:
    'Nog geen Mastodon-account? Je kunt je toch op de kanalen abonneren en de lijst in je browser proberen.',
  openApp: 'App openen',
  lastVideo: 'Nieuwste video',
  videoFeed: 'Video-feedaccount',
  channel: 'YouTube-kanaal',
  moreKits: 'Meer YouTuber-lijsten',
  allKits: 'Alle YouTuber-lijsten',
  creators: (count) => `${count} makers`,
  faqTitle: 'Vragen',
  faq: [
    {
      q: 'Heb ik een YouTube-account nodig?',
      a: 'Nee. Mawkingbird leest de openbare feed van elk kanaal, dus nieuwe video’s verschijnen in je abonnementen zonder bij YouTube in te loggen.',
    },
    {
      q: 'Wie staat hier?',
      a: 'Makers van wie het YouTube-kanaal en het Mastodon-account naar elkaar verwijzen, via hun profiel, hun kanaal of Wikidata, en die onlangs iets hebben gepost of geüpload. Sommige vermeldingen zijn accounts die de video’s van een kanaal doorplaatsen; die staan gemarkeerd als video-feedaccounts.',
    },
    {
      q: 'Hoe kom ik erop of eraf?',
      a: 'De lijsten worden regelmatig ververst uit openbare profielen. Wie er niet op wil staan, neemt contact op met Mawkingbird en wordt bij volgende verversingen overgeslagen.',
    },
  ],
  contact: 'Mawkingbird op Mastodon vragen',
  alsoIn: 'Ook in',
};

const JA: YoutuberCopy = {
  hubHeading: 'MastodonにいるYouTuber：テーマ別のおすすめクリエイター',
  hubDescription:
    'MastodonにいるYouTubeクリエイターをテーマ別に紹介。Mastodonアカウントをフォローし、チャンネルを登録できます。YouTubeアカウントは不要です。',
  hubIntro: [
    '多くのYouTubeクリエイターがMastodonにも投稿しています。このリストではテーマ別に、MastodonアカウントとYouTubeチャンネルの両方を紹介しています。フォローだけ、チャンネル登録だけ、または両方も可能です。',
    '掲載されるのは、YouTubeチャンネルとMastodonアカウントが互いにリンクしていて、最近活動しており、掲載ルール（アダルトや過激な内容は不可）を満たすクリエイターです。',
  ],
  kitHeading: (category, count) => `${category}：MastodonでフォローできるYouTuber ${count}人`,
  kitDescription: (category, count) =>
    `Mastodonでフォローできる「${category}」のYouTubeクリエイター${count}人とそのチャンネル。MawkingbirdならYouTubeアカウントなしでフォローもチャンネル登録もできます。`,
  kitIntro: (category) =>
    `Mastodonにも投稿している「${category}」のYouTubeクリエイター。Mawkingbirdなら、アカウントのフォロー、チャンネル登録、またはその両方をワンクリックで。`,
  eyebrow: 'MastodonにいるYouTuber',
  openKit: 'Mawkingbirdでフォロー・チャンネル登録',
  noAccount: 'Mastodonアカウントがなくても、チャンネル登録やブラウザでのお試しができます。',
  openApp: 'アプリを開く',
  lastVideo: '最新動画',
  videoFeed: '動画フィードアカウント',
  channel: 'YouTubeチャンネル',
  moreKits: 'ほかのYouTuberリスト',
  allKits: 'すべてのYouTuberリスト',
  creators: (count) => `${count}人`,
  faqTitle: 'よくある質問',
  faq: [
    {
      q: 'YouTubeアカウントは必要ですか？',
      a: 'いいえ。Mawkingbirdは各チャンネルの公開フィードを読み込むため、YouTubeにログインしなくても新しい動画が登録チャンネルに表示されます。',
    },
    {
      q: 'どんな人が掲載されていますか？',
      a: 'プロフィール、チャンネル、またはWikidataでYouTubeチャンネルとMastodonアカウントが互いにリンクしていて、最近投稿やアップロードをしたクリエイターです。チャンネルの動画を転載するアカウントも一部あり、「動画フィードアカウント」と表示しています。',
    },
    {
      q: '掲載や削除を希望するには？',
      a: 'リストは公開プロフィールをもとに定期的に更新されます。掲載を望まない場合はMawkingbirdにご連絡ください。以後の更新で除外します。',
    },
  ],
  contact: 'MastodonでMawkingbirdに問い合わせる',
  alsoIn: 'ほかの言語',
};

export const YOUTUBER_COPY: Readonly<Record<string, YoutuberCopy>> = {
  en: EN,
  de: DE,
  fr: FR,
  es: ES,
  it: IT,
  nl: NL,
  ja: JA,
};

/** A language's copy; English for a language without its own (never published unrouted). */
export function youtuberCopy(lang: string): YoutuberCopy {
  return YOUTUBER_COPY[lang] ?? EN;
}
