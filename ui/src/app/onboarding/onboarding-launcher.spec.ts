import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { scopeSuffixForToken } from '../account-scope';
import { OnboardingLauncher } from './onboarding-launcher';
import { markOnboardingPending, readOnboardingAccount } from './onboarding-store';

describe('OnboardingLauncher', () => {
  let launcher: OnboardingLauncher;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mastodon_mock_token', 'alice-token');
    TestBed.configureTestingModule({});
    launcher = TestBed.inject(OnboardingLauncher);
  });

  it('auto-opens a pending account on Home, once', () => {
    markOnboardingPending(scopeSuffixForToken('alice-token'));

    launcher.maybeAutoOpen('/home?tab=all', false);

    expect(launcher.mode()).toBe('auto');
    expect(readOnboardingAccount()?.pending).toBe(false);
    launcher.close();
    launcher.maybeAutoOpen('/home', false);
    expect(launcher.mode()).toBeNull();
  });

  it('waits for Home and for the first-run modal to close', () => {
    markOnboardingPending(scopeSuffixForToken('alice-token'));

    launcher.maybeAutoOpen('/bundled-starter-kits', false);
    launcher.maybeAutoOpen('/login/mastodon', false);
    launcher.maybeAutoOpen('/home', true);
    expect(launcher.mode()).toBeNull();
    expect(readOnboardingAccount()?.pending).toBe(true);

    launcher.maybeAutoOpen('/home', false);
    expect(launcher.mode()).toBe('auto');
  });

  it('never auto-opens an existing account that was not marked pending', () => {
    launcher.maybeAutoOpen('/home', false);
    expect(launcher.mode()).toBeNull();
  });

  it('opens from the menu regardless of pending state', () => {
    launcher.openFromMenu();
    expect(launcher.mode()).toBe('menu');
  });
});
