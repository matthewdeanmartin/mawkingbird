import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { Wellness } from '../../wellness/wellness';
import { SettingsWellness } from './settings-wellness';
import { WELLNESS_KEYS } from '../../wellness/wellness-model';

describe('SettingsWellness', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(SettingsWellness);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function radio(el: HTMLElement, preset: string): HTMLInputElement {
    return el.querySelector(`input[name="wellness_preset"][value="${preset}"]`)!;
  }

  it('starts on Off', () => {
    const el = render();
    expect(radio(el, 'off').checked).toBe(true);
    expect(TestBed.inject(Wellness).hidePostCounts()).toBe(false);
  });

  it('choosing Strong turns its protections on and persists in the synced prefs blob', () => {
    const el = render();
    radio(el, 'strong').click();
    const wellness = TestBed.inject(Wellness);
    expect(wellness.preset()).toBe('strong');
    expect(wellness.hideProfileCounts()).toBe(true);
    TestBed.tick();
    const stored = JSON.parse(localStorage.getItem('mockingbird_client_prefs') ?? '{}');
    expect(stored.wellness).toEqual({ preset: 'strong', overrides: {} });
  });

  it('moving a switch shows the custom note', () => {
    TestBed.inject(Wellness).setPreset('gentle');
    const fixture = TestBed.createComponent(SettingsWellness);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const box = el.querySelector<HTMLInputElement>('input[name="wellness_hidePostCounts"]')!;
    expect(box.checked).toBe(true);
    box.click();
    fixture.detectChanges();
    expect(TestBed.inject(Wellness).hidePostCounts()).toBe(false);
    expect(el.querySelector('[data-testid="wellness-custom"]')).not.toBeNull();
  });

  it('every protection switch is usable, one per key', () => {
    const el = render();
    const boxes = [
      ...el.querySelectorAll<HTMLInputElement>('input[name^="wellness_"][type="checkbox"]'),
    ]
      .filter((box) => !['wellness_ignore_feed_cooldown'].includes(box.name))
      .filter(
        (box) =>
          !box.name.match(
            /_(auto_refresh|algo_calm|confirm_post|delayed_send|thoughtful_posting|show_images)$/,
          ),
      );
    expect(boxes.map((box) => box.name.replace('wellness_', ''))).toEqual([...WELLNESS_KEYS]);
    expect(boxes.every((box) => !box.disabled)).toBe(true);
  });

  it('Force Calm locks the mirrored Calm switch', async () => {
    TestBed.inject(Wellness).set('forceCalm', true);
    const fixture = TestBed.createComponent(SettingsWellness);
    fixture.detectChanges();
    // ngModel applies [disabled] asynchronously.
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector<HTMLInputElement>('input[name="wellness_algo_calm"]')!.disabled).toBe(
      true,
    );
    expect(TestBed.inject(ClientPrefs).algoCalm()).toBe(false);
    expect(TestBed.inject(Wellness).calm()).toBe(true);
  });
});
