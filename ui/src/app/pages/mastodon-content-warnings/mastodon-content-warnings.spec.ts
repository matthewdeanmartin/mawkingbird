import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../auth';
import { Server } from '../../server';
import { TrustedAccounts } from '../../trusted-accounts';
import { ContentWarningsWorkbench } from './content-warnings-workbench';
import { MastodonContentWarnings } from './mastodon-content-warnings';

const PREFS = '/api/v1/preferences';

describe('MastodonContentWarnings', () => {
  beforeEach(() => localStorage.clear());

  async function page(data: Record<string, unknown>): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [MastodonContentWarnings],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data } } },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(MastodonContentWarnings);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('signed out, answers for the Mastodon website too and signs in back here', async () => {
    const root = await page({});
    expect(root.querySelector('h1')?.textContent).toContain(
      'How to turn off content warnings on Mastodon',
    );
    expect(root.textContent).toContain('Always expand posts marked with content warnings');
    expect(root.querySelector('.sign-in-choices a')?.getAttribute('href')).toBe(
      '/login/mastodon?next=%2Fturn-off-content-warnings-mastodon',
    );
    expect(root.querySelector('app-content-warnings-workbench')).toBeNull();
  });

  it('signed in, shows the switches instead of the pitch', async () => {
    const root = await page({ inShell: true });
    expect(root.querySelector('.steps')).toBeNull();
    expect(root.querySelector('.sign-in-choices')).toBeNull();
  });
});

describe('ContentWarningsWorkbench', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ContentWarningsWorkbench>;
  let root: HTMLElement;
  let trust: TrustedAccounts;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ContentWarningsWorkbench],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(Server).setBaseUrl('https://mastodon.social');
    // Trust settings are stored per signed-in account.
    TestBed.inject(Auth).setToken('cw-account');
    trust = TestBed.inject(TrustedAccounts);
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ContentWarningsWorkbench);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  function checkboxes(): HTMLInputElement[] {
    return [...root.querySelectorAll<HTMLInputElement>('#cw-here-title ~ .switches input')];
  }

  it("switches Mawkingbird's two settings on in place, then offers the next steps", () => {
    http.expectOne(PREFS).flush({});
    fixture.detectChanges();
    const [cw, media] = checkboxes();
    expect(cw.checked).toBe(false);
    expect(root.querySelector('app-focused-next-steps')).toBeNull();

    cw.click();
    media.click();
    fixture.detectChanges();
    expect(trust.expandAllCw()).toBe(true);
    expect(trust.showAllSensitive()).toBe(true);
    expect(root.querySelector('app-focused-next-steps')).not.toBeNull();
  });

  it('lifts "trust no one", which would otherwise keep the switch silent, and says so', () => {
    http.expectOne(PREFS).flush({});
    trust.setLevel('none');
    fixture.detectChanges();
    checkboxes()[0].click();
    fixture.detectChanges();
    expect(trust.level()).toBe('individuals');
    expect(trust.expandAllCw()).toBe(true);
    expect(root.textContent).toContain('back to the default');
  });

  it("shows the server's own preferences read-only, with a link to change them there", () => {
    http
      .expectOne(PREFS)
      .flush({ 'reading:expand:spoilers': false, 'reading:expand:media': 'default' });
    fixture.detectChanges();
    const server = root.querySelector('[aria-labelledby="cw-server-title"]')!;
    expect(server.textContent).toContain('content warnings: off');
    expect(server.textContent).toContain('hide media marked as sensitive');
    expect(server.querySelector('input')).toBeNull();
    expect(server.querySelector('a')?.getAttribute('href')).toBe(
      'https://mastodon.social/settings/preferences/other',
    );
  });

  it('points to per-person trust', () => {
    http.expectOne(PREFS).flush({});
    fixture.detectChanges();
    expect(root.querySelector('a[href="/settings/content"]')).not.toBeNull();
  });
});
