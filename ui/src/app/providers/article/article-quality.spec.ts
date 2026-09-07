import { describe, expect, it } from 'vitest';
import { ArticleMetrics } from './article-models';
import { judge, measure } from './article-quality';

function metrics(overrides: Partial<ArticleMetrics> = {}): ArticleMetrics {
  return {
    wordCount: 800,
    linkDensity: 0.05,
    paragraphCount: 8,
    textToMarkupRatio: 0.6,
    ...overrides,
  };
}

describe('judge', () => {
  it('accepts a substantial low-link article', () => {
    expect(judge(metrics())).toBe('good');
  });

  it('rejects anything too short to be an article', () => {
    expect(judge(metrics({ wordCount: 40 }))).toBe('junk');
  });

  it('rejects a link-dense block as navigation', () => {
    // The metric that does the real work: this is what a homepage or a
    // "related posts" sidebar looks like once the extractor picks it.
    expect(judge(metrics({ linkDensity: 0.6 }))).toBe('junk');
  });

  it('rejects a short wall of text with no paragraph structure', () => {
    expect(judge(metrics({ wordCount: 300, paragraphCount: 0 }))).toBe('junk');
  });

  it('allows a long wall of text through, structure or not', () => {
    // Being wrong here would discard something substantial, so length buys
    // the benefit of the doubt.
    expect(judge(metrics({ wordCount: 900, paragraphCount: 0 }))).toBe('thin');
  });

  it('calls a short but real piece thin rather than junk', () => {
    // A lede and two paragraphs beat a bare link — rendered, with a caveat.
    expect(judge(metrics({ wordCount: 180 }))).toBe('thin');
  });

  it('calls a moderately linky article thin rather than rejecting it', () => {
    expect(judge(metrics({ linkDensity: 0.3 }))).toBe('thin');
  });

  it('treats a 300-word post as a complete article', () => {
    // Regression guard for the 2026-08-21 calibration: at THIN_WORDS = 400
    // this was flagged "may be only part of the article", which is a false
    // caveat on an ordinary blog entry.
    expect(judge(metrics({ wordCount: 300 }))).toBe('good');
  });
});

describe('measure', () => {
  function root(html: string): Element {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    return doc.body;
  }

  it('counts words from the markdown, not the markup', () => {
    const result = measure(root('<p>one two three</p>'), 'one two three');
    expect(result.wordCount).toBe(3);
  });

  it('computes link density from linked words', () => {
    const el = root('<p>one two <a href="https://e.com/">three four</a></p>');
    expect(measure(el, 'one two three four').linkDensity).toBeCloseTo(0.5, 2);
  });

  it('counts only paragraphs long enough to be prose', () => {
    const long = Array.from({ length: 30 }, () => 'word').join(' ');
    const el = root(`<p>${long}</p><p>caption</p>`);
    expect(measure(el, long).paragraphCount).toBe(1);
  });

  it('reports zero density for text with no links', () => {
    expect(measure(root('<p>plain words here</p>'), 'plain words here').linkDensity).toBe(0);
  });
});
