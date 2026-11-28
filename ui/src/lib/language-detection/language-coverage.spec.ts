import { describe, expect, it } from 'vitest';
import corpus from './corpus.json';
import {
  analyzeLanguage,
  detectLanguage,
  excludesLanguages,
  LANG_NAMES,
  languageIdentity,
} from './index';

describe('language coverage and Malay/Indonesian ambiguity', () => {
  it('has a passing positive outcome for every named language', () => {
    for (const code of Object.keys(LANG_NAMES).filter((code) => code !== 'und')) {
      const cases = corpus.filter((c) => c.lang === code);
      expect(cases.length, code).toBeGreaterThan(0);
      for (const c of cases) expect(analyzeLanguage(c.text).language, c.text).toBe(code);
    }
  });
  it('retains shared Malay/Indonesian grammar as complete alternatives', () => {
    const result = analyzeLanguage('Saya membaca buku ini dengan mereka.');
    expect(result.language).toBeNull();
    expect(detectLanguage('Saya membaca buku ini dengan mereka.', 'en')).toEqual([
      { lang: 'und', share: 1 },
    ]);
    expect(result.candidates).toEqual(['id', 'ms']);
    expect(result.candidatesComplete).toBe(true);
    expect(excludesLanguages(result, ['en', 'de'])).toBe(true);
    expect(excludesLanguages(result, ['ms'])).toBe(false);
    expect(excludesLanguages(result, ['id'])).toBe(false);
  });
  it('uses independent grammar and vocabulary to resolve the pair', () => {
    expect(
      analyzeLanguage('Saya membaca buku ini dengan mereka kerana ceritanya menarik.').language,
    ).toBe('ms');
    expect(
      analyzeLanguage('Saya membaca buku ini dengan mereka karena ceritanya menarik.').language,
    ).toBe('id');
    expect(
      analyzeLanguage('Saya membaca buku ini dengan mereka kerana karena').language,
    ).toBeNull();
  });
  it('does not turn weak or conflicting clues into foreign certainty', () => {
    for (const text of [
      'saya',
      'saya saya saya',
      'Kuala Lumpur',
      'ok lol',
      'because saya ini dengan',
    ]) {
      expect(excludesLanguages(analyzeLanguage(text), ['en']), text).toBe(false);
    }
    expect(
      excludesLanguages(analyzeLanguage('Saya membaca buku ini dengan mereka.', true), ['en']),
    ).toBe(false);
  });
  it('normalizes reading identities', () => {
    expect(languageIdentity('fil-PH')).toBe('tl');
    expect(languageIdentity('nb-NO')).toBe('no');
    expect(languageIdentity('ms-MY')).toBe('ms');
    expect(
      excludesLanguages(analyzeLanguage('Ang mga kaibigan namin ay hindi nandito ngayon.'), [
        'fil',
      ]),
    ).toBe(false);
  });
});
