import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { NavFit } from './nav-fit';

@Component({
  imports: [NavFit],
  template: `<nav appNavFit><a>Skrzynka odbiorcza</a></nav>`,
})
class Host {}

/** jsdom has no layout, so widths stand in for what each level would render. */
function navNeeding(widths: Record<string, number>, available: number) {
  const fixture = TestBed.createComponent(Host);
  const nav = (fixture.nativeElement as HTMLElement).querySelector('nav')!;
  Object.defineProperty(nav, 'clientWidth', { get: () => available });
  Object.defineProperty(nav, 'scrollWidth', { get: () => widths[nav.dataset['fit'] ?? ''] });
  const fit = fixture.debugElement.children[0].injector.get(NavFit);
  return { nav, fit };
}

describe('NavFit', () => {
  it('keeps full labels while they fit', () => {
    const { fit } = navNeeding({ full: 500, tight: 450, short: 300, icons: 200 }, 600);
    expect(fit.measure()).toBe('full');
  });

  it('tries tighter spacing before giving up any words', () => {
    const { fit } = navNeeding({ full: 620, tight: 580, short: 300, icons: 200 }, 600);
    expect(fit.measure()).toBe('tight');
  });

  it('steps down to short labels, then icons, and records the level for CSS', () => {
    const short = navNeeding({ full: 900, tight: 850, short: 560, icons: 200 }, 600);
    expect(short.fit.measure()).toBe('short');
    expect(short.nav.dataset['fit']).toBe('short');

    TestBed.resetTestingModule();
    const icons = navNeeding({ full: 900, tight: 850, short: 700, icons: 200 }, 600);
    expect(icons.fit.measure()).toBe('icons');
    expect(icons.nav.dataset['fit']).toBe('icons');
  });
});
