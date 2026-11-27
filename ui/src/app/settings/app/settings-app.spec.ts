import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExtensionBridge } from '../../platform/extension/extension-bridge';
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
    expect(el.textContent).toContain('Download Mawkingbird for your computer');
    expect(el.querySelectorAll('a[href*="native-v0.3.0"]')).toHaveLength(6);
    const advanced = el.querySelector('mb-disclosure details')!;
    expect(advanced.hasAttribute('open')).toBe(false);
    advanced.querySelector('summary')!.click();
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

describe('SettingsApp with Mawkingbird for Firefox', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setUp(present: boolean, allSites: boolean) {
    const fake = {
      installed: signal(false),
      canPrompt: signal(false),
      route: () => 'manual' as InstallRoute,
      prompt: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AppInstall, useValue: fake },
        {
          provide: ExtensionBridge,
          useValue: {
            present: () => present,
            allSites: signal(allSites),
            refreshAllSites: vi.fn(async () => allSites),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(SettingsApp);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('says it is installed, and whether it may read any public site', () => {
    const el = setUp(true, true);
    expect(el.textContent).toContain('Mawkingbird for Firefox');
    expect(el.textContent).toContain('It may read any public site.');
  });

  it('offers nothing about it before it is installed (not on the store yet)', () => {
    expect(setUp(false, false).textContent).not.toContain('Mawkingbird for Firefox');
  });
});
