import { describe, expect, it } from 'vitest';
import {
  bumpSlug,
  normalizeContentPath,
  postPath,
  postSlug,
  predictedPermalink,
  slugify,
} from './hugo-post';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Hello, World! Again')).toBe('hello-world-again');
  });

  it('folds diacritics instead of dropping the letters', () => {
    expect(slugify('Café naïve résumé')).toBe('cafe-naive-resume');
  });

  it('collapses runs and trims stray hyphens', () => {
    expect(slugify('  --- Spaced   out ---  ')).toBe('spaced-out');
  });

  it('returns empty for a title with nothing latin in it', () => {
    expect(slugify('🎉🎉🎉')).toBe('');
    expect(slugify('日本語のタイトル')).toBe('');
  });

  it('caps length on a word boundary', () => {
    const slug = slugify(
      'the quick brown fox jumps over the lazy dog and then keeps on running',
      30,
    );

    expect(slug.length).toBeLessThanOrEqual(30);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug).toBe('the-quick-brown-fox-jumps');
  });
});

describe('postSlug', () => {
  it('uses the slug when there is one', () => {
    expect(postSlug('Hello World')).toBe('hello-world');
  });

  it('falls back to a dated slug when the title slugifies to nothing', () => {
    const slug = postSlug('日本語のタイトル', new Date('2026-08-05T12:00:00Z'), () => 0.5);

    expect(slug).toMatch(/^2026-08-05-[0-9a-f]{4}$/);
  });

  it('pads a small random suffix to four hex digits', () => {
    expect(postSlug('🎉', new Date('2026-08-05T12:00:00Z'), () => 0)).toBe('2026-08-05-0000');
  });
});

describe('normalizeContentPath', () => {
  it('strips leading, trailing and duplicated slashes', () => {
    expect(normalizeContentPath('/content//posts/')).toBe('content/posts');
  });

  it('accepts windows separators and a leading dot-slash', () => {
    expect(normalizeContentPath('.\\content\\posts')).toBe('content/posts');
  });

  it('rejects an empty path with an actionable message', () => {
    expect(() => normalizeContentPath('   ')).toThrow(/content\/posts/);
  });

  it('refuses to escape the repository', () => {
    expect(() => normalizeContentPath('../../etc')).toThrow(/inside the repository/);
  });
});

describe('postPath', () => {
  it('joins the normalized folder and the slug', () => {
    expect(postPath('/content/posts/', 'hello')).toBe('content/posts/hello.md');
  });
});

describe('bumpSlug', () => {
  it('leaves the first attempt alone and numbers the rest', () => {
    expect(bumpSlug('hello', 1)).toBe('hello');
    expect(bumpSlug('hello', 2)).toBe('hello-2');
    expect(bumpSlug('hello', 3)).toBe('hello-3');
  });

  it('appends rather than editing a number the title itself ended with', () => {
    expect(bumpSlug('part-2', 2)).toBe('part-2-2');
  });
});

describe('predictedPermalink', () => {
  it('drops the content/ root and keeps the section', () => {
    expect(predictedPermalink('https://me.github.io/blog/', 'content/posts', 'hello')).toBe(
      'https://me.github.io/blog/posts/hello/',
    );
  });

  it('tolerates a site URL with no trailing slash', () => {
    expect(predictedPermalink('https://example.com', 'content/posts', 'hello')).toBe(
      'https://example.com/posts/hello/',
    );
  });

  it('handles a nested section', () => {
    expect(predictedPermalink('https://example.com/', 'content/blog/notes', 'hello')).toBe(
      'https://example.com/blog/notes/hello/',
    );
  });

  it('returns null when there is no site URL, so callers link to GitHub instead', () => {
    expect(predictedPermalink(null, 'content/posts', 'hello')).toBeNull();
  });

  it('returns null rather than throwing on an unparseable site URL', () => {
    expect(predictedPermalink('not a url', 'content/posts', 'hello')).toBeNull();
  });
});
