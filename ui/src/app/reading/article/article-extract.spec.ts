import { describe, expect, it } from 'vitest';
import { extractArticle } from './article-extract';
import { renderMarkdown } from './markdown-render';

/**
 * The corpus that decides whether this feature is viable.
 *
 * Each case is a shape of page the extractor will actually meet. The assertions
 * are about the *verdict* — did we render, and did we name the right reason —
 * because that is what the reader sees. Exact word counts are deliberately
 * ranges: tightening them would make the tests break on harmless tuning.
 */

/** Enough prose to clear the quality gate, in `count` paragraphs. */
function prose(
  count: number,
  sentence = 'The quick brown fox jumps over the lazy dog, twice.',
): string {
  return Array.from(
    { length: count },
    () => `<p>${Array.from({ length: 6 }, () => sentence).join(' ')}</p>`,
  ).join('');
}

function page(body: string, head = ''): string {
  return `<!doctype html><html><head><title>Test Page</title>${head}</head><body>${body}</body></html>`;
}

describe('extractArticle', () => {
  it('extracts a plain semantic blog post', () => {
    const html = page(
      `<nav><a href="/">Home</a><a href="/about">About</a></nav>
       <article><h1>On Writing</h1>${prose(5)}</article>
       <footer><a href="/rss">RSS</a></footer>`,
      '<meta property="og:title" content="On Writing">',
    );
    const result = extractArticle(html, 'https://blog.example/on-writing');
    expect(result.diagnosis).toBe('ok');
    expect(result.article).not.toBeNull();
    expect(result.article!.title).toBe('On Writing');
    expect(result.article!.markdown).toContain('quick brown fox');
    // Furniture is gone.
    expect(result.article!.markdown).not.toContain('About');
  });

  it('scores its way to the body when the markup is not semantic', () => {
    const html = page(
      `<div id="wrapper">
         <div class="menu"><a href="/a">A</a><a href="/b">B</a><a href="/c">C</a></div>
         <div class="entry-content"><h1>Scored</h1>${prose(6)}</div>
       </div>`,
    );
    const result = extractArticle(html, 'https://blog.example/scored');
    expect(result.diagnosis).toBe('ok');
    expect(result.article!.markdown).toContain('quick brown fox');
  });

  it('does not treat an index page of articles as one article', () => {
    // Several <article> elements means a listing, so the semantic shortcut must
    // not fire; what is left is short teasers, which the gate should reject.
    const html = page(
      `<main>
         <article><h2><a href="/1">First</a></h2><p>Teaser one.</p></article>
         <article><h2><a href="/2">Second</a></h2><p>Teaser two.</p></article>
         <article><h2><a href="/3">Third</a></h2><p>Teaser three.</p></article>
       </main>`,
    );
    const result = extractArticle(html, 'https://blog.example/');
    expect(result.article).toBeNull();
  });

  it('rejects a navigation-heavy homepage as junk', () => {
    const links = Array.from(
      { length: 60 },
      (_, i) => `<a href="/p/${i}">Some link title number ${i}</a>`,
    ).join(' ');
    const html = page(`<div id="main"><div class="links">${links}</div></div>`);
    const result = extractArticle(html, 'https://example.com/');
    expect(result.article).toBeNull();
    expect(result.diagnosis).toBe('junk');
  });

  it('names a bot challenge rather than reporting junk', () => {
    const html = page(
      '<div id="cf-wrapper"><h1>Just a moment…</h1><p>Verify you are human before continuing.</p></div>',
    );
    const result = extractArticle(html, 'https://guarded.example/post');
    expect(result.diagnosis).toBe('bot-check');
    expect(result.article).toBeNull();
  });

  it('names a JavaScript-only page', () => {
    const html = page('<div id="root"></div><script src="/app.js"></script>');
    const result = extractArticle(html, 'https://spa.example/post');
    expect(result.diagnosis).toBe('needs-js');
  });

  it("believes a publisher's own paywall declaration", () => {
    // The best paywall signal there is, because it is set deliberately.
    const html = page(
      `<article><h1>Locked</h1>${prose(5)}</article>`,
      `<script type="application/ld+json">
         {"@type":"NewsArticle","headline":"Locked","isAccessibleForFree":false}
       </script>`,
    );
    const result = extractArticle(html, 'https://news.example/locked');
    expect(result.diagnosis).toBe('paywall');
  });

  it('names a consent wall', () => {
    const html = page(
      `<div id="consent"><h1>Your privacy</h1>
        <p>We and our partners store and/or access information on a device.</p>
        <p>We process data for legitimate interest purposes.</p>
        <button>Accept all cookies</button></div>`,
    );
    const result = extractArticle(html, 'https://news.example/story');
    expect(result.diagnosis).toBe('consent-wall');
  });

  it('renders a short piece as partial rather than refusing it', () => {
    // A lede and two paragraphs beat a bare link, so `thin` renders — with a
    // caveat rather than silence.
    const html = page(`<article><h1>Short</h1>${prose(3)}</article>`);
    const result = extractArticle(html, 'https://blog.example/short');
    expect(result.diagnosis).toBe('partial');
    expect(result.article!.quality).toBe('thin');
  });

  it('always produces a card, even when extraction fails', () => {
    // The property that keeps the failure path from being a dead end.
    const html = page(
      '<div id="root"></div>',
      [
        '<meta property="og:title" content="A Locked Story">',
        '<meta property="og:description" content="You cannot read this.">',
        '<meta property="og:image" content="/cover.jpg">',
        '<meta property="og:site_name" content="The Example">',
      ].join(''),
    );
    const result = extractArticle(html, 'https://news.example/story');
    expect(result.article).toBeNull();
    expect(result.card).not.toBeNull();
    expect(result.card!.title).toBe('A Locked Story');
    expect(result.card!.image).toBe('https://news.example/cover.jpg');
    expect(result.card!.provider_name).toBe('The Example');
  });

  it('resolves relative URLs against the final URL, not the requested one', () => {
    // The redirect case: a shortened link whose images would otherwise 404.
    const html = page(
      `<article><h1>Pictures</h1>${prose(5)}<img src="cover.png" alt="Cover"></article>`,
    );
    const result = extractArticle(
      html,
      'https://blog.example/posts/pictures',
      'https://bit.ly/abc',
    );
    expect(result.article!.images).toContain('https://blog.example/posts/cover.png');
    expect(result.finalUrl).toBe('https://blog.example/posts/pictures');
    expect(result.requestedUrl).toBe('https://bit.ly/abc');
  });

  /**
   * The Readability fallback.
   *
   * Each case is a page the in-house scorer gets wrong, and the assertion is
   * that the reader still gets an article. These are the pages behind "it
   * succeeds sometimes, but often fails and is frustrating".
   */
  describe('Readability fallback', () => {
    it('rescues an article whose container has a junk-sounding class', () => {
      // `stripFurniture` deletes anything matching JUNK_PATTERN, and both
      // "sidebar" and "comment" match. The real article is inside, so our own
      // pass removes the body it was looking for and finds nothing.
      // Readability scores the untouched document and finds the prose.
      const html = page(
        `<div id="sidebar-wrapper">
           <div class="comment-body"><h1>Real Article</h1>${prose(8)}</div>
         </div>`,
      );
      const result = extractArticle(html, 'https://blog.example/rescued');

      expect(result.article).not.toBeNull();
      expect(result.article!.markdown).toContain('quick brown fox');
      expect(result.diagnosis).not.toBe('junk');
    });

    it('rescues prose that sits directly in the body with no container', () => {
      // No element to elect as the root, so `findArticleRoot` has nothing to
      // return and the in-house path exits at `junk`.
      const html = page(`<h1>Bare</h1>${prose(8)}`);
      const result = extractArticle(html, 'https://blog.example/bare');

      expect(result.article).not.toBeNull();
      expect(result.article!.markdown).toContain('quick brown fox');
    });

    it('still refuses a page that is genuinely navigation soup', () => {
      // The gate applies to Readability's output too. Being better on average
      // does not earn it the right to bypass the check that keeps the button
      // honest — a false "good" costs more than a false "junk".
      const links = Array.from(
        { length: 60 },
        (_, i) => `<li><a href="/p/${i}">Some link number ${i}</a></li>`,
      ).join('');
      const html = page(`<div class="listing"><ul>${links}</ul></div>`);
      const result = extractArticle(html, 'https://blog.example/index');

      expect(result.article).toBeNull();
      expect(result.diagnosis).toBe('junk');
    });

    it('leaves a page our own extractor already reads well alone', () => {
      // The fallback is a fallback. A clean semantic article must not be routed
      // through it, because that would pay a document clone on the common case.
      const html = page(`<article><h1>On Writing</h1>${prose(5)}</article>`);
      const result = extractArticle(html, 'https://blog.example/on-writing');

      expect(result.diagnosis).toBe('ok');
      expect(result.article!.markdown).toContain('quick brown fox');
    });

    it('does not let the fallback corrupt the metadata card', () => {
      // Readability has its own title and byline guesses, and they are weaker
      // than the page's own metadata. The card must still win.
      const html = page(
        `<div class="comment-body"><h1>Inner Heading</h1>${prose(8)}</div>`,
        '<meta property="og:title" content="Canonical Title">',
      );
      const result = extractArticle(html, 'https://blog.example/meta');

      expect(result.article).not.toBeNull();
      expect(result.article!.title).toBe('Canonical Title');
    });
  });
});

describe('extraction is not a script vector', () => {
  it('drops scripts, handlers and javascript: URLs end to end', () => {
    const html = page(
      `<article><h1>Hostile</h1>
        <script>alert('xss')</script>
        <p onclick="alert('xss')">Ordinary text follows here and continues.</p>
        <p><a href="javascript:alert('xss')">click me</a></p>
        <p><img src="x" onerror="alert('xss')"></p>
        ${prose(5)}
      </article>`,
    );
    const result = extractArticle(html, 'https://hostile.example/post');
    const rendered = renderMarkdown(result.article!.markdown);

    expect(rendered).not.toContain('<script');
    expect(rendered).not.toContain('onclick');
    expect(rendered).not.toContain('onerror');
    expect(rendered).not.toContain('javascript:');
    // The link's text survives even though its destination did not.
    expect(rendered).toContain('click me');
  });
});
