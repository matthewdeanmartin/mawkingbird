/**
 * Turning a repo directory into a list of posts.
 *
 * Pure — the sorting and naming rules, with no HTTP — because the interesting
 * part is what to do when the front matter has not arrived yet. The listing
 * call gives us names and shas; titles and dates live inside each file, and
 * fetching four hundred files to render one page is not an option (see
 * {@link HYDRATE_LIMIT}). So every row has to be renderable from its filename
 * alone, and improve when its front matter lands.
 */

import { HugoDirEntry } from './hugo-contents';
import { ParsedPost } from './hugo-front-matter';

/**
 * How many files the page will open to read their front matter.
 *
 * The naive version — read every file in the directory — is fine on a twelve
 * post test repo and fires four hundred requests on a real blog, which is both
 * slow and a good way to meet GitHub's rate limit. Twenty is roughly one
 * screenful; the rest hydrate when the user asks for more.
 */
export const HYDRATE_LIMIT = 20;

/** Where a row's title and date came from, so the UI can be honest about it. */
export type PostRowSource = 'front-matter' | 'filename';

export interface HugoPostRow {
  /** Repo-relative path — the row's identity, and what an edit writes back to. */
  path: string;
  /** Filename without its extension. The slug, and the permalink's last part. */
  slug: string;
  /** Blob sha, which an update must send back. Changes when the file changes. */
  sha: string;
  title: string;
  /** ISO date if one could be determined, else null. */
  date: string | null;
  draft: boolean;
  /** Whether `title`/`date` are real or guessed from the filename. */
  source: PostRowSource;
}

/** Hugo's section index page. A section's front page, not a post. */
const SECTION_INDEX = /^_index\.(md|markdown)$/i;

/** `2026-08-05-hello-world.md` — the other convention for dating a post. */
const DATED_FILENAME = /^(\d{4}-\d{2}-\d{2})-(.*)$/;

/** Only Markdown files are posts. Images and data files sit in the same folder. */
export function isPostFile(entry: HugoDirEntry): boolean {
  return (
    entry.type === 'file' && /\.(md|markdown)$/i.test(entry.name) && !SECTION_INDEX.test(entry.name)
  );
}

/**
 * Un-slugify a filename into something readable.
 *
 * A guess, and labelled as one (`source: 'filename'`). `hello-world.md` reads
 * far better as "Hello world" than as a filename, and it is right often enough
 * to be worth showing while the real title is still in flight.
 */
export function titleFromFilename(name: string): string {
  const withoutExtension = name.replace(/\.(md|markdown)$/i, '');
  const withoutDate = DATED_FILENAME.exec(withoutExtension)?.[2] ?? withoutExtension;
  const words = withoutDate.replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : withoutExtension;
}

/** The date encoded in a filename, if it follows the dated convention. */
export function dateFromFilename(name: string): string | null {
  const match = DATED_FILENAME.exec(name);
  if (!match) {
    return null;
  }
  const parsed = new Date(`${match[1]}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** A row as it looks before its front matter has been read. */
export function rowFromEntry(entry: HugoDirEntry): HugoPostRow {
  return {
    path: entry.path,
    slug: entry.name.replace(/\.(md|markdown)$/i, ''),
    sha: entry.sha,
    title: titleFromFilename(entry.name),
    date: dateFromFilename(entry.name),
    draft: false,
    source: 'filename',
  };
}

/**
 * The same row once its file has been read.
 *
 * A post whose front matter has no title keeps the filename guess rather than
 * rendering blank — but it is still marked `front-matter`, because we did read
 * the file and "no title" is the truth about it.
 */
export function hydrateRow(row: HugoPostRow, parsed: ParsedPost): HugoPostRow {
  return {
    ...row,
    title: parsed.title?.trim() || row.title,
    date: normalizeDate(parsed.date) ?? row.date,
    draft: parsed.draft,
    source: 'front-matter',
  };
}

/** Front matter dates are written many ways; keep only what parses. */
function normalizeDate(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Newest first, with a defined answer for rows that have no date at all.
 *
 * Three tiers, because a list whose order changes as rows hydrate is worse than
 * one that is stably approximate: dated rows sort by date, undated rows fall to
 * the bottom sorted by filename descending (which puts the dated-filename
 * convention in the right order anyway). Sorting is stable within a tier, so a
 * row hydrating from filename-date to front-matter-date only moves if the two
 * genuinely disagree.
 */
export function sortRows(rows: readonly HugoPostRow[]): HugoPostRow[] {
  return [...rows].sort((a, b) => {
    if (a.date && b.date) {
      return b.date.localeCompare(a.date);
    }
    if (a.date) {
      return -1;
    }
    if (b.date) {
      return 1;
    }
    return b.slug.localeCompare(a.slug);
  });
}

/**
 * Which rows to read next: the newest `limit` that have not been read yet.
 *
 * Kept separate from the fetching so the budget is testable without HTTP. The
 * caller re-asks after each batch, so "show more" is just another call.
 */
export function rowsToHydrate(
  rows: readonly HugoPostRow[],
  limit: number = HYDRATE_LIMIT,
): HugoPostRow[] {
  return sortRows(rows)
    .filter((row) => row.source === 'filename')
    .slice(0, limit);
}
