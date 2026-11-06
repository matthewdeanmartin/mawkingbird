import { PageLanguage } from '../../../focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  en: {
    title: 'Vegan and vegetarian communities on Mastodon | Plant Based Living',
    description:
      'Find welcoming vegan, vegetarian and plant-based people on Mastodon. Discover recipes, everyday tips and tags to build your own feed.',
    heading: 'Plant Based Living',
    listTitle: 'Plant Based Living',
    intro: [
      'A good meal, a useful ingredient swap, someone who understands cooking for a mixed household: small discoveries can make plant-based living easier. This starter kit brings together vegan and vegetarian voices with a practical, welcoming approach.',
      'Choose people and tags, then preview the feed before following. Whether you are vegan, vegetarian or simply curious about eating more plants, there is room to explore at your own pace.',
    ],
    faq: [
      {
        q: 'Do I need an account?',
        a: 'You can explore the recommendations and preview public posts without an account. To follow people and tags or create a Mastodon list, sign in with your Mastodon account.',
      },
      {
        q: 'What does positive mean here?',
        a: 'We look for helpful everyday ideas and constructive conversation. Accounts mainly sharing graphic animal suffering or using shock and shaming are outside this selection. Ethical discussion is welcome. Public tags and accounts can change, so preview your choices; this is a curated starting point, not a guarantee about every post.',
      },
      {
        q: 'How do I get onto this list?',
        a: 'Share useful vegan, vegetarian or plant-based posts regularly and allow your profile to be suggested in your server settings. Recommendations also depend on recent activity, topic fit and review. For help or removal, contact @mawkingbird@mastodon.social.',
      },
    ],
  },
  de: {
    title: 'Vegan und vegetarisch auf Mastodon: Menschen und Rezepte finden',
    description:
      'Entdecke vegane und vegetarische Rezepte, Alltagstipps und Menschen auf Mastodon. Stell dir einen Feed zusammen, der Lust auf pflanzliches Essen macht.',
    heading: 'Pflanzlich leben auf Mastodon',
    listTitle: 'Pflanzlich leben',
    intro: [
      'Was koche ich heute, und was nehme ich statt Ei oder Milch? Oft hilft ein Tipp von jemandem, der es schon ausprobiert hat. Hier findest du vegane und vegetarische Stimmen, die ihr Wissen teilen und neugierige Fragen willkommen heißen.',
      'Such dir Menschen und Hashtags aus und schau dir den Feed an, bevor du ihnen folgst. Ob du vegan lebst, vegetarisch isst oder öfter pflanzlich kochen möchtest: Du musst dich hier nicht erst auf ein Etikett festlegen.',
    ],
    faq: [
      {
        q: 'Brauche ich ein Konto?',
        a: 'Du kannst die Empfehlungen und die Vorschau öffentlicher Beiträge ohne Konto ansehen. Um Menschen und Hashtags zu folgen oder eine Mastodon-Liste anzulegen, meldest du dich mit deinem Mastodon-Konto an.',
      },
      {
        q: 'Was bedeutet hier positiv?',
        a: 'Wir wählen hilfreiche Alltagstipps und konstruktive Gespräche aus. Accounts, die überwiegend drastische Bilder von Tierleid verbreiten oder mit Schock und Beschämung arbeiten, passen nicht in diese Auswahl. Ethische Fragen sind willkommen. Öffentliche Hashtags und Accounts können sich verändern; die Vorschau hilft dir bei der Auswahl, ist aber keine Garantie für jeden künftigen Beitrag.',
      },
      {
        q: 'Wie komme ich auf diese Liste?',
        a: 'Teile regelmäßig hilfreiche Beiträge zum veganen, vegetarischen oder pflanzlichen Leben und erlaube deinem Server, dein Profil vorzuschlagen. Auch aktuelle Aktivität, Themenbezug und die Prüfung zählen. Bei Fragen oder für eine Entfernung erreichst du @mawkingbird@mastodon.social.',
      },
    ],
  },
};
