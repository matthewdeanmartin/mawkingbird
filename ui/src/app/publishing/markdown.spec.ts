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
    // Fenced code is no longer "weird" (it renders as a block, below); an
    // unclosed fence is still left exactly as written.
    const unclosed = '<p>```<br>let x = 1<br>and **bold**</p>';
    expect(applyMinimalMarkdown(unclosed)).toBe(
      '<p>```<br>let x = 1<br>and <strong>bold</strong></p>',
    );
    const mdLink = '<p>[click](https://x.test) and **bold**</p>';
    expect(applyMinimalMarkdown(mdLink)).toBe(mdLink);
    const mdImage = '<p>![alt](https://x.test/i.png) and *i*</p>';
    expect(applyMinimalMarkdown(mdImage)).toBe(mdImage);
  });

  describe('fenced code', () => {
    it('renders a fence as a code block and keeps markdown working around it', () => {
      const html = '<p>```python<br>x = 1  # *not italic*<br>```<br>and **bold**</p>';
      expect(applyMinimalMarkdown(html)).toBe(
        '<pre class="mb-code"><code class="language-python">x = 1  # *not italic*</code></pre>' +
          '<p>and <strong>bold</strong></p>',
      );
    });

    it('keeps blank lines inside the block and links outside it', () => {
      const html =
        '<p>see <a href="https://x.test">x.test</a></p><p>```js<br>a()</p><p>b()<br>```</p>';
      expect(applyMinimalMarkdown(html)).toBe(
        '<p>see <a href="https://x.test">x.test</a></p>' +
          '<pre class="mb-code"><code class="language-javascript">a()\n\nb()</code></pre>',
      );
    });

    it('escapes code instead of interpreting it as HTML', () => {
      const html = '<p>```<br>&lt;script&gt;alert(1)&lt;/script&gt;<br>```</p>';
      expect(applyMinimalMarkdown(html)).toBe(
        '<pre class="mb-code"><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>',
      );
    });

    it('still renders code when the rest of the post has an unsupported construct', () => {
      const html = '<p>[link](https://x.test) **b**</p><p>```<br>x<br>```</p>';
      expect(applyMinimalMarkdown(html)).toBe(
        '<p>[link](https://x.test) **b**</p><pre class="mb-code"><code>x</code></pre>',
      );
    });
  });

  it('passes plain content through untouched', () => {
    const html = '<p>nothing fancy here</p>';
    expect(applyMinimalMarkdown(html)).toBe(html);
    expect(applyMinimalMarkdown('')).toBe('');
  });
});
