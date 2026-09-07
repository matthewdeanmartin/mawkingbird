import { describe, expect, it } from 'vitest';
import { CustomEmoji } from '../models';
import { renderStatusText } from './status-text';

const blob: CustomEmoji = {
  shortcode: 'blobcat',
  url: 'https://files.example/blobcat.png',
  static_url: 'https://files.example/blobcat_static.png',
  visible_in_picker: true,
};

describe('renderStatusText', () => {
  it('wraps plain text in a paragraph and escapes HTML', () => {
    expect(renderStatusText('hello <script>alert(1)</script>')).toBe(
      '<p>hello &lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
  });

  it('linkifies URLs with the protocol stripped from the label', () => {
    const html = renderStatusText('see https://example.com/page');
    expect(html).toContain('href="https://example.com/page"');
    expect(html).toContain('<span>example.com/page</span>');
  });

  it('ellipsises long URL labels at 30 characters', () => {
    const html = renderStatusText('https://example.com/a/very/long/path/that/keeps/going');
    expect(html).toContain('<span class="ellipsis">…</span>');
  });

  it('turns hashtags into in-app tag links', () => {
    expect(renderStatusText('about #caturday')).toContain(
      '<a class="mention hashtag" href="/tags/caturday">#caturday</a>',
    );
  });

  it('marks up @mentions (including full fedi addresses)', () => {
    const html = renderStatusText('hi @alice@example.social');
    expect(html).toContain('<a class="u-url mention">@alice@example.social</a>');
  });

  it('replaces known custom emoji shortcodes with images', () => {
    const html = renderStatusText('nice :blobcat:', [blob]);
    expect(html).toContain('<img class="custom-emoji"');
    expect(html).toContain('src="https://files.example/blobcat_static.png"');
    expect(html).toContain('alt=":blobcat:"');
  });

  it('leaves unknown shortcodes as literal text', () => {
    expect(renderStatusText('what :nosuch:', [blob])).toBe('<p>what :nosuch:</p>');
  });

  it('splits blank lines into paragraphs and newlines into <br>', () => {
    expect(renderStatusText('one\ntwo\n\nthree')).toBe('<p>one<br />two</p><p>three</p>');
  });

  it('renders nothing for whitespace-only text', () => {
    expect(renderStatusText('  \n ')).toBe('');
  });
});
