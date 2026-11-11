import { Directive, ElementRef, inject, input, OnDestroy, OnInit, output } from '@angular/core';

/**
 * How much of a row must be visible before it can start counting as seen.
 *
 * Not 1.0: a long full-size card may be taller than the viewport and could never
 * be fully visible, so a "wholly visible" rule would silently never fire for
 * exactly the items that take longest to read.
 */
const VISIBLE_RATIO = 0.6;

/**
 * How long it must stay visible, in milliseconds, before it counts.
 *
 * A dwell requirement is the difference between "read" and "flew past on the way
 * to the bottom". Without it, one flick of a scroll wheel marks forty items read
 * — the behaviour that makes scroll-tracking feel like data loss, and the reason
 * the preference defaults off.
 */
const DWELL_MS = 800;

/**
 * Emit once when the host element has been read past.
 *
 * ## "Scrolled past", not "currently on screen"
 *
 * The obvious implementation — fire after an element has been visible for a
 * moment — is wrong for a dense list, and measurably so: headline rows are ~34px
 * tall, so a 700px pane holds twenty of them at once. Every row on screen clears
 * a visibility threshold simultaneously, and the whole screenful gets marked read
 * for the crime of being displayed. A runtime check of that first version marked
 * all 12 test items read from a single flick to the bottom.
 *
 * So the rule is: an element counts as read once it has been properly visible
 * **and has then left the top of the viewport** — you scrolled it away, which is
 * the gesture that actually means "done with this". Items still sitting on screen
 * are untouched no matter how long you leave the tab open, and scrolling back up
 * does not mark the things you scrolled up past, because they leave downward.
 *
 * The dwell timer remains on the exit edge, so flicking past and immediately
 * scrolling back does not count either.
 *
 * An `IntersectionObserver` rather than scroll-position arithmetic: it reports
 * real geometry (correct inside a scrolling pane, under a sticky header, or when
 * the tab is not composited), costs nothing while nothing moves, and — per the
 * sprint's own test note — is far easier to drive deterministically from a
 * Playwright run than synthesized scroll maths.
 *
 * Fires at most once per element; the caller does not have to de-duplicate.
 */
@Directive({
  selector: '[appSeenWhenScrolled]',
})
export class SeenWhenScrolled implements OnInit, OnDestroy {
  private host = inject(ElementRef<HTMLElement>);

  /** Turns the observer on. Off means no observer is created at all. */
  readonly appSeenWhenScrolled = input(false);

  readonly seen = output<void>();

  private observer: IntersectionObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private fired = false;
  /** Whether this element has ever been properly on screen. */
  private seenVisible = false;

  ngOnInit(): void {
    if (!this.appSeenWhenScrolled() || typeof IntersectionObserver === 'undefined') {
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const visible = entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO;
          if (visible) {
            this.seenVisible = true;
            this.cancelDwell();
            return;
          }
          // Not visible. Only interesting if it *was* — and only if it left
          // upward, which is what distinguishes "you scrolled past this" from
          // "this is still below the fold" and from "you scrolled back up".
          // `rootBounds` is null in some cross-origin cases; fall back to the
          // viewport, which is the root this observer actually uses.
          const rootTop = entry.rootBounds?.top ?? 0;
          const leftUpward = entry.boundingClientRect.bottom <= rootTop + 1;
          if (this.seenVisible && leftUpward) {
            this.startDwell();
          } else {
            this.cancelDwell();
          }
        }
      },
      { threshold: [0, VISIBLE_RATIO] },
    );
    this.observer.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.cancelDwell();
    this.observer?.disconnect();
    this.observer = null;
  }

  private startDwell(): void {
    if (this.fired || this.timer !== null) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.fired = true;
      // Stop watching: this element has nothing left to report.
      this.observer?.disconnect();
      this.observer = null;
      this.seen.emit();
    }, DWELL_MS);
  }

  private cancelDwell(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
