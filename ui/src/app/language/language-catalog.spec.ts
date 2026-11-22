import { describe, expect, it } from 'vitest';
import {
  bareLanguageCode,
  foldForSearch,
  LANGUAGE_CODES,
  languageName,
  languageOption,
  searchLanguages,
  suggestedLanguages,
} from './language-catalog';

describe('language catalog', () => {
  it('covers ISO 639-1 and Mastodon’s ISO 639-3 additions, once each', () => {
    expect(LANGUAGE_CODES).toContain('ms');
    expect(LANGUAGE_CODES).toContain('id');
    expect(LANGUAGE_CODES).toContain('eo');
    expect(LANGUAGE_CODES).toContain('tok');
    expect(LANGUAGE_CODES).toContain('ckb');
    expect(new Set(LANGUAGE_CODES).size).toBe(LANGUAGE_CODES.length);
  });

  it('names languages in the reader’s locale, falling back to English then the code', () => {
    expect(languageName('ms', 'en')).toBe('Malay');
    expect(languageName('de', 'de')).toBe('Deutsch');
    expect(languageName('tok', 'en')).toBe('Toki Pona');
    expect(languageName('qqq', 'en')).toBe('qqq');
  });

  it('keeps an endonym only when it differs from the displayed name', () => {
    expect(languageOption('ms', 'en').endonym).toBe('Melayu');
    expect(languageOption('eo', 'en').endonym).toBeUndefined();
  });

  it('folds accents and case for matching', () => {
    expect(foldForSearch('  Español ')).toBe('espanol');
    expect(bareLanguageCode('zh-Hant')).toBe('zh');
    expect(bareLanguageCode('PT_br')).toBe('pt');
  });

  describe('searchLanguages', () => {
    it('finds Malay by English name, endonym, and code', () => {
      for (const query of ['Malay', 'melayu', 'ms']) {
        expect(searchLanguages(query, 'en')[0]?.code, query).toBe('ms');
      }
    });

    it('finds a language by its name in the reader’s locale', () => {
      expect(searchLanguages('Deutsch', 'de')[0]?.code).toBe('de');
      expect(searchLanguages('Allemand', 'fr')[0]?.code).toBe('de');
    });

    it('ranks an exact code before prefix matches', () => {
      expect(searchLanguages('id', 'en')[0]?.code).toBe('id');
    });

    it('returns nothing for an empty query and respects the limit', () => {
      expect(searchLanguages('  ', 'en')).toEqual([]);
      expect(searchLanguages('a', 'en', 5).length).toBeLessThanOrEqual(5);
    });
  });

  describe('suggestedLanguages', () => {
    it('lists the user’s languages, then app languages, each code once', () => {
      const groups = suggestedLanguages('', ['eo', 'en-US'], ['en', 'de', 'zh-Hant', 'ms'], 'en');
      expect(groups.map((g) => g.kind)).toEqual(['yours', 'app']);
      expect(groups[0].options.map((o) => o.code)).toEqual(['en', 'eo']);
      expect(groups[1].options.map((o) => o.code).sort()).toEqual(['de', 'ms', 'zh']);
    });

    it('adds the current choice when it came from the finder', () => {
      const groups = suggestedLanguages('tok', ['en'], ['en'], 'en');
      expect(groups[0]).toEqual({ kind: 'current', options: [{ code: 'tok', name: 'Toki Pona' }] });
    });

    it('does not repeat a current choice that is already listed', () => {
      const groups = suggestedLanguages('en', ['en'], ['de'], 'en');
      expect(groups.map((g) => g.kind)).toEqual(['yours', 'app']);
    });

    it('drops empty and undetermined codes', () => {
      expect(suggestedLanguages('', ['', 'und'], [], 'en')).toEqual([]);
    });
  });
});
