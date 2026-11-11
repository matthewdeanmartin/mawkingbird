import { PageLanguage } from '../../../public-pages/focused-tools';
import { TopicCopy } from './topic-copy';

/**
 * The space and astronomy pages' own words, one block per language. The
 * people, tags and servers come from the data; this is the pitch and the
 * questions around them. Descriptions stay under 160 characters.
 */
export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  en: {
    title: 'Space and astronomy on Mastodon: who and what to follow',
    description:
      'Astronomers, astrophotographers, spaceflight fans and space YouTubers on Mastodon, plus the hashtags worth following. Read it all before you make an account.',
    heading: 'Space and astronomy on Mastodon',
    listTitle: 'Space and astronomy',
    intro: [
      'Mastodon is full of people looking up: professional astronomers and planetary scientists, astrophotographers with backyard telescopes, launch watchers, observatories, and science writers who explain what the latest mission found.',
      'Starting from an empty timeline is slow. This page gives you a head start: the hashtags people actually use, the people worth following, and a server where the space community gathers.',
    ],
    faq: [
      {
        q: 'Do I need an account to read this?',
        a: 'No. Every hashtag here opens in Mawkingbird without an account. To follow people and tags you need a Mastodon account on any server; mastodon.social is a fine first choice, and you can move later and keep your followers.',
      },
      {
        q: 'Is Mastodon a good place for space and astronomy?',
        a: 'Yes. Many astronomers and space scientists moved to Mastodon, astrophotographers share their nights under #Astrophotography, and launches, eclipses and new telescope images get busy, knowledgeable threads. Conversations are slower than on Twitter and less driven by outrage.',
      },
      {
        q: 'How do I get onto this list?',
        a: 'Post about space or astronomy, use the hashtags above, and let your profile be suggested to others (your server’s Privacy and reach settings). The list is refreshed every month.',
      },
    ],
  },
  de: {
    title: 'Weltraum und Astronomie auf Mastodon: wem du folgen kannst',
    description:
      'Astronominnen, Astrofotografen, Raumfahrt-Fans und Weltraum-YouTuber auf Mastodon, dazu die passenden Hashtags. Alles lesbar, bevor du ein Konto anlegst.',
    heading: 'Weltraum und Astronomie auf Mastodon',
    listTitle: 'Weltraum und Astronomie',
    intro: [
      'Auf Mastodon schauen viele nach oben: Astronominnen und Planetenforscher, Astrofotografen mit Teleskop im Garten, Leute, die jeden Raketenstart verfolgen, Sternwarten und Wissenschaftsjournalisten, die erklären, was die neueste Mission gefunden hat.',
      'Mit einer leeren Startseite anzufangen ist mühsam. Diese Seite hilft dir beim Start: Hashtags, die wirklich benutzt werden, Leute, denen sich das Folgen lohnt, und ein Server, auf dem sich die Weltraum-Community trifft.',
    ],
    faq: [
      {
        q: 'Brauche ich ein Konto, um mitzulesen?',
        a: 'Nein. Jeder Hashtag hier öffnet sich in Mawkingbird ohne Konto. Um Leuten und Hashtags zu folgen, brauchst du ein Mastodon-Konto auf irgendeinem Server; mastodon.social ist ein guter Anfang, und du kannst später umziehen und deine Follower mitnehmen.',
      },
      {
        q: 'Warum stehen hier englische Hashtags?',
        a: 'Viele Gespräche über Astronomie und Raumfahrt laufen auf Mastodon unter englischen Hashtags, auch von Leuten, die auf Deutsch schreiben. Wir zeigen die aktivsten und dazu deutsche Hashtags wie #Astronomie und #Raumfahrt.',
      },
      {
        q: 'Wie komme ich auf diese Liste?',
        a: 'Schreib über Weltraum oder Astronomie, benutze die Hashtags oben und erlaube in den Einstellungen deines Servers (Privatsphäre und Reichweite), dass dein Profil anderen vorgeschlagen wird. Die Liste wird jeden Monat erneuert.',
      },
    ],
  },
  fr: {
    title: 'Espace et astronomie sur Mastodon\u00a0: qui et quoi suivre',
    description:
      'Astronomes, astrophotographes, passionnés de spatial et youtubeurs de l’espace sur Mastodon, et les hashtags à suivre. Tout se lit avant de créer un compte.',
    heading: 'Espace et astronomie sur Mastodon',
    listTitle: 'Espace et astronomie',
    intro: [
      'Sur Mastodon, beaucoup de monde a la tête dans les étoiles\u00a0: astronomes et planétologues, astrophotographes avec leur télescope au jardin, fans de lancements, observatoires, et journalistes scientifiques qui expliquent ce que la dernière mission a découvert.',
      'Partir d’un fil vide, c’est long. Cette page te donne un coup de pouce\u00a0: les hashtags vraiment utilisés, les personnes à suivre et un serveur où se retrouve la communauté de l’espace.',
    ],
    faq: [
      {
        q: 'Faut-il un compte pour lire tout ça\u202f?',
        a: 'Non. Chaque hashtag s’ouvre dans Mawkingbird sans compte. Pour suivre des personnes et des hashtags, il te faut un compte Mastodon sur n’importe quel serveur\u00a0; mastodon.social est un bon début, et tu pourras déménager plus tard en gardant tes abonnés.',
      },
      {
        q: 'Pourquoi des hashtags en anglais\u202f?',
        a: 'Une grande partie des conversations sur l’astronomie et le spatial se tient sous des hashtags anglais, y compris chez des gens qui écrivent en français. On montre les plus actifs, avec les hashtags français comme #Astronomie et #Espace.',
      },
      {
        q: 'Comment figurer sur cette liste\u202f?',
        a: 'Publie sur l’espace ou l’astronomie, utilise les hashtags ci-dessus et autorise ton serveur à suggérer ton profil (réglages de confidentialité et de visibilité). La liste est mise à jour chaque mois.',
      },
    ],
  },
  es: {
    title: 'Espacio y astronomía en Mastodon: a quién y qué seguir',
    description:
      'Astrónomos, astrofotógrafos, fans de la exploración espacial y youtubers del espacio en Mastodon, y las etiquetas que conviene seguir. Léelo sin crear cuenta.',
    heading: 'Espacio y astronomía en Mastodon',
    listTitle: 'Espacio y astronomía',
    intro: [
      'En Mastodon hay mucha gente mirando al cielo: astrónomas y científicos planetarios, astrofotógrafos con su telescopio en el patio, quienes siguen cada lanzamiento, observatorios y divulgadores que explican lo que encontró la última misión.',
      'Empezar con un inicio vacío es lento. Esta página te da un empujón: las etiquetas que de verdad se usan, las personas que vale la pena seguir y un servidor donde se reúne la comunidad del espacio.',
    ],
    faq: [
      {
        q: '¿Necesito una cuenta para leer esto?',
        a: 'No. Cada etiqueta se abre en Mawkingbird sin cuenta. Para seguir a personas y etiquetas necesitas una cuenta de Mastodon en cualquier servidor; mastodon.social es un buen comienzo, y puedes mudarte después sin perder a tus seguidores.',
      },
      {
        q: '¿Por qué hay etiquetas en inglés?',
        a: 'Muchas conversaciones sobre astronomía y el espacio usan etiquetas en inglés, también entre quienes escriben en español. Mostramos las más activas junto a etiquetas en español como #Astronomía y #Espacio.',
      },
      {
        q: '¿Cómo entro en esta lista?',
        a: 'Publica sobre el espacio o la astronomía, usa las etiquetas de arriba y permite que tu servidor sugiera tu perfil a otras personas (ajustes de privacidad y alcance). La lista se actualiza cada mes.',
      },
    ],
  },
  it: {
    title: 'Spazio e astronomia su Mastodon: chi e cosa seguire',
    description:
      'Astronomi, astrofotografi, appassionati di spazio e youtuber su Mastodon, e gli hashtag da seguire. Puoi leggere tutto senza account.',
    heading: 'Spazio e astronomia su Mastodon',
    listTitle: 'Spazio e astronomia',
    intro: [
      'Su Mastodon tante persone guardano in alto: astronome e planetologi, astrofotografi con il telescopio in giardino, chi segue ogni lancio, osservatori e divulgatori che spiegano cosa ha scoperto l’ultima missione.',
      'Partire da una home vuota è lento. Questa pagina ti dà una spinta: gli hashtag usati davvero, le persone da seguire e un server dove si ritrova la comunità dello spazio.',
    ],
    faq: [
      {
        q: 'Serve un account per leggere?',
        a: 'No. Ogni hashtag si apre in Mawkingbird senza account. Per seguire persone e hashtag ti serve un account Mastodon su un server qualsiasi; mastodon.social va benissimo per iniziare, e puoi traslocare dopo portando con te i tuoi follower.',
      },
      {
        q: 'Perché ci sono hashtag in inglese?',
        a: 'Molte conversazioni su astronomia e spazio passano per hashtag inglesi, anche tra chi scrive in italiano. Mostriamo i più attivi insieme agli hashtag italiani da far crescere, come #Astronomia e #Spazio.',
      },
      {
        q: 'Come entro in questa lista?',
        a: 'Scrivi di spazio o astronomia, usa gli hashtag qui sopra e permetti al tuo server di suggerire il tuo profilo ad altri (impostazioni di privacy e visibilità). La lista viene aggiornata ogni mese.',
      },
    ],
  },
  ja: {
    title: 'Mastodon（マストドン）の宇宙・天文：フォローしたい人とタグ',
    description:
      'Mastodon（マストドン）で活動する天文学者、天体写真家、宇宙開発ファン、宇宙系 YouTuber と、フォローしたいハッシュタグ。アカウントがなくても読めます。',
    heading: 'Mastodon（マストドン）の宇宙・天文',
    listTitle: '宇宙・天文',
    intro: [
      'Mastodon には空を見上げる人がたくさんいます。天文学者や惑星科学者、庭の望遠鏡で星を撮る天体写真家、ロケットの打ち上げを追いかける人、天文台、そして最新の探査で何がわかったのかを解説するサイエンスライターなどです。',
      '何もないホームから始めるのは大変です。このページでは、実際に使われているハッシュタグ、フォローしたい人、宇宙好きが集まるサーバーをまとめて紹介します。',
    ],
    faq: [
      {
        q: '読むのにアカウントは必要ですか？',
        a: 'いいえ。このページのハッシュタグは、アカウントがなくても Mawkingbird で開けます。人やタグをフォローするには、どこかのサーバーに Mastodon のアカウントが必要です。最初は mastodon.social で十分で、あとからフォロワーを連れて引っ越せます。',
      },
      {
        q: 'なぜ英語のハッシュタグがあるのですか？',
        a: 'Mastodon では天文や宇宙の話題の多くが英語のハッシュタグで交わされています。いちばん活発な英語のタグと、#宇宙 などこれから育てたい日本語のタグを一緒に紹介しています。',
      },
      {
        q: 'このリストに載るには？',
        a: '宇宙や天文について投稿し、上のハッシュタグを使い、サーバーのプライバシー設定でプロフィールをおすすめに表示できるようにしてください。リストは毎月更新されます。',
      },
    ],
  },
};
