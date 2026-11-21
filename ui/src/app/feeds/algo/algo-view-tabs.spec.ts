import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlgoViewTabs } from './algo-view-tabs';
import { Auth } from '../../platform/session/auth';
import { NATIVE_PROFILES } from '../../platform/session/platform-login';
import { Wellness } from '../../wellness/wellness';

describe('Algo view picker', () => {
  beforeEach(() => localStorage.clear());

  function render(view: string, native: boolean, before?: () => void): HTMLElement {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: NATIVE_PROFILES, useValue: native ? {} : null }],
    });
    TestBed.inject(Auth).setToken('reader');
    before?.();
    const fixture = TestBed.createComponent(AlgoViewTabs);
    fixture.componentRef.setInput('view', view);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function options(el: HTMLElement): string[] {
    return [...el.querySelectorAll('option')].map((option) => option.value);
  }

  it('Native lists Good Stuff, Relationships and Catch-up, with the current view selected', () => {
    const el = render('relationships', true);
    expect(options(el)).toEqual(['goodStuff', 'relationships', 'catchUp']);
    expect(el.querySelector<HTMLSelectElement>('select')!.value).toBe('relationships');
  });

  it('the web has no Relationships view', () => {
    expect(options(render('goodStuff', false))).toEqual(['goodStuff', 'catchUp']);
  });

  it('Wellness demotion drops Good Stuff, except while you are on it', () => {
    const demote = () => TestBed.inject(Wellness).set('demoteGoodStuff', true);
    expect(options(render('catchUp', true, demote))).toEqual(['relationships', 'catchUp']);
    TestBed.resetTestingModule();
    expect(options(render('goodStuff', true, demote))).toEqual([
      'goodStuff',
      'relationships',
      'catchUp',
    ]);
  });

  it('choosing a view navigates to its route', () => {
    const el = render('goodStuff', false);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const select = el.querySelector<HTMLSelectElement>('select')!;
    select.value = 'catchUp';
    select.dispatchEvent(new Event('change'));
    expect(navigate).toHaveBeenCalledWith('/algo/catch-up');
  });

  it('hides itself when only one view is available', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: NATIVE_PROFILES, useValue: null }],
    });
    TestBed.inject(Auth).enterAnonymous('https://social.example');
    const fixture = TestBed.createComponent(AlgoViewTabs);
    fixture.componentRef.setInput('view', 'goodStuff');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('select')).toBeNull();
  });
});
