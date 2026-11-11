import { computed, Injectable, signal } from '@angular/core';
import { FrontMatterFormat } from './hugo-front-matter';

/**
 * The git half of "I am editing an existing post".
 *
 * The composer already knows how to receive text across a navigation:
 * `Drafts.handoff()` parks a `DraftSnapshot` and the composer drains it on
 * seed. That carries the title and body perfectly well — but an edit also has
 * to carry a file path, a blob sha, the delimiter style the file used, its
 * original publish date, and every front-matter key we do not model. None of
 * that belongs in `DraftSnapshot`, which is a *local* concept shared by every
 * target and must not learn what a sha is.
 *
 * So this rides alongside: the connector page parks both, and the composer
 * reads this one only when its target is Hugo. Same lifetime rules as the
 * draft handoff — in memory, drained once, never persisted. A parked edit that
 * survived a reload would be worse than a lost one: it would make the *next*
 * post the user writes silently overwrite a file they had forgotten about.
 */
export interface HugoEdit {
  /** Repo-relative path of the file being edited. */
  path: string;
  /**
   * The blob sha as read. Sent back on update so GitHub can reject the write if
   * the file moved on — see the 409 handling in the composer.
   */
  sha: string;
  /** The delimiter style the file used, so an edit does not convert it. */
  format: FrontMatterFormat;
  /**
   * The post's original publish date, preserved verbatim.
   *
   * Editing a post does not republish it. Rewriting `date` to now would reorder
   * the whole blog on the next build, which is a surprising amount of damage
   * for a typo fix.
   */
  date: string | null;
  /** Front-matter lines we do not model, carried through untouched. */
  extraLines: string[];
  /** The title as it was, for the "Editing: …" banner and to detect changes. */
  originalTitle: string;
}

@Injectable({ providedIn: 'root' })
export class HugoEditSession {
  private readonly parked = signal<HugoEdit | null>(null);

  /**
   * The edit the composer is currently working on.
   *
   * Unlike the draft handoff this is *not* cleared when read: the composer
   * needs it again at submit time, to write back with the right sha. It is
   * cleared explicitly by {@link finish} on a successful publish, or by
   * {@link cancel}.
   */
  readonly current = this.parked.asReadonly();
  readonly editing = computed(() => this.parked() !== null);

  /** Park an edit for the composer that is about to open. */
  start(edit: HugoEdit): void {
    this.parked.set(edit);
  }

  /**
   * Advance to a new sha after a successful write.
   *
   * Keeps an edit session usable for a second consecutive save: without this,
   * saving twice in a row would send the first sha again and 409 against our
   * own previous commit.
   */
  advance(sha: string): void {
    const current = this.parked();
    if (current) {
      this.parked.set({ ...current, sha });
    }
  }

  finish(): void {
    this.parked.set(null);
  }

  cancel(): void {
    this.parked.set(null);
  }
}
