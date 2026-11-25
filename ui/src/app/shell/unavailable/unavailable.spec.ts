import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { Unavailable } from './unavailable';

describe('Unavailable', () => {
  function render(query: Record<string, string>): HTMLElement {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(query)) } },
      ],
    });
    const fixture = TestBed.createComponent(Unavailable);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('offers to sign in and come back, not only a way out', () => {
    const root = render({ feature: 'Muted accounts', next: '/settings/mutes' });
    expect(root.textContent).toContain('Muted accounts');
    expect([...root.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '/login?next=%2Fsettings%2Fmutes',
      '/home',
    ]);
  });

  it('still offers to sign in when it does not know the page', () => {
    expect(render({}).querySelector('a')?.getAttribute('href')).toBe('/login');
  });
});
