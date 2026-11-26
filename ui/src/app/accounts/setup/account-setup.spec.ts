import { Component, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { scopeSuffixForMastodonAccount } from '../../platform/session/account-scope';
import { Auth } from '../../platform/session/auth';
import { Server } from '../../platform/http/server';
import { AccountSetup } from './account-setup';
import { setupGuard } from './setup.guard';
import { armSetup, readSetup } from './setup-store';

@Component({ changeDetection: ChangeDetectionStrategy.Eager, template: 'home' })
class HomeStub {}

const SERVER = 'https://mastodon.example';

describe('AccountSetup page', () => {
  let harness: RouterTestingHarness;
  let router: Router;

  async function signIn(): Promise<void> {
    TestBed.inject(Server).setBaseUrl(SERVER);
    const auth = TestBed.inject(Auth);
    auth.setToken('alice-token');
    auth.setAccount({ id: '42', username: 'alice', acct: 'alice' } as never);
    localStorage.removeItem(
      `mockingbird_onboarding_account${scopeSuffixForMastodonAccount('42', SERVER)}`,
    );
    armSetup(scopeSuffixForMastodonAccount('42', SERVER), 'signup');
  }

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'home', component: HomeStub },
          { path: 'crosspost', component: HomeStub },
          { path: 'setup', canActivate: [setupGuard], component: AccountSetup },
          { path: 'setup/:step', canActivate: [setupGuard], component: AccountSetup },
        ]),
      ],
    });
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
  });

  const text = () => (harness.routeNativeElement as HTMLElement).textContent ?? '';
  const button = (label: string) =>
    [...(harness.routeNativeElement as HTMLElement).querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label,
    )!;
  const settle = async () => {
    await harness.fixture.whenStable();
    harness.detectChanges();
    await harness.fixture.whenStable();
  };

  it('sends anyone without a Mastodon account Home', async () => {
    await harness.navigateByUrl('/setup/welcome');
    expect(router.url).toBe('/home');
  });

  it('resumes from /setup at the first step, shows the handle, and marks setup running', async () => {
    await signIn();
    await harness.navigateByUrl('/setup');
    await settle();
    expect(router.url).toBe('/setup/welcome');
    expect(text()).toContain('@alice@mastodon.example');
    expect(text()).toContain('Step 1 of 9');
    expect(readSetup()?.state).toBe('running');
  });

  it('redirects a hidden or unknown step to where the account should resume', async () => {
    await signIn();
    await harness.navigateByUrl('/setup/twitter');
    await settle();
    expect(router.url).toBe('/setup/welcome');
  });

  it('records Next and Skip as answered, goes Back, and exits Home keeping progress', async () => {
    await signIn();
    await harness.navigateByUrl('/setup/welcome');
    await settle();
    button('Next').click();
    await settle();
    expect(router.url).toBe('/setup/purpose');
    button('Skip').click();
    await settle();
    expect(router.url).toBe('/setup/profile');
    expect(readSetup()?.answered).toEqual(['welcome', 'purpose']);

    button('Back').click();
    await settle();
    expect(router.url).toBe('/setup/purpose');

    button('Exit setup').click();
    await settle();
    expect(router.url).toBe('/home');
    expect(readSetup()).toMatchObject({ state: 'running', answered: ['welcome', 'purpose'] });
  });

  it('finishes on the page whose sign-in became a sign-up', async () => {
    sessionStorage.setItem('mockingbird_login_next', '/crosspost');
    await signIn();
    await harness.navigateByUrl('/setup/done');
    await settle();
    (harness.routeDebugElement!.componentInstance as any).finish();
    await settle();
    expect(router.url).toBe('/crosspost');
    sessionStorage.clear();
  });

  it('finishes on Done and goes Home', async () => {
    await signIn();
    await harness.navigateByUrl('/setup/done');
    await settle();
    button('Go to Home').click();
    await settle();
    expect(router.url).toBe('/home');
    expect(readSetup()?.state).toBe('finished');
  });
});
