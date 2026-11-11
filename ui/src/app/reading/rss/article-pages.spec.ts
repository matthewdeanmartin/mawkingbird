import { describe, expect, it } from 'vitest';
import { paginateMarkdown } from './article-pages';

/** `n` words as one paragraph. */
function para(n: number, word = 'word'): string {
  return Array.from({ length: n }, () => word).join(' ');
}

describe('paginateMarkdown', () => {
  it('returns a single page for empty input rather than nothing', () => {
    expect(paginateMarkdown('')).toEqual(['']);
    expect(paginateMarkdown('   ')).toEqual(['']);
  });

  it('does not paginate a short article', () => {
    const short = `${para(100)}\n\n${para(100)}`;
    expect(paginateMarkdown(short)).toHaveLength(1);
  });

  it('does not paginate just over one page, when page two would be a scrap', () => {
    // 600 words is over the target but under the 1.5-page threshold: splitting
    // would leave a 100-word second page, which is worse than one long page.
    expect(paginateMarkdown(para(600))).toHaveLength(1);
  });

  it('splits a long article into several pages', () => {
    const long = Array.from({ length: 10 }, () => para(200)).join('\n\n');
    const pages = paginateMarkdown(long);

    expect(pages.length).toBeGreaterThan(1);
    // Every word survives the split.
    expect(pages.join(' ').split(/\s+/).filter(Boolean)).toHaveLength(2000);
  });

  it('never splits inside a paragraph', () => {
    const long = Array.from({ length: 8 }, (_, i) => `Paragraph${i} ${para(200)}`).join('\n\n');
    for (const page of paginateMarkdown(long)) {
      // A page that began mid-paragraph would start with the filler word rather
      // than a paragraph marker.
      expect(page.trimStart().startsWith('Paragraph')).toBe(true);
    }
  });

  it('keeps a fenced code block whole', () => {
    // A blank line inside a fence must not be treated as a block boundary: an
    // unterminated fence would make the renderer swallow the rest of the page.
    const code = ['```ts', 'const a = 1;', '', 'const b = 2;', '```'].join('\n');
    const long = `${para(600)}\n\n${code}\n\n${para(600)}`;

    const pages = paginateMarkdown(long);
    const withCode = pages.filter((p) => p.includes('```'));
    // Both fences land on the same page.
    expect(withCode).toHaveLength(1);
    expect(withCode[0].match(/```/g)).toHaveLength(2);
  });

  it('folds a tiny trailing remainder into the previous page', () => {
    const long = `${Array.from({ length: 4 }, () => para(300)).join('\n\n')}\n\nShort tail.`;
    const pages = paginateMarkdown(long);

    expect(pages[pages.length - 1]).toContain('Short tail.');
    expect(pages[pages.length - 1].split(/\s+/).length).toBeGreaterThan(10);
  });

  it('loses no content, whatever the shape', () => {
    const long = Array.from({ length: 12 }, (_, i) => `# Heading ${i}\n\n${para(150)}`).join(
      '\n\n',
    );
    const pages = paginateMarkdown(long);

    for (let i = 0; i < 12; i++) {
      expect(pages.join('\n\n')).toContain(`# Heading ${i}`);
    }
  });
});
