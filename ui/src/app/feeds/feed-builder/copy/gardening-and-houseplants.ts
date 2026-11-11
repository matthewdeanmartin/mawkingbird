import { PageLanguage } from '../../../public-pages/focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  en: {
    title: 'Gardening and houseplants on Mastodon: people and tags to follow',
    description:
      'Grow a Mastodon feed full of gardens and houseplants. Find growers, plant care, succulents, greenhouses and hydroponics, then preview their posts.',
    heading: 'Gardening and houseplants on Mastodon',
    listTitle: 'Gardening and houseplants',
    intro: [
      'A windowsill full of succulents, a greenhouse experiment or a border coming into bloom: follow people sharing what they grow and how they care for it. Ornamental gardens, indoor plants and home vegetable patches all belong here.',
      'Choose people and hashtags, then preview their public posts. Useful plant subjects stay on the list even when their tags are quiet, so you can follow the things you want to see grow.',
    ],
    faq: [
      {
        q: 'Do I need an account?',
        a: 'You can browse and preview public posts without an account. Sign in with your Mastodon account to follow people and hashtags or create a list.',
      },
      {
        q: 'Does this include greenhouses and hydroponics?',
        a: 'Yes, along with houseplant care, propagation, decorative gardens and home food growing. Farming and animal husbandry are outside this selection. Some useful tags are quiet, while others have unrelated posts or ads; preview them to choose your mix.',
      },
      {
        q: 'How do I get onto this list?',
        a: 'Share gardening or houseplant posts regularly and allow your server to suggest your profile. Recent activity, sustained topic fit and review determine the selection. For help or removal, contact @mawkingbird@mastodon.social.',
      },
    ],
  },
  de: {
    title: 'Garten und Zimmerpflanzen auf Mastodon: Menschen und Hashtags',
    description:
      'Entdecke Menschen, die gärtnern, Zimmerpflanzen pflegen und mit Gewächshaus oder Hydrokultur experimentieren. Stell deinen Feed zusammen und teste die Vorschau.',
    heading: 'Garten und Zimmerpflanzen auf Mastodon',
    listTitle: 'Garten und Zimmerpflanzen',
    intro: [
      'Kakteen auf der Fensterbank, neue Triebe im Gewächshaus oder ein Beet voller Blüten: Hier teilen Menschen ihre Pflanzenfreude und ihre Erfahrungen beim Gärtnern. Auch der kleine Gemüsegarten gehört dazu.',
      'Wähle Menschen und Hashtags aus und schau dir die öffentlichen Beiträge in der Vorschau an. Nützliche Pflanzenthemen bleiben auch dann auswählbar, wenn unter dem Hashtag gerade wenig los ist.',
    ],
    faq: [
      {
        q: 'Brauche ich ein Konto?',
        a: 'Zum Stöbern und für die Vorschau öffentlicher Beiträge brauchst du kein Konto. Um Menschen und Hashtags zu folgen oder eine Liste anzulegen, meldest du dich mit deinem Mastodon-Konto an.',
      },
      {
        q: 'Sind Gewächshäuser und Hydrokultur dabei?',
        a: 'Ja, ebenso Zimmerpflanzen, Vermehrung, Ziergärten und Gemüseanbau im eigenen Garten. Landwirtschaft und Tierhaltung gehören nicht zu dieser Auswahl. Manche Hashtags sind ruhig, andere enthalten Werbung oder fremde Themen. Mit der Vorschau findest du deine Mischung.',
      },
      {
        q: 'Wie komme ich auf diese Liste?',
        a: 'Schreib regelmäßig über deinen Garten oder Zimmerpflanzen und erlaube deinem Server, dein Profil vorzuschlagen. Aktuelle Aktivität, dauerhafter Themenbezug und die Prüfung zählen. Bei Fragen oder für eine Entfernung erreichst du @mawkingbird@mastodon.social.',
      },
    ],
  },
  fr: {
    title: 'Jardinage et plantes d’intérieur sur Mastodon : qui suivre',
    description:
      'Compose ton fil Mastodon autour du jardinage et des plantes d’intérieur : succulentes, serres, hydroponie et conseils de culture. Essaie l’aperçu.',
    heading: 'Jardinage et plantes d’intérieur sur Mastodon',
    listTitle: 'Jardinage et plantes',
    intro: [
      'Des succulentes sur le rebord de la fenêtre, des boutures qui prennent ou un massif en fleurs : découvre des personnes qui partagent leurs cultures et leurs expériences. Plantes d’intérieur, jardins d’ornement et petits potagers ont leur place ici.',
      'Choisis des comptes et des hashtags, puis explore leurs publications publiques dans l’aperçu. Les thèmes utiles restent proposés même quand leur hashtag est peu actif, pour que tu puisses suivre ce qui t’intéresse.',
    ],
    faq: [
      {
        q: 'Faut-il un compte ?',
        a: 'Tu peux parcourir la sélection et lire les publications publiques dans l’aperçu sans compte. Connecte-toi avec ton compte Mastodon pour suivre des personnes et des hashtags ou créer une liste.',
      },
      {
        q: 'Les serres et l’hydroponie sont-elles incluses ?',
        a: 'Oui, avec les soins des plantes, la multiplication, les jardins d’ornement et le potager familial. L’agriculture et l’élevage sont hors sujet ici. Certains hashtags sont peu actifs, d’autres contiennent de la publicité ou des publications sans rapport. L’aperçu t’aide à choisir.',
      },
      {
        q: 'Comment apparaître sur cette liste ?',
        a: 'Publie régulièrement sur le jardinage ou les plantes d’intérieur et autorise ton serveur à suggérer ton profil. L’activité récente, la régularité du sujet et la vérification comptent aussi. Pour une question ou un retrait, contacte @mawkingbird@mastodon.social.',
      },
    ],
  },
};
