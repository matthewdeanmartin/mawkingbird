import { describe, expect, it } from 'vitest';
import { HIGHLIGHT_CLASS, markPassages, SEARCH_HIT_CLASS } from './mark-passages';

const html = (markup: string) => {
  const holder = document.createElement('div');
  holder.innerHTML = markup;
  return holder;
};

describe('marking a passage in rendered article HTML', () => {
  it('wraps the quote and leaves the rest alone', () => {
    const out = markPassages('<p>The otters swim well.</p>', ['otters swim']);
    const marked = html(out).querySelector('mark');

    expect(marked?.textContent).toBe('otters swim');
    expect(marked?.className).toBe(HIGHLIGHT_CLASS);
    expect(html(out).textContent).toBe('The otters swim well.');
  });

  it('marks every quote it is given', () => {
    const out = markPassages('<p>One and two and three.</p>', ['One', 'three']);
    expect(html(out).querySelectorAll('mark')).toHaveLength(2);
  });

  /** A quote crossing an element boundary is the common case, not an edge one. */
  it('marks a quote that straddles inline markup', () => {
    const out = markPassages('<p>a <em>bold</em> claim</p>', ['bold claim']);
    const marked = html(out).querySelector('mark');

    expect(marked?.textContent).toBe('bold claim');
    // The emphasis survives inside the mark: nothing was re-serialized.
    expect(marked?.querySelector('em')?.textContent).toBe('bold');
  });

  it('matches across the whitespace the renderer introduced', () => {
    const out = markPassages('<p>a phrase\n   split here</p>', ['phrase split']);
    expect(html(out).querySelector('mark')?.textContent).toBe('phrase\n   split');
  });

  it('gives a search hit its own class, so it reads differently', () => {
    const out = markPassages('<p>find the needle</p>', [], 'needle');
    expect(html(out).querySelector('mark')?.className).toBe(SEARCH_HIT_CLASS);
  });

  it('leaves the html untouched when there is nothing to mark', () => {
    const source = '<p>Nothing to do.</p>';
    expect(markPassages(source, [])).toBe(source);
    expect(markPassages(source, ['not in this document'])).toBe(source);
    expect(markPassages('', ['anything'])).toBe('');
  });

  /**
   * The security rule, tested rather than asserted.
   *
   * The renderer is the choke point and its output is safe; marking must not
   * weaken that. Because this walks the DOM and wraps existing nodes rather
   * than building markup from strings, a quote full of angle brackets is text
   * both before and after — there is no injection point to get wrong.
   */
  it('never turns the reader’s own text into markup', () => {
    const source = '<p>a &lt;script&gt;alert(1)&lt;/script&gt; b</p>';
    const out = markPassages(source, ['<script>alert(1)</script>']);
    const tree = html(out);

    expect(tree.querySelector('script')).toBeNull();
    expect(tree.querySelector('mark')?.textContent).toBe('<script>alert(1)</script>');
  });

  it('does not let a crafted quote inject an attribute or a handler', () => {
    const out = markPassages('<p>click &quot; onclick=alert(1) x</p>', ['" onclick=alert(1)']);
    const marked = html(out).querySelector('mark');

    expect(marked?.getAttribute('onclick')).toBeNull();
    expect(marked?.attributes).toHaveLength(1);
    expect(marked?.className).toBe(HIGHLIGHT_CLASS);
  });

  /** Overlapping quotes must not nest wrappers into an unreadable tangle. */
  it('does not mark inside an existing mark', () => {
    const out = markPassages('<p>the otters swim</p>', ['otters swim', 'otters']);
    expect(html(out).querySelectorAll('mark')).toHaveLength(1);
  });

  it('survives html it cannot mark without losing the article', () => {
    const source = '<p>text</p>';
    expect(markPassages(source, ['   '])).toBe(source);
  });
});
