import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { MenuIndicators } from '../../../menu-indicators';
import { SettingsNotificationPreferences } from './settings-notification-preferences';

describe('SettingsNotificationPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('loads saved preferences into labelled design-system fields and persists edits', async () => {
    localStorage.setItem(
      'mockingbird_menu_indicator_preferences',
      JSON.stringify({ hours: [9, 17], quietStart: 22, quietEnd: 8, chatMinutes: 15 }),
    );
    const fixture = TestBed.createComponent(SettingsNotificationPreferences);
    fixture.detectChanges();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const inputs = Array.from(el.querySelectorAll<HTMLInputElement>('mb-field input'));
    expect(inputs.map((input) => input.value)).toEqual(['9, 17', '22', '8', '15']);
    for (const input of inputs) {
      expect(el.querySelector(`label[for="${input.id}"]`)?.textContent?.trim()).toBeTruthy();
      expect(input.getAttribute('aria-describedby')).toBeTruthy();
    }
    for (const [index, value] of ['10, 18', '21', '6', '30'].entries()) {
      inputs[index].value = value;
      inputs[index].dispatchEvent(new Event(index === 0 ? 'change' : 'input'));
    }
    fixture.detectChanges();
    await fixture.whenStable();
    expect(JSON.parse(localStorage.getItem('mockingbird_menu_indicator_preferences')!)).toEqual({
      hours: [10, 18],
      quietStart: 21,
      quietEnd: 6,
      chatMinutes: 30,
    });
  });

  it('describes invalid delivery hours without overwriting preferences and accepts immediate delivery', () => {
    const indicators = TestBed.inject(MenuIndicators);
    indicators.configure({ hours: [9] });
    const fixture = TestBed.createComponent(SettingsNotificationPreferences);
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = '9, nope';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(indicators.preferences().hours).toEqual([9]);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain(
      'Enter hours from 0–23 separated by commas',
    );
    input.value = '';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(indicators.preferences().hours).toEqual([]);
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });
});
