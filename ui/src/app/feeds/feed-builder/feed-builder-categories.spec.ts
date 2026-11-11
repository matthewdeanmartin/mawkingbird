import { describe, expect, it } from 'vitest';
import {
  filledCategories,
  HUB_CATEGORIES,
  HUB_NAV_WORDS,
  preferredHubLanguage,
  TOPIC_CATEGORY,
} from './feed-builder-categories';
import { FEED_BUILDER_HUBS, FEED_BUILDER_TOPICS } from './feed-builder-registry';

describe('communities hub categories', () => {
  it('files every topic page under a declared category', () => {
    expect(TOPIC_CATEGORY['vietnam']).toBe('international-regions');
    expect(TOPIC_CATEGORY['malaysia']).toBe('international-regions');
    expect(TOPIC_CATEGORY['bicycling']).toBe('games-and-sport');
    expect(TOPIC_CATEGORY['literary-fiction']).toBe('culture');
    expect(TOPIC_CATEGORY['historical-fiction']).toBe('culture');
    expect(TOPIC_CATEGORY['mystery-and-crime']).toBe('culture');
    for (const topic of FEED_BUILDER_TOPICS) {
      expect(HUB_CATEGORIES, `${topic} needs a category`).toContain(TOPIC_CATEGORY[topic]);
    }
  });

  it('shows only categories that have a topic, in rail order', () => {
    const filled = filledCategories();
    expect(filled.flatMap((category) => category.topics).sort()).toEqual(
      [...FEED_BUILDER_TOPICS].sort(),
    );
    expect(filled.every((category) => category.topics.length > 0)).toBe(true);
    // Declared ahead of their topics, so not shown yet.
    expect(filled.map((category) => category.id)).not.toContain('music');
    expect(filled.find((category) => category.id === 'games-and-sport')?.topics).toContain(
      'running',
    );
    expect(filled.find((category) => category.id === 'society')?.topics).toContain('dmv');
    expect(filled.find((category) => category.id === 'culture')?.topics).toContain('romance-books');
    const order = filled.map((category) => HUB_CATEGORIES.indexOf(category.id));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('names every category in every hub language', () => {
    for (const { lang } of FEED_BUILDER_HUBS) {
      const words = HUB_NAV_WORDS[lang];
      expect(words, lang).toBeDefined();
      for (const id of HUB_CATEGORIES) expect(words!.categories[id], `${lang} ${id}`).toBeTruthy();
    }
  });

  it("picks the reader's first language that has pages, else English", () => {
    const available = ['en', 'de', 'fr'];
    expect(preferredHubLanguage(['de-AT', 'en'], available)).toBe('de');
    expect(preferredHubLanguage(['pt-BR', 'fr-CA'], available)).toBe('fr');
    expect(preferredHubLanguage(['pt-BR'], available)).toBe('en');
    expect(preferredHubLanguage([], available)).toBe('en');
  });
});
