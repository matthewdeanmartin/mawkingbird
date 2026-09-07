import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Lightbox } from './lightbox';
import { MediaAttachment } from '../models';

/**
 * Swipe paging, added because on a phone there was no other way to reach the
 * second image: the nav arrows are laid out beside the image, and at 90vw the
 * image plus two 52px buttons overflows a narrow viewport, so the arrows were
 * squeezed away or pushed off-screen. A reader could open a four-image post and
 * see only the first.
 *
 * jsdom has no layout and no real touch, so these drive the handlers with
 * synthetic TouchEvents. That covers the gesture *rules* — how far, which
 * direction, what to ignore — which is where the bugs are. Whether the arrows
 * are actually on screen at 390px wide is CSS, and a real-device check.
 */
describe('Lightbox', () => {
  let fixture: ComponentFixture<Lightbox>;

  function media(id: string): MediaAttachment {
    return {
      id,
      type: 'image',
      url: `https://example.test/${id}.jpg`,
      preview_url: `https://example.test/${id}-small.jpg`,
      description: null,
    } as MediaAttachment;
  }

  /** The rendered "2 / 4" counter is the observable statement of which image is
   *  showing, so assertions read it rather than reaching into the component. */
  function counter(): string {
    return (
      (fixture.nativeElement as HTMLElement).querySelector('.lightbox-counter')?.textContent ?? ''
    ).trim();
  }

  /** A completed one-finger gesture from (x, y) to (x + dx, y + dy). */
  function swipe(dx: number, dy = 0, startX = 200, startY = 300): void {
    const overlay = (fixture.nativeElement as HTMLElement).querySelector(
      '.lightbox-overlay',
    ) as HTMLElement;
    const at = (x: number, y: number) => ({ clientX: x, clientY: y }) as unknown as Touch;
    overlay.dispatchEvent(
      new TouchEvent('touchstart', { touches: [at(startX, startY)], bubbles: true }),
    );
    overlay.dispatchEvent(
      new TouchEvent('touchend', {
        changedTouches: [at(startX + dx, startY + dy)],
        bubbles: true,
      }),
    );
    fixture.detectChanges();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Lightbox] });
    fixture = TestBed.createComponent(Lightbox);
    fixture.componentRef.setInput('items', [media('a'), media('b'), media('c')]);
    fixture.componentRef.setInput('startIndex', 0);
    fixture.detectChanges();
    // The component seeds its index from startIndex in a microtask.
    await Promise.resolve();
    fixture.detectChanges();
  });

  it('swiping left advances to the next image', () => {
    expect(counter()).toBe('1 / 3');
    swipe(-120);
    expect(counter()).toBe('2 / 3');
  });

  it('swiping right goes back', () => {
    swipe(-120);
    expect(counter()).toBe('2 / 3');
    swipe(120);
    expect(counter()).toBe('1 / 3');
  });

  it('wraps around, matching the arrow buttons', () => {
    // Swiping back from the first image lands on the last, exactly as the
    // `prev` button does — the gesture is a different way to press the same
    // control, not a different navigation model.
    swipe(120);
    expect(counter()).toBe('3 / 3');
  });

  it('ignores a short drag, so a tap that wandered does not turn the page', () => {
    swipe(-15);
    expect(counter()).toBe('1 / 3');
  });

  it('ignores a mostly-vertical drag', () => {
    // A downward flick is how readers dismiss a viewer, and scrolling a tall
    // image is a vertical gesture too. Neither may be read as "next image".
    swipe(-50, 200);
    expect(counter()).toBe('1 / 3');
  });

  it('ignores a two-finger gesture, leaving pinch-zoom alone', () => {
    const overlay = (fixture.nativeElement as HTMLElement).querySelector(
      '.lightbox-overlay',
    ) as HTMLElement;
    const at = (x: number) => ({ clientX: x, clientY: 300 }) as unknown as Touch;
    overlay.dispatchEvent(
      new TouchEvent('touchstart', { touches: [at(200), at(260)], bubbles: true }),
    );
    overlay.dispatchEvent(new TouchEvent('touchend', { changedTouches: [at(60)], bubbles: true }));
    fixture.detectChanges();
    // Pinching a photo is worth more than a page turn, so a multi-touch gesture
    // is dropped at touchstart rather than measured.
    expect(counter()).toBe('1 / 3');
  });

  it('does nothing on a single-image post', async () => {
    fixture.componentRef.setInput('items', [media('only')]);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    // No counter and no arrows are rendered for one image, and a swipe must not
    // throw trying to page a list it cannot page.
    expect(counter()).toBe('');
    expect(() => swipe(-120)).not.toThrow();
  });
});
