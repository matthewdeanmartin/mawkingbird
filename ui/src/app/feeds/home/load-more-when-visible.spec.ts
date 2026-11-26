import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { LoadMoreWhenVisible } from './load-more-when-visible';

@Component({
  imports: [LoadMoreWhenVisible],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '<button [appLoadMoreWhenVisible]="ready()" (visible)="load()">More</button>',
})
class Host {
  readonly ready = signal(true);
  readonly load = vi.fn();
}

it('requests another page only while the sentinel is ready and visible', async () => {
  let notify!: (entries: IntersectionObserverEntry[]) => void;
  const unobserve = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
        notify = callback;
      }
      observe = vi.fn();
      unobserve = unobserve;
      disconnect = vi.fn();
    },
  );
  try {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    notify([{ isIntersecting: true }] as IntersectionObserverEntry[]);
    expect(fixture.componentInstance.load).toHaveBeenCalledTimes(1);
    fixture.componentInstance.ready.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    notify([{ isIntersecting: true }] as IntersectionObserverEntry[]);
    expect(fixture.componentInstance.load).toHaveBeenCalledTimes(1);
    expect(unobserve).toHaveBeenCalled();
    fixture.destroy();
  } finally {
    vi.unstubAllGlobals();
  }
});
