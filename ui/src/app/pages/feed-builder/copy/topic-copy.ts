import { PageLanguage } from '../../../focused-tools';
import { FeedTopic } from '../feed-builder-registry';

/** A topic page's own words in one language; the people and tags come from data. */
export interface TopicCopy {
  /** The document title, written for the searcher ("…: who and what to follow"). */
  title: string;
  /** Meta description, under 160 characters. */
  description: string;
  heading: string;
  /** The Mastodon list "Convert to list" makes: the topic, short. */
  listTitle: string;
  intro: string[];
  faq: { q: string; a: string }[];
}

/** One lazy chunk per topic: a topic's copy loads only with its pages. */
const COPY_LOADERS: Record<
  FeedTopic,
  () => Promise<{ COPY: Partial<Record<PageLanguage, TopicCopy>> }>
> = {
  'esp32-and-single-board-computers': () => import('./esp32-and-single-board-computers'),
  'gardening-and-houseplants': () => import('./gardening-and-houseplants'),
  'plant-based-living': () => import('./plant-based-living'),
  math: () => import('./math'),
  'science-fiction': () => import('./science-fiction'),
  'space-and-astronomy': () => import('./space-and-astronomy'),
};

export async function loadTopicCopy(topic: FeedTopic, lang: PageLanguage): Promise<TopicCopy> {
  const copy = (await COPY_LOADERS[topic]()).COPY[lang];
  if (!copy) throw new Error(`No ${lang} copy for Feed Builder topic ${topic}`);
  return copy;
}
