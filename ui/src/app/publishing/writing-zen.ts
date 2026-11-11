import { Injectable, signal } from '@angular/core';

/**
 * Writing zen: the temporary, total blackout of everything but the text.
 *
 * This is **not** {@link ClientPrefs.zenMode}, and the two must not be merged.
 * They answer different questions:
 *
 * | | Global zen (`ClientPrefs.zenMode`) | Writing zen (this) |
 * | --- | --- | --- |
 * | Scope | the whole app | the writing surface only |
 * | Lifetime | a persisted preference | this visit, not persisted |
 * | Hides | the rails | rails, header, footer, side panes — everything |
 *
 * Global zen declutters reading. Writing zen removes every enticing feed to
 * click on, so what is left is the text and the way out.
 *
 * It lives in a root service rather than on the page because the header and
 * footer belong to the shell, outside the router outlet — the page cannot hide
 * them by itself. Deliberately not persisted: a mode that hides the whole
 * interface and survives a reload is a mode someone gets stuck in, and the exit
 * control is only rendered by the page that set it.
 */
@Injectable({ providedIn: 'root' })
export class WritingZen {
  private readonly on = signal(false);

  /** Whether the chrome is currently hidden for writing. */
  readonly active = this.on.asReadonly();

  enter(): void {
    this.on.set(true);
  }

  exit(): void {
    this.on.set(false);
  }

  toggle(): void {
    this.on.update((v) => !v);
  }
}
