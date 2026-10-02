import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MbActionCount } from './post-actions';

@Component({
  imports: [MbActionCount],
  template: `<span mbActionCount [count]="count" label="boosts" [locale]="locale()"
    >{{ count }} boosts</span
  >`,
})
class CountHost {
  count = 1200000;
  locale = signal('en');
}

describe('post action counts', () => {
  it('compacts large counts while retaining exact accessible text and a tooltip', () => {
    const fixture = TestBed.createComponent(CountHost);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement.querySelector('[mbActionCount]');
    expect(host.querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('1.2M boosts');
    expect(host.querySelector('.exact')?.textContent?.trim()).toBe('1200000 boosts');
    expect(host.querySelector('[aria-hidden="true"]')?.getAttribute('title')).toBe('1200000');
  });

  it('handles zero, small numbers, rounding boundaries and billions', () => {
    const fixture = TestBed.createComponent(MbActionCount);
    fixture.componentRef.setInput('locale', 'en');
    for (const [count, expected] of [
      [0, '0'],
      [12, '12'],
      [999, '999'],
      [1000, '1K'],
      [1250, '1.3K'],
      [999950, '1M'],
      [1200000, '1.2M'],
      [12345678, '12.3M'],
      [1200000000, '1.2B'],
    ] as const) {
      fixture.componentRef.setInput('count', count);
      fixture.detectChanges();
      expect(fixture.componentInstance.formatted()).toBe(expected);
    }
  });

  it('updates number formatting when the language changes', () => {
    const fixture = TestBed.createComponent(CountHost);
    fixture.detectChanges();
    fixture.componentInstance.locale.set('fr');
    fixture.detectChanges();
    const visible = fixture.nativeElement.querySelector('[aria-hidden="true"]');
    expect(visible.textContent).toContain(
      new Intl.NumberFormat('fr', {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(1200000),
    );
  });
});
