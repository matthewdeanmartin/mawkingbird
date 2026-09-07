import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_QUOTE_LENGTH, selectionWithin, shareBody, truncateQuote } from './share-selection';

describe('truncateQuote', () => {
  it('flattens whitespace', () => {
    expect(truncateQuote('  a\n\n  b  ')).toBe('a b');
  });

  it('leaves a short quote alone', () => {
    expect(truncateQuote('short enough')).toBe('short enough');
  });

  it('caps a long quote', () => {
    const long = 'word '.repeat(200);
    const quote = truncateQuote(long);
    expect(Array.from(quote).length).toBeLessThanOrEqual(MAX_QUOTE_LENGTH + 1);
    expect(quote.endsWith('…')).toBe(true);
  });

  it('breaks at a word boundary when one is close', () => {
    // Every word in the source is "alpha" or "beta", so a clean break leaves a
    // whole one at the end; a mid-word clip would leave a fragment like "alph".
    const quote = truncateQuote('alpha beta '.repeat(40));
    const lastWord = quote.replace(/…$/, '').trimEnd().split(' ').pop();
    expect(['alpha', 'beta']).toContain(lastWord);
  });

  it('does not lose a visible chunk to a distant word boundary', () => {
    // One enormous token: breaking at the last space would throw away most of
    // the quote, so it clips mid-token instead.
    const quote = truncateQuote(`tiny ${'x'.repeat(400)}`);
    expect(Array.from(quote).length).toBeGreaterThan(MAX_QUOTE_LENGTH * 0.9);
  });
});

describe('selectionWithin', () => {
  let card: HTMLElement;
  let other: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    card = document.createElement('div');
    card.textContent = 'the selected passage';
    other = document.createElement('div');
    other.textContent = 'a different post entirely';
    document.body.append(card, other);
  });

  /** A real Selection over `node`'s contents. */
  function select(node: Node): Selection {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection;
  }

  it('returns the selection when it is inside the shared element', () => {
    expect(selectionWithin(card, select(card))).toBe('the selected passage');
  });

  it('returns nothing for a selection in a different post', () => {
    // The silent-wrong-quote case: highlight one card, share another.
    expect(selectionWithin(card, select(other))).toBe('');
  });

  it('returns nothing when there is no selection', () => {
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    expect(selectionWithin(card, selection)).toBe('');
  });

  it('returns nothing without a container', () => {
    expect(selectionWithin(null, select(card))).toBe('');
  });

  it('truncates a long selection', () => {
    card.textContent = 'word '.repeat(200);
    expect(selectionWithin(card, select(card)).endsWith('…')).toBe(true);
  });
});

describe('shareBody', () => {
  it('is title and link when nothing is quoted', () => {
    expect(shareBody({ title: 'A Post', url: 'https://x.test/a' })).toBe(
      'A Post — https://x.test/a',
    );
  });

  it('puts the quote above the attribution', () => {
    expect(shareBody({ quote: 'the passage', title: 'A Post', url: 'https://x.test/a' })).toBe(
      '> the passage\n\nA Post — https://x.test/a',
    );
  });

  it('ignores a whitespace-only quote', () => {
    expect(shareBody({ quote: '   ', title: 'A Post', url: 'https://x.test/a' })).toBe(
      'A Post — https://x.test/a',
    );
  });

  it('copes with a missing title', () => {
    expect(shareBody({ title: '', url: 'https://x.test/a' })).toBe('https://x.test/a');
  });
});
