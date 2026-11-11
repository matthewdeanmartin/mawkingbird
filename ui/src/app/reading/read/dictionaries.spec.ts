import { describe, expect, it } from 'vitest';
import {
  DICTIONARIES,
  dictionaryById,
  dictionaryUrl,
  isSingleWord,
  isValidDictionaryTemplate,
} from './dictionaries';

describe('what counts as a word worth defining', () => {
  it('accepts an ordinary word', () => {
    expect(isSingleWord('sesquipedalian')).toBe(true);
  });

  it('accepts accented and non-Latin words', () => {
    expect(isSingleWord('Schadenfreude')).toBe(true);
    expect(isSingleWord('café')).toBe(true);
    expect(isSingleWord('привет')).toBe(true);
    expect(isSingleWord('日本語')).toBe(true);
  });

  it('accepts hyphens and apostrophes inside a word', () => {
    expect(isSingleWord('well-being')).toBe(true);
    expect(isSingleWord("l'école")).toBe(true);
  });

  /** A phrase is the highlight case; offering both makes each harder to hit. */
  it('rejects anything with whitespace', () => {
    expect(isSingleWord('two words')).toBe(false);
    expect(isSingleWord('a\nb')).toBe(false);
  });

  it('rejects a stray one-character selection', () => {
    expect(isSingleWord('a')).toBe(false);
    expect(isSingleWord('')).toBe(false);
  });

  /** A selected URL, number or code fragment is not a lookup anyone asked for. */
  it('rejects numbers, URLs and punctuation-edged selections', () => {
    expect(isSingleWord('2026')).toBe(false);
    expect(isSingleWord('https://example.com')).toBe(false);
    expect(isSingleWord('word,')).toBe(false);
    expect(isSingleWord('-word')).toBe(false);
  });
});

describe('building a lookup URL', () => {
  const wiktionary = dictionaryById('wiktionary');

  it('encodes the word, because titles contain URL syntax', () => {
    expect(dictionaryUrl(wiktionary, 'a/b')).toBe('https://en.wiktionary.org/wiki/a%2Fb');
  });

  /**
   * The reason the language is threaded through at all: a reader looking up a
   * German word should land on the German entry, not the English one.
   */
  it('sends a German document to the German Wiktionary', () => {
    expect(dictionaryUrl(wiktionary, 'Zeitgeist', 'de')).toBe(
      'https://de.wiktionary.org/wiki/Zeitgeist',
    );
  });

  it('falls back to the default edition for a language it has no site for', () => {
    expect(dictionaryUrl(wiktionary, 'orð', 'is')).toBe('https://en.wiktionary.org/wiki/or%C3%B0');
  });

  it('ignores the language for a monolingual provider', () => {
    expect(dictionaryUrl(dictionaryById('merriam'), 'word', 'de')).toBe(
      'https://www.merriam-webster.com/dictionary/word',
    );
  });

  it('uses the reader’s own template for the custom provider', () => {
    expect(
      dictionaryUrl(dictionaryById('custom'), 'word', null, 'https://example.test/d/{word}'),
    ).toBe('https://example.test/d/word');
  });

  it('returns nothing when the custom template is unset or unusable', () => {
    const custom = dictionaryById('custom');
    expect(dictionaryUrl(custom, 'word')).toBeNull();
    expect(dictionaryUrl(custom, 'word', null, 'not a url')).toBeNull();
  });

  it('falls back to the default when the stored id is unknown', () => {
    expect(dictionaryById('a-provider-we-removed').id).toBe('wiktionary');
    expect(dictionaryById(null).id).toBe('wiktionary');
  });
});

describe('validating a custom template', () => {
  it('requires a {word} placeholder', () => {
    // Without it the lookup silently opens the same page every time, which
    // reads as a broken feature rather than a bad setting.
    expect(isValidDictionaryTemplate('https://example.test/dictionary')).toBe(false);
  });

  it('requires http or https', () => {
    expect(isValidDictionaryTemplate('javascript:alert({word})')).toBe(false);
    expect(isValidDictionaryTemplate('ftp://example.test/{word}')).toBe(false);
  });

  it('accepts an ordinary template', () => {
    expect(isValidDictionaryTemplate('https://example.test/d/{word}')).toBe(true);
    expect(isValidDictionaryTemplate('http://example.test/?q={word}')).toBe(true);
  });
});

describe('the catalogue itself', () => {
  it('offers a custom slot and real templates for the rest', () => {
    for (const entry of DICTIONARIES) {
      if (entry.id === 'custom') {
        expect(entry.url).toBe('');
        continue;
      }
      expect(isValidDictionaryTemplate(entry.url)).toBe(true);
    }
  });

  it('has a usable template for every language edition it claims', () => {
    for (const entry of DICTIONARIES) {
      for (const url of Object.values(entry.byLanguage ?? {})) {
        expect(isValidDictionaryTemplate(url)).toBe(true);
      }
    }
  });
});
