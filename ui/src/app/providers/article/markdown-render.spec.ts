import { describe, expect, it } from 'vitest';
import { renderInline, renderMarkdown } from './markdown-render';

describe('renderInline', () => {
  it('renders emphasis, code and links', () => {
    expect(renderInline('**bold**')).toBe('<strong>bold</strong>');
    expect(renderInline('*italic*')).toBe('<em>italic</em>');
    expect(renderInline('`code()`')).toBe('<code>code()</code>');
    expect(renderInline('[text](https://example.com/)')).toContain('href="https://example.com/"');
  });

  it('escapes text that would otherwise be markup', () => {
    expect(renderInline('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(renderInline('a & b')).toBe('a &amp; b');
  });

  it('does not interpret markdown inside a code span', () => {
    expect(renderInline('`**not bold**`')).toBe('<code>**not bold**</code>');
  });

  it('honours a backslash escape', () => {
    expect(renderInline('\\*not italic\\*')).toBe('*not italic*');
  });
});

describe('renderInline refuses unsafe destinations', () => {
  // The check that matters: this output goes through [innerHTML].
  it('keeps link text but drops a javascript: destination', () => {
    const html = renderInline('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a');
    expect(html).toContain('click');
  });

  it('drops a data: destination', () => {
    const html = renderInline('[x](data:text/html,<script>alert(1)</script>)');
    expect(html).not.toContain('data:');
    expect(html).not.toContain('<script');
  });

  it('keeps alt text but drops an unsafe image source', () => {
    const html = renderInline('![alt text](javascript:alert(1))');
    expect(html).not.toContain('<img');
    expect(html).toContain('alt text');
  });

  it('cannot be tricked into emitting an extra attribute', () => {
    // An attribute-injection attempt inside a link destination. The URL pattern
    // stops at whitespace, so this never becomes a link at all and the quote is
    // escaped — "onmouseover" survives as inert text, which is the point: it is
    // never *parsed* as an attribute.
    const html = renderInline('[t](https://example.com/" onmouseover="alert(1))');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('"onmouseover');
    expect(html).toContain('&quot;');
  });
});

describe('renderMarkdown', () => {
  it('renders headings starting at h2', () => {
    // The reader's own title is the h1; a second one is an outline bug.
    expect(renderMarkdown('# Title')).toBe('<h2>Title</h2>');
    expect(renderMarkdown('## Sub')).toBe('<h3>Sub</h3>');
  });

  it('renders paragraphs split on blank lines', () => {
    expect(renderMarkdown('one\n\ntwo')).toBe('<p>one</p>\n<p>two</p>');
  });

  it('renders unordered and ordered lists', () => {
    expect(renderMarkdown('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(renderMarkdown('1. a\n2. b')).toBe('<ol><li>a</li><li>b</li></ol>');
  });

  it('renders a blockquote', () => {
    expect(renderMarkdown('> quoted')).toContain('<blockquote>');
  });

  it('renders a fenced code block without interpreting it', () => {
    const html = renderMarkdown('```\n**not bold**\n<b>tag</b>\n```');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('**not bold**');
    expect(html).toContain('&lt;b&gt;');
  });

  it('renders an unterminated fence rather than losing its content', () => {
    const html = renderMarkdown('```\nstranded');
    expect(html).toContain('stranded');
  });

  it('renders a horizontal rule', () => {
    expect(renderMarkdown('---')).toBe('<hr>');
  });
});
