import { PageLanguage } from '../../../public-pages/focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  en: {
    title: 'Math on Mastodon: people and hashtags to follow',
    description:
      'Build a math feed on Mastodon: research, teaching, puzzles and mathematical art. Choose people and hashtags, then preview their public posts.',
    heading: 'Math on Mastodon',
    listTitle: 'Mathematics',
    intro: [
      'A neat proof, a puzzle to think about, a picture that makes an idea click: there are many ways into mathematics. This starter kit looks across research, teaching and recreational math.',
      'Choose the people and hashtags that interest you, then try the preview. You can explore public posts before signing in and adjust your choices before following.',
    ],
    faq: [
      {
        q: 'Do I need an account?',
        a: 'You can browse the recommendations and preview public posts without an account. To follow people and hashtags or create a Mastodon list, sign in with your Mastodon account.',
      },
      {
        q: 'Is this only for professional mathematicians?',
        a: 'No. Teaching, puzzles, mathematical art and explanations belong alongside research. Some posts assume specialist knowledge; preview the people and tags to find the mix you enjoy.',
      },
      {
        q: 'How do I get onto this list?',
        a: 'Share mathematical posts regularly and allow your server to suggest your profile. Recommendations depend on recent activity, topic fit and review. For help or removal, contact @mawkingbird@mastodon.social.',
      },
    ],
  },
  de: {
    title: 'Mathematik auf Mastodon: Menschen und Hashtags finden',
    description:
      'Forschung, Unterricht, Knobeleien und mathematische Kunst auf Mastodon. Wähle Menschen und Hashtags für deinen Feed und probiere die Vorschau aus.',
    heading: 'Mathematik auf Mastodon',
    listTitle: 'Mathematik',
    intro: [
      'Ein eleganter Beweis, eine knifflige Aufgabe oder eine Zeichnung, die den Groschen fallen lässt: Mathematik hat viele Zugänge. Hier geht es um Forschung, Unterricht und die Freude am Knobeln.',
      'Such dir Menschen und Hashtags aus und schau in die Vorschau. Öffentliche Beiträge kannst du ohne Anmeldung lesen; wem du folgen möchtest, entscheidest du danach.',
    ],
    faq: [
      {
        q: 'Brauche ich ein Konto?',
        a: 'Die Empfehlungen und die Vorschau öffentlicher Beiträge kannst du ohne Konto ansehen. Um Menschen und Hashtags zu folgen oder eine Mastodon-Liste anzulegen, meldest du dich mit deinem Mastodon-Konto an.',
      },
      {
        q: 'Muss ich Mathematik studiert haben?',
        a: 'Nein. Unterrichtsideen, Rätsel, mathematische Kunst und Erklärungen gehören ebenso dazu wie Forschung. Manche Beiträge setzen Fachwissen voraus. Mit der Vorschau findest du heraus, was dich anspricht.',
      },
      {
        q: 'Wie komme ich auf diese Liste?',
        a: 'Schreib regelmäßig über Mathematik und erlaube deinem Server, dein Profil vorzuschlagen. Auch aktuelle Aktivität, Themenbezug und die Prüfung zählen. Bei Fragen oder für eine Entfernung erreichst du @mawkingbird@mastodon.social.',
      },
    ],
  },
  fr: {
    title: 'Mathématiques sur Mastodon : comptes et hashtags à suivre',
    description:
      'Recherche, enseignement, énigmes et art mathématique sur Mastodon. Choisis des comptes et des hashtags, puis essaie l’aperçu de ton fil.',
    heading: 'Les mathématiques sur Mastodon',
    listTitle: 'Mathématiques',
    intro: [
      'Une preuve astucieuse, une énigme qui résiste, un dessin qui éclaire une notion : les maths se partagent de bien des façons. Cette sélection fait place à la recherche, à l’enseignement et aux maths récréatives.',
      'Choisis les comptes et les hashtags qui t’intéressent, puis regarde l’aperçu. Tu peux lire les publications publiques sans te connecter et affiner tes choix avant de t’abonner.',
    ],
    faq: [
      {
        q: 'Faut-il un compte ?',
        a: 'Non pour parcourir les recommandations et l’aperçu des publications publiques. Pour suivre des comptes et des hashtags ou créer une liste Mastodon, connecte-toi avec ton compte Mastodon.',
      },
      {
        q: 'Faut-il faire de la recherche en maths ?',
        a: 'Non. Les énigmes, les explications, l’enseignement et l’art mathématique ont aussi leur place. Certains échanges demandent des connaissances spécialisées ; l’aperçu t’aide à trouver ce qui te plaît.',
      },
      {
        q: 'Comment apparaître sur cette liste ?',
        a: 'Publie régulièrement sur les mathématiques et autorise ton serveur à suggérer ton profil. L’activité récente, le lien avec le sujet et la vérification comptent aussi. Pour une question ou un retrait, contacte @mawkingbird@mastodon.social.',
      },
    ],
  },
};
