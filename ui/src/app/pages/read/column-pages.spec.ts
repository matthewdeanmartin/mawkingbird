import { afterEach, describe, expect, it, vi } from 'vitest';
import { readColumnPages } from './column-pages';
import { pageOfQuote } from './reading-tools';

afterEach(() => vi.restoreAllMocks());

describe('Native column text index', () => {
  it('indexes a single text node crossing three pages without losing characters', () => {
    const element = document.createElement('div');
    element.innerHTML = '<p>abcdefghijkl</p>';
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 200,
      height: 80,
    } as DOMRect);
    Object.defineProperty(element, 'scrollWidth', { value: 696 });
    // Simulate the browser's character geometry, not a block-height estimate.
    const rectangles = function (this: Range): DOMRectList {
      return [
        { left: 100 + Math.floor(this.startOffset / 4) * 248, width: 8, height: 16 },
      ] as unknown as DOMRectList;
    };
    const createRange = document.createRange.bind(document);
    vi.spyOn(document, 'createRange').mockImplementation(() => {
      const range = createRange();
      Object.defineProperty(range, 'getClientRects', { value: rectangles });
      return range;
    });
    const pages = readColumnPages(element);
    expect(pages.text).toEqual(['abcd', 'efgh', 'ijkl\n']);
    expect(pages.text.join('').trim()).toBe(element.textContent);
    expect(pages.starts.map((range) => range?.startOffset)).toEqual([0, 4, 8]);
    expect(element.innerHTML).toBe('<p>abcdefghijkl</p>');
  });

  it('leaves the whole text available when no layout engine is present', () => {
    const element = document.createElement('div');
    element.textContent = 'Unmeasurable text still exists.';
    expect(readColumnPages(element)).toEqual({
      text: [element.textContent],
      starts: [null],
      stride: 0,
    });
  });

  it('locates a note on the page where its passage begins within a long paragraph', () => {
    expect(
      pageOfQuote(['Before. ', 'The remembered ', 'passage continues.'], 'remembered passage'),
    ).toBe(2);
    expect(pageOfQuote(['Before. ', 'The remembered ', 'passage continues.'], 'continues.')).toBe(
      3,
    );
    expect(pageOfQuote(['Before.'], 'missing')).toBeNull();
  });
});
