import { Component, HostListener, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FocusTrap } from '../a11y/focus-trap';
import { MediaAttachment } from '../models';

// i18n lightbox.viewer: Image viewer
// i18n lightbox.close: Close
// i18n lightbox.previous: Previous image
// i18n lightbox.next: Next image

/**
 * How far a finger must travel to count as a swipe rather than a tap that
 * wandered. 40px is roughly a thumb's width — below it, taps to close the
 * viewer start registering as page turns.
 */
const SWIPE_MIN_PX = 40;

/**
 * A full-screen image viewer: centers the current image, dims the page behind
 * it, and lets the user page through a status's attachments like a slideshow.
 */
@Component({
  selector: 'app-lightbox',
  imports: [FocusTrap, TranslocoPipe],
  templateUrl: './lightbox.html',
  styleUrl: './lightbox.css',
})
export class Lightbox {
  /** The images to page through. */
  readonly items = input.required<MediaAttachment[]>();
  /** Index of the image to show first. */
  readonly startIndex = input(0);
  /** Emitted when the viewer should close. */
  readonly closed = output<void>();

  protected index = signal(0);

  constructor() {
    // Seed the current index from the requested start once inputs are set.
    queueMicrotask(() => this.index.set(this.startIndex()));
  }

  protected current = computed(() => this.items()[this.index()] ?? null);
  protected hasMultiple = computed(() => this.items().length > 1);

  prev(event: Event): void {
    event.stopPropagation();
    this.index.update((i) => (i - 1 + this.items().length) % this.items().length);
  }

  next(event: Event): void {
    event.stopPropagation();
    this.index.update((i) => (i + 1) % this.items().length);
  }

  close(): void {
    this.closed.emit();
  }

  /**
   * Horizontal swipe to page through images, because on a phone there was no
   * other way.
   *
   * The nav arrows are laid out in a row beside the image, and the image claims
   * `min(90vw, 1100px)`. On a narrow screen 90vw plus two 52px buttons overflows
   * the viewport, so the arrows were squeezed to nothing or pushed off-screen —
   * a reader on a phone could open a four-image post and never reach image two.
   * The CSS now overlays the arrows on small screens; this makes the gesture
   * they'd expect work regardless.
   *
   * Deliberately not a full drag-with-the-finger animation. That needs the image
   * to track the pointer and settle, which means owning transform state and
   * fighting the browser's own pan/zoom — pinch-to-zoom on a photo is worth more
   * than a rubber-band effect. This reads a completed gesture and pages.
   */
  private touchStartX: number | null = null;
  private touchStartY: number | null = null;

  onTouchStart(event: TouchEvent): void {
    // Multi-touch is a pinch-zoom, not a swipe — leave it entirely alone.
    if (event.touches.length !== 1) {
      this.touchStartX = null;
      this.touchStartY = null;
      return;
    }
    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
  }

  onTouchEnd(event: TouchEvent): void {
    const startX = this.touchStartX;
    const startY = this.touchStartY;
    this.touchStartX = null;
    this.touchStartY = null;
    if (startX === null || startY === null || !this.hasMultiple()) {
      return;
    }
    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    // Far enough to be deliberate, and more horizontal than vertical so a scroll
    // or a downward dismiss-flick is never read as "next image".
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) {
      return;
    }
    if (dx < 0) {
      this.next(event);
    } else {
      this.prev(event);
    }
  }

  /** Close only when the backdrop itself is clicked, not the image/controls. */
  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.close();
    } else if (event.key === 'ArrowRight' && this.hasMultiple()) {
      this.next(event);
    } else if (event.key === 'ArrowLeft' && this.hasMultiple()) {
      this.prev(event);
    }
  }
}
