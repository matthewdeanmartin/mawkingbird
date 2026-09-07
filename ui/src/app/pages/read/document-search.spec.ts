import { describe, expect, it } from 'vitest';
import { findInPages, MAX_MATCHES } from './document-search';

describe('searching a document rather than a page', () => {
  const pages = [
    'The first page mentions otters once.',
    'The second page mentions otters twice: otters.',
    'The third page mentions nothing of interest.',
  ];

  /**
   * The whole reason this searches the markdown. Searching the rendered DOM
   * would find matches on the page already on screen and silently miss the
   * rest — which is also what the browser's own find would do, and why the
   * reader intercepts it.
   */
  it('finds matches on pages other than the first', () => {
    const matches = findInPages(pages, 'otters');
    expect(matches).toHaveLength(3);
    expect(matches.map((m) => m.page)).toEqual([1, 2, 2]);
  });

  it('reports a match page as a lookup, not a measurement', () => {
    expect(findInPages(pages, 'third')[0].page).toBe(3);
  });

  it('is case-insensitive', () => {
    expect(findInPages(['Otters and OTTERS'], 'otters')).toHaveLength(2);
  });

  it('keeps the matched text in its original case', () => {
    expect(findInPages(['The Otters'], 'otters')[0].text).toBe('Otters');
  });

  /** The match is the match, not the match plus the space after it. */
  it('does not drag trailing whitespace into a match', () => {
    expect(findInPages(['otters swim'], 'otters')[0].text).toBe('otters');
    expect(findInPages(['a phrase\nsplit here'], 'phrase split')[0].text).toBe('phrase\nsplit');
  });

  /**
   * A reader typing `(` wants the paren. Handing keystrokes to a regex engine
   * turns a search box into a syntax-error box, and with the wrong pattern into
   * a hang.
   */
  it('treats the query as text, not a pattern', () => {
    expect(findInPages(['a (b) c'], '(b)')).toHaveLength(1);
    expect(() => findInPages(['a'], '[')).not.toThrow();
    expect(findInPages(['aaa'], '.*')).toHaveLength(0);
  });

  /** The markdown wraps; the phrase the reader is looking for does not. */
  it('matches a phrase that the source wrapped across lines', () => {
    expect(findInPages(['a phrase\nsplit across lines'], 'phrase split')).toHaveLength(1);
  });

  it('ignores a query too short to be a search', () => {
    expect(findInPages(pages, 'o')).toHaveLength(0);
    expect(findInPages(pages, '  ')).toHaveLength(0);
  });

  it('gives each match a line of context with the match located inside it', () => {
    const [match] = findInPages(['Otters are excellent swimmers and eat fish.'], 'excellent');
    expect(match.context).toContain('excellent');
    expect(match.context.slice(match.contextOffset, match.contextOffset + 9)).toBe('excellent');
  });

  it('elides context at the edges of a long block', () => {
    const long = `${'word '.repeat(60)}needle${' word'.repeat(60)}`;
    const [match] = findInPages([long], 'needle');
    expect(match.context.startsWith('…')).toBe(true);
    expect(match.context.endsWith('…')).toBe(true);
  });

  it('caps the result list, so a common substring cannot flood the dialog', () => {
    const flooded = findInPages([`${'ab '.repeat(MAX_MATCHES + 50)}`], 'ab');
    expect(flooded).toHaveLength(MAX_MATCHES);
  });

  it('finds nothing in an empty document without throwing', () => {
    expect(findInPages([], 'otters')).toHaveLength(0);
    expect(findInPages([''], 'otters')).toHaveLength(0);
  });

  it('finds phrases and words split by native page boundaries', () => {
    const [phrase] = findInPages(
      ['Before. The remem', 'bered ', 'passage continues.'],
      'remembered passage',
      true,
    );
    expect(phrase.page).toBe(1);
    expect(phrase.offset).toBe(12);
    expect(phrase.text).toBe('remembered passage');
    expect(findInPages(['Before. ', 'The passage.'], 'passage', true)[0].page).toBe(2);
  });
});
