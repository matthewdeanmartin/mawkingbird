import { describe, expect, it } from 'vitest';
import {
  focalPointOf,
  focusParam,
  nudge,
  objectPosition,
  pointFromClick,
  samePoint,
} from './focal-point';

describe('focal point', () => {
  it("reads the author's point and ignores missing or malformed ones", () => {
    expect(focalPointOf({ meta: { focus: { x: 0.5, y: -0.25 } } })).toEqual({ x: 0.5, y: -0.25 });
    expect(focalPointOf({ meta: {} })).toBeNull();
    expect(focalPointOf({})).toBeNull();
    expect(focalPointOf({ meta: { focus: { x: 3, y: -9 } } })).toEqual({ x: 1, y: -1 });
  });

  it('maps Mastodon coordinates (y up) to CSS object-position', () => {
    expect(objectPosition({ x: 0, y: 0 })).toBeNull();
    expect(objectPosition(null)).toBeNull();
    // Top-left corner of the picture.
    expect(objectPosition({ x: -1, y: 1 })).toBe('0.0% 0.0%');
    // A face near the top, a little right of centre.
    expect(objectPosition({ x: 0.2, y: 0.6 })).toBe('60.0% 20.0%');
  });

  it('turns a click on the whole picture into a point', () => {
    const image = {
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 200, height: 100 }),
    } as unknown as Element;
    expect(pointFromClick({ clientX: 150, clientY: 75 } as MouseEvent, image)).toEqual({
      x: -0.5,
      y: 0.5,
    });
    expect(pointFromClick({ clientX: 300, clientY: 150 } as MouseEvent, image)).toEqual({
      x: 1,
      y: -1,
    });
  });

  it('moves a tenth per arrow press and stops at the edge', () => {
    expect(nudge({ x: 0, y: 0 }, 'ArrowUp')).toEqual({ x: 0, y: 0.1 });
    expect(nudge({ x: 0.95, y: 0 }, 'ArrowRight')).toEqual({ x: 1, y: 0 });
    expect(nudge({ x: 0, y: 0 }, 'Enter')).toBeNull();
  });

  it('formats the API value and compares points to the hundredth', () => {
    expect(focusParam({ x: 0.123, y: -0.5 })).toBe('0.12,-0.5');
    expect(samePoint(null, { x: 0, y: 0 })).toBe(true);
    expect(samePoint({ x: 0.1, y: 0 }, { x: 0.104, y: 0 })).toBe(true);
    expect(samePoint({ x: 0.1, y: 0 }, { x: 0.2, y: 0 })).toBe(false);
  });
});
