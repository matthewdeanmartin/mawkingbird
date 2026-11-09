import { PageLanguage } from '../../focused-tools';
import { Elsewhere, FameCode, Shelf } from './feed-builder-data';

/**
 * The words every topic page shares, one block per language. Written in the
 * page, not the app dictionaries: it is what search engines read, the
 * prerender loads no dictionaries, and each block serves one language's
 * readers (see ui/docs/seo.md, "Pages in other languages"). Style follows the
 * tool pages: German du, French tu with French spacing, Spanish tú, Italian tu,
 * Japanese です/ます with マストドン beside Mastodon.
 */
export interface FeedChrome {
  eyebrow: string;
  openApp: string;
  hub: string;
  tagsHeading: string;
  tagsIntro: string;
  englishTag: string;
  futureHeading: string;
  futureIntro: string;
  futureBeside: (source: string) => string;
  futureNew: string;
  futureStarting: string;
  caution: { spam: string; 'off-topic': string };
  shelves: Record<Shelf, { heading: string; intro: string }>;
  fame: Record<FameCode, string>;
  elsewhere: Record<Elsewhere, string>;
  youtube: (band: string | undefined) => string;
  feedCopy: string;
  activity: (posts: number) => string;
  serversHeading: string;
  serversIntro: string;
  chooseHeading: string;
  choose: string[];
  helpHeading: string;
  help: string;
  helpLink: string;
  faqHeading: string;
  readTag: (tag: string) => string;
  peopleHeading: string;
  groupColumn: string;
  countColumn: string;
  everyone: string;
  alsoYoutubeHeading: string;
  alsoYoutubeIntro: (count: number, total: number) => string;
  otherLanguages: string;
  updated: (date: string) => string;
}

const en: FeedChrome = {
  eyebrow: 'Mastodon starter kit',
  openApp: 'Open Mawkingbird',
  hub: 'All communities',
  tagsHeading: 'Hashtags worth following',
  tagsIntro:
    'On Mastodon you can follow a hashtag like a person: its posts arrive in your Home feed. These are the busiest ones for this topic. Open one to read it now, no account needed.',
  englishTag: 'English',
  futureHeading: 'Help start these hashtags',
  futureIntro:
    'Busy English hashtags have local versions that are only getting started. Follow one alongside the English tag and use it when you post in this language: that is how a tag grows.',
  futureBeside: (source) => `the local version of #${source}`,
  futureNew: 'new',
  futureStarting: 'just starting',
  caution: {
    spam: 'Often busy with sales posts: read it before you follow.',
    'off-topic': 'Often used for other things: read it before you follow.',
  },
  shelves: {
    youtube: {
      heading: 'Creators with a YouTube channel',
      intro: 'People who make videos on YouTube and post on Mastodon too.',
    },
    notable: {
      heading: 'Writers, artists and well-known names',
      intro: 'Public figures in the field: authors, artists, editors, magazines and events.',
    },
    community: {
      heading: 'Community voices',
      intro: 'Active people who talk about the topic and asked to be discoverable.',
    },
  },
  fame: {
    wikidata: 'Wikidata',
    wikipedia: 'Wikipedia',
    'youtube-10k': 'YouTube 10k+',
    'followers-2500': '2,500+ followers',
    'followers-625': '625+ followers',
  },
  elsewhere: {
    bluesky: 'Bluesky',
    youtube: 'YouTube',
    twitch: 'Twitch',
    patreon: 'Patreon',
    podcast: 'Podcast',
    website: 'Website',
  },
  youtube: (band) => (band ? `YouTube channel, ${band} subscribers` : 'YouTube channel'),
  feedCopy: 'posts its new videos',
  activity: (posts) => `${posts.toLocaleString('en')} posts this week on mastodon.social`,
  serversHeading: 'Where the community gathers',
  serversIntro:
    'Any Mastodon server can follow anyone, so you can stay where you are. If you want a server built around this topic, these are good places to start.',
  chooseHeading: 'How we choose',
  choose: [
    'People are listed when they asked their server to make them discoverable, or when they are public figures with public evidence: a Wikipedia or Wikidata entry, a YouTube channel with 10,000 subscribers, or 2,500 followers on Mastodon.',
    'An account that looks like it wants to stay out of view is left out: few followers, hidden follower lists, no profile picture, together with a request not to be indexed. Anyone who turns off discoverability is never listed.',
    'A language model checks that each person really posts about the topic, quoting their own posts as evidence. Every account is checked again each month: quiet accounts drop off and come back when they post again.',
  ],
  helpHeading: 'Need help?',
  help: 'Questions, or listed here and would rather not be? Message us on Mastodon and you will be removed for good.',
  helpLink: '@mawkingbird@mastodon.social',
  faqHeading: 'Questions',
  readTag: (tag) => `Read #${tag} in Mawkingbird`,
  peopleHeading: 'People to follow',
  groupColumn: 'Group',
  countColumn: 'People',
  everyone: 'Everyone',
  alsoYoutubeHeading: 'Also on YouTube',
  alsoYoutubeIntro: (n, total) =>
    `${n} of the ${total} people above also make videos on YouTube. Follow them on Mastodon, subscribe to their channels in Mawkingbird to see new videos without a YouTube account, or both.`,
  otherLanguages: 'This page in other languages',
  updated: (date) => `Updated ${date}`,
};

const de: FeedChrome = {
  eyebrow: 'Mastodon-Starterkit',
  openApp: 'Mawkingbird öffnen',
  hub: 'Alle Communities',
  tagsHeading: 'Hashtags, denen du folgen kannst',
  tagsIntro:
    'Auf Mastodon kannst du einem Hashtag folgen wie einer Person: Seine Beiträge erscheinen auf deiner Startseite. Das hier sind die aktivsten zum Thema. Öffne einen und lies sofort mit, auch ohne Konto.',
  englishTag: 'Englisch',
  futureHeading: 'Hilf mit, diese Hashtags zu starten',
  futureIntro:
    'Zu aktiven englischen Hashtags gibt es deutsche Versionen, die gerade erst anfangen. Folge einer neben dem englischen Tag und benutze sie, wenn du auf Deutsch schreibst. So wächst ein Hashtag.',
  futureBeside: (source) => `deutsche Version von #${source}`,
  futureNew: 'neu',
  futureStarting: 'fängt gerade an',
  caution: {
    spam: 'Oft voller Verkaufsbeiträge: Lies erst rein, bevor du folgst.',
    'off-topic': 'Wird oft für anderes benutzt: Lies erst rein, bevor du folgst.',
  },
  shelves: {
    youtube: {
      heading: 'Creator mit YouTube-Kanal',
      intro: 'Leute, die Videos auf YouTube machen und auch auf Mastodon schreiben.',
    },
    notable: {
      heading: 'Autorinnen, Künstler und bekannte Namen',
      intro:
        'Öffentliche Personen aus dem Fach: Autorinnen und Autoren, Künstler, Verlage, Magazine und Veranstaltungen.',
    },
    community: {
      heading: 'Stimmen aus der Community',
      intro: 'Aktive Leute, die über das Thema schreiben und auffindbar sein wollen.',
    },
  },
  fame: {
    wikidata: 'Wikidata',
    wikipedia: 'Wikipedia',
    'youtube-10k': 'YouTube 10k+',
    'followers-2500': '2.500+ Follower',
    'followers-625': '625+ Follower',
  },
  elsewhere: {
    bluesky: 'Bluesky',
    youtube: 'YouTube',
    twitch: 'Twitch',
    patreon: 'Patreon',
    podcast: 'Podcast',
    website: 'Website',
  },
  youtube: (band) => (band ? `YouTube-Kanal, ${band} Abos` : 'YouTube-Kanal'),
  feedCopy: 'teilt neue Videos',
  activity: (posts) => `${posts.toLocaleString('de')} Beiträge diese Woche auf mastodon.social`,
  serversHeading: 'Wo sich die Community trifft',
  serversIntro:
    'Jeder Mastodon-Server kann allen folgen, du kannst also bleiben, wo du bist. Wenn du einen Server suchst, der sich um dieses Thema dreht, sind diese ein guter Anfang.',
  chooseHeading: 'Wie wir auswählen',
  choose: [
    'Aufgenommen wird, wer seinen Server gebeten hat, ihn auffindbar zu machen, oder wer eine öffentliche Person ist, belegt durch einen Eintrag in Wikipedia oder Wikidata, einen YouTube-Kanal mit 10.000 Abos oder mindestens 625 Follower bei einem klar deutschsprachigen Mastodon-Konto.',
    'Wer erkennbar unbemerkt bleiben will, bleibt draußen: wenige Follower, versteckte Follower-Listen, kein Profilbild, zusammen mit der Bitte, nicht indexiert zu werden. Wer die Auffindbarkeit abschaltet, wird nie aufgenommen.',
    'Ein Sprachmodell prüft, ob jemand wirklich über das Thema schreibt, und belegt das mit Zitaten aus den eigenen Beiträgen. Jedes Konto wird jeden Monat neu geprüft: Stille Konten fallen heraus und kommen zurück, sobald sie wieder schreiben.',
  ],
  helpHeading: 'Brauchst du Hilfe?',
  help: 'Fragen, oder du stehst hier und möchtest das nicht? Schreib uns auf Mastodon, dann wirst du dauerhaft entfernt.',
  helpLink: '@mawkingbird@mastodon.social',
  faqHeading: 'Fragen',
  readTag: (tag) => `#${tag} in Mawkingbird lesen`,
  peopleHeading: 'Leute zum Folgen',
  groupColumn: 'Gruppe',
  countColumn: 'Leute',
  everyone: 'Alle',
  alsoYoutubeHeading: 'Auch auf YouTube',
  alsoYoutubeIntro: (n, total) =>
    `${n} der ${total} Leute oben machen auch Videos auf YouTube. Folge ihnen auf Mastodon, abonniere ihre Kanäle in Mawkingbird, um neue Videos ohne YouTube-Konto zu sehen, oder beides.`,
  otherLanguages: 'Diese Seite in anderen Sprachen',
  updated: (date) => `Stand: ${date}`,
};

const fr: FeedChrome = {
  eyebrow: 'Kit de démarrage Mastodon',
  openApp: 'Ouvrir Mawkingbird',
  hub: 'Toutes les communautés',
  tagsHeading: 'Des hashtags à suivre',
  tagsIntro:
    'Sur Mastodon, tu peux suivre un hashtag comme une personne\u00a0: ses messages arrivent dans ton fil d’accueil. Voici les plus actifs sur ce sujet. Ouvre-en un pour le lire tout de suite, sans compte.',
  englishTag: 'anglais',
  futureHeading: 'Aide à lancer ces hashtags',
  futureIntro:
    'Les hashtags anglais les plus actifs ont des versions françaises qui démarrent à peine. Suis-en une à côté du tag anglais et utilise-la quand tu écris en français\u00a0: c’est comme ça qu’un hashtag grandit.',
  futureBeside: (source) => `version française de #${source}`,
  futureNew: 'nouveau',
  futureStarting: 'démarre à peine',
  caution: {
    spam: 'Souvent envahi de messages de vente\u00a0: lis-le avant de le suivre.',
    'off-topic': 'Souvent utilisé pour autre chose\u00a0: lis-le avant de le suivre.',
  },
  shelves: {
    youtube: {
      heading: 'Créateurs avec une chaîne YouTube',
      intro: 'Des gens qui font des vidéos sur YouTube et publient aussi sur Mastodon.',
    },
    notable: {
      heading: 'Autrices, artistes et noms connus',
      intro:
        'Des figures publiques du domaine\u00a0: autrices et auteurs, artistes, éditeurs, revues et festivals.',
    },
    community: {
      heading: 'Voix de la communauté',
      intro: 'Des personnes actives qui parlent du sujet et ont choisi d’être découvrables.',
    },
  },
  fame: {
    wikidata: 'Wikidata',
    wikipedia: 'Wikipédia',
    'youtube-10k': 'YouTube 10k+',
    'followers-2500': '2\u202f500+ abonnés',
    'followers-625': '625+ abonnés',
  },
  elsewhere: {
    bluesky: 'Bluesky',
    youtube: 'YouTube',
    twitch: 'Twitch',
    patreon: 'Patreon',
    podcast: 'Podcast',
    website: 'Site web',
  },
  youtube: (band) => (band ? `Chaîne YouTube, ${band} abonnés` : 'Chaîne YouTube'),
  feedCopy: 'publie ses nouvelles vidéos',
  activity: (posts) => `${posts.toLocaleString('fr')} messages cette semaine sur mastodon.social`,
  serversHeading: 'Où se retrouve la communauté',
  serversIntro:
    'N’importe quel serveur Mastodon peut suivre tout le monde, tu peux donc rester où tu es. Si tu cherches un serveur dédié à ce sujet, ceux-ci sont un bon point de départ.',
  chooseHeading: 'Comment nous choisissons',
  choose: [
    'Une personne apparaît ici si elle a demandé à son serveur de la rendre découvrable, ou si c’est une figure publique avec des preuves publiques\u00a0: une fiche Wikipédia ou Wikidata, une chaîne YouTube de 10\u202f000 abonnés, ou au moins 625 abonnés pour un compte Mastodon clairement francophone.',
    'Un compte qui semble vouloir rester discret est écarté\u00a0: peu d’abonnés, listes d’abonnés masquées, pas de photo de profil, avec une demande de non-indexation. Quiconque désactive la découvrabilité n’est jamais listé.',
    'Un modèle de langage vérifie que chaque personne parle vraiment du sujet, en citant ses propres messages. Chaque compte est revérifié tous les mois\u00a0: les comptes silencieux disparaissent et reviennent dès qu’ils publient à nouveau.',
  ],
  helpHeading: 'Besoin d’aide\u202f?',
  help: 'Des questions, ou tu figures ici et tu préfères ne pas y être\u202f? Écris-nous sur Mastodon et tu seras retiré pour de bon.',
  helpLink: '@mawkingbird@mastodon.social',
  faqHeading: 'Questions',
  readTag: (tag) => `Lire #${tag} dans Mawkingbird`,
  peopleHeading: 'Des personnes à suivre',
  groupColumn: 'Groupe',
  countColumn: 'Personnes',
  everyone: 'Tout le monde',
  alsoYoutubeHeading: 'Aussi sur YouTube',
  alsoYoutubeIntro: (n, total) =>
    `${n} des ${total} personnes ci-dessus font aussi des vidéos sur YouTube. Suis-les sur Mastodon, abonne-toi à leurs chaînes dans Mawkingbird pour voir les nouvelles vidéos sans compte YouTube, ou les deux.`,
  otherLanguages: 'Cette page dans d’autres langues',
  updated: (date) => `Mis à jour le ${date}`,
};

const es: FeedChrome = {
  eyebrow: 'Kit de inicio de Mastodon',
  openApp: 'Abrir Mawkingbird',
  hub: 'Todas las comunidades',
  tagsHeading: 'Etiquetas que vale la pena seguir',
  tagsIntro:
    'En Mastodon puedes seguir una etiqueta igual que a una persona: sus publicaciones llegan a tu inicio. Estas son las más activas del tema. Abre una para leerla ya, sin cuenta.',
  englishTag: 'inglés',
  futureHeading: 'Ayuda a poner en marcha estas etiquetas',
  futureIntro:
    'Las etiquetas en inglés más activas tienen versiones en español que apenas empiezan. Sigue una junto a la etiqueta en inglés y úsala cuando escribas en español: así crece una etiqueta.',
  futureBeside: (source) => `la versión en español de #${source}`,
  futureNew: 'nueva',
  futureStarting: 'empezando',
  caution: {
    spam: 'Suele llenarse de anuncios de venta: léela antes de seguirla.',
    'off-topic': 'Se usa a menudo para otras cosas: léela antes de seguirla.',
  },
  shelves: {
    youtube: {
      heading: 'Creadores con canal de YouTube',
      intro: 'Gente que hace vídeos en YouTube y también publica en Mastodon.',
    },
    notable: {
      heading: 'Autoras, artistas y nombres conocidos',
      intro:
        'Figuras públicas del género: autoras y autores, artistas, editoriales, revistas y eventos.',
    },
    community: {
      heading: 'Voces de la comunidad',
      intro: 'Gente activa que habla del tema y pidió aparecer en el directorio.',
    },
  },
  fame: {
    wikidata: 'Wikidata',
    wikipedia: 'Wikipedia',
    'youtube-10k': 'YouTube 10k+',
    'followers-2500': '2500+ seguidores',
    'followers-625': '625+ seguidores',
  },
  elsewhere: {
    bluesky: 'Bluesky',
    youtube: 'YouTube',
    twitch: 'Twitch',
    patreon: 'Patreon',
    podcast: 'Pódcast',
    website: 'Web',
  },
  youtube: (band) => (band ? `Canal de YouTube, ${band} suscriptores` : 'Canal de YouTube'),
  feedCopy: 'publica sus vídeos nuevos',
  activity: (posts) => `${posts.toLocaleString('es')} publicaciones esta semana en mastodon.social`,
  serversHeading: 'Dónde se reúne la comunidad',
  serversIntro:
    'Cualquier servidor de Mastodon puede seguir a cualquiera, así que puedes quedarte donde estás. Si buscas un servidor dedicado a este tema, estos son un buen comienzo.',
  chooseHeading: 'Cómo elegimos',
  choose: [
    'Aparece aquí quien pidió a su servidor aparecer en el directorio, o quien es una figura pública con pruebas públicas: una entrada en Wikipedia o Wikidata, un canal de YouTube con 10 000 suscriptores o al menos 625 seguidores en una cuenta de Mastodon claramente en español.',
    'Si una cuenta parece querer pasar desapercibida, la dejamos fuera: pocos seguidores, listas de seguidores ocultas, sin foto de perfil, junto con la petición de no ser indexada. Quien desactiva aparecer en el directorio nunca aparece aquí.',
    'Un modelo de lenguaje comprueba que cada persona habla de verdad del tema, citando sus propias publicaciones. Cada cuenta se revisa de nuevo cada mes: las cuentas inactivas salen y vuelven cuando publican otra vez.',
  ],
  helpHeading: '¿Necesitas ayuda?',
  help: '¿Preguntas, o apareces aquí y prefieres no estar? Escríbenos en Mastodon y te quitaremos para siempre.',
  helpLink: '@mawkingbird@mastodon.social',
  faqHeading: 'Preguntas',
  readTag: (tag) => `Leer #${tag} en Mawkingbird`,
  peopleHeading: 'Personas a seguir',
  groupColumn: 'Grupo',
  countColumn: 'Personas',
  everyone: 'Todos',
  alsoYoutubeHeading: 'También en YouTube',
  alsoYoutubeIntro: (n, total) =>
    `${n} de las ${total} personas de arriba también hacen vídeos en YouTube. Síguelas en Mastodon, suscríbete a sus canales en Mawkingbird para ver los vídeos nuevos sin cuenta de YouTube, o ambas cosas.`,
  otherLanguages: 'Esta página en otros idiomas',
  updated: (date) => `Actualizado el ${date}`,
};

const it: FeedChrome = {
  eyebrow: 'Starter kit di Mastodon',
  openApp: 'Apri Mawkingbird',
  hub: 'Tutte le comunità',
  tagsHeading: 'Hashtag da seguire',
  tagsIntro:
    'Su Mastodon puoi seguire un hashtag come una persona: i suoi post arrivano nella tua home. Questi sono i più attivi sull’argomento. Aprine uno per leggerlo subito, senza account.',
  englishTag: 'inglese',
  futureHeading: 'Aiuta a far partire questi hashtag',
  futureIntro:
    'Gli hashtag inglesi più attivi hanno versioni italiane appena nate. Seguine una accanto al tag inglese e usala quando scrivi in italiano: è così che un hashtag cresce.',
  futureBeside: (source) => `la versione italiana di #${source}`,
  futureNew: 'nuovo',
  futureStarting: 'agli inizi',
  caution: {
    spam: 'Spesso pieno di post di vendita: leggilo prima di seguirlo.',
    'off-topic': 'Usato spesso per altro: leggilo prima di seguirlo.',
  },
  shelves: {
    youtube: {
      heading: 'Creator con un canale YouTube',
      intro: 'Persone che fanno video su YouTube e scrivono anche su Mastodon.',
    },
    notable: {
      heading: 'Autrici, artisti e nomi noti',
      intro: 'Figure pubbliche del genere: autrici e autori, artisti, editori, riviste ed eventi.',
    },
    community: {
      heading: 'Voci della community',
      intro: 'Persone attive che parlano dell’argomento e hanno chiesto di essere trovabili.',
    },
  },
  fame: {
    wikidata: 'Wikidata',
    wikipedia: 'Wikipedia',
    'youtube-10k': 'YouTube 10k+',
    'followers-2500': '2.500+ follower',
    'followers-625': '625+ follower',
  },
  elsewhere: {
    bluesky: 'Bluesky',
    youtube: 'YouTube',
    twitch: 'Twitch',
    patreon: 'Patreon',
    podcast: 'Podcast',
    website: 'Sito web',
  },
  youtube: (band) => (band ? `Canale YouTube, ${band} iscritti` : 'Canale YouTube'),
  feedCopy: 'pubblica i nuovi video',
  activity: (posts) => `${posts.toLocaleString('it')} post questa settimana su mastodon.social`,
  serversHeading: 'Dove si ritrova la community',
  serversIntro:
    'Ogni server Mastodon può seguire chiunque, quindi puoi restare dove sei. Se cerchi un server dedicato a questo argomento, questi sono un buon inizio.',
  chooseHeading: 'Come scegliamo',
  choose: [
    'Compare qui chi ha chiesto al proprio server di essere trovabile, o chi è una figura pubblica con prove pubbliche: una voce su Wikipedia o Wikidata, un canale YouTube da 10.000 iscritti o almeno 625 follower per un account Mastodon chiaramente in italiano.',
    'Un account che sembra voler restare in disparte viene escluso: pochi follower, liste dei follower nascoste, nessuna foto profilo, insieme alla richiesta di non essere indicizzato. Chi disattiva la trovabilità non compare mai.',
    'Un modello linguistico verifica che ogni persona parli davvero dell’argomento, citando i suoi post. Ogni account viene ricontrollato ogni mese: gli account fermi escono e tornano quando ricominciano a scrivere.',
  ],
  helpHeading: 'Serve aiuto?',
  help: 'Domande, o compari qui e preferisci di no? Scrivici su Mastodon e verrai rimosso per sempre.',
  helpLink: '@mawkingbird@mastodon.social',
  faqHeading: 'Domande',
  readTag: (tag) => `Leggi #${tag} in Mawkingbird`,
  peopleHeading: 'Persone da seguire',
  groupColumn: 'Gruppo',
  countColumn: 'Persone',
  everyone: 'Tutti',
  alsoYoutubeHeading: 'Anche su YouTube',
  alsoYoutubeIntro: (n, total) =>
    `${n} delle ${total} persone qui sopra fanno anche video su YouTube. Seguile su Mastodon, iscriviti ai loro canali in Mawkingbird per vedere i nuovi video senza un account YouTube, o entrambe le cose.`,
  otherLanguages: 'Questa pagina in altre lingue',
  updated: (date) => `Aggiornato il ${date}`,
};

const ja: FeedChrome = {
  eyebrow: 'Mastodon（マストドン）スターターキット',
  openApp: 'Mawkingbird を開く',
  hub: 'すべてのコミュニティ',
  tagsHeading: 'フォローしたいハッシュタグ',
  tagsIntro:
    'Mastodon では、人と同じようにハッシュタグもフォローできます。フォローすると、そのタグの投稿がホームに届きます。ここにあるのは、このテーマで特に活発なタグです。開けば、アカウントがなくてもすぐに読めます。',
  englishTag: '英語',
  futureHeading: 'このハッシュタグを一緒に育てましょう',
  futureIntro:
    '活発な英語のハッシュタグには、まだ始まったばかりの日本語版があります。英語のタグと一緒にフォローして、日本語で投稿するときに使ってください。ハッシュタグはそうやって育ちます。',
  futureBeside: (source) => `#${source} の日本語版`,
  futureNew: '新しいタグ',
  futureStarting: '始まったばかり',
  caution: {
    spam: '宣伝の投稿が多いタグです。フォローする前に読んでみてください。',
    'off-topic': '別の話題にもよく使われます。フォローする前に読んでみてください。',
  },
  shelves: {
    youtube: {
      heading: 'YouTube チャンネルを持つクリエイター',
      intro: 'YouTube で動画を作り、Mastodon にも投稿している人たちです。',
    },
    notable: {
      heading: '作家・アーティスト・よく知られた名前',
      intro: 'この分野の著名人です。作家、アーティスト、出版社、雑誌、イベントなど。',
    },
    community: {
      heading: 'コミュニティの声',
      intro: 'このテーマについて活発に投稿し、見つけてもらうことを選んだ人たちです。',
    },
  },
  fame: {
    wikidata: 'Wikidata',
    wikipedia: 'Wikipedia',
    'youtube-10k': 'YouTube 1万人以上',
    'followers-2500': 'フォロワー 2,500 人以上',
    'followers-625': 'フォロワー 625 人以上',
  },
  elsewhere: {
    bluesky: 'Bluesky',
    youtube: 'YouTube',
    twitch: 'Twitch',
    patreon: 'Patreon',
    podcast: 'ポッドキャスト',
    website: 'ウェブサイト',
  },
  youtube: (band) => (band ? `YouTube チャンネル（登録者 ${band}）` : 'YouTube チャンネル'),
  feedCopy: '新しい動画を投稿',
  activity: (posts) => `mastodon.social で今週 ${posts.toLocaleString('ja')} 件の投稿`,
  serversHeading: 'コミュニティが集まる場所',
  serversIntro:
    'Mastodon はどのサーバーからでも誰でもフォローできるので、今のサーバーのままで大丈夫です。このテーマのサーバーを探しているなら、ここから始めるのがおすすめです。',
  chooseHeading: '選び方',
  choose: [
    'ここに載るのは、自分のサーバーで「見つけてもらう」設定をオンにした人か、公開された根拠がある著名人です。根拠とは、Wikipedia や Wikidata の項目、登録者 1 万人以上の YouTube チャンネル、日本語で発信していることが確認できる Mastodon アカウントのフォロワー 625 人以上のいずれかです。',
    '目立たずにいたいように見えるアカウントは載せません。フォロワーが少ない、フォロー・フォロワー一覧を隠している、プロフィール画像がない、といった点に加えて検索エンジンに載せない設定をしている場合です。「見つけてもらう」設定をオフにしている人は決して載りません。',
    '言語モデルが、その人が本当にこのテーマについて投稿しているかを、本人の投稿を引用して確かめます。すべてのアカウントは毎月見直します。投稿が止まったアカウントは外れ、また投稿を始めれば戻ります。',
  ],
  helpHeading: 'お困りですか？',
  help: 'ご質問、またはここに載りたくない場合は、Mastodon でご連絡ください。今後も載らないよう削除します。',
  helpLink: '@mawkingbird@mastodon.social',
  faqHeading: 'よくある質問',
  readTag: (tag) => `#${tag} を Mawkingbird で読む`,
  peopleHeading: 'フォローしたい人',
  groupColumn: 'グループ',
  countColumn: '人数',
  everyone: '全員',
  alsoYoutubeHeading: 'YouTube にもいる人',
  alsoYoutubeIntro: (n, total) =>
    `上の ${total} 人のうち ${n} 人は YouTube でも動画を投稿しています。マストドン（Mastodon）でフォローすることも、YouTube アカウントなしで新しい動画を見られるよう Mawkingbird でチャンネルを登録することも、両方することもできます。`,
  otherLanguages: 'ほかの言語のページ',
  updated: (date) => `${date} 更新`,
};

const ms: FeedChrome = {
  eyebrow: 'Kit permulaan Mastodon',
  openApp: 'Buka Mawkingbird',
  hub: 'Semua komuniti',
  tagsHeading: 'Hashtag untuk diikuti',
  tagsIntro:
    'Ikuti hashtag untuk melihat siarannya dalam suapan Utama. Buka hashtag untuk membaca tanpa akaun.',
  englishTag: 'Bahasa Inggeris',
  futureHeading: 'Bantu mulakan hashtag ini',
  futureIntro:
    'Gunakan hashtag tempatan bersama hashtag bahasa Inggeris untuk membantu komuniti berkembang.',
  futureBeside: (source) => `versi tempatan #${source}`,
  futureNew: 'baharu',
  futureStarting: 'baru bermula',
  caution: {
    spam: 'Banyak siaran jualan: baca dahulu sebelum mengikuti.',
    'off-topic': 'Sering digunakan untuk topik lain: baca dahulu.',
  },
  shelves: {
    youtube: {
      heading: 'Pencipta dengan saluran YouTube',
      intro: 'Pencipta video yang turut berkongsi di Mastodon.',
    },
    notable: {
      heading: 'Penulis, seniman dan tokoh dikenali',
      intro: 'Akaun awam yang berkongsi tentang topik ini.',
    },
    community: {
      heading: 'Suara komuniti',
      intro: 'Akaun komuniti untuk diterokai, termasuk yang jarang menulis.',
    },
  },
  fame: {
    wikidata: 'Wikidata',
    wikipedia: 'Wikipedia',
    'youtube-10k': 'YouTube 10k+',
    'followers-2500': '2,500+ pengikut',
    'followers-625': '625+ pengikut',
  },
  elsewhere: {
    bluesky: 'Bluesky',
    youtube: 'YouTube',
    twitch: 'Twitch',
    patreon: 'Patreon',
    podcast: 'Podcast',
    website: 'Laman web',
  },
  youtube: (band) => (band ? `Saluran YouTube, ${band} pelanggan` : 'Saluran YouTube'),
  feedCopy: 'berkongsi video baharu',
  activity: (posts) => `${posts.toLocaleString('ms')} siaran minggu ini di mastodon.social`,
  serversHeading: 'Tempat komuniti berkumpul',
  serversIntro:
    'Anda boleh mengikuti akaun dari mana-mana pelayan Mastodon tanpa berpindah pelayan.',
  chooseHeading: 'Cara kami memilih',
  choose: [
    'Kit komuniti kecil ini merangkumi akaun dengan kaitan setempat yang kelihatan dalam profil atau siaran awam. Tiada jumlah minimum pengikut atau siaran; akaun dengan siaran dalam tempoh 30 bulan lalu boleh disertakan.',
    'Kami menghormati permintaan supaya profil tidak diindeks di web dan pilihan untuk tidak ditemui. Mematikan carian teks penuh Mastodon sahaja tidak menghalang penyenaraian di sini.',
    'Kandungan disemak untuk kesesuaian keluarga dan kegunaan kepada pembaca. Bahasa dan kekerapan siaran berbeza-beza. Pratonton sebelum mengikuti; suapan mungkin berubah selepas semakan.',
  ],
  helpHeading: 'Perlukan bantuan?',
  help: 'Ada soalan atau mahu dikeluarkan daripada senarai? Hubungi kami di Mastodon; permintaan anda akan dihormati.',
  helpLink: '@mawkingbird@mastodon.social',
  faqHeading: 'Soalan lazim',
  readTag: (tag) => `Baca #${tag} di Mawkingbird`,
  peopleHeading: 'Akaun untuk diikuti',
  groupColumn: 'Kumpulan',
  countColumn: 'Akaun',
  everyone: 'Semua',
  alsoYoutubeHeading: 'Juga di YouTube',
  alsoYoutubeIntro: (n, total) =>
    `${n} daripada ${total} akaun ini turut menghasilkan video di YouTube. Ikuti di Mastodon atau langgan saluran mereka di Mawkingbird.`,
  otherLanguages: 'Halaman ini dalam bahasa lain',
  updated: (date) => `Dikemas kini ${date}`,
};

const vi: FeedChrome = {
  eyebrow: 'Bộ khởi đầu Mastodon',
  openApp: 'Mở Mawkingbird',
  hub: 'Tất cả cộng đồng',
  tagsHeading: 'Hashtag để theo dõi',
  tagsIntro:
    'Theo dõi hashtag để xem bài viết trong bảng tin. Bạn có thể đọc mà không cần tài khoản.',
  englishTag: 'Tiếng Anh',
  futureHeading: 'Cùng phát triển hashtag',
  futureIntro: 'Dùng hashtag tiếng Việt cùng hashtag tiếng Anh để giúp cộng đồng phát triển.',
  futureBeside: (s) => `phiên bản tiếng Việt của #${s}`,
  futureNew: 'mới',
  futureStarting: 'vừa bắt đầu',
  caution: {
    spam: 'Nhiều bài bán hàng: hãy đọc trước khi theo dõi.',
    'off-topic': 'Thường dùng cho chủ đề khác: hãy đọc trước.',
  },
  shelves: {
    youtube: {
      heading: 'Nhà sáng tạo có kênh YouTube',
      intro: 'Những người làm video cũng chia sẻ trên Mastodon.',
    },
    notable: {
      heading: 'Tác giả, nghệ sĩ và gương mặt quen thuộc',
      intro: 'Tài khoản công khai chia sẻ về chủ đề này.',
    },
    community: {
      heading: 'Tiếng nói cộng đồng',
      intro: 'Những tài khoản để khám phá, kể cả người ít đăng bài.',
    },
  },
  fame: {
    wikidata: 'Wikidata',
    wikipedia: 'Wikipedia',
    'youtube-10k': 'YouTube 10k+',
    'followers-2500': '2.500+ người theo dõi',
    'followers-625': '625+ người theo dõi',
  },
  elsewhere: {
    bluesky: 'Bluesky',
    youtube: 'YouTube',
    twitch: 'Twitch',
    patreon: 'Patreon',
    podcast: 'Podcast',
    website: 'Trang web',
  },
  youtube: (band) => (band ? `Kênh YouTube, ${band} người đăng ký` : 'Kênh YouTube'),
  feedCopy: 'chia sẻ video mới',
  activity: (n) => `${n.toLocaleString('vi')} bài tuần này trên mastodon.social`,
  serversHeading: 'Nơi cộng đồng gặp gỡ',
  serversIntro:
    'Bạn có thể theo dõi tài khoản trên mọi máy chủ Mastodon mà không cần chuyển máy chủ.',
  chooseHeading: 'Cách chúng tôi lựa chọn',
  choose: [
    'Tài khoản viết tiếng Việt ở bất cứ đâu đều có thể được chọn, kể cả khi không nêu nơi ở. Tài khoản viết tiếng Anh cần có mối liên hệ rõ ràng với Việt Nam.',
    'Không yêu cầu số người theo dõi hay số bài tối thiểu. Tài khoản có bài trong 30 tháng qua có thể tham gia. Chúng tôi tôn trọng lựa chọn không được tìm thấy và yêu cầu không lập chỉ mục web; tắt tìm kiếm toàn văn Mastodon không tự động loại tài khoản.',
    'Nội dung được xem xét về tính phù hợp với gia đình và ích lợi cho người đọc. Hãy xem trước: nội dung có thể thay đổi sau khi được chọn.',
  ],
  helpHeading: 'Cần trợ giúp?',
  help: 'Có câu hỏi hoặc muốn được gỡ khỏi danh sách? Hãy liên hệ trên Mastodon; chúng tôi sẽ tôn trọng yêu cầu của bạn.',
  helpLink: '@mawkingbird@mastodon.social',
  faqHeading: 'Câu hỏi thường gặp',
  readTag: (tag) => `Đọc #${tag} trên Mawkingbird`,
  peopleHeading: 'Tài khoản để theo dõi',
  groupColumn: 'Nhóm',
  countColumn: 'Tài khoản',
  everyone: 'Tất cả',
  alsoYoutubeHeading: 'Cũng có trên YouTube',
  alsoYoutubeIntro: (n, total) =>
    `${n} trong ${total} tài khoản cũng làm video trên YouTube. Theo dõi trên Mastodon hoặc đăng ký kênh trong Mawkingbird.`,
  otherLanguages: 'Trang này bằng ngôn ngữ khác',
  updated: (date) => `Cập nhật ${date}`,
};

export const FEED_CHROME: Partial<Record<PageLanguage, FeedChrome>> = {
  en,
  de,
  fr,
  es,
  it,
  ja,
  vi,
  ms,
};

export function chromeFor(lang: PageLanguage): FeedChrome {
  return FEED_CHROME[lang] ?? en;
}
