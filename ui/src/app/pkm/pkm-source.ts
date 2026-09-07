import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from '../api';
import { Auth } from '../auth';
import { ClientPrefs } from '../client-prefs';
import { Draft, Drafts } from '../drafts';
import { Status } from '../models';
import { stripHtml } from '../sentiment';
import { PkmKind, pkmKinds } from './pkm-tags';

/**
 * How far back a note or to-do stays interesting.
 *
 * Deliberately *not* `SELF_DRAFT_MAX_AGE_DAYS` (30), which bounds the drafts
 * list. The two answer different questions: a draft you abandoned six weeks ago
 * has stopped being a draft, but a to-do you wrote six weeks ago is still owed
 * a reply, and a note is worth keeping precisely because it outlives the day it
 * was written.
 */
export const PKM_MAX_AGE_DAYS = 180;

/** Statuses per page when scanning your own posts for tagged ones. */
const PKM_SCAN_LIMIT = 40;

/**
 * Pages to scan before giving up.
 *
 * Capped so a prolific account doesn't fire fifteen requests on route entry.
 * Missing the oldest few notes is a much cheaper failure than making the page
 * slow every time it opens — and the ones missed are the ones least likely to
 * still matter.
 */
const PKM_SCAN_MAX_PAGES = 3;

const PREVIEW_CHARS = 140;

export type PkmSourceKind = 'local' | 'self';

/**
 * Where a PKM item lives.
 *
 * A discriminated union rather than a boolean because the PKM epic will add
 * sources — bookmarks, links, scheduled items — and this is where they go.
 * Nothing outside this module may assume there are only two.
 */
export type PkmItemSource = { kind: 'local'; draft: Draft } | { kind: 'self'; status: Status };

/** One row in the notes list, whatever it came from. */
export interface PkmItem {
  /** Unique across sources — ids are only unique within one. */
  key: string;
  id: string;
  /** Every kind this item carries; a post can be both a note and a to-do. */
  kinds: PkmKind[];
  at: string;
  preview: string;
  source: PkmItemSource;
}

export interface PkmSourceError {
  kind: PkmSourceKind;
  message: string;
}

function truncate(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '(empty)';
  }
  return trimmed.length > PREVIEW_CHARS ? `${trimmed.slice(0, PREVIEW_CHARS)}…` : trimmed;
}

/** A draft's segments as one body, for tag matching and preview. */
function draftText(draft: Draft): string {
  return draft.segments.filter((s) => s.trim()).join('\n\n');
}

/**
 * Whether a status is one of the user's own private notes-to-self.
 *
 * The same predicate the drafts list uses, and for the same reason: `direct`
 * with zero mentions is a note to nobody, while a real DM always mentions the
 * person it is addressed to. Missing `mentions` is treated as "not a note"
 * rather than "no mentions" — surfacing someone's actual private message in a
 * notes pane is a far worse failure than omitting one note-to-self.
 */
export function isSelfNote(status: Status, accountId: string): boolean {
  if (status.account?.id !== accountId || status.visibility !== 'direct' || status.reblog) {
    return false;
  }
  return Array.isArray(status.mentions) && status.mentions.length === 0;
}

/** Whether a status is recent enough to still count as live PKM. */
export function withinPkmAge(status: Status, now: number = Date.now()): boolean {
  const created = Date.parse(status.created_at);
  if (Number.isNaN(created)) {
    return false;
  }
  return now - created <= PKM_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

export function localPkmItem(draft: Draft, kinds: PkmKind[]): PkmItem {
  return {
    key: `local:${draft.id}`,
    id: draft.id,
    kinds,
    at: draft.updatedAt,
    preview: truncate(draftText(draft)),
    source: { kind: 'local', draft },
  };
}

export function selfPkmItem(status: Status, kinds: PkmKind[]): PkmItem {
  return {
    key: `self:${status.id}`,
    id: status.id,
    kinds,
    at: status.created_at,
    preview: truncate(stripHtml(status.content)),
    source: { kind: 'self', status },
  };
}

/**
 * The user's own notes and to-dos, from everywhere one can live.
 *
 * Modelled on `DraftSources`, deliberately: same independent per-source
 * loading, same per-source error capture, same anonymous fast path that issues
 * no requests at all. Mastodon has no notes API, so a PKM item is either a
 * local draft carrying the tag or a real self-post carrying it — and the user
 * should see both in one list rather than learning two hiding places.
 *
 * This is the *writing* slice of PKM. The wider PKM epic will add sources to
 * {@link PkmItemSource}; it should not have to change this service's shape to
 * do it.
 */
@Injectable({ providedIn: 'root' })
export class PkmSource {
  private api = inject(Api);
  private auth = inject(Auth);
  private drafts = inject(Drafts);
  private prefs = inject(ClientPrefs);

  /** Tagged self-posts found by the last scan. */
  private readonly selfNotes = signal<PkmItem[]>([]);
  private readonly errors = signal<PkmSourceError[]>([]);
  readonly loading = signal(false);
  readonly loaded = signal(false);

  readonly sourceErrors = this.errors.asReadonly();

  /**
   * Local drafts carrying a PKM tag.
   *
   * A computed rather than a stored list, so writing `#todo` into a draft makes
   * it appear in the notes pane immediately — no reload, no refresh button.
   * Recomputes when the vocabulary changes too, which is what makes renaming
   * the tag word feel instant.
   */
  private readonly localNotes = computed(() => {
    const vocab = this.prefs.pkmVocabulary();
    const items: PkmItem[] = [];
    for (const draft of this.drafts.drafts()) {
      const kinds = pkmKinds(draftText(draft), vocab);
      if (kinds.length) {
        items.push(localPkmItem(draft, kinds));
      }
    }
    return items;
  });

  /** Every PKM item, newest first. */
  readonly items = computed(() =>
    [...this.localNotes(), ...this.selfNotes()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
  );

  /** How many items carry each kind. An item counts once per kind it carries. */
  readonly counts = computed(() => {
    const counts: Record<PkmKind, number> = { note: 0, todo: 0, cal: 0 };
    for (const item of this.items()) {
      for (const kind of item.kinds) {
        counts[kind]++;
      }
    }
    return counts;
  });

  /** Items carrying a given kind, or everything when `kind` is null. */
  byKind(kind: PkmKind | null): PkmItem[] {
    const items = this.items();
    return kind ? items.filter((item) => item.kinds.includes(kind)) : items;
  }

  /**
   * Scan the account's own recent posts for tagged ones.
   *
   * Local items need no loading — they are a computed over a signal, so they
   * are already there and stay live.
   */
  load(): void {
    this.errors.set([]);
    const accountId = this.auth.account()?.id;
    if (this.auth.isAnonymous || !accountId) {
      // No server identity: nothing to ask for, and asking would attach a token
      // that doesn't exist. Local notes still work, which is the point.
      this.selfNotes.set([]);
      this.loaded.set(true);
      return;
    }
    this.loading.set(true);
    this.scan(accountId, undefined, 0, []);
  }

  /** Drop a self note from the list after its status is deleted server-side. */
  forgetSelf(id: string): void {
    this.selfNotes.update((list) => list.filter((item) => item.id !== id));
  }

  /**
   * One page of the scan, recursing until the age bound or the page cap.
   *
   * Stops as soon as a page's oldest post is out of range: statuses come back
   * newest-first, so everything past that point is older still.
   */
  private scan(accountId: string, maxId: string | undefined, page: number, found: PkmItem[]): void {
    this.api.getAccountStatuses(accountId, { limit: PKM_SCAN_LIMIT, maxId }).subscribe({
      next: (rows) => {
        const vocab = this.prefs.pkmVocabulary();
        let oldestInRange = true;
        for (const status of rows) {
          if (!withinPkmAge(status)) {
            oldestInRange = false;
            continue;
          }
          if (!isSelfNote(status, accountId)) {
            continue;
          }
          const kinds = pkmKinds(stripHtml(status.content), vocab);
          if (kinds.length) {
            found.push(selfPkmItem(status, kinds));
          }
        }
        const last = rows[rows.length - 1];
        const more = rows.length === PKM_SCAN_LIMIT && oldestInRange && !!last;
        if (more && page + 1 < PKM_SCAN_MAX_PAGES) {
          this.scan(accountId, last.id, page + 1, found);
          return;
        }
        this.selfNotes.set(found);
        this.finish();
      },
      error: () => {
        this.errors.update((list) => [
          ...list,
          {
            kind: 'self' as const,
            message: "Your own posts couldn't be loaded, so notes saved to the server are missing.",
          },
        ]);
        // Whatever earlier pages found is better than nothing.
        this.selfNotes.set(found);
        this.finish();
      },
    });
  }

  private finish(): void {
    this.loading.set(false);
    this.loaded.set(true);
  }
}
