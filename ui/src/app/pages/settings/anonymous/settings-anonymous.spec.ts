import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AnonymousPreferences } from '../../../providers/anonymous/anonymous-preferences';
import { SettingsAnonymous } from './settings-anonymous';

describe('SettingsAnonymous', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [SettingsAnonymous] });
  });

  it('shows the one-year default and saves a new maximum age', async () => {
    const fixture = TestBed.createComponent(SettingsAnonymous);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const select = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>(
      '#followed-post-max-age',
    )!;

    expect(select.selectedOptions[0].textContent).toContain('1 year');
    const threeMonths = [...select.options].find((option) =>
      option.textContent?.includes('3 months'),
    )!;
    select.value = threeMonths.value;
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(TestBed.inject(AnonymousPreferences).followedPostMaxAgeDays()).toBe(90);
  });
});
