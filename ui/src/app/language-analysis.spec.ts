import { describe, expect, it } from 'vitest';
import { analyzeLanguage, detectLanguage, segmentLanguageText } from '../language-detection';
import corpus from './language-detect.corpus.json';

const ENGLISH = 'This is the book that we read with our friends.';
const DUTCH =
  'Dit is een boek dat ik voor mijn vrienden heb gevonden en het wordt ook morgen gelezen.';
const GERMAN = corpus.find(({ text }) => text.startsWith('7 von 10'))!.text;

describe('language analysis and explanations', () => {
  it.each(corpus.filter(({ lang }) => lang !== 'und'))(
    'explains established $lang prose: $text',
    ({ lang, text }) => {
      const result = analyzeLanguage(text);
      expect(result.language).toBe(lang);
      expect(result.candidates).toEqual([lang]);
      expect(result.candidatesComplete).toBe(true);
      expect(result.reasons).toEqual([]);
      expect(result.evidence.length).toBeGreaterThan(0);
    },
  );

  it('separates the reported German prose from English marketing hashtags and link labels', () => {
    const text =
      GERMAN +
      '\n\n[#ITConsulting](https://mstdn.social/tags/ITConsulting) #AI #ContentOptimization\n' +
      `[${ENGLISH}](https://example.test/article)`;
    const result = analyzeLanguage(text);
    expect(result.language).toBe('de');
    expect(result.prose.language).toBe('de');
    expect(detectLanguage(text)).toEqual([{ lang: 'de', share: 1 }]);
    expect(
      result.segments.some((s) => s.kind === 'link' && s.language === 'en' && !s.included),
    ).toBe(true);
    expect(result.segments.filter((s) => s.kind === 'hashtag')).toHaveLength(3);
    expect(result.segments.filter((s) => s.kind === 'hashtag').every((s) => !s.included)).toBe(
      true,
    );
  });

  it.each([
    `${ENGLISH}\n> ${DUTCH}`,
    `${ENGLISH} “${DUTCH}”`,
    `${ENGLISH} "${DUTCH}"`,
    `${ENGLISH} «${DUTCH}»`,
    `${ENGLISH} 「${DUTCH}」`,
  ])('preserves a foreign quotation as readable content: %s', (text) => {
    const result = analyzeLanguage(text);
    expect(result.prose.language).toBe('en');
    expect(result.language).toBeNull();
    expect(result.candidates).toEqual(['en', 'nl']);
    expect(result.candidatesComplete).toBe(true);
    expect(result.reasons).toContain('mixed-languages');
    expect(result.segments.find((s) => s.kind === 'quote')?.language).toBe('nl');
  });

  it('preserves unquoted mixed prose and quotation-only posts', () => {
    expect(analyzeLanguage(`${ENGLISH}\n${DUTCH}`).candidates).toEqual(['en', 'nl']);
    expect(analyzeLanguage(`> ${DUTCH}`).language).toBe('nl');
    expect(analyzeLanguage(`> ${DUTCH}`).prose.language).toBeNull();
  });

  it('does not split contractions or count code as a quotation', () => {
    expect(
      segmentLanguageText("I don't think they've finished.").every((s) => s.kind === 'prose'),
    ).toBe(true);
    expect(analyzeLanguage(`${ENGLISH} \x60"${DUTCH}"\x60`).language).toBe('en');
    expect(analyzeLanguage(`\x60\x60\x60\n${DUTCH}\n\x60\x60\x60`).reasons).toEqual(['no-text']);
  });

  it('diagnoses weak clues without treating a singleton candidate as established', () => {
    const result = analyzeLanguage('because');
    expect(result.language).toBeNull();
    expect(result.candidates).toEqual(['en']);
    expect(result.candidatesComplete).toBe(false);
    expect(result.reasons).toEqual(['insufficient-clues']);
    expect(result.evidence).toContainEqual({ kind: 'word', value: 'because', candidates: ['en'] });
    expect(analyzeLanguage('xyzzy').candidates).toEqual([]);
  });

  it('distinguishes corroborated multiple languages from weak conflicting clues', () => {
    const complete = analyzeLanguage('because which these het een voor');
    expect(complete.language).toBeNull();
    expect(complete.candidates).toEqual(['en', 'nl']);
    expect(complete.candidatesComplete).toBe(true);
    expect(complete.reasons).toEqual(['conflicting-clues']);
    const weak = analyzeLanguage('because het');
    expect(weak.candidates).toEqual(['en', 'nl']);
    expect(weak.candidatesComplete).toBe(false);
  });

  it('exposes shared spelling and shared-script candidates without closing their sets', () => {
    const marks = analyzeLanguage('ä ö');
    expect(marks.candidates).toEqual(['de', 'fi', 'is', 'sv']);
    expect(marks.candidatesComplete).toBe(false);
    expect(marks.evidence.some((e) => e.kind === 'spelling' && e.value === 'ö')).toBe(true);
    const han = analyzeLanguage('東京');
    expect(han.candidates).toEqual(['ja', 'ko', 'zh']);
    expect(han.candidatesComplete).toBe(false);
    expect(han.reasons).toEqual(['shared-script']);
    expect(analyzeLanguage('Москва').candidates).toEqual(['ru', 'uk']);
    expect(analyzeLanguage('مصر').candidates).toEqual(['ar', 'fa']);
    expect(analyzeLanguage(`${ENGLISH} Müller`).candidates).not.toContain('en');
  });

  it.each(['ꦲꦤꦕꦫꦏ', 'Ово је српски текст', 'یہ اردو زبان کا متن ہے', 'ৰৱ'])(
    'diagnoses unsupported writing: %s',
    (text) => {
      const result = analyzeLanguage(text);
      expect(result.language).toBeNull();
      expect(result.candidatesComplete).toBe(false);
      expect(result.reasons).toContain('unsupported-script');
    },
  );

  it('does not certify truncated text or unexamined segments', () => {
    const result = analyzeLanguage(ENGLISH.repeat(1000));
    expect(result.language).toBeNull();
    expect(result.candidatesComplete).toBe(false);
    expect(result.reasons).toContain('truncated');
    expect(
      analyzeLanguage(
        Array.from({ length: 1000 }, () => ({ kind: 'prose' as const, text: ENGLISH })),
      ).reasons,
    ).toContain('truncated');
  });

  it('examines link-only and hashtag-only posts instead of discarding all their content', () => {
    const linked = analyzeLanguage(`[${ENGLISH}](https://example.test)`);
    expect(linked.language).toBe('en');
    expect(linked.prose.language).toBeNull();
    expect(analyzeLanguage('#Straße').language).toBe('de');
    expect(analyzeLanguage('https://example.test/#これは日本語').reasons).toEqual(['no-text']);
  });
});
