import { describe, expect, it } from 'vitest';
import { paginateMarkdown } from '../rss/article-pages';
import {
  anchorForQuote,
  anchorIsIntact,
  blockPlainText,
  documentBlocks,
  pageOfBlock,
} from './reader-anchor';

const DOC = [
  '# A heading',
  'The first paragraph, which is where the interesting phrase lives.',
  'A second paragraph with **bold** text and a [link](https://example.test).',
].join('\n\n');

describe('reducing a block to what the reader actually selected', () => {
  it('drops the marks that wrap text', () => {
    expect(blockPlainText('**bold** and *italic* and `code`')).toBe('bold and italic and code');
  });

  it('keeps link text and drops the target', () => {
    expect(blockPlainText('see [the docs](https://example.test)')).toBe('see the docs');
  });

  it('drops heading, quote and list markers', () => {
    expect(blockPlainText('## Heading')).toBe('Heading');
    expect(blockPlainText('> quoted')).toBe('quoted');
    expect(blockPlainText('- item')).toBe('item');
    expect(blockPlainText('1. item')).toBe('item');
  });
});

describe('anchoring a selection into the document', () => {
  const document = documentBlocks(DOC);

  it('finds the block a quote came from and points at it', () => {
    const anchor = anchorForQuote(document, 'interesting phrase');
    expect(anchor?.block).toBe(1);
    expect(document.text[anchor!.block].slice(anchor!.start, anchor!.end)).toBe(
      'interesting phrase',
    );
  });

  /**
   * The selection comes off rendered HTML, where wrapping and indentation are
   * the browser's business. Refusing to anchor over a line break would be a
   * false negative on a perfectly good highlight.
   */
  it('matches a quote whose whitespace differs from the source', () => {
    expect(anchorForQuote(document, 'interesting\n   phrase')?.block).toBe(1);
  });

  it('anchors through markdown the reader never saw', () => {
    // "bold text" is contiguous on screen; in the source it is `**bold** text`.
    expect(anchorForQuote(document, 'bold text')?.block).toBe(2);
  });

  it('finds nothing for a phrase that is not in the document', () => {
    expect(anchorForQuote(document, 'a phrase from another article')).toBeNull();
    expect(anchorForQuote(document, '   ')).toBeNull();
  });
});

describe('the quote check that decides whether a highlight is drawn', () => {
  const document = documentBlocks(DOC);

  it('accepts an anchor that still points at its quote', () => {
    const anchor = anchorForQuote(document, 'interesting phrase')!;
    expect(anchorIsIntact(document, anchor)).toBe(true);
  });

  /**
   * The publisher rewrote the article. Drawing the highlight anyway would mark
   * the wrong sentence, and the reader has no way to notice that — so a drifted
   * anchor is reported instead, never rendered in place.
   */
  it('rejects an anchor whose text has changed underneath it', () => {
    const anchor = anchorForQuote(document, 'interesting phrase')!;
    const rewritten = documentBlocks(
      ['# A heading', 'The first paragraph, entirely rewritten by the publisher.'].join('\n\n'),
    );
    expect(anchorIsIntact(rewritten, anchor)).toBe(false);
  });

  it('rejects an anchor whose block is gone entirely', () => {
    const anchor = anchorForQuote(document, 'bold text')!;
    expect(anchorIsIntact(documentBlocks('# A heading'), anchor)).toBe(false);
  });
});

describe('which page a highlight is on', () => {
  /**
   * A lookup rather than a measurement, exactly as for a search match: the
   * anchor names a block, pages are runs of blocks, so the answer is counting.
   * That is what makes it survive a type-size change.
   */
  it('reports the page a block falls on', () => {
    const markdown = Array.from({ length: 12 }, (_, i) => `${'word '.repeat(120)}${i}`).join(
      '\n\n',
    );
    const pages = paginateMarkdown(markdown);
    expect(pages.length).toBeGreaterThan(1);

    expect(pageOfBlock(pages, 0)).toBe(1);
    expect(pageOfBlock(pages, 11)).toBe(pages.length);
  });

  it('never reports a page outside the document', () => {
    const pages = paginateMarkdown('one short block');
    expect(pageOfBlock(pages, 99)).toBe(1);
  });
});
