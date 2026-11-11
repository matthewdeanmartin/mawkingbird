import { describe, expect, it } from 'vitest';
import { ReadingZen } from './reading-zen';

describe('ReadingZen', () => {
  it('is off until something holds it', () => {
    expect(new ReadingZen().active()).toBe(false);
  });

  it('hides the rails while a hold is out and gives them back on release', () => {
    const zen = new ReadingZen();
    const release = zen.hold();
    expect(zen.active()).toBe(true);
    release();
    expect(zen.active()).toBe(false);
  });

  it('keeps the rails hidden until the last holder releases', () => {
    // Two overlapping readers: the first to leave must not turn the rails back
    // on underneath the second.
    const zen = new ReadingZen();
    const first = zen.hold();
    const second = zen.hold();
    first();
    expect(zen.active()).toBe(true);
    second();
    expect(zen.active()).toBe(false);
  });

  it('ignores a repeated release', () => {
    // A page releasing on both "reader closed" and "destroyed" is the normal
    // case; double-counting it would strand another holder's rails.
    const zen = new ReadingZen();
    const other = zen.hold();
    const release = zen.hold();
    release();
    release();
    expect(zen.active()).toBe(true);
    other();
    expect(zen.active()).toBe(false);
  });

  it('reset drops every hold', () => {
    const zen = new ReadingZen();
    zen.hold();
    zen.hold();
    zen.reset();
    expect(zen.active()).toBe(false);
  });
});
