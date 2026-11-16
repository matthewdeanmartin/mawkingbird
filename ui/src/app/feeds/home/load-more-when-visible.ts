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

/** Requests the next archive page when its accessible fallback button comes into view. */
@Directive({ selector: '[appLoadMoreWhenVisible]' })
export class LoadMoreWhenVisible {
  readonly appLoadMoreWhenVisible = input(false);
  readonly visible = output<void>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer: IntersectionObserver | null = null;

  constructor() {
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') return;
      this.observer = new IntersectionObserver(
        (entries) => {
          if (this.appLoadMoreWhenVisible() && entries.some((entry) => entry.isIntersecting)) {
            this.visible.emit();
          }
        },
        { rootMargin: '0px 0px 400px 0px' },
      );
      if (this.appLoadMoreWhenVisible()) this.observer.observe(this.element.nativeElement);
    });
    effect(() => {
      const enabled = this.appLoadMoreWhenVisible();
      if (!this.observer) return;
      if (enabled) this.observer.observe(this.element.nativeElement);
      else this.observer.unobserve(this.element.nativeElement);
    });
    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());
  }
}
