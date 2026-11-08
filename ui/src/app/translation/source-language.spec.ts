import { describe, expect, it } from 'vitest';
import { bareLanguage, languageDisplayName, toIso6393 } from './language-codes';
import { resolveSource } from './source-language';

const none = { language: null, candidates: [] };
const sure = (language: string) => ({ language, candidates: [language] });

describe('resolveSource', () => {
  it('uses the declared tag when nothing contradicts it (server allowed)', () => {
    expect(resolveSource('de', none, 'en')).toEqual({
      kind: 'source',
      source: 'de',
      fromTag: true,
    });
    expect(resolveSource('de-AT', sure('de'), 'en')).toEqual({
      kind: 'source',
      source: 'de',
      fromTag: true,
    });
  });

  it('trusts a confident detection over a contradicting tag, and says the tag is wrong', () => {
    expect(resolveSource('en', sure('de'), 'en')).toEqual({
      kind: 'source',
      source: 'de',
      fromTag: false,
    });
    expect(resolveSource('fr', sure('de'), 'en')).toEqual({
      kind: 'source',
      source: 'de',
      fromTag: false,
    });
  });

  it('reports a post confidently in the target language as the same language', () => {
    expect(resolveSource('en', sure('en'), 'en')).toEqual({ kind: 'same', language: 'en' });
    expect(resolveSource('de', sure('en'), 'en-GB')).toEqual({ kind: 'same', language: 'en' });
  });

  it('asks when the tag is the target (or missing) and detection is unsure', () => {
    expect(resolveSource('en', { language: null, candidates: ['nl', 'de', 'en'] }, 'en')).toEqual({
      kind: 'ask',
      candidates: ['nl', 'de'],
    });
    expect(resolveSource(null, none, 'en')).toEqual({ kind: 'ask', candidates: [] });
    expect(resolveSource('und', none, 'en')).toEqual({ kind: 'ask', candidates: [] });
  });
});

describe('language codes', () => {
  it('reduces tags to bare ISO 639-1', () => {
    expect(bareLanguage('pt_BR')).toBe('pt');
    expect(bareLanguage('EN-us')).toBe('en');
    expect(bareLanguage(null)).toBe('');
  });

  it('maps to Apertium three-letter codes', () => {
    expect(toIso6393('es')).toBe('spa');
    expect(toIso6393('en-GB')).toBe('eng');
    expect(toIso6393('xx')).toBeNull();
  });

  it('names languages the detector and the browser know', () => {
    expect(languageDisplayName('de')).toBe('German');
    expect(languageDisplayName('gl')).toBe('Galician');
  });
});
