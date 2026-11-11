import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeenWhenScrolled } from './seen-when-scrolled';

/** The observer callback the directive registered, so a test can drive it. */
let capturedCallback: IntersectionObserverCallback | null = null;
let disconnected = 0;
let observedCount = 0;

/** One IntersectionObserverEntry, with only the fields the directive reads. */
function entry(options: {
  isIntersecting: boolean;
  ratio: number;
  /** Element's bottom edge relative to the viewport. */
  bottom: number;
}): IntersectionObserverEntry {
  return {
    isIntersecting: options.isIntersecting,
    intersectionRatio: options.ratio,
    boundingClientRect: { bottom: options.bottom } as DOMRectReadOnly,
    rootBounds: { top: 0 } as DOMRectReadOnly,
  } as IntersectionObserverEntry;
}

@Component({
  imports: [SeenWhenScrolled],
  template: `<div [appSeenWhenScrolled]="enabled()" (seen)="seen = seen + 1">row</div>`,
})
class Host {
  readonly enabled = signal(true);
  seen = 0;
}

describe('SeenWhenScrolled', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(() => {
    vi.useFakeTimers();
    capturedCallback = null;
    disconnected = 0;
    observedCount = 0;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          capturedCallback = callback;
        }
        observe() {
          observedCount += 1;
        }
        disconnect() {
          disconnected += 1;
        }
        unobserve() {
          // Required by the interface; the directive only calls disconnect().
        }
        takeRecords() {
          return [];
        }
      },
    );
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Visible, then scrolled off the top — the "you read past this" gesture. */
  function scrollPast(): void {
    capturedCallback!([entry({ isIntersecting: true, ratio: 0.9, bottom: 400 })], null!);
    capturedCallback!([entry({ isIntersecting: false, ratio: 0, bottom: -10 })], null!);
  }

  it('does not fire merely for being on screen', () => {
    capturedCallback!([entry({ isIntersecting: true, ratio: 1, bottom: 400 })], null!);
    vi.advanceTimersByTime(10_000);

    // The bug this rule exists for: in a dense list every row on screen clears
    // a visibility threshold at once, and marking them all read is wrong.
    expect(fixture.componentInstance.seen).toBe(0);
  });

  it('fires once the item has been scrolled off the top and dwelled', () => {
    scrollPast();
    expect(fixture.componentInstance.seen).toBe(0);

    vi.advanceTimersByTime(800);
    expect(fixture.componentInstance.seen).toBe(1);
  });

  it('does not fire when the item leaves downward', () => {
    // Scrolling back up: the item exits past the *bottom* edge, which is not
    // reading it.
    capturedCallback!([entry({ isIntersecting: true, ratio: 0.9, bottom: 400 })], null!);
    capturedCallback!([entry({ isIntersecting: false, ratio: 0, bottom: 900 })], null!);
    vi.advanceTimersByTime(10_000);

    expect(fixture.componentInstance.seen).toBe(0);
  });

  it('does not fire for an item that was never visible', () => {
    // Below the fold the whole time, then the list re-renders it away.
    capturedCallback!([entry({ isIntersecting: false, ratio: 0, bottom: -10 })], null!);
    vi.advanceTimersByTime(10_000);

    expect(fixture.componentInstance.seen).toBe(0);
  });

  it('cancels the dwell if the item comes back before it elapses', () => {
    scrollPast();
    vi.advanceTimersByTime(400);
    // Scrolled back up onto it.
    capturedCallback!([entry({ isIntersecting: true, ratio: 0.9, bottom: 400 })], null!);
    vi.advanceTimersByTime(10_000);

    expect(fixture.componentInstance.seen).toBe(0);
  });

  it('fires at most once', () => {
    scrollPast();
    vi.advanceTimersByTime(800);
    scrollPast();
    vi.advanceTimersByTime(800);

    expect(fixture.componentInstance.seen).toBe(1);
  });

  it('observes nothing at all when disabled', () => {
    TestBed.resetTestingModule();
    const other = TestBed.createComponent(Host);
    other.componentInstance.enabled.set(false);
    observedCount = 0;
    other.detectChanges();

    expect(observedCount).toBe(0);
  });

  it('disconnects on destroy', () => {
    fixture.destroy();
    expect(disconnected).toBeGreaterThan(0);
  });
});
