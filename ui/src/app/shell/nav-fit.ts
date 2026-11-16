import { afterNextRender, DestroyRef, Directive, ElementRef, inject } from '@angular/core';

/** How much fits: whole labels, the same tightly spaced, short forms, or icons. */
export type NavFitLevel = 'full' | 'tight' | 'short' | 'icons';

const LEVELS: readonly NavFitLevel[] = ['full', 'tight', 'short', 'icons'];

/**
 * Steps a row of labelled links down until it fits, instead of letting labels
 * wrap.
 *
 * A translated label can be several times the English one ("Skrzynka
 * odbiorcza" for Inbox), and a wrapped two-line label in a 64px bar collides
 * with its neighbours' icons. Labels never wrap; instead the row sets
 * `data-fit` to the first level whose content fits its width, and CSS shows
 * the full label, the same with less spacing, the translator's short form,
 * or the icon alone. Each link keeps its full name as its accessible name,
 * so nothing is lost at any level.
 *
 * Measured, not guessed from a breakpoint: the right level depends on the
 * language, the account's tabs and the window, and only the browser knows the
 * sum. Re-measured whenever the row resizes or its text changes.
 */
@Directive({ selector: '[appNavFit]' })
export class NavFit {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.measure();
      if (typeof ResizeObserver === 'undefined') return;
      const resize = new ResizeObserver(() => this.measure());
      resize.observe(this.el);
      // Language changes, tabs that come and go: same width, new text.
      const text = new MutationObserver(() => this.measure());
      text.observe(this.el, { subtree: true, childList: true, characterData: true });
      destroyRef.onDestroy(() => {
        resize.disconnect();
        text.disconnect();
      });
    });
  }

  /** Try each level in order; layout is read synchronously, so nothing flickers. */
  measure(): NavFitLevel {
    for (const level of LEVELS) {
      this.el.dataset['fit'] = level;
      if (this.el.scrollWidth <= this.el.clientWidth + 1) return level;
    }
    return 'icons';
  }
}
