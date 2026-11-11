import { describe, expect, it } from 'vitest';
import { HugoDirEntry } from './hugo-contents';
import { ParsedPost } from './hugo-front-matter';
import {
  dateFromFilename,
  HugoPostRow,
  hydrateRow,
  isPostFile,
  rowFromEntry,
  rowsToHydrate,
  sortRows,
  titleFromFilename,
} from './hugo-listing';

function entry(name: string, type: HugoDirEntry['type'] = 'file'): HugoDirEntry {
  return { name, path: `content/posts/${name}`, sha: `sha-${name}`, size: 10, type };
}

function parsed(over: Partial<ParsedPost> = {}): ParsedPost {
  return {
    format: 'toml',
    missing: false,
    title: null,
    date: null,
    draft: false,
    tags: [],
    extraLines: [],
    body: '',
    ...over,
  };
}

describe('isPostFile', () => {
  it('takes markdown files', () => {
    expect(isPostFile(entry('hello.md'))).toBe(true);
    expect(isPostFile(entry('hello.markdown'))).toBe(true);
  });

  it('skips images and data files that share the folder', () => {
    expect(isPostFile(entry('hero.png'))).toBe(false);
    expect(isPostFile(entry('data.json'))).toBe(false);
  });

  it('skips _index.md, which is a section front page and not a post', () => {
    expect(isPostFile(entry('_index.md'))).toBe(false);
    expect(isPostFile(entry('_index.markdown'))).toBe(false);
  });

  it('skips directories', () => {
    expect(isPostFile(entry('2026', 'dir'))).toBe(false);
  });
});

describe('titleFromFilename', () => {
  it('un-slugifies into something readable', () => {
    expect(titleFromFilename('hello-world.md')).toBe('Hello world');
  });

  it('drops a leading date from the dated-filename convention', () => {
    expect(titleFromFilename('2026-08-05-hello-world.md')).toBe('Hello world');
  });

  it('keeps the raw name when there is nothing to un-slugify', () => {
    expect(titleFromFilename('README.md')).toBe('README');
  });
});

describe('dateFromFilename', () => {
  it('reads the dated convention', () => {
    expect(dateFromFilename('2026-08-05-hello.md')).toBe('2026-08-05T00:00:00.000Z');
  });

  it('returns null for an undated name', () => {
    expect(dateFromFilename('hello.md')).toBeNull();
  });

  it('returns null for a date that is not real', () => {
    expect(dateFromFilename('2026-13-45-hello.md')).toBeNull();
  });
});

describe('rowFromEntry', () => {
  it('produces a renderable row before the file has been read', () => {
    const row = rowFromEntry(entry('2026-08-05-hello-world.md'));

    expect(row).toMatchObject({
      path: 'content/posts/2026-08-05-hello-world.md',
      slug: '2026-08-05-hello-world',
      title: 'Hello world',
      date: '2026-08-05T00:00:00.000Z',
      source: 'filename',
    });
  });
});

describe('hydrateRow', () => {
  it('replaces the guess with the real title and date', () => {
    const row = hydrateRow(
      rowFromEntry(entry('hello-world.md')),
      parsed({ title: 'A Much Better Title', date: '2026-01-02T03:04:05Z', draft: true }),
    );

    expect(row.title).toBe('A Much Better Title');
    expect(row.date).toBe('2026-01-02T03:04:05.000Z');
    expect(row.draft).toBe(true);
    expect(row.source).toBe('front-matter');
  });

  it('keeps the filename guess when front matter has no title', () => {
    const row = hydrateRow(rowFromEntry(entry('hello-world.md')), parsed());

    expect(row.title).toBe('Hello world');
    // Still 'front-matter': the file WAS read, and "no title" is the truth.
    expect(row.source).toBe('front-matter');
  });

  it('ignores an unparseable front-matter date rather than blanking the row', () => {
    const row = hydrateRow(
      rowFromEntry(entry('2026-08-05-hello.md')),
      parsed({ date: 'last Tuesday' }),
    );

    expect(row.date).toBe('2026-08-05T00:00:00.000Z');
  });
});

describe('sortRows', () => {
  function row(slug: string, date: string | null): HugoPostRow {
    return {
      path: `content/posts/${slug}.md`,
      slug,
      sha: 's',
      title: slug,
      date,
      draft: false,
      source: 'filename',
    };
  }

  it('puts newest first', () => {
    const sorted = sortRows([
      row('old', '2020-01-01T00:00:00Z'),
      row('new', '2026-01-01T00:00:00Z'),
      row('mid', '2023-01-01T00:00:00Z'),
    ]);

    expect(sorted.map((r) => r.slug)).toEqual(['new', 'mid', 'old']);
  });

  it('sinks undated rows below dated ones, ordered by filename descending', () => {
    const sorted = sortRows([
      row('apple', null),
      row('dated', '2026-01-01T00:00:00Z'),
      row('banana', null),
    ]);

    expect(sorted.map((r) => r.slug)).toEqual(['dated', 'banana', 'apple']);
  });

  it('does not mutate its input', () => {
    const rows = [row('a', '2020-01-01T00:00:00Z'), row('b', '2026-01-01T00:00:00Z')];
    sortRows(rows);

    expect(rows.map((r) => r.slug)).toEqual(['a', 'b']);
  });
});

describe('rowsToHydrate', () => {
  const many = Array.from({ length: 100 }, (_, i) =>
    rowFromEntry(entry(`2026-01-${String((i % 28) + 1).padStart(2, '0')}-post-${i}.md`)),
  );

  it('caps how many files one pass will open', () => {
    expect(rowsToHydrate(many)).toHaveLength(20);
  });

  it('never re-reads a row that already has real front matter', () => {
    const hydrated = many.map((row) => hydrateRow(row, parsed({ title: 'Read' })));

    expect(rowsToHydrate(hydrated)).toHaveLength(0);
  });

  it('takes the newest first, so the top of the list resolves first', () => {
    const rows = [
      rowFromEntry(entry('2020-01-01-old.md')),
      rowFromEntry(entry('2026-01-01-new.md')),
    ];

    expect(rowsToHydrate(rows, 1)[0].slug).toBe('2026-01-01-new');
  });
});
