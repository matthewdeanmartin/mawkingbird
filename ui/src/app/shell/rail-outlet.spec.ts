import { Component } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { RailOutlet } from './rail-outlet';

@Component({ template: '' })
class Left {}

@Component({ template: '' })
class Right {}

const left = { component: Left, labelKey: 'left' };
const right = { component: Right, labelKey: 'right' };

describe('RailOutlet', () => {
  it('shows a page’s rails until that page releases them', () => {
    const outlet = new RailOutlet();
    const page = {};
    outlet.show(page, { left, right });
    expect(outlet.left()).toBe(left);
    expect(outlet.right()).toBe(right);
    outlet.release(page);
    expect(outlet.left()).toBeNull();
    expect(outlet.right()).toBeNull();
  });

  it('ignores a release from a page that no longer owns the rails', () => {
    const outlet = new RailOutlet();
    const leaving = {};
    const arriving = {};
    outlet.show(leaving, { left, right });
    outlet.show(arriving, { right });
    outlet.release(leaving);
    expect(outlet.left()).toBeNull();
    expect(outlet.right()).toBe(right);
  });
});
