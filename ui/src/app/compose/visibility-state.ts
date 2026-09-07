import { Injectable, inject, signal } from '@angular/core';

import { ClientPrefs } from '../client-prefs';

/** The four Mastodon post visibilities, widest first. */
export const VISIBILITIES = ['public', 'unlisted', 'private', 'direct'] as const;

export type PostVisibility = (typeof VISIBILITIES)[number];

// i18n compose.visibility.public.label: public
// i18n compose.visibility.unlisted.label: unlisted
// i18n compose.visibility.private.label: private
// i18n compose.visibility.direct.label: direct
/**
 * Translation key for a visibility's name, as shown next to its icon.
 *
 * Shared between `/write` and the compact composer so the two surfaces cannot
 * drift into naming the same value differently.
 */
export function visibilityLabel(value: string): string {
  switch (value) {
    case 'public':
      return 'compose.visibility.public.label';
    case 'unlisted':
      return 'compose.visibility.unlisted.label';
    case 'private':
      return 'compose.visibility.private.label';
    default:
      return 'compose.visibility.direct.label';
  }
}

// i18n compose.visibility.public.hint: Anyone, and it appears in public timelines.
// i18n compose.visibility.unlisted.hint: Anyone with the link, but kept out of public timelines.
// i18n compose.visibility.private.hint: Your followers only.
// i18n compose.visibility.direct.hint: Only the people you mention.
/** Translation key for a visibility's explanation. */
export function visibilityHint(value: string): string {
  switch (value) {
    case 'public':
      return 'compose.visibility.public.hint';
    case 'unlisted':
      return 'compose.visibility.unlisted.hint';
    case 'private':
      return 'compose.visibility.private.hint';
    default:
      return 'compose.visibility.direct.hint';
  }
}

/**
 * The visibility a composing surface is working with, and the stash that keeps
 * a deliberate choice alive across a target change.
 *
 * Extracted from the compact composer because `/write` needs exactly the same
 * rules and had none of them: it hardcoded the account default into every
 * snapshot and dropped the saved visibility on the way back in, so a
 * followers-only draft opened in the writing page came out public. The rules
 * are subtle enough (see {@link clampFor}) that a second hand-written copy
 * would have drifted, while the *UI* around them is legitimately different —
 * a cramped `<select>` in one surface, a roomy row of choices in the other.
 * So the state is shared and the markup is not.
 *
 * Not `providedIn: 'root'`: each open composer owns its own visibility, and two
 * surfaces sharing one instance would leak one's choice into the other. It is
 * listed in each component's `providers`.
 */
@Injectable()
export class VisibilityState {
  private prefs = inject(ClientPrefs);

  /** The visibility in effect right now. */
  readonly value = signal<string>('public');

  /**
   * The visibility from before a target-driven clamp overwrote it.
   *
   * Paste services only understand `public`/`unlisted` (and burn-after-reading
   * only `unlisted`), so selecting Paste has to narrow whatever the user had.
   * Without this, switching Fedi → Paste → Fedi silently left the post on
   * `unlisted` — a real downgrade of a deliberate choice, and the reason this
   * exists. Null means "nothing to put back": either no clamp has happened, or
   * the user has since picked a visibility by hand, which outranks anything we
   * remembered for them.
   */
  private stashed: string | null = null;

  /**
   * Open on `initial`, or on the account's posting default when that is empty.
   *
   * Seeding always clears the stash: a freshly seeded composer has no earlier
   * choice to put back, and carrying one over from the last post is how a
   * `direct` reply's visibility ends up on an unrelated public one.
   */
  seed(initial?: string): void {
    this.value.set(initial || this.prefs.defaultVisibility());
    this.stashed = null;
  }

  /** A hand-picked visibility is the user's real intent; forget what we stashed. */
  choose(visibility: string): void {
    this.value.set(visibility);
    this.stashed = null;
  }

  /**
   * Narrow to what the destination can express, remembering what was there.
   *
   * Only the *first* clamp stashes: going rentry → tinyurl → fedi must restore
   * what the user chose before any of it, not the value the previous paste
   * provider forced. `active` is the caller's "is this destination live right
   * now" test — provider and expiry state also move while a saved draft is
   * restored, and a fedi draft saved as `private` must not be narrowed just
   * because the composer set up its paste controls on the way past.
   */
  clampFor(allowed: readonly string[], active: boolean): void {
    const current = this.value();
    if (!active || allowed.includes(current)) {
      return;
    }
    this.stashed ??= current;
    this.value.set(allowed[0] ?? 'unlisted');
  }

  /**
   * Put back the visibility a clamp took away.
   *
   * With nothing stashed (the surface never went near a narrowing target, or
   * the user has since chosen by hand) this falls back to the account's posting
   * default, so a fresh paste-first composer — the anonymous default — still
   * lands somewhere the user chose rather than on `unlisted`.
   */
  restore(): void {
    this.value.set(this.stashed ?? this.prefs.defaultVisibility());
    this.stashed = null;
  }

  /**
   * Restore only if a clamp actually took something away.
   *
   * The difference from {@link restore} matters on every *widening* target
   * change, including the one the publish wizard makes as it opens. Nothing was
   * stashed, so the unconditional restore would reset to the posting default
   * and quietly throw away a visibility the user had just picked by hand — the
   * exact bug the picker was added to fix, reintroduced one call site along.
   */
  restoreIfClamped(): void {
    if (this.stashed !== null) {
      this.restore();
    }
  }
}
