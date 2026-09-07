import { describe, expect, it } from 'vitest';
import { applyMinimalMarkdown } from './markdown';

describe('applyMinimalMarkdown', () => {
  it('renders bold, italic, and code inline', () => {
    expect(applyMinimalMarkdown('<p>a **bold** move</p>')).toBe(
      '<p>a <strong>bold</strong> move</p>',
    );
    expect(applyMinimalMarkdown('<p>an *italic* aside</p>')).toBe(
      '<p>an <em>italic</em> aside</p>',
    );
    expect(applyMinimalMarkdown('<p>run `make check` first</p>')).toBe(
      '<p>run <code>make check</code> first</p>',
    );
  });

  it('renders ***both*** as bold italic', () => {
    expect(applyMinimalMarkdown('<p>***loud***</p>')).toBe('<p><strong><em>loud</em></strong></p>');
  });

  it('handles several constructs in one paragraph', () => {
    expect(applyMinimalMarkdown('<p>**a** and *b* and `c`</p>')).toBe(
      '<p><strong>a</strong> and <em>b</em> and <code>c</code></p>',
    );
  });

  it('turns leading #-lines into headers, splitting at <br>', () => {
    expect(applyMinimalMarkdown('<p># Title<br>body text</p>')).toBe(
      '<h1>Title</h1><p>body text</p>',
    );
    expect(applyMinimalMarkdown('<p>intro<br>## Section<br>more</p>')).toBe(
      '<p>intro</p><h2>Section</h2><p>more</p>',
    );
  });

  it('does not treat #hashtags as headers', () => {
    const html = '<p>#computing is great</p>';
    expect(applyMinimalMarkdown(html)).toBe(html);
  });

  it('leaves unpaired or spaced-out markers literal', () => {
    expect(applyMinimalMarkdown('<p>2 * 3 * 4 = 24</p>')).toBe('<p>2 * 3 * 4 = 24</p>');
    expect(applyMinimalMarkdown('<p>a ** stray marker</p>')).toBe('<p>a ** stray marker</p>');
  });

  it('never touches text inside links or existing code', () => {
    const link = '<p><a href="https://x.test/a*b*c">https://x.test/a*b*c</a></p>';
    expect(applyMinimalMarkdown(link)).toBe(link);
    const code = '<p><code>*not italic*</code></p>';
    expect(applyMinimalMarkdown(code)).toBe(code);
  });

  it('anything weird turns markdown off entirely', () => {
    const fenced = '<p>```<br>let x = 1<br>```<br>and **bold**</p>';
    expect(applyMinimalMarkdown(fenced)).toBe(fenced);
    const mdLink = '<p>[click](https://x.test) and **bold**</p>';
    expect(applyMinimalMarkdown(mdLink)).toBe(mdLink);
    const mdImage = '<p>![alt](https://x.test/i.png) and *i*</p>';
    expect(applyMinimalMarkdown(mdImage)).toBe(mdImage);
  });

  it('passes plain content through untouched', () => {
    const html = '<p>nothing fancy here</p>';
    expect(applyMinimalMarkdown(html)).toBe(html);
    expect(applyMinimalMarkdown('')).toBe('');
  });
});
