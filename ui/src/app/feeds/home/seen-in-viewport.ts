import {
  DestroyRef,
  Directive,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
} from '@angular/core';

/**
 * Emits `seen` when the element has actually been on screen: at least half of
 * it, or half the viewport's height for a post taller than the screen.
 *
 * This is what the server read marker is fed from (parity item 7). A post that
 * was fetched but never scrolled into view must not count as read, so this is
 * deliberately a viewport observation and not a hook in the loader.
 */
@Directive({ selector: '[appSeenInViewport]' })
export class SeenInViewport {
  /** Observation is off until the feed has settled where it is going to be. */
  readonly appSeenInViewport = input(false);
  readonly seen = output<void>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer: IntersectionObserver | null = null;

  constructor() {
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') return;
      this.observer = new IntersectionObserver(
        (entries) => {
          if (!this.appSeenInViewport()) return;
          const viewport = typeof window === 'undefined' ? 0 : window.innerHeight;
          if (
            entries.some(
              (entry) =>
                entry.isIntersecting &&
                (entry.intersectionRatio >= 0.5 ||
                  (viewport > 0 && entry.intersectionRect.height >= viewport / 2)),
            )
          ) {
            this.seen.emit();
          }
        },
        { threshold: [0, 0.25, 0.5, 0.75, 1] },
      );
      if (this.appSeenInViewport()) this.observer.observe(this.element.nativeElement);
    });
    effect(() => {
      const enabled = this.appSeenInViewport();
      if (!this.observer) return;
      // Re-observing delivers a fresh first callback, so posts already on
      // screen when tracking turns on are counted.
      this.observer.unobserve(this.element.nativeElement);
      if (enabled) this.observer.observe(this.element.nativeElement);
    });
    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());
  }
}
