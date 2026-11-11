import { describe, expect, it } from 'vitest';
import messages from './starter-pack-ui.json';
import catalog from './starter-catalog.generated.json';
import { starterPackText } from './starter-pack-text';

describe('starter-pack translations', () => {
  it('covers the current catalogue languages and preserves every interpolation', () => {
    const dictionaries: Record<string, Record<string, string>> = messages;
    const placeholders = (text: string) =>
      [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]).sort();
    for (const language of new Set(catalog.packs.map((pack) => pack.lang))) {
      const dictionary = dictionaries[language];
      expect(dictionary, language).toBeDefined();
      for (const [key, english] of Object.entries(messages.en)) {
        expect(dictionary[key], `${language}: ${key}`).toBeTruthy();
        expect(placeholders(dictionary[key]), `${language}: ${key}`).toEqual(placeholders(english));
      }
    }
    for (const pack of catalog.packs) {
      expect(
        (pack.title as Partial<Record<string, string>>)[pack.lang],
        `${pack.lang}/${pack.slug} title`,
      ).toBeTruthy();
      expect(
        (pack.blurb as Partial<Record<string, string>>)[pack.lang],
        `${pack.lang}/${pack.slug} blurb`,
      ).toBeTruthy();
    }
  });

  it('normalizes language tags and interpolates progress without an app dictionary', () => {
    expect(
      starterPackText('starterCollection.followingProgress', 'ru-RU', { completed: 2, total: 9 }),
    ).toBe('Подписываемся… 2/9');
    expect(starterPackText('starterCollection.followAll', 'xx', { count: 9 })).toBe('Follow all 9');
  });

  it('preserves Traditional Chinese scripts and regional variants', () => {
    for (const language of ['zh-Hant', 'zh-hant-TW', 'zh_TW', 'zh-HK']) {
      expect(starterPackText('starterCollection.browse', language)).toBe(
        messages['zh-Hant']['starterCollection.browse'],
      );
    }
    expect(starterPackText('starterCollection.browse', 'zh-CN')).toBe(
      messages.zh['starterCollection.browse'],
    );
  });
});
