import { describe, expect, it } from 'vitest';
import { parseFrontMatter, serializeFrontMatter, tagsFromBody } from './hugo-front-matter';

const FIELDS = {
  title: 'Hello world',
  date: '2026-08-05T14:31:00Z',
  draft: false,
  tags: [] as string[],
};

describe('serializeFrontMatter', () => {
  it('writes a TOML block Hugo would accept', () => {
    const file = serializeFrontMatter(FIELDS, 'Body text.');

    expect(file).toBe(
      [
        '+++',
        'title = "Hello world"',
        'date = 2026-08-05T14:31:00Z',
        'draft = false',
        '+++',
        '',
        'Body text.',
        '',
      ].join('\n'),
    );
  });

  it('escapes quotes and backslashes in a title without double-escaping', () => {
    const file = serializeFrontMatter({ ...FIELDS, title: 'The "C:\\Windows" problem' }, 'x');

    expect(file).toContain('title = "The \\"C:\\\\Windows\\" problem"');
  });

  it('collapses a newline in a title rather than emitting a multi-line string', () => {
    const file = serializeFrontMatter({ ...FIELDS, title: 'Two\nlines' }, 'x');

    expect(file).toContain('title = "Two lines"');
  });

  it('emits tags as an array and omits the key when there are none', () => {
    expect(serializeFrontMatter({ ...FIELDS, tags: ['hugo', 'blogging'] }, 'x')).toContain(
      'tags = ["hugo", "blogging"]',
    );
    expect(serializeFrontMatter(FIELDS, 'x')).not.toContain('tags');
  });

  it('quotes the date in YAML but leaves it bare in TOML', () => {
    expect(serializeFrontMatter(FIELDS, 'x', 'yaml')).toContain('date: "2026-08-05T14:31:00Z"');
    expect(serializeFrontMatter(FIELDS, 'x', 'toml')).toContain('date = 2026-08-05T14:31:00Z');
  });

  it('carries unmodelled lines through verbatim', () => {
    const file = serializeFrontMatter(FIELDS, 'x', 'toml', ['weight = 5', 'categories = ["dev"]']);

    expect(file).toContain('weight = 5');
    expect(file).toContain('categories = ["dev"]');
  });
});

describe('parseFrontMatter', () => {
  it('reads a TOML block', () => {
    const parsed = parseFrontMatter(
      '+++\ntitle = "Hello"\ndate = 2026-08-05T14:31:00Z\ndraft = true\ntags = ["a", "b"]\n+++\n\nBody.\n',
    );

    expect(parsed.format).toBe('toml');
    expect(parsed.missing).toBe(false);
    expect(parsed.title).toBe('Hello');
    expect(parsed.date).toBe('2026-08-05T14:31:00Z');
    expect(parsed.draft).toBe(true);
    expect(parsed.tags).toEqual(['a', 'b']);
    expect(parsed.body).toBe('Body.');
  });

  it('reads a YAML block and remembers that it was YAML', () => {
    const parsed = parseFrontMatter('---\ntitle: "Hello"\ndraft: false\n---\n\nBody.\n');

    expect(parsed.format).toBe('yaml');
    expect(parsed.title).toBe('Hello');
    expect(parsed.body).toBe('Body.');
  });

  it('treats a file with no front matter as all body rather than an error', () => {
    const parsed = parseFrontMatter('Just some markdown.\n');

    expect(parsed.missing).toBe(true);
    expect(parsed.title).toBeNull();
    expect(parsed.body).toBe('Just some markdown.');
  });

  it('survives CRLF line endings', () => {
    const parsed = parseFrontMatter('+++\r\ntitle = "Hello"\r\n+++\r\n\r\nBody.\r\n');

    expect(parsed.title).toBe('Hello');
    expect(parsed.body).toBe('Body.');
  });

  it('keeps a body that itself contains a fence', () => {
    const parsed = parseFrontMatter('+++\ntitle = "Hello"\n+++\n\nBefore\n\n---\n\nAfter\n');

    expect(parsed.title).toBe('Hello');
    expect(parsed.body).toContain('---');
    expect(parsed.body).toContain('After');
  });
});

describe('front matter round trip', () => {
  it('preserves every unmodelled key when only the title changes', () => {
    const original = [
      '+++',
      'title = "Old title"',
      'date = 2026-01-02T03:04:05Z',
      'draft = false',
      'weight = 5',
      'categories = ["dev", "notes"]',
      'aliases = ["/old-path/"]',
      '[params]',
      'hero = "img.png"',
      '+++',
      '',
      'The body.',
    ].join('\n');

    const parsed = parseFrontMatter(original);
    const rewritten = serializeFrontMatter(
      { title: 'New title', date: parsed.date!, draft: parsed.draft, tags: parsed.tags },
      parsed.body,
      parsed.format,
      parsed.extraLines,
    );

    expect(rewritten).toContain('title = "New title"');
    // The publish date is the post's, not the edit's.
    expect(rewritten).toContain('date = 2026-01-02T03:04:05Z');
    for (const survivor of [
      'weight = 5',
      'categories = ["dev", "notes"]',
      'aliases = ["/old-path/"]',
      '[params]',
      'hero = "img.png"',
    ]) {
      expect(rewritten).toContain(survivor);
    }
    expect(rewritten).toContain('The body.');
  });

  it('rewrites a YAML post as YAML, never converting it to TOML', () => {
    const parsed = parseFrontMatter('---\ntitle: "Old"\nlayout: special\n---\n\nBody.\n');
    const rewritten = serializeFrontMatter(
      { title: 'New', date: '2026-08-05T00:00:00Z', draft: false, tags: [] },
      parsed.body,
      parsed.format,
      parsed.extraLines,
    );

    expect(rewritten.startsWith('---\n')).toBe(true);
    expect(rewritten).not.toContain('+++');
    expect(rewritten).toContain('layout: special');
  });

  it('round-trips a title full of quotes through both directions', () => {
    const title = 'She said "hi" — a C:\\path\\ tale';
    const file = serializeFrontMatter({ ...FIELDS, title }, 'Body.');

    expect(parseFrontMatter(file).title).toBe(title);
  });
});

describe('tagsFromBody', () => {
  it('takes hashtags without the hash and deduplicates case-insensitively', () => {
    expect(tagsFromBody('A post about #Hugo and #hugo and #static-sites')).toEqual([
      'Hugo',
      'static-sites',
    ]);
  });

  it('ignores a hash inside a word or a heading', () => {
    expect(tagsFromBody('C# is fine, and a#b is not a tag')).toEqual([]);
  });

  it('caps how many tags one post can generate', () => {
    const body = Array.from({ length: 20 }, (_, i) => `#tag${i}`).join(' ');

    expect(tagsFromBody(body)).toHaveLength(8);
  });
});
