import { computed, Injectable, signal } from '@angular/core';
import { scopedKey } from '../../account-scope';
import { ProviderId, Status } from '../../models';

/**
 * Interactions waiting to be recorded on your own site.
 *
 * POSSE — Publish (O)n your (O)wn (S)ite, (S)yndicate (E)lsewhere. The premise:
 * the record that you liked something currently lives only on someone else's
 * server and vanishes with it. Writing it to a repo you own makes it durable.
 *
 * **Queued rather than committed immediately**, because a like is a file
 * commit and twenty hearts in a session would be twenty commits and twenty site
 * rebuilds. The queue's visibility — a badge in the shell, a page listing it —
 * is what stops "not durable until you publish" from being a real objection.
 *
 * Nothing here talks to a network. Queueing is a synchronous localStorage write
 * that cannot fail a like: see `StatusCard.toggleFavourite`, where the Mastodon
 * (or Bluesky) request runs exactly as it always did and this is purely
 * additive.
 */
const STORAGE_KEY_BASE = 'mockingbird_posse_queue';

/** How many entries may wait before the queue refuses more. */
export const POSSE_QUEUE_LIMIT = 500;

export type PosseKind = 'like' | 'repost' | 'reply';

export interface PosseEntry {
  /** Local identity, for list keys and removal. Never leaves this browser. */
  id: string;
  kind: PosseKind;
  /**
   * The post being reacted to — the URL a webmention would target, and the URL
   * the published record links to.
   *
   * The load-bearing field, and the one that can be silently wrong. It must be
   * the post's **canonical public address** (`https://mastodon.social/@alice/1`),
   * never an API path and never a Mawkingbird route. `Status.url` already holds
   * this for every provider; an entry cannot be built without one.
   */
  targetUrl: string;
  /** Enough to render the queue without re-fetching anything. */
  targetAuthor: string;
  targetExcerpt: string;
  /** Reply text. Empty for likes and reposts. */
  text: string;
  /** Which network the original lives on, for the queue's provider badge. */
  provider: ProviderId;
  queuedAt: string;
}

function load(key: string): PosseEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    // A stored entry with no target cannot be published or rendered, so drop it
    // rather than carrying a row that will fail later.
    return parsed.filter(
      (entry: Partial<PosseEntry>): entry is PosseEntry =>
        typeof entry?.id === 'string' &&
        typeof entry.targetUrl === 'string' &&
        !!entry.targetUrl &&
        (entry.kind === 'like' || entry.kind === 'repost' || entry.kind === 'reply'),
    );
  } catch {
    return [];
  }
}

/** Plain text of a status body, trimmed for a one-line queue row. */
export function excerptOf(status: Status, max = 140): string {
  const text = (status.content ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

@Injectable({ providedIn: 'root' })
export class PosseQueue {
  private readonly storageKey = scopedKey(STORAGE_KEY_BASE);
  private readonly state = signal<PosseEntry[]>(load(this.storageKey));

  readonly entries = this.state.asReadonly();
  readonly count = computed(() => this.state().length);
  readonly isEmpty = computed(() => this.state().length === 0);

  /**
   * Queue an interaction, unless the same one is already waiting.
   *
   * Deduped on `kind + targetUrl`: liking, un-liking and re-liking a post
   * should leave exactly one record, not three. Returns the entry, or null when
   * it was rejected — no usable target URL, a duplicate, or the queue is full.
   * Callers deliberately ignore the result: a failure to queue must never
   * surface as a failure to like.
   */
  add(kind: PosseKind, status: Status, text = ''): PosseEntry | null {
    const targetUrl = status.url?.trim();
    if (!targetUrl) {
      // No canonical URL means nothing a record could point at. Inventing one
      // would produce a permanent link to a page that does not exist.
      return null;
    }
    if (this.has(kind, targetUrl)) {
      return null;
    }
    if (this.state().length >= POSSE_QUEUE_LIMIT) {
      return null;
    }

    const entry: PosseEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      targetUrl,
      targetAuthor: status.account?.acct ?? '',
      targetExcerpt: excerptOf(status),
      text: text.trim(),
      provider: status.provider ?? 'mastodon',
      queuedAt: new Date().toISOString(),
    };
    this.persist([...this.state(), entry]);
    return entry;
  }

  has(kind: PosseKind, targetUrl: string): boolean {
    return this.state().some((entry) => entry.kind === kind && entry.targetUrl === targetUrl);
  }

  /**
   * Drop a queued interaction, by kind and target.
   *
   * This is the un-like path: un-liking something you liked a moment ago should
   * leave nothing behind. Once an entry has been *published* it is a commit in
   * a repo and this queue has no further claim on it — the queue's job ends at
   * publication, and un-liking later does not chase it.
   */
  removeMatching(kind: PosseKind, targetUrl: string | null | undefined): void {
    if (!targetUrl) {
      return;
    }
    const next = this.state().filter(
      (entry) => !(entry.kind === kind && entry.targetUrl === targetUrl),
    );
    if (next.length !== this.state().length) {
      this.persist(next);
    }
  }

  /** Drop one entry by its local id — the queue page's remove button. */
  remove(id: string): void {
    this.persist(this.state().filter((entry) => entry.id !== id));
  }

  /**
   * Drop exactly the entries a publish actually committed.
   *
   * By id, not "clear everything": a partial publish must leave the rest
   * queued rather than silently discarding records that were never written.
   */
  clearPublished(ids: readonly string[]): void {
    const published = new Set(ids);
    this.persist(this.state().filter((entry) => !published.has(entry.id)));
  }

  clear(): void {
    this.persist([]);
  }

  private persist(entries: PosseEntry[]): void {
    this.state.set(entries);
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(entries));
    } catch {
      // Storage full or blocked. The in-memory queue still works for this
      // session, and a quota error is never a reason to fail the like that
      // triggered this write.
    }
  }
}
