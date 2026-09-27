import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../auth';
import { ClientPrefs } from '../client-prefs';
import { FeatureFlags } from '../feature-flags';
import { OnboardingCard } from './onboarding-card';
import { OnboardingLauncher } from './onboarding-launcher';

async function render() {
  const fixture = TestBed.createComponent(OnboardingCard);
  fixture.detectChanges();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) ?? null;
  const click = async (label: string) => {
    const target = button(label);
    if (!target) throw new Error(`no button "${label}"`);
    target.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, el, button, click };
}

describe('OnboardingCard', () => {
  let launcher: OnboardingLauncher;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    launcher = TestBed.inject(OnboardingLauncher);
    launcher.openFromMenu();
  });

  it('shows one question with its progress and scope', async () => {
    const { el } = await render();
    expect(el.querySelector('h2')?.textContent).toContain('Light or dark?');
    expect(el.querySelector('.ob-progress')?.textContent).toMatch(/^1 of \d+$/);
    expect(el.querySelector('.ob-tag')?.textContent).toContain('all accounts');
    expect(el.getAttribute('aria-modal')).toBe('false');
  });

  it('applies a choice immediately and moves on with Next', async () => {
    const { el, click } = await render();
    await click('Dark');
    expect(TestBed.inject(ClientPrefs).themeMode()).toBe('dark');

    await click('Next');
    expect(el.querySelector('h2')?.textContent).toContain('Pick a colour.');
  });

  it('closes on Quit and keeps what was applied', async () => {
    const { click } = await render();
    await click('Light');
    await click('Quit');
    expect(launcher.mode()).toBeNull();
    expect(TestBed.inject(ClientPrefs).themeMode()).toBe('light');
  });

  it('leaves for the starter packs from the find-people card', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const { fixture, click } = await render();
    // Jump straight to the action card: the Anonymous account follows nobody.
    (
      fixture.componentInstance as unknown as { flow: { currentId: { set(v: string): void } } }
    ).flow.currentId.set('find-people');
    fixture.detectChanges();

    await click('Show me starter packs');
    expect(navigate).toHaveBeenCalledWith('/bundled-starter-kits');
    expect(launcher.mode()).toBeNull();
  });

  it('ends without a Plus card when the Plus flag is off', async () => {
    TestBed.inject(FeatureFlags).setState('mawkingbird-plus', 'off');
    const { el, fixture, click } = await render();
    for (
      let i = 0;
      i < 40 && el.querySelector('h2')?.textContent?.trim() !== "You're all set.";
      i++
    ) {
      expect(el.querySelector('h2')?.textContent).not.toContain('Mawkingbird Plus');
      await click('Skip');
      fixture.detectChanges();
    }
    expect(el.querySelector('h2')?.textContent).toContain("You're all set.");
  });
});
