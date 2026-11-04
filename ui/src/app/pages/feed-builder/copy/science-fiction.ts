import { PageLanguage } from '../../../focused-tools';
import { TopicCopy } from './topic-copy';

/**
 * The science fiction & fantasy pages' own words, one block per language. The
 * people, tags and servers come from the data; this is the pitch and the
 * questions around them. Descriptions stay under 160 characters.
 */
export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  en: {
    title: 'Science fiction & fantasy on Mastodon: who and what to follow',
    description:
      'Sci-fi and fantasy writers, artists, YouTubers and fans on Mastodon, plus the hashtags worth following. Read it all before you make an account.',
    heading: 'Science fiction & fantasy on Mastodon',
    intro: [
      'Mastodon has a lively science fiction and fantasy crowd: novelists and short-story writers, magazines, illustrators, critics, Star Trek and Doctor Who fans, and people who simply read a lot.',
      'Starting from an empty timeline is slow. This page gives you a head start: the hashtags people actually use, the people worth following, and the servers where the community gathers.',
    ],
    faq: [
      {
        q: 'Do I need an account to read this?',
        a: 'No. Every hashtag here opens in Mawkingbird without an account. To follow people and tags you need a Mastodon account on any server; mastodon.social is a fine first choice, and you can move later and keep your followers.',
      },
      {
        q: 'Is Mastodon a good place for science fiction fans?',
        a: 'Yes. Many SF and fantasy authors, editors and magazines moved to Mastodon, and wandering.shop is a server run for readers and writers of the genre. Conversations are slower than on Twitter and less driven by outrage.',
      },
      {
        q: 'How do I get onto this list?',
        a: 'Post about science fiction or fantasy, use the hashtags above, and let your profile be suggested to others (your server’s Privacy and reach settings). The list is refreshed every month.',
      },
    ],
  },
  de: {
    title: 'Science-Fiction und Fantasy auf Mastodon: wem du folgen kannst',
    description:
      'Autorinnen, Künstler, YouTuber und Fans von Science-Fiction und Fantasy auf Mastodon, dazu die passenden Hashtags. Alles lesbar, bevor du ein Konto anlegst.',
    heading: 'Science-Fiction und Fantasy auf Mastodon',
    intro: [
      'Auf Mastodon gibt es eine lebendige Szene für Science-Fiction und Phantastik: Autorinnen und Autoren, Verlage, Illustratoren, Rezensenten, Fans von Star Trek und Doctor Who und viele, die einfach gern lesen.',
      'Mit einer leeren Startseite anzufangen ist mühsam. Diese Seite hilft dir beim Start: Hashtags, die wirklich benutzt werden, Leute, denen sich das Folgen lohnt, und Server, auf denen sich die Community trifft.',
    ],
    faq: [
      {
        q: 'Brauche ich ein Konto, um mitzulesen?',
        a: 'Nein. Jeder Hashtag hier öffnet sich in Mawkingbird ohne Konto. Um Leuten und Hashtags zu folgen, brauchst du ein Mastodon-Konto auf irgendeinem Server; mastodon.social ist ein guter Anfang, und du kannst später umziehen und deine Follower mitnehmen.',
      },
      {
        q: 'Warum stehen hier englische Hashtags?',
        a: 'Viele Gespräche über Science-Fiction laufen auf Mastodon unter englischen Hashtags, auch von Leuten, die auf Deutsch schreiben. Wir zeigen die aktivsten und dazu deutsche Hashtags, die wachsen sollen.',
      },
      {
        q: 'Wie komme ich auf diese Liste?',
        a: 'Schreib über Science-Fiction oder Fantasy, benutze die Hashtags oben und erlaube in den Einstellungen deines Servers (Privatsphäre und Reichweite), dass dein Profil anderen vorgeschlagen wird. Die Liste wird jeden Monat erneuert.',
      },
    ],
  },
  fr: {
    title: 'Science-fiction et fantasy sur Mastodon : qui suivre',
    description:
      'Autrices, artistes, vidéastes et fans de science-fiction et de fantasy sur Mastodon, avec les hashtags à suivre. Tout se lit avant même de créer un compte.',
    heading: 'Science-fiction et fantasy sur Mastodon',
    intro: [
      'Mastodon abrite une communauté vivante autour des littératures de l’imaginaire : romancières et nouvellistes, revues, illustrateurs, critiques, fans de Star Trek ou de Doctor Who, et beaucoup de grands lecteurs.',
      'Partir d’un fil vide prend du temps. Cette page te donne une longueur d’avance : les hashtags vraiment utilisés, les personnes à suivre et les serveurs où la communauté se retrouve.',
    ],
    faq: [
      {
        q: 'Faut-il un compte pour lire ?',
        a: 'Non. Chaque hashtag de cette page s’ouvre dans Mawkingbird sans compte. Pour suivre des personnes et des hashtags, il te faut un compte Mastodon sur n’importe quel serveur ; mastodon.social est un bon début, et tu pourras déménager plus tard avec tes abonnés.',
      },
      {
        q: 'Pourquoi des hashtags en anglais ?',
        a: 'Beaucoup de conversations sur la SF passent par des hashtags anglais, y compris chez des gens qui écrivent en français. Nous montrons les plus actifs, et des hashtags français qui méritent de grandir, comme #SFFF et #Imaginaire.',
      },
      {
        q: 'Comment apparaître sur cette liste ?',
        a: 'Parle de science-fiction ou de fantasy, utilise les hashtags ci-dessus et autorise ton serveur à suggérer ton profil (paramètres de confidentialité et de portée). La liste est mise à jour chaque mois.',
      },
    ],
  },
  es: {
    title: 'Ciencia ficción y fantasía en Mastodon: a quién seguir',
    description:
      'Autoras, artistas, youtubers y fans de la ciencia ficción y la fantasía en Mastodon, con las etiquetas que vale la pena seguir. Léelo todo sin crear cuenta.',
    heading: 'Ciencia ficción y fantasía en Mastodon',
    intro: [
      'En Mastodon hay una comunidad muy viva de ciencia ficción y fantasía: novelistas y cuentistas, revistas, ilustradores, críticos, fans de Star Trek y Star Wars, y mucha gente que simplemente lee.',
      'Empezar con un inicio vacío cuesta. Esta página te da ventaja: las etiquetas que de verdad se usan, la gente a la que vale la pena seguir y los servidores donde se reúne la comunidad.',
    ],
    faq: [
      {
        q: '¿Necesito una cuenta para leer?',
        a: 'No. Cada etiqueta de esta página se abre en Mawkingbird sin cuenta. Para seguir a personas y etiquetas necesitas una cuenta de Mastodon en cualquier servidor; mastodon.social es un buen comienzo, y puedes mudarte después con tus seguidores.',
      },
      {
        q: '¿Por qué hay etiquetas en inglés?',
        a: 'Muchas conversaciones sobre ciencia ficción en Mastodon usan etiquetas en inglés, también entre quienes escriben en español. Mostramos las más activas y, junto a ellas, etiquetas en español como #CienciaFicción y #Fantasía.',
      },
      {
        q: '¿Cómo aparezco en esta lista?',
        a: 'Publica sobre ciencia ficción o fantasía, usa las etiquetas de arriba y permite que tu servidor sugiera tu perfil a otros (ajustes de privacidad y alcance). La lista se actualiza cada mes.',
      },
    ],
  },
  it: {
    title: 'Fantascienza e fantasy su Mastodon: chi seguire',
    description:
      'Autrici, artisti, youtuber e fan di fantascienza e fantasy su Mastodon, con gli hashtag da seguire. Puoi leggere tutto prima ancora di creare un account.',
    heading: 'Fantascienza e fantasy su Mastodon',
    intro: [
      'Su Mastodon c’è una community vivace di fantascienza e fantasy: romanzieri e autori di racconti, riviste, illustratori, critici, fan di Star Trek e di Star Wars, e tante persone che leggono e basta.',
      'Partire da una home vuota è lento. Questa pagina ti dà una spinta: gli hashtag usati davvero, le persone da seguire e i server dove la community si ritrova.',
    ],
    faq: [
      {
        q: 'Serve un account per leggere?',
        a: 'No. Ogni hashtag di questa pagina si apre in Mawkingbird senza account. Per seguire persone e hashtag ti serve un account Mastodon su qualsiasi server; mastodon.social va benissimo per iniziare, e puoi traslocare dopo portando con te i follower.',
      },
      {
        q: 'Perché ci sono hashtag in inglese?',
        a: 'Molte conversazioni sulla fantascienza passano da hashtag inglesi, anche tra chi scrive in italiano. Mostriamo i più attivi e, accanto, #Fantascienza, che è già vivo e merita di crescere.',
      },
      {
        q: 'Come entro in questa lista?',
        a: 'Scrivi di fantascienza o fantasy, usa gli hashtag qui sopra e permetti al tuo server di suggerire il tuo profilo ad altri (impostazioni di privacy e visibilità). La lista viene aggiornata ogni mese.',
      },
    ],
  },
  ja: {
    title: 'Mastodon（マストドン）の SF・ファンタジー：フォローしたい人とタグ',
    description:
      'Mastodon（マストドン）で活動する SF・ファンタジーの作家、アーティスト、YouTuber、ファンと、フォローしたいハッシュタグ。アカウントがなくても読めます。',
    heading: 'Mastodon（マストドン）の SF・ファンタジー',
    intro: [
      'Mastodon には、SF やファンタジーを書く人、描く人、読む人のにぎやかなコミュニティがあります。作家や雑誌、イラストレーター、レビュアー、スタートレックやスター・ウォーズのファンなどです。',
      '何もないホームから始めるのは大変です。このページでは、実際に使われているハッシュタグ、フォローしたい人、コミュニティが集まるサーバーをまとめて紹介します。',
    ],
    faq: [
      {
        q: '読むのにアカウントは必要ですか？',
        a: 'いいえ。このページのハッシュタグは、アカウントがなくても Mawkingbird で開けます。人やタグをフォローするには、どこかのサーバーに Mastodon のアカウントが必要です。最初は mastodon.social で十分で、あとからフォロワーを連れて引っ越せます。',
      },
      {
        q: 'なぜ英語のハッシュタグがあるのですか？',
        a: 'Mastodon では SF の話題の多くが英語のハッシュタグで交わされています。いちばん活発な英語のタグと、これから育てたい日本語のタグを一緒に紹介しています。',
      },
      {
        q: 'このリストに載るには？',
        a: 'SF やファンタジーについて投稿し、上のハッシュタグを使い、サーバーのプライバシー設定でプロフィールをおすすめに表示できるようにしてください。リストは毎月更新されます。',
      },
    ],
  },
};
