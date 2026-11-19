import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Component } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  activeLabel,
  CreateAccount,
  defaultSignupLanguage,
  SIGNUP_SERVERS,
} from './create-account';
import { CreateAccountGo } from './create-account-go';

@Component({ template: 'login' })
class LoginStub {}

describe('create-mastodon-account page', () => {
  it('has a reviewed list for English with at least one open server per language', () => {
    expect(SIGNUP_SERVERS['en']?.length).toBeGreaterThan(0);
    for (const servers of Object.values(SIGNUP_SERVERS)) {
      expect(servers.some((s) => !s.approvalRequired)).toBe(true);
    }
  });

  it('defaults to the first browser language with a list, else English', () => {
    const listed = Object.keys(SIGNUP_SERVERS).find((code) => code !== 'en')!;
    expect(defaultSignupLanguage(['xx-YY', `${listed}-ZZ`])).toBe(listed);
    expect(defaultSignupLanguage(['xx'])).toBe('en');
  });

  it('rounds active users so they read as a size', () => {
    expect(activeLabel(400)).toBe('a few hundred active');
    expect(activeLabel(5352)).toBe('about 5,400 active each week');
    expect(activeLabel(41_620)).toBe('about 42,000 active each week');
  });

  it('hides servers that review new accounts until asked', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(CreateAccount);
    const page = fixture.componentInstance as unknown as {
      language: { set(v: string): void };
      showApproval: { set(v: boolean): void };
      servers(): { approvalRequired: boolean }[];
    };
    page.language.set('en');
    expect(page.servers().every((s) => !s.approvalRequired)).toBe(true);
    page.showApproval.set(true);
    expect(page.servers().length).toBe(SIGNUP_SERVERS['en'].length);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Create a Mastodon account');
  });

  describe('go hop', () => {
    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({
        providers: [
          provideRouter([
            { path: 'create-mastodon-account', component: LoginStub },
            { path: 'create-mastodon-account/go/:server', component: CreateAccountGo },
            { path: 'login/mastodon', component: LoginStub },
          ]),
        ],
      });
    });

    it('sends a chosen server to sign-in with the sign-up started', async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/create-mastodon-account/go/mastodon.social');
      await harness.fixture.whenStable();
      expect(TestBed.inject(Router).url).toBe(
        '/login/mastodon?intent=need&server=mastodon.social&go=1',
      );
    });

    it('sends anything that is not a domain back to the page', async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/create-mastodon-account/go/not%20a%20domain');
      await harness.fixture.whenStable();
      expect(TestBed.inject(Router).url).toBe('/create-mastodon-account');
    });
  });
});
