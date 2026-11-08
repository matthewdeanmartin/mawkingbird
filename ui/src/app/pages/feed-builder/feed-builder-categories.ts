import { PageLanguage } from '../../focused-tools';
import { FEED_BUILDER_TOPICS, FeedTopic } from './feed-builder-registry';

/**
 * The communities hubs' two tiers: big categories in the left rail, topic
 * pages inside them.
 *
 * Categories are declared ahead of the topics that will fill them (Music
 * before there is a K-pop or a classical page), and the hub shows a category
 * only once at least one topic sits in it. Every topic must be filed: the
 * `Record<FeedTopic, …>` below stops a new topic in feed-builder-paths.json
 * from type-checking until it has a category, and feed-builder-categories.spec.ts
 * says so in words.
 *
 * Imported by the hub component only, which is lazy-loaded, so none of this
 * reaches the startup bundle.
 */
export const HUB_CATEGORIES = [
  'tech',
  'science',
  'society',
  'culture',
  'music',
  'games-and-sport',
  'nature',
  'home-and-garden',
  'food-and-drink',
] as const;

export type HubCategory = (typeof HUB_CATEGORIES)[number];

export const TOPIC_CATEGORY: Record<FeedTopic, HubCategory> = {
  dmv: 'society',
  retrocomputing: 'tech',
  'esp32-and-single-board-computers': 'tech',
  math: 'science',
  'space-and-astronomy': 'science',
  'science-fiction': 'culture',
  'gardening-and-houseplants': 'home-and-garden',
  'plant-based-living': 'food-and-drink',
};

/** Categories with at least one topic, in rail order, each with its topics in registry order. */
export function filledCategories(
  topics: readonly FeedTopic[] = FEED_BUILDER_TOPICS,
): { id: HubCategory; topics: FeedTopic[] }[] {
  return HUB_CATEGORIES.map((id) => ({
    id,
    topics: topics.filter((topic) => TOPIC_CATEGORY[topic] === id),
  })).filter((category) => category.topics.length > 0);
}

/** The words the hub's rail and language filter need, per hub language. */
export interface HubNavWords {
  categories: Record<HubCategory, string>;
  /** The rail's first entry: the compact list of every topic. */
  allTopics: string;
  /** Accessible name of the rail. */
  railLabel: string;
  /** The phone's button that opens the rail as a drawer, and the drawer's title. */
  openRail: string;
  closeRail: string;
  /** The language filter. */
  language: string;
  everyLanguage: string;
  /** Beside a topic shown in English because it has no page in the chosen language. */
  inEnglish: string;
}

const EN: HubNavWords = {
  categories: {
    tech: 'Tech',
    science: 'Science',
    society: 'Society',
    culture: 'Arts and culture',
    music: 'Music',
    'games-and-sport': 'Games and sport',
    nature: 'Nature and animals',
    'home-and-garden': 'Home and garden',
    'food-and-drink': 'Food and drink',
  },
  allTopics: 'All topics',
  railLabel: 'Categories',
  openRail: 'Categories',
  closeRail: 'Close categories',
  language: 'Language',
  everyLanguage: 'Every language',
  inEnglish: 'in English',
};

export const HUB_NAV_WORDS: Partial<Record<PageLanguage, HubNavWords>> = {
  en: EN,
  de: {
    categories: {
      tech: 'Technik',
      science: 'Wissenschaft',
      society: 'Gesellschaft',
      culture: 'Kunst und Kultur',
      music: 'Musik',
      'games-and-sport': 'Spiele und Sport',
      nature: 'Natur und Tiere',
      'home-and-garden': 'Haus und Garten',
      'food-and-drink': 'Essen und Trinken',
    },
    allTopics: 'Alle Themen',
    railLabel: 'Kategorien',
    openRail: 'Kategorien',
    closeRail: 'Kategorien schließen',
    language: 'Sprache',
    everyLanguage: 'Alle Sprachen',
    inEnglish: 'auf Englisch',
  },
  fr: {
    categories: {
      tech: 'Technologie',
      science: 'Sciences',
      society: 'Société',
      culture: 'Arts et culture',
      music: 'Musique',
      'games-and-sport': 'Jeux et sport',
      nature: 'Nature et animaux',
      'home-and-garden': 'Maison et jardin',
      'food-and-drink': 'Cuisine et boissons',
    },
    allTopics: 'Tous les sujets',
    railLabel: 'Catégories',
    openRail: 'Catégories',
    closeRail: 'Fermer les catégories',
    language: 'Langue',
    everyLanguage: 'Toutes les langues',
    inEnglish: 'en anglais',
  },
  es: {
    categories: {
      tech: 'Tecnología',
      science: 'Ciencia',
      society: 'Sociedad',
      culture: 'Arte y cultura',
      music: 'Música',
      'games-and-sport': 'Juegos y deporte',
      nature: 'Naturaleza y animales',
      'home-and-garden': 'Casa y jardín',
      'food-and-drink': 'Comida y bebida',
    },
    allTopics: 'Todos los temas',
    railLabel: 'Categorías',
    openRail: 'Categorías',
    closeRail: 'Cerrar categorías',
    language: 'Idioma',
    everyLanguage: 'Todos los idiomas',
    inEnglish: 'en inglés',
  },
  it: {
    categories: {
      tech: 'Tecnologia',
      science: 'Scienza',
      society: 'Società',
      culture: 'Arte e cultura',
      music: 'Musica',
      'games-and-sport': 'Giochi e sport',
      nature: 'Natura e animali',
      'home-and-garden': 'Casa e giardino',
      'food-and-drink': 'Cibo e bevande',
    },
    allTopics: 'Tutti gli argomenti',
    railLabel: 'Categorie',
    openRail: 'Categorie',
    closeRail: 'Chiudi le categorie',
    language: 'Lingua',
    everyLanguage: 'Tutte le lingue',
    inEnglish: 'in inglese',
  },
  ja: {
    categories: {
      tech: 'テクノロジー',
      science: '科学',
      society: '社会',
      culture: 'アートとカルチャー',
      music: '音楽',
      'games-and-sport': 'ゲームとスポーツ',
      nature: '自然と動物',
      'home-and-garden': '住まいと庭',
      'food-and-drink': '食べ物と飲み物',
    },
    allTopics: 'すべてのトピック',
    railLabel: 'カテゴリー',
    openRail: 'カテゴリー',
    closeRail: 'カテゴリーを閉じる',
    language: '言語',
    everyLanguage: 'すべての言語',
    inEnglish: '英語',
  },
};

/** The hub words for `lang`, English when that hub has none yet. */
export function hubNavWordsFor(lang: string): HubNavWords {
  return HUB_NAV_WORDS[lang as PageLanguage] ?? EN;
}

/**
 * The first of the reader's languages that has topic pages, else English.
 * Matches on the primary subtag, so `de-AT` finds the German pages.
 */
export function preferredHubLanguage(
  browserLanguages: readonly string[],
  available: readonly string[],
): string {
  for (const tag of browserLanguages) {
    const primary = tag.toLowerCase().split('-')[0];
    if (available.includes(primary)) return primary;
  }
  return 'en';
}
