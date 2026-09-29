import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../../auth';
import { ClientPrefs } from '../../../client-prefs';
import { DEFAULT_PKM_VOCABULARY } from '../../../pkm/pkm-tags';
import { WIZARD_STEPS } from '../../../publish-wizard';
import { SettingsWriting } from './settings-writing';

describe('SettingsWriting shared controls', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(Auth).enterAnonymous();
  });

  it('keeps wizard steps and the publishing warning independent through shared checkboxes', async () => {
    const fixture = TestBed.createComponent(SettingsWriting);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const prefs = TestBed.inject(ClientPrefs);
    for (const step of WIZARD_STEPS) {
      const control = el.querySelector<HTMLInputElement>(
        `mb-settings-row input[name="wizard-${step}"]`,
      )!;
      expect(control.checked).toBe(prefs.wizardSteps()[step]);
      if (control.checked) control.click();
    }
    await fixture.whenStable();
    expect(WIZARD_STEPS.every((step) => !prefs.wizardSteps()[step])).toBe(true);
    expect(el.textContent).toContain('Every step is off');
    const warning = el.querySelector<HTMLInputElement>(
      'mb-settings-row input[name="warnOnPkmPublish"]',
    )!;
    const wasOn = prefs.warnOnPkmPublish();
    warning.click();
    await fixture.whenStable();
    expect(prefs.warnOnPkmPublish()).toBe(!wasOn);
    expect(WIZARD_STEPS.every((step) => !prefs.wizardSteps()[step])).toBe(true);
    expect(warning.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('edits labelled vocabulary rows, saves on form submission and restores defaults', async () => {
    const fixture = TestBed.createComponent(SettingsWriting);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const prefs = TestBed.inject(ClientPrefs);
    expect(el.textContent).toContain('What do you call tasks, notes and appointments?');
    function field(label: string): HTMLInputElement {
      return Array.from(el.querySelectorAll<HTMLLabelElement>('mb-field label')).find(
        (node) => node.textContent?.trim() === label,
      )!.control as HTMLInputElement;
    }
    for (const [label, value] of Object.entries({
      Tasks: 'task, chores',
      Notes: 'memo',
      Appointments: 'appointment',
    })) {
      const input = field(label);
      expect(el.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`)?.control).toBe(input);
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    expect(prefs.pkmVocabulary()).toEqual(DEFAULT_PKM_VOCABULARY);
    const form = field('Tasks').closest('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(prefs.pkmVocabulary()).toEqual({
      todo: ['task', 'chores'],
      note: ['memo'],
      cal: ['appointment'],
    });
    expect(form.querySelector('.sactions mb-save-feedback')!.textContent).toContain('Saved');
    const reset = Array.from(form.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('Restore defaults'),
    )!;
    reset.click();
    await fixture.whenStable();
    expect(prefs.pkmVocabulary()).toEqual(DEFAULT_PKM_VOCABULARY);
    expect(field('Tasks').value).toBe('todo');
  });
});
