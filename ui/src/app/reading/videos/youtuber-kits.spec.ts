import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { packTitle, preferredKitLanguage, YOUTUBER_PATHS, YoutuberKits } from './youtuber-kits';

describe('preferredKitLanguage', () => {
  const available = { en: 12, de: 6, 'zh-Hant': 1, fr: 2 };

  it('takes the reader’s language, matching a region or script loosely', () => {
    expect(preferredKitLanguage(available, ['de'])).toBe('de');
    expect(preferredKitLanguage(available, ['fr-CA', 'en'])).toBe('fr');
    expect(preferredKitLanguage(available, ['zh-hant'])).toBe('zh-Hant');
  });

  it('falls back to English, then to the language with most kits', () => {
    expect(preferredKitLanguage(available, ['ja'])).toBe('en');
    expect(preferredKitLanguage({ de: 3, fr: 5 }, ['ja'])).toBe('fr');
    expect(preferredKitLanguage({}, ['en'])).toBeNull();
  });
});

describe('packTitle', () => {
  it('uses the reader’s language with an English fallback', () => {
    const pack = { title: { en: 'Technology', de: 'Technologie' } };
    expect(packTitle(pack, 'de')).toBe('Technologie');
    expect(packTitle(pack, 'de-AT')).toBe('Technologie');
    expect(packTitle(pack, 'ja')).toBe('Technology');
  });
});

describe('YoutuberKits', () => {
  it('knows the bundled languages without loading any kit data', () => {
    const kits = TestBed.inject(YoutuberKits);
    expect(kits.languages()).toEqual(YOUTUBER_PATHS.languages);
    expect(kits.available()).toBe(Object.keys(YOUTUBER_PATHS.languages).length > 0);
  });

  it('loads a language’s kits once, and nothing for a language it does not have', async () => {
    const kits = TestBed.inject(YoutuberKits);
    const lang = Object.keys(YOUTUBER_PATHS.languages)[0];
    if (!lang) return;
    const first = kits.packs(lang);
    expect(kits.packs(lang)).toBe(first);
    const packs = await first;
    expect(packs).toHaveLength(YOUTUBER_PATHS.languages[lang]);
    expect(typeof packs[0].members[0].bio).toBe('string');
    expect(await kits.packs('xx')).toEqual([]);
    expect(await kits.packs('../secrets')).toEqual([]);
  });
});
