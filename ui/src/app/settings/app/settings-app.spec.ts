import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppInstall, InstallRoute } from '../../shell/app-install/app-install';
import { SettingsApp } from './settings-app';

describe('SettingsApp', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setUp(route: InstallRoute, installed = false) {
    const fake = {
      installed: signal(installed),
      canPrompt: signal(route === 'prompt'),
      route: () => route,
      prompt: vi.fn().mockResolvedValue(true),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AppInstall, useValue: fake }] });
    const fixture = TestBed.createComponent(SettingsApp);
    fixture.detectChanges();
    return { fixture, fake, el: fixture.nativeElement as HTMLElement };
  }

  it('offers the install button where the browser allows it', async () => {
    const { fixture, fake, el } = setUp('prompt');
    expect(el.textContent).toContain('Install Mawkingbird to open it in its own window');
    el.querySelector('button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fake.prompt).toHaveBeenCalledOnce();
    expect(el.textContent).toContain('Open Mawkingbird from your home screen');
  });

  it('explains Add to Home Screen on iPhone, and says so once installed', () => {
    expect(setUp('ios').el.textContent).toContain('Add to Home Screen');
    TestBed.resetTestingModule();
    const { el } = setUp('prompt', true);
    expect(el.querySelector('button')).toBeNull();
    expect(el.textContent).toContain("You're using Mawkingbird as an app right now.");
  });
});
