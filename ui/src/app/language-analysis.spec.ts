import { describe, expect, it } from 'vitest';
import {
  analyzeLanguage,
  detectLanguage,
  DISCRIMINATING_WORDS,
  segmentLanguageText,
} from '../language-detection';
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

  it('recognizes Vietnamese from several distinct tone-marked words', () => {
    const text = 'Buổi sáng đẹp, hẹn gặp lại!';
    expect(analyzeLanguage(text).language).toBe('vi');
    expect(detectLanguage(text, 'en')).toEqual([{ lang: 'vi', share: 1 }]);
    expect(detectLanguage(text.normalize('NFD'), 'en')).toEqual([{ lang: 'vi', share: 1 }]);
  });

  it('does not label an accented hashtag as English from metadata', () => {
    expect(detectLanguage('#SãoPaulo', 'en')).toEqual([{ lang: 'und', share: 1 }]);
    const result = analyzeLanguage('#SãoPaulo');
    expect(result.language).toBeNull();
    expect(result.candidates).toEqual(['pt', 'vi']);
    expect(result.candidatesComplete).toBe(false);
    expect(analyzeLanguage(`${ENGLISH} #SãoPaulo`).language).toBe('en');
  });

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

/** A real Brazilian post that reached an English-only feed with the wrong declaration. */
const REPORTED_PORTUGUESE_LINES = [
  'Deixa eu falar um negócio pra vcs',
  'Usar Linux, estar no fediverso, usar software livre etc não te faz melhor do que ninguém',
  'Essa conversa de superioridade moral é justamente o que impede mais pessoas de chegarem no movimento',
  'Deixa as pessoa',
  'Pela atenção, obrig',
];

describe('line-broken posts with thin evidence per line', () => {
  it('reads the reported Portuguese post as Portuguese, one segment per line', () => {
    const result = analyzeLanguage(REPORTED_PORTUGUESE_LINES.join('\n'));
    expect(result.segments.filter((s) => s.kind === 'prose')).toHaveLength(5);
    expect(result.language).toBe('pt');
    expect(result.candidatesComplete).toBe(true);
    expect(result.prose.language).toBe('pt');
    expect(result.ruledOut).toContain('en');
    expect(result.ruledOut).not.toContain('pt');
  });

  it('does not count the Romance pronoun "te" as Dutch', () => {
    expect(DISCRIMINATING_WORDS.get('te')).toBeUndefined();
    expect(analyzeLanguage(REPORTED_PORTUGUESE_LINES[1]).candidates).toEqual(['pt']);
  });

  it('gives blank, punctuation-only, digit-only and emoji-only lines no vote', () => {
    const result = analyzeLanguage(`${ENGLISH}\n\n...\n!!!\n123 456\n😀😀\n${ENGLISH}`);
    expect(result.language).toBe('en');
    expect(result.segments.filter((s) => s.included)).toHaveLength(2);
  });

  it('lets a line with words but no clues abstain instead of vetoing', () => {
    expect(analyzeLanguage(`${ENGLISH}\nok`).language).toBe('en');
    expect(analyzeLanguage(`${DUTCH}\nhaha`).language).toBe('nl');
  });

  it('still vetoes on lines with conflicting or unsupported evidence', () => {
    expect(analyzeLanguage(`${ENGLISH}\n${DUTCH}`).language).toBeNull();
    expect(analyzeLanguage(`${ENGLISH}\nیہ اردو ہے`).language).toBeNull();
    expect(analyzeLanguage(`${ENGLISH}\nnão sei mas estoy feliz`).language).toBeNull();
  });

  it('pools undecided lines, so short lines add up rather than each falling short', () => {
    const result = analyzeLanguage('Bom dia!\nHoje vou à praia com a minha família.\nAté mais!');
    expect(result.segments.every((s) => s.language === null)).toBe(true);
    expect(result.language).toBe('pt');
  });
});

describe('ruling languages out by their letters', () => {
  it('rules out languages whose script is absent', () => {
    const cyrillic = analyzeLanguage('Москва Киев Минск');
    expect(cyrillic.language).toBeNull();
    expect(cyrillic.ruledOut).toEqual(expect.arrayContaining(['en', 'pt', 'ja', 'zh', 'el']));
    expect(cyrillic.ruledOut).not.toContain('ru');
    expect(cyrillic.ruledOut).not.toContain('uk');
    expect(analyzeLanguage(ENGLISH).ruledOut).toEqual(expect.arrayContaining(['ja', 'ru']));
    expect(analyzeLanguage(ENGLISH).ruledOut).not.toContain('en');
  });

  it('rules out English for accented text when another language has a clue', () => {
    const mixed = analyzeLanguage('não sei, mas é muito bom\nestoy feliz com a atenção');
    expect(mixed.language).toBeNull();
    expect(mixed.ruledOut).toContain('en');
    expect(mixed.ruledOut).not.toContain('pt');
  });

  it.each([
    'Visited Belém and São Paulo with my friend Conceição.',
    'I had a café au lait at the Champs-Élysées with José and Zoë',
    'Belém e São Paulo!!',
    'naïve café',
    'ok lol',
  ])('keeps English open for borrowed spellings: %s', (text) => {
    expect(analyzeLanguage(text).ruledOut).not.toContain('en');
  });

  it('never rules out a Latin language by spelling without its word table', () => {
    expect(
      analyzeLanguage('não sei, mas é muito bom\nestoy feliz com a atenção').ruledOut,
    ).not.toContain('is');
    expect(analyzeLanguage('Москва Киев Минск').ruledOut).toContain('is');
  });

  it('accepts every Vietnamese tone and vowel mark as Vietnamese', () => {
    const text = 'Buổi sáng đẹp, hẹn gặp lại!';
    expect(analyzeLanguage(text).ruledOut).not.toContain('vi');
    expect(analyzeLanguage(text.normalize('NFD')).ruledOut).not.toContain('vi');
  });
});
