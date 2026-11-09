import { describe, expect, it } from 'vitest';
import { mfmToHtml, safeHttpUrl } from './misskey-mfm';

const ctx = { server: 'https://misskey.io', authorHost: null };

describe('mfmToHtml', () => {
  it('returns an empty string for missing text', () => {
    expect(mfmToHtml(null, ctx)).toBe('');
    expect(mfmToHtml('', ctx)).toBe('');
  });

  it('escapes markup and keeps line breaks and paragraphs', () => {
    expect(mfmToHtml('a <b> & "c"', ctx)).toBe('<p>a &lt;b&gt; &amp; &quot;c&quot;</p>');
    expect(mfmToHtml('one\ntwo\n\nthree', ctx)).toBe('<p>one<br>two</p><p>three</p>');
  });

  it('never lets an author inject a tag', () => {
    const html = mfmToHtml('<script>alert(1)</script> <img src=x onerror=alert(1)>', ctx);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders inline styles as real tags', () => {
    expect(mfmToHtml('**bold** <i>it</i> ~~gone~~ <small>s</small> `x<y`', ctx)).toBe(
      '<p><strong>bold</strong> <em>it</em> <del>gone</del> <small>s</small> <code>x&lt;y</code></p>',
    );
  });

  it('turns $[ruby] into a <ruby> with a reading', () => {
    expect(mfmToHtml('$[ruby 漢字 かんじ]', ctx)).toBe(
      '<p><ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby></p>',
    );
  });

  it('keeps the words of decorative $[fn] effects and drops the effect', () => {
    expect(mfmToHtml('$[x2 big] $[spin.speed=1s round]', ctx)).toBe('<p>big round</p>');
  });

  it('leaves custom emoji as :shortcode: for the card emoji pipe', () => {
    expect(mfmToHtml('hi :blobcat:', ctx)).toBe('<p>hi :blobcat:</p>');
  });

  it('links mentions to the reader server, resolving local ones to the author host', () => {
    expect(mfmToHtml('@alice@misskey.design', ctx)).toContain(
      'href="https://misskey.io/@alice@misskey.design"',
    );
    const remoteAuthor = { server: 'https://misskey.io', authorHost: 'example.social' };
    expect(mfmToHtml('@bob', remoteAuthor)).toContain(
      'href="https://misskey.io/@bob@example.social"',
    );
    expect(mfmToHtml('@carol', ctx)).toContain('href="https://misskey.io/@carol"');
  });

  it('sends hashtags to server search, not /tags/ (which the app would reroute)', () => {
    const html = mfmToHtml('#猫', ctx);
    expect(html).toContain(`href="https://misskey.io/search?q=${encodeURIComponent('#猫')}"`);
    expect(html).not.toContain('/tags/');
  });

  it('links only http(s) URLs', () => {
    expect(mfmToHtml('https://example.com/a?b=1', ctx)).toContain(
      'href="https://example.com/a?b=1"',
    );
    expect(mfmToHtml('[click](javascript:alert(1))', ctx)).not.toContain('href="javascript');
  });

  it('opens links in a new tab without a referrer', () => {
    expect(mfmToHtml('https://example.com', ctx)).toContain(
      'rel="nofollow noopener noreferrer" target="_blank"',
    );
  });

  it('renders quotes and code blocks as blocks outside paragraphs', () => {
    expect(mfmToHtml('before\n> quoted\nafter', ctx)).toBe(
      '<p>before</p><blockquote><p>quoted</p></blockquote><p>after</p>',
    );
    expect(mfmToHtml('```\na < b\n```', ctx)).toBe('<pre><code>a &lt; b</code></pre>');
  });
});

describe('safeHttpUrl', () => {
  it('accepts http and https and rejects everything else', () => {
    expect(safeHttpUrl('https://a.example/')).toBe('https://a.example/');
    expect(safeHttpUrl('http://a.example/x')).toBe('http://a.example/x');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,hi')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
  });
});
