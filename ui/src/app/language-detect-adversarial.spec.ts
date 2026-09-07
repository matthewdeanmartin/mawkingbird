import { describe, expect, it } from 'vitest';
import corpus from './language-detect.corpus.json';
import { confidentLanguage, detectLanguage, detectScriptCandidates } from './language-detect';

describe('conservative language detection', () => {
  it.each(corpus)('$lang: $text', ({ lang, text }) => {
    expect(detectLanguage(text)).toEqual([{ lang, share: 1 }]);
    expect(confidentLanguage(text)).toBe(lang === 'und' ? null : lang);
  });

  it.each(corpus.filter(({ lang }) => lang !== 'und'))(
    'preserves $lang under normalization and irrelevant identifiers: $text',
    ({ lang, text }) => {
      for (const version of [
        text.normalize('NFD'),
        text.toUpperCase(),
        text + ' https://host.test/日本語 @Łódź :emoji_name:',
      ]) {
        expect(detectLanguage(version)).toEqual([{ lang, share: 1 }]);
      }
    },
  );

  it('does not invent minority languages from losing lexical guesses', () => {
    expect(detectLanguage('This is the book that we read with our friends in São Paulo.')).toEqual([
      { lang: 'en', share: 1 },
    ]);
  });

  it('keeps script evidence visible without letting one character relabel English', () => {
    const result = detectLanguage('This is the story that we read with our friends. 中');
    expect(result[0].lang).toBe('en');
    expect(result.some(({ lang }) => lang === 'und')).toBe(true);
    expect(detectScriptCandidates('中')).toEqual(['zh', 'ja']);
  });

  it('keeps genuinely mixed text from becoming a confident single language', () => {
    const text =
      'We are reading this book with our friends today.\nこれは日本語で書かれた文章です。今日は新しい本を読んでいます。';
    expect(confidentLanguage(text)).toBeNull();
    expect(
      detectLanguage(text)
        .map(({ lang }) => lang)
        .sort(),
    ).toEqual(['en', 'ja']);
  });

  it('never turns short script evidence into a competing metadata vote', () => {
    expect(detectLanguage('これはテスト', 'en')).toEqual([{ lang: 'ja', share: 1 }]);
    expect(detectLanguage('Привіт світ як справи', 'ru')).toEqual([{ lang: 'uk', share: 1 }]);
    expect(detectLanguage('這是中文', 'en')).toEqual([{ lang: 'zh', share: 1 }]);
    expect(detectLanguage('123', 'en')).toEqual([{ lang: 'und', share: 1 }]);
  });

  it('does not turn unsupported metadata or inherited object keys into languages', () => {
    for (const hint of ['xx', 'constructor', '__proto__', 'toString']) {
      expect(detectLanguage('xyzzy', hint)).toEqual([{ lang: 'und', share: 1 }]);
    }
    expect(detectLanguage('東京', 'zh-Hant')).toEqual([{ lang: 'zh', share: 1 }]);
  });

  it('handles compatibility kana, extended Han, and vocalized Arabic', () => {
    expect(confidentLanguage('ｺﾝﾆﾁﾊ')).toBe('ja');
    expect(detectScriptCandidates('𠮷野家')).toEqual(['zh', 'ja']);
    expect(confidentLanguage('هَذَا كِتَابٌ فِي الْمَكْتَبَةِ')).toBe('ar');
  });

  it('does not use first-match-wins when distinctive spellings conflict', () => {
    expect(detectScriptCandidates('Straße Łódź')).toEqual([]);
    expect(confidentLanguage('Straße Łódź')).toBeNull();
    expect(detectScriptCandidates('São')).toEqual([]);
    expect(confidentLanguage('ã õ')).toBeNull();
  });

  it.each([
    '這是中文，我們今天閱讀這本書。あ',
    '這是中文，我們今天閱讀這本書。가',
    'Это русский текст, который мы читаем сегодня. ї',
    'هذا كتاب جديد ونحن نقرأ هذه القصة في المكتبة اليوم این است',
  ])('abstains when an injected cue conflicts with established script evidence: %s', (text) => {
    expect(confidentLanguage(text)).toBeNull();
  });
});
