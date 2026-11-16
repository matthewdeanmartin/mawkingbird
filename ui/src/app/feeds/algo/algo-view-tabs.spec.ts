import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlgoViewTabs } from './algo-view-tabs';

describe('Algo view tabs', () => {
  it('offers Good Stuff and Relationships as in-page routes', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(AlgoViewTabs);
    fixture.componentRef.setInput('view', 'relationships');
    fixture.detectChanges();
    const nav = (fixture.nativeElement as HTMLElement).querySelector('nav')!;
    expect(nav.querySelector('a[href="/algo"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/algo/people"]')?.getAttribute('aria-current')).toBe('page');
    expect(nav.querySelectorAll('a')).toHaveLength(2);
  });
});
