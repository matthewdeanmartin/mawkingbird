import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../../auth';
import { ClientLists } from '../../../lists/client-lists';
import { Pseudonymity } from '../../../pseudonymity';
import { SettingsPseudonymity } from './settings-pseudonymity';

describe('SettingsPseudonymity', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(Auth).setToken('settings-account');
  });

  it('shows existing private lists and accurately distinguishes unavailable private actions', () => {
    TestBed.inject(ClientLists).create('Pizza');
    const fixture = TestBed.createComponent(SettingsPseudonymity);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('1 lists in this browser');
    expect(el.textContent).toContain('Private follows');
    expect(el.textContent).toContain('Private likes');
    expect(el.textContent).toContain('not available for this account yet');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/feeds?section=client-lists');
    expect(el.querySelector('input[name="pseudonymity-reminder"]')).toBeNull();
  });

  it('enables the reminder with PA and lets the user disable it independently', async () => {
    const fixture = TestBed.createComponent(SettingsPseudonymity);
    fixture.detectChanges();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    (el.querySelector('input[name="pseudonymity"]') as HTMLInputElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    const reminder = el.querySelector('input[name="pseudonymity-reminder"]') as HTMLInputElement;
    expect(reminder.checked).toBe(true);
    reminder.click();
    fixture.detectChanges();
    expect(TestBed.inject(Pseudonymity).enabled()).toBe(true);
    expect(TestBed.inject(Pseudonymity).reminder()).toBe(false);
  });
});
