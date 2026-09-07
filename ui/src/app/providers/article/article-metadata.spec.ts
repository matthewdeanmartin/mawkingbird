import { describe, expect, it } from 'vitest';
import {
  absoluteHttpUrl,
  declaredPaywalled,
  extractMetadata,
  trimSiteSuffix,
} from './article-metadata';

function doc(head: string, body = ''): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><head>${head}</head><body>${body}</body></html>`,
    'text/html',
  );
}

describe('extractMetadata', () => {
  it('prefers OpenGraph', () => {
    const card = extractMetadata(
      doc(`<title>Ignored</title>
           <meta property="og:title" content="Real Title">
           <meta property="og:description" content="A summary.">
           <meta property="og:site_name" content="Example Blog">`),
      'https://example.com/post',
    );
    expect(card?.title).toBe('Real Title');
    expect(card?.description).toBe('A summary.');
    expect(card?.provider_name).toBe('Example Blog');
  });

  it('falls back to Twitter card tags', () => {
    const card = extractMetadata(
      doc(`<meta name="twitter:title" content="Tweeted Title">
           <meta name="twitter:description" content="Tweeted summary.">`),
      'https://example.com/post',
    );
    expect(card?.title).toBe('Tweeted Title');
    expect(card?.description).toBe('Tweeted summary.');
  });

  it('falls back to JSON-LD', () => {
    const card = extractMetadata(
      doc(`<script type="application/ld+json">
             {"@type":"BlogPosting","headline":"Structured Title","author":{"name":"A. Writer"}}
           </script>`),
      'https://example.com/post',
    );
    expect(card?.title).toBe('Structured Title');
    expect(card?.author_name).toBe('A. Writer');
  });

  it('degrades to the title tag and the host', () => {
    const card = extractMetadata(doc('<title>Just A Title</title>'), 'https://www.example.com/p');
    expect(card?.title).toBe('Just A Title');
    // `www.` stripped: it is noise in a "where is this from" line.
    expect(card?.provider_name).toBe('example.com');
  });

  it('returns null when there is no title anywhere', () => {
    expect(extractMetadata(doc(''), 'https://example.com/p')).toBeNull();
  });

  it('resolves a relative image against the final URL', () => {
    const card = extractMetadata(
      doc(`<meta property="og:title" content="T">
           <meta property="og:image" content="/img/cover.jpg">`),
      'https://example.com/posts/one',
    );
    expect(card?.image).toBe('https://example.com/img/cover.jpg');
  });

  it('drops an image with an unsafe scheme', () => {
    const card = extractMetadata(
      doc(`<meta property="og:title" content="T">
           <meta property="og:image" content="javascript:alert(1)">`),
      'https://example.com/p',
    );
    expect(card?.image).toBeNull();
  });

  it('handles a @graph wrapper', () => {
    const card = extractMetadata(
      doc(`<script type="application/ld+json">
             {"@graph":[{"@type":"WebSite"},{"@type":"Article","headline":"In A Graph"}]}
           </script>`),
      'https://example.com/p',
    );
    expect(card?.title).toBe('In A Graph');
  });

  it('survives malformed JSON-LD', () => {
    // Extremely common in the wild; one bad block must not cost the next one.
    const card = extractMetadata(
      doc(`<script type="application/ld+json">{not json at all}</script>
           <script type="application/ld+json">{"@type":"Article","headline":"Second"}</script>`),
      'https://example.com/p',
    );
    expect(card?.title).toBe('Second');
  });
});

describe('declaredPaywalled', () => {
  it('reads a boolean isAccessibleForFree', () => {
    expect(
      declaredPaywalled(
        doc(`<script type="application/ld+json">
               {"@type":"NewsArticle","isAccessibleForFree":false}
             </script>`),
      ),
    ).toBe(true);
  });

  it('reads the string spelling publishers actually use', () => {
    expect(
      declaredPaywalled(
        doc(`<script type="application/ld+json">
               {"@type":"NewsArticle","isAccessibleForFree":"False"}
             </script>`),
      ),
    ).toBe(true);
  });

  it('reads a locked content tier', () => {
    expect(declaredPaywalled(doc('<meta name="article:content_tier" content="locked">'))).toBe(
      true,
    );
  });

  it('is false for a free article', () => {
    expect(
      declaredPaywalled(
        doc(`<script type="application/ld+json">
               {"@type":"Article","isAccessibleForFree":true}
             </script>`),
      ),
    ).toBe(false);
  });
});

describe('trimSiteSuffix', () => {
  it('removes a trailing site name', () => {
    expect(trimSiteSuffix('A Real Post | Example Blog', 'Example Blog')).toBe('A Real Post');
    expect(trimSiteSuffix('A Real Post — Example Blog', 'Example Blog')).toBe('A Real Post');
  });

  it('leaves a title whose tail is not the site name', () => {
    expect(trimSiteSuffix('Part One | Part Two', 'Example Blog')).toBe('Part One | Part Two');
  });

  it('refuses to reduce a title to a fragment', () => {
    expect(trimSiteSuffix('Hi | Example Blog', 'Example Blog')).toBe('Hi | Example Blog');
  });
});

describe('absoluteHttpUrl', () => {
  it('resolves relative URLs', () => {
    expect(absoluteHttpUrl('b.png', 'https://e.com/a/c.html')).toBe('https://e.com/a/b.png');
  });

  it('refuses non-http schemes', () => {
    expect(absoluteHttpUrl('javascript:alert(1)', 'https://e.com/')).toBeNull();
    expect(absoluteHttpUrl('data:text/html,x', 'https://e.com/')).toBeNull();
  });

  it('returns null for nothing', () => {
    expect(absoluteHttpUrl(null, 'https://e.com/')).toBeNull();
  });
});
