import { computed, inject, Injectable, signal } from '@angular/core';
import { HugoContents } from './hugo-contents';
import { parseFrontMatter, ParsedPost } from './hugo-front-matter';
import {
  HYDRATE_LIMIT,
  HugoPostRow,
  hydrateRow,
  isPostFile,
  rowFromEntry,
  rowsToHydrate,
  sortRows,
} from './hugo-listing';
import { HugoSettings } from './hugo-settings';

/**
 * The posts already in the repo: list them, read them, and cache what was read.
 *
 * Two-phase on purpose. Listing the directory is one request and gives every
 * row a filename-derived title immediately; reading each file for its real
 * title is one request *per post*, so it is budgeted (see `HYDRATE_LIMIT`) and
 * happens after the list is already on screen.
 *
 * The cache is keyed by `path + sha`, which is not an optimisation so much as a
 * correctness rule: a file's sha changes exactly when its content does, so a
 * cache entry can never go stale without its key changing too. Editing a post
 * therefore invalidates its own cache entry for free.
 */
@Injectable({ providedIn: 'root' })
export class HugoPosts {
  private readonly contents = inject(HugoContents);
  private readonly settings = inject(HugoSettings);

  /** Parsed front matter, keyed by `${path}@${sha}`. Lives for the session. */
  private readonly cache = new Map<string, ParsedPost>();

  private readonly state = signal<HugoPostRow[]>([]);
  readonly rows = computed(() => sortRows(this.state()));
  readonly loading = signal(false);
  readonly hydrating = signal(false);
  readonly error = signal<string | null>(null);

  /** True while any row still has a guessed title that could be read for real. */
  readonly hasMoreToHydrate = computed(() => this.state().some((row) => row.source === 'filename'));

  /**
   * List the configured content folder, then read the newest batch.
   *
   * Errors from the listing are fatal to the page (there is nothing to show);
   * errors from an individual file read are not, and leave that row on its
   * filename guess. That asymmetry is deliberate: one unreadable post should
   * not blank out a working list.
   */
  async load(): Promise<void> {
    const repo = this.settings.repo();
    if (!repo) {
      this.error.set('Connect your Hugo repository in Settings first.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const entries = await this.contents.listDirectory(repo.contentPath);
      const rows = entries.filter(isPostFile).map(rowFromEntry);
      this.state.set(rows.map((row) => this.fromCache(row)));
    } catch (error: unknown) {
      this.state.set([]);
      this.error.set(error instanceof Error ? error.message : 'Could not read your posts folder.');
      return;
    } finally {
      this.loading.set(false);
    }
    await this.hydrate();
  }

  /** Read the next batch of files, replacing guessed titles with real ones. */
  async hydrate(limit: number = HYDRATE_LIMIT): Promise<void> {
    const pending = rowsToHydrate(this.state(), limit);
    if (!pending.length) {
      return;
    }
    this.hydrating.set(true);
    try {
      // In parallel: these are independent reads and the budget already bounds
      // how many are in flight.
      await Promise.all(pending.map((row) => this.readRow(row)));
    } finally {
      this.hydrating.set(false);
    }
  }

  /**
   * The full text of one post, for editing.
   *
   * Always a fresh read, never the cache: the cache holds a *parse*, and an
   * edit needs the current `sha` to write back with. Reading here is also the
   * last chance to notice the file changed since the list was drawn.
   */
  async open(path: string): Promise<{ parsed: ParsedPost; sha: string }> {
    const file = await this.contents.readFile(path);
    const parsed = parseFrontMatter(file.text);
    this.cache.set(cacheKey(path, file.sha), parsed);
    // The row may be carrying an older sha; correct it so a later edit does not
    // fail a concurrency check we already know the answer to.
    this.state.update((rows) =>
      rows.map((row) => (row.path === path ? hydrateRow({ ...row, sha: file.sha }, parsed) : row)),
    );
    return { parsed, sha: file.sha };
  }

  /** Forget everything, e.g. on disconnect. */
  reset(): void {
    this.cache.clear();
    this.state.set([]);
    this.error.set(null);
  }

  private async readRow(row: HugoPostRow): Promise<void> {
    try {
      const file = await this.contents.readFile(row.path);
      const parsed = parseFrontMatter(file.text);
      this.cache.set(cacheKey(row.path, file.sha), parsed);
      this.state.update((rows) =>
        rows.map((current) =>
          current.path === row.path ? hydrateRow({ ...current, sha: file.sha }, parsed) : current,
        ),
      );
    } catch {
      // One unreadable file keeps its filename guess. Deliberately silent: the
      // row is still usable and a per-row error would be noise on a page whose
      // job is to show a list.
    }
  }

  private fromCache(row: HugoPostRow): HugoPostRow {
    const parsed = this.cache.get(cacheKey(row.path, row.sha));
    return parsed ? hydrateRow(row, parsed) : row;
  }
}

function cacheKey(path: string, sha: string): string {
  return `${path}@${sha}`;
}
