import { Injectable, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Api } from './api';
import { Auth } from './auth';
import { AnonymousTags } from './providers/anonymous/anonymous-tags';

export type ImportTagStatus = 'pending' | 'following' | 'followed' | 'already_followed' | 'failed';

export interface ImportTagRow {
  /** Normalized tag name, without the leading '#'. */
  tag: string;
  status: ImportTagStatus;
  error?: string;
}

/**
 * How many `followed_tags` pages the importer will read to learn what you
 * already follow. Two pages is 200 tags — enough to cover most people's whole
 * list in one or two requests, and a hard ceiling so a 5,000-tag account cannot
 * turn "import 20 tags" into fifty reads.
 */
export const PROBE_PAGES = 2;
/**
 * Below this many tags, an incomplete bulk probe is topped up with one `getTag`
 * per unknown tag. Worth ≤9 requests to know the answer exactly; not worth 50.
 */
export const SMALL_IMPORT = 10;

/** Longest hashtag we'll accept; Mastodon's own limit is 30 characters. */
const MAX_TAG_LENGTH = 30;

/**
 * Turn a pasted blob (or an uploaded file's text) into a deduped list of hashtags.
 *
 * Deliberately forgiving, because there is no standard hashtag export to import
 * from — people will paste whatever they have. Accepts, in any mix:
 * - one per line, with or without a leading '#'
 * - several per line, separated by commas, semicolons or spaces
 * - tag page URLs: https://host/tags/foo, /tags/foo, or host/tag/foo
 * - a one-column CSV with a header row naming the column
 */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    // Skip a CSV header rather than importing "hashtag" as a tag.
    if (
      !tags.length &&
      /^["']?(?:#?\s*)?(?:hashtag|tag|tag name|name)["']?\s*(?:,|$)/i.test(trimmed)
    ) {
      continue;
    }
    for (const token of trimmed.split(/[\s,;]+/)) {
      const tag = normalizeTag(token);
      if (tag && !seen.has(tag)) {
        seen.add(tag);
        tags.push(tag);
      }
    }
  }
  return tags;
}

/**
 * Normalize one token to a bare tag name; null if it isn't one.
 *
 * Mastodon tags are letters (any script), digits and underscores — no hyphens,
 * no dots. A
 * token carrying anything else is a stray word from a pasted sentence, not a
 * tag someone meant to follow, so it is dropped rather than mangled into one.
 */
export function normalizeTag(raw: string): string | null {
  let value = raw.trim().replace(/^["']|["']$/g, '');
  if (!value) {
    return null;
  }
  const url = value.match(/(?:^|\/\/)[^/]*\/tags?\/([^/?#]+)\/?$/i);
  if (url) {
    value = decodeURIComponent(url[1]);
  }
  value = value.replace(/^#/, '');
  if (
    !/^[\p{L}\p{N}_]+$/u.test(value) ||
    /^\p{N}+$/u.test(value) ||
    value.length > MAX_TAG_LENGTH
  ) {
    return null;
  }
  return value.toLowerCase();
}

/** Render followed tags in the one-per-line format `parseTags` reads back. */
export function followedTagsCsv(tags: readonly string[]): string {
  return ['Hashtag', ...tags.map((tag) => tag.replace(/^#/, '')), ''].join('\n');
}

/**
 * Client-side hashtag importer: follows a list of tags one at a time.
 *
 * Same shape as ImportFollows, for the same reasons — real Mastodon has no bulk
 * tag-follow API, requests are spaced out, and a 429 waits until
 * X-RateLimit-Reset (capped) or backs off exponentially, then retries the same
 * tag. Unlike follows there is no resolve step: a tag either exists or is
 * created on follow, so a row goes straight from pending to following.
 */
@Injectable({ providedIn: 'root' })
export class ImportTags {
  private api = inject(Api);
  private auth = inject(Auth);
  private anonymousTags = inject(AnonymousTags);

  readonly rows = signal<ImportTagRow[]>([]);
  readonly running = signal(false);
  /**
   * True when we learned the follow state of every tag in the list, so the
   * "already followed" count is the whole truth rather than a lower bound.
   *
   * The UI reports a net change only when this is set. A partial answer — we
   * checked the first 200 of your 5,000 tags — would make "3 of 50 were already
   * followed" read as fact when it is a floor, so nothing is claimed instead.
   */
  readonly knowsFollowState = signal(false);

  /** Spacing between tags; tests set this to 0. */
  delayMs = 250;
  /** Longest single rate-limit wait; tests set this low. */
  maxWaitMs = 5 * 60_000;

  private stopRequested = false;

  load(tags: string[]): void {
    this.rows.set(tags.map((tag) => ({ tag, status: 'pending' as const })));
  }

  stop(): void {
    this.stopRequested = true;
  }

  reset(): void {
    this.rows.set([]);
    this.running.set(false);
    this.knowsFollowState.set(false);
    this.stopRequested = false;
  }

  /** Follow every pending row, sequentially. Resolves when done or stopped. */
  async start(): Promise<void> {
    if (this.running()) {
      return;
    }
    this.stopRequested = false;
    this.running.set(true);
    try {
      await this.markAlreadyFollowed();
      for (let i = 0; i < this.rows().length; i++) {
        if (this.stopRequested) {
          break;
        }
        if (this.rows()[i].status !== 'pending') {
          continue;
        }
        await this.processRow(i);
        if (this.delayMs && !this.auth.isAnonymous) {
          await sleep(this.delayMs);
        }
      }
    } finally {
      this.running.set(false);
    }
  }

  /**
   * Mark the rows you already follow, so the run can skip them.
   *
   * Bounded on purpose. Following an already-followed tag is a harmless no-op
   * server-side, so this is an optimization and an honesty fix, never a
   * correctness one — which is why it is allowed to give up. The budget:
   *
   * - Up to {@link PROBE_PAGES} pages of `followed_tags` (2 requests). If the
   *   list ended inside that budget we know everything and can report a net
   *   change; if it did not, we still skip whatever overlap we found.
   * - Then, only for a small import whose bulk probe fell short, one `getTag`
   *   per still-unknown tag — at most {@link SMALL_IMPORT} - 1 requests.
   *
   * Anything past that is followed blind, because reading a 5,000-tag follow
   * list to save a handful of no-op writes is the trade backwards.
   *
   * A failed probe is not a failed import: it leaves every row pending and the
   * run proceeds exactly as it did before this existed.
   */
  private async markAlreadyFollowed(): Promise<void> {
    this.knowsFollowState.set(false);
    const tags = this.rows().map((row) => row.tag);
    if (!tags.length) {
      return;
    }

    if (this.auth.isAnonymous) {
      // Local state: the whole set is already in memory, so this is free and
      // always complete.
      this.skipFollowed(new Set(this.anonymousTags.tags()));
      this.knowsFollowState.set(true);
      return;
    }

    const followed = new Set<string>();
    let complete = false;
    try {
      let maxId: string | undefined;
      for (let page = 0; page < PROBE_PAGES; page++) {
        const result = await firstValueFrom(this.api.followedTagsPage(maxId));
        for (const tag of result.tags) {
          followed.add(tag.name.toLowerCase());
        }
        if (!result.nextMaxId || result.nextMaxId === maxId || !result.tags.length) {
          complete = true;
          break;
        }
        maxId = result.nextMaxId;
      }
    } catch {
      // Probing is optional, so a failure mid-walk is not fatal — but the tags
      // read before it are still known-followed and worth skipping, so fall
      // through with what we have rather than discarding it. `complete` stays
      // false, so nothing is claimed about the net change.
    }
    this.skipFollowed(followed);

    if (!complete && tags.length < SMALL_IMPORT) {
      // Few enough left that asking about each is cheaper than not knowing.
      complete = await this.probeRemaining();
    }
    this.knowsFollowState.set(complete);
  }

  /** Ask about each still-pending tag individually. False if any ask failed. */
  private async probeRemaining(): Promise<boolean> {
    const pending = this.rows()
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.status === 'pending');
    for (const { row, index } of pending) {
      if (this.stopRequested) {
        return false;
      }
      try {
        const tag = await firstValueFrom(this.api.getTag(row.tag));
        if (tag.following) {
          this.patch(index, { status: 'already_followed' });
        }
      } catch {
        return false;
      }
    }
    return true;
  }

  private skipFollowed(followed: ReadonlySet<string>): void {
    this.rows.update((rows) =>
      rows.map((row) =>
        row.status === 'pending' && followed.has(row.tag.toLowerCase())
          ? { ...row, status: 'already_followed' as const }
          : row,
      ),
    );
  }

  private async processRow(i: number): Promise<void> {
    const tag = this.rows()[i].tag;
    this.patch(i, { status: 'following' });
    try {
      if (this.auth.isAnonymous) {
        const result = this.anonymousTags.follow(tag);
        if (!result.ok) throw new Error(result.error);
      } else {
        // Following an already-followed tag is a harmless no-op server-side.
        await this.withRateLimitRetry(() => firstValueFrom(this.api.followTag(tag)));
      }
      this.patch(i, { status: 'followed' });
    } catch (err) {
      this.patch(i, { status: 'failed', error: describeHttpError(err) });
    }
  }

  private async withRateLimitRetry<T>(request: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await request();
      } catch (err) {
        const status = (err as HttpErrorResponse)?.status;
        if (status !== 429 || attempt >= 4 || this.stopRequested) {
          throw err;
        }
        await sleep(this.rateLimitWaitMs(err as HttpErrorResponse, attempt));
      }
    }
  }

  private rateLimitWaitMs(err: HttpErrorResponse, attempt: number): number {
    const reset = err.headers?.get('X-RateLimit-Reset');
    if (reset) {
      const until = Date.parse(reset) - Date.now();
      if (Number.isFinite(until) && until > 0) {
        return Math.min(until + 1000, this.maxWaitMs);
      }
    }
    return Math.min(5000 * 2 ** attempt, this.maxWaitMs);
  }

  private patch(i: number, changes: Partial<ImportTagRow>): void {
    this.rows.update((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...changes } : r)));
  }
}

function describeHttpError(err: unknown): string {
  const status = (err as HttpErrorResponse)?.status;
  if (status === 429) {
    return 'Rate limited — try again later.';
  }
  if (status === 422) {
    return 'The server rejected this hashtag.';
  }
  if (status) {
    return `Request failed (HTTP ${status}).`;
  }
  // The anonymous tag cap arrives as a plain Error whose message is the only
  // thing explaining why the run stopped; keep it. See ImportFollows.
  const message = err instanceof Error ? err.message.trim() : '';
  return message || 'Request failed.';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
