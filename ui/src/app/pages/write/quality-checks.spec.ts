import { describe, expect, it } from 'vitest';
import { DEFAULT_PKM_VOCABULARY } from '../../pkm/pkm-tags';
import {
  QualityContext,
  capsRuns,
  hashtagsIn,
  readabilityBand,
  readingEase,
  repeatedWords,
  runQualityChecks,
} from './quality-checks';

function context(overrides: Partial<QualityContext> = {}): QualityContext {
  return {
    limit: 500,
    segments: ['a segment'],
    vocab: DEFAULT_PKM_VOCABULARY,
    ...overrides,
  };
}

/** Ordinary, blameless prose. Nothing should fire on this. */
const PLAIN =
  'I went to the shop today and bought some bread. The sun was out. ' +
  'It was a good walk, and I saw a cat on the way home.';

function ids(text: string, ctx: Partial<QualityContext> = {}): string[] {
  return runQualityChecks(text, context({ segments: [text], ...ctx })).map((f) => f.id);
}

describe('repeatedWords', () => {
  it('catches a doubled word', () => {
    expect(repeatedWords('this is is wrong')).toEqual(['is']);
  });

  it('is case-insensitive', () => {
    expect(repeatedWords('The the thing')).toEqual(['the']);
  });

  it('does not fire on a word that merely appears twice', () => {
    expect(repeatedWords('the cat sat on the mat')).toEqual([]);
  });
});

describe('capsRuns', () => {
  it('catches a run of shouted words', () => {
    expect(capsRuns('this is REALLY VERY IMPORTANT ok')).toEqual(['REALLY VERY IMPORTANT']);
  });

  it('leaves acronyms alone', () => {
    // A run is three or more, so ordinary initialisms never trip it.
    expect(capsRuns('the HTTP and TLS specs')).toEqual([]);
    expect(capsRuns('NASA said so')).toEqual([]);
  });

  it('leaves ordinary prose alone', () => {
    expect(capsRuns(PLAIN)).toEqual([]);
  });
});

describe('hashtagsIn', () => {
  it('lowercases and counts every tag', () => {
    expect(hashtagsIn('#Rust and #rust and #Go')).toEqual(['#rust', '#rust', '#go']);
  });
});

describe('readingEase', () => {
  it('declines to score anything too short to mean much', () => {
    // A two-sentence post has no meaningful readability, and printing a number
    // invites editing toward a statistic.
    expect(readingEase('Short post.')).toBeNull();
    expect(readingEase(PLAIN)).toBeNull();
  });

  it('scores a long plain body as easier than a long dense one', () => {
    const plain = `${PLAIN} `.repeat(4);
    const dense = (
      'The instantiation of heterogeneous infrastructural methodologies necessitates ' +
      'comprehensive reconsideration of organisational epistemologies, particularly where ' +
      'institutional stakeholders demonstrate insufficient familiarity with the underlying ' +
      'architectural paradigms that characterise contemporary implementations. '
    ).repeat(3);
    const plainScore = readingEase(plain);
    const denseScore = readingEase(dense);

    expect(plainScore).not.toBeNull();
    expect(denseScore).not.toBeNull();
    expect(plainScore!).toBeGreaterThan(denseScore!);
  });

  it('stays inside 0–100', () => {
    const score = readingEase(`${PLAIN} `.repeat(6));
    expect(score!).toBeGreaterThanOrEqual(0);
    expect(score!).toBeLessThanOrEqual(100);
  });

  it('ignores URLs and hashtags, which are not prose', () => {
    const withNoise = `${`${PLAIN} `.repeat(4)} https://example.com/a/very/long/path #tag #other`;
    const without = `${PLAIN} `.repeat(4);
    expect(readingEase(withNoise)).toBe(readingEase(without));
  });

  it('bands the score in words rather than numbers', () => {
    expect(readabilityBand(80)).toBe('pages.write.readability.plain');
    expect(readabilityBand(20)).toBe('pages.write.readability.dense');
  });
});

describe('runQualityChecks', () => {
  it('finds nothing wrong with ordinary prose', () => {
    // The most important test here. A check that fires on correct writing
    // teaches people to click past the whole step.
    expect(ids(PLAIN)).toEqual([]);
  });

  it('warns about an over-limit segment', () => {
    const long = 'x'.repeat(600);
    expect(ids(long, { limit: 500, segments: [long] })).toContain('over-limit');
  });

  it('counts every over-limit segment, not just the first', () => {
    const long = 'x'.repeat(600);
    const findings = runQualityChecks(long, context({ segments: [long, long], limit: 500 }));
    const finding = findings.find((f) => f.id === 'over-limit');
    expect(finding?.messageKey).toBe('pages.write.finding.overLimit.other');
    expect(finding?.messageParams).toEqual({ count: 2 });
  });

  it('warns that a tagged note is about to go to followers', () => {
    expect(ids('a thought #note')).toContain('pkm-tagged');
  });

  it('warns about missing alt text only when the user asked', () => {
    expect(ids(PLAIN, { missingAltText: true, requireAltText: true })).toContain('missing-alt');
    expect(ids(PLAIN, { missingAltText: true, requireAltText: false })).not.toContain(
      'missing-alt',
    );
  });

  it('reports repeated words with the pair as a sample', () => {
    const findings = runQualityChecks('it is is here', context({ segments: ['it is is here'] }));
    expect(findings.find((f) => f.id === 'repeated-words')?.samples).toEqual(['is is']);
  });

  it('mentions long links as cosmetic, not as a cost', () => {
    const url = `https://example.com/${'p'.repeat(60)}`;
    const findings = runQualityChecks(`see ${url}`, context({ segments: [`see ${url}`] }));
    const finding = findings.find((f) => f.id === 'long-links');
    expect(finding?.severity).toBe('info');
    expect(finding?.messageKey).toBe('pages.write.finding.longLinks');
  });

  it('does not flag a short link', () => {
    expect(ids('see https://a.co/x')).not.toContain('long-links');
  });

  it('flags a pile of hashtags but not a handful', () => {
    expect(ids('#a #b #c')).not.toContain('tag-count');
    expect(ids('#a #b #c #d #e #f #g #h')).toContain('tag-count');
  });

  it('orders the most actionable finding first', () => {
    const long = `${'x'.repeat(600)} #note`;
    expect(ids(long, { limit: 500, segments: [long] })[0]).toBe('over-limit');
  });

  it('marks blocking-shaped findings as warnings and cosmetic ones as info', () => {
    const findings = runQualityChecks('tagged #todo', context({ segments: ['tagged #todo'] }));
    expect(findings.find((f) => f.id === 'pkm-tagged')?.severity).toBe('warn');
  });
});
