import { inject, Injectable } from '@angular/core';
import { HugoApiError, HugoContents } from './hugo-contents';
import { HugoSettings } from './hugo-settings';
import { PosseEntry, PosseQueue } from './posse-queue';

/**
 * Commit the queued interactions to the Hugo repo — one commit for the batch.
 *
 * "One commit" is the entire reason the queue exists (roadmap decision 3).
 * A like is a file write; twenty hearts committed individually would be twenty
 * site rebuilds.
 *
 * Entries land in `data/interactions/YYYY-MM-DD.json` rather than as one page
 * each. `data/` because these are records a template renders as a list, not
 * pages that each deserve their own URL — the indieweb-purist alternative (one
 * `content/likes/*.md` per like, each with a permalink) is more correct in
 * theory and is a rebuild per like.
 *
 * The write is Hugo sprint 2's update path exactly: read the file, keep its
 * `sha`, merge, `PUT` with that `sha`. A 409 means the day's file changed
 * underneath — most likely the same queue publishing from another device — so
 * it re-reads and merges rather than overwriting.
 */
const INTERACTIONS_DIR = 'data/interactions';

/** How many times a 409 is re-read and merged before giving up. */
const MAX_MERGE_ATTEMPTS = 3;

export interface PublishBatchResult {
  /** Local ids of entries the commit actually contains. */
  publishedIds: string[];
  /** How many were already in the file (published from elsewhere). */
  alreadyPresent: number;
  commitSha: string;
  path: string;
  /**
   * Where each published record will live on the built site, by entry id.
   *
   * This is the `source` a webmention needs: the receiver fetches it to verify
   * the link, so it must be a page a human can also read. The blog's content
   * adapter (`content/interactions/_content.gotmpl`) generates one page per
   * record at `/interactions/<day>-<n>/`, numbering from 1 in file order —
   * this mirrors that numbering, and the two must stay in step.
   *
   * **These URLs are not live until the site rebuilds.** Sending a webmention
   * whose source 404s gets it rejected by any receiver that verifies, which is
   * why delivery waits for the build.
   */
  sourceUrls: Record<string, string>;
}

/** One interaction as it is stored in the repo. */
interface StoredInteraction {
  kind: string;
  target: string;
  targetAuthor: string;
  targetExcerpt: string;
  text: string;
  provider: string;
  published: string;
}

@Injectable({ providedIn: 'root' })
export class PossePublish {
  private readonly contents = inject(HugoContents);
  private readonly queue = inject(PosseQueue);
  private readonly settings = inject(HugoSettings);

  /**
   * Publish everything currently queued.
   *
   * Only the entries the commit contains are dropped from the queue: a failure
   * leaves the queue exactly as it was, so nothing is lost by trying.
   */
  async publishAll(now = new Date()): Promise<PublishBatchResult> {
    const entries = this.queue.entries();
    if (!entries.length) {
      throw new Error('Nothing is waiting to be published.');
    }
    const path = `${INTERACTIONS_DIR}/${now.toISOString().slice(0, 10)}.json`;

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_MERGE_ATTEMPTS; attempt++) {
      try {
        const result = await this.commitInto(path, entries);
        this.queue.clearPublished(result.publishedIds);
        return result;
      } catch (error: unknown) {
        lastError = error;
        // 409 = the file moved on since we read it. Re-reading and merging is
        // the correct response; overwriting would discard whatever the other
        // writer added.
        if (!(error instanceof HugoApiError && error.status === 409)) {
          throw error;
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Could not publish these interactions.');
  }

  private async commitInto(
    path: string,
    entries: readonly PosseEntry[],
  ): Promise<PublishBatchResult> {
    const existing = await this.readExisting(path);
    const seen = new Set(existing.records.map((record) => key(record.kind, record.target)));

    const publishedIds: string[] = [];
    const merged = [...existing.records];
    /** Which queue entry produced which record, so source URLs survive sorting. */
    const idByKey = new Map<string, string>();
    let alreadyPresent = 0;

    for (const entry of entries) {
      const entryKey = key(entry.kind, entry.targetUrl);
      idByKey.set(entryKey, entry.id);
      publishedIds.push(entry.id);
      if (seen.has(entryKey)) {
        // Already recorded — by an earlier publish, or from another device.
        // It still counts as done, so it leaves the queue, and it still has a
        // source page (the one generated for the record already there).
        alreadyPresent++;
        continue;
      }
      seen.add(entryKey);
      merged.push({
        kind: entry.kind,
        target: entry.targetUrl,
        targetAuthor: entry.targetAuthor,
        targetExcerpt: entry.targetExcerpt,
        text: entry.text,
        provider: entry.provider,
        published: entry.queuedAt,
      });
    }

    // Sort first, then derive source URLs: the blog's content adapter numbers
    // pages by position in the *committed* array, so any index taken before
    // this would name the wrong page.
    merged.sort((a, b) => a.published.localeCompare(b.published));
    const sourceUrls: Record<string, string> = {};
    merged.forEach((record, index) => {
      const id = idByKey.get(key(record.kind, record.target));
      if (id) {
        sourceUrls[id] = this.sourceUrlFor(path, index);
      }
    });

    if (merged.length === existing.records.length) {
      // Everything was already there; committing an identical file would be an
      // empty commit and a pointless rebuild.
      return { publishedIds, alreadyPresent, commitSha: '', path, sourceUrls };
    }

    const commit = await this.contents.putFile({
      path,
      text: `${JSON.stringify(merged, null, 2)}\n`,
      message: `Record ${publishedIds.length} interaction${publishedIds.length === 1 ? '' : 's'}`,
      ...(existing.sha ? { sha: existing.sha } : {}),
    });

    return { publishedIds, alreadyPresent, commitSha: commit.commitSha, path, sourceUrls };
  }

  /**
   * The page the blog will generate for the record at `index` in `path`.
   *
   * Mirrors `content/interactions/_content.gotmpl`, which names pages
   * `<day>-<n>` counting from 1. Returns '' with no site URL configured — a
   * webmention cannot be sent without one, and a relative source is useless to
   * a receiver.
   */
  private sourceUrlFor(path: string, index: number): string {
    const siteUrl = this.settings.siteUrl();
    if (!siteUrl) {
      return '';
    }
    const day =
      path
        .split('/')
        .pop()
        ?.replace(/\.json$/, '') ?? '';
    try {
      return new URL(
        `interactions/${day}-${index + 1}/`,
        siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`,
      ).toString();
    } catch {
      return '';
    }
  }

  /** The day's file, or an empty one when today has no interactions yet. */
  private async readExisting(
    path: string,
  ): Promise<{ records: StoredInteraction[]; sha: string | null }> {
    try {
      const file = await this.contents.readFile(path);
      const parsed = JSON.parse(file.text) as unknown;
      return {
        records: Array.isArray(parsed) ? (parsed as StoredInteraction[]) : [],
        sha: file.sha,
      };
    } catch (error: unknown) {
      if (error instanceof HugoApiError && error.status === 404) {
        // First interaction of the day. No sha means "create", which is what
        // the contents API wants.
        return { records: [], sha: null };
      }
      if (error instanceof SyntaxError) {
        // A corrupt file must not wedge publishing forever, but silently
        // replacing it would destroy whatever is in there.
        throw new Error(
          `${path} in your repository is not valid JSON. Fix or delete it, then publish again.`,
          { cause: error },
        );
      }
      throw error;
    }
  }
}

function key(kind: string, target: string): string {
  return `${kind} ${target}`;
}
