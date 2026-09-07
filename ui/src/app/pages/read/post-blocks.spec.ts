import { describe, expect, it } from 'vitest';
import { Status } from '../../models';
import { chainBlocks, splitPostHtml } from './post-blocks';

describe('splitting a post into blocks', () => {
  /**
   * The case the reader is named after. A single long tweet used to be one
   * unit, so it landed on one page and that page was several screens tall —
   * "I don't see page splitting for one long tweet".
   */
  it('splits a long post into its paragraphs', () => {
    const blocks = splitPostHtml('<p>One.</p><p>Two.</p><p>Three.</p>');
    expect(blocks).toEqual(['<p>One.</p>', '<p>Two.</p>', '<p>Three.</p>']);
  });

  it('treats headings, lists and quotes as their own blocks', () => {
    const blocks = splitPostHtml('<h2>Title</h2><ul><li>a</li></ul><blockquote>q</blockquote>');
    expect(blocks).toHaveLength(3);
  });

  /** A sentence in italics is not a page. */
  it('keeps inline elements with the text around them', () => {
    const blocks = splitPostHtml('Some <em>emphasis</em> and <a href="#">a link</a>.');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('emphasis');
    expect(blocks[0]).toContain('a link');
  });

  /** Some servers send bare text with no wrapping element. */
  it('wraps loose text so the caller never special-cases it', () => {
    expect(splitPostHtml('just some words')).toEqual(['<p>just some words</p>']);
  });

  it('separates loose text from the blocks around it', () => {
    const blocks = splitPostHtml('lead in<p>A paragraph.</p>tail');
    expect(blocks).toEqual(['<p>lead in</p>', '<p>A paragraph.</p>', '<p>tail</p>']);
  });

  /**
   * A full-content RSS item is a `Status` whose `content` is the whole article
   * (`rss-adapter.ts:241`), so it takes the *post* path rather than the fetched
   * article path. Reported by the operator: "RSS, if I view as thread, it does
   * open in reader, but no splitting no matter how long the article is." One
   * cause, shared with the long-tweet case: a post was one unit.
   */
  it('splits a full-content RSS article, which arrives as a post', () => {
    const article = [
      '<p><strong>The headline</strong></p>',
      ...Array.from({ length: 30 }, (_, i) => `<p>Paragraph ${i} of the article body.</p>`),
    ].join('');

    expect(splitPostHtml(article)).toHaveLength(31);
  });

  /**
   * The operator's example, in the shape the server actually sends it
   * (`mastodon.social/api/v1/statuses/117136053979504519`): a "Week in
   * Fediverse" digest written as paragraphs, two of which are long runs of
   * `<br>`-separated links. Structurally 14 blocks, one of them 1,454
   * characters — so splitting on paragraphs alone still left a block several
   * screens tall, and the page did not fit. Splitting the line breaks too takes
   * the same post to 32 blocks with the largest at 409.
   */
  it('splits a digest written as <br>-separated lines', () => {
    const digest = [
      '<p><strong>Week in Fediverse</strong></p>',
      '<p><strong>Servers</strong></p>',
      `<p>${Array.from(
        { length: 10 },
        (_, i) => `- <a href="https://example.test/${i}">Project v1.${i}</a>`,
      ).join('<br>')}</p>`,
    ].join('');

    const blocks = splitPostHtml(digest);

    // Two headings plus one block per link, rather than one wall of links.
    expect(blocks).toHaveLength(12);
    expect(blocks.every((block) => block.length < 200)).toBe(true);
  });

  /** The break is the seam; each line keeps the wrapper it was written in. */
  it('keeps each split line inside its original element', () => {
    const blocks = splitPostHtml('<p class="x">one<br>two</p>');
    expect(blocks).toEqual(['<p class="x">one</p>', '<p class="x">two</p>']);
  });

  it('leaves a paragraph with no line breaks alone', () => {
    expect(splitPostHtml('<p>a single sentence</p>')).toEqual(['<p>a single sentence</p>']);
  });

  it('splits one uninterrupted long paragraph into page-sized prose fragments', () => {
    const prose = Array.from({ length: 160 }, (_, i) => `word${i}`).join(' ');
    const blocks = splitPostHtml(`<p>${prose}</p>`);

    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.every((block) => block.startsWith('<span>'))).toBe(true);
    expect(blocks.join(' ')).toContain('word0');
    expect(blocks.join(' ')).toContain('word159');
  });

  it('keeps inline markup balanced when long prose is split through it', () => {
    const linked = Array.from({ length: 100 }, (_, i) => `linked${i}`).join(' ');
    const blocks = splitPostHtml(
      `<p>Before <a href="https://example.test">${linked}</a> after.</p>`,
    );

    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) {
      const holder = document.createElement('div');
      holder.innerHTML = block;
      expect(holder.querySelectorAll('script')).toHaveLength(0);
      expect(holder.textContent?.trim()).not.toBe('');
    }
  });

  /** A trailing `<br>` is spacing, not an empty line worth a block. */
  it('drops blank lines rather than making pages of them', () => {
    expect(splitPostHtml('<p>one<br><br>two<br></p>')).toEqual(['<p>one</p>', '<p>two</p>']);
  });

  /** A break inside a list item is that item's business. */
  it('does not tear apart a list to get at a nested break', () => {
    const blocks = splitPostHtml('<ul><li>one<br>still one</li><li>two</li></ul>');
    expect(blocks).toHaveLength(1);
  });

  it('returns nothing for an empty post', () => {
    expect(splitPostHtml('')).toEqual([]);
    expect(splitPostHtml('   ')).toEqual([]);
  });

  /**
   * Each block is the `outerHTML` of an element that was already in the parsed
   * tree — a subtree of what the server sent, serialised back out. Nothing is
   * concatenated or rebuilt from text, so a block is exactly as safe as the
   * post it came from.
   */
  it('does not resurrect markup the parser had already neutralised', () => {
    const blocks = splitPostHtml('<p>a &lt;script&gt;alert(1)&lt;/script&gt; b</p>');
    expect(blocks[0]).not.toContain('<script>');
    expect(blocks[0]).toContain('&lt;script&gt;');
  });
});

describe('blocks across a chain', () => {
  const post = (id: string, content: string): Status => ({ id, content }) as unknown as Status;

  it('keeps reading order and remembers which post each block came from', () => {
    const blocks = chainBlocks([post('1', '<p>One.</p><p>Two.</p>'), post('2', '<p>Three.</p>')]);

    expect(blocks.map((block) => block.post)).toEqual([0, 0, 1]);
    expect(blocks.map((block) => block.html)).toEqual([
      '<p>One.</p>',
      '<p>Two.</p>',
      '<p>Three.</p>',
    ]);
  });

  it('survives a post with no content', () => {
    expect(chainBlocks([post('1', '')])).toEqual([]);
  });
});
