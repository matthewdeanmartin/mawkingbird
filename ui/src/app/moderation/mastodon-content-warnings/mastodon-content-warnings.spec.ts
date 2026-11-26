import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ComponentFixture,
  DeferBlockBehavior,
  DeferBlockState,
  TestBed,
} from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { Server } from '../../platform/http/server';
import { TrustedAccounts } from '../../accounts/trusted-accounts';
import { ContentWarningsWorkbench } from './content-warnings-workbench';
import { MastodonContentWarnings } from './mastodon-content-warnings';

const PREFS = '/api/v1/preferences';

describe('MastodonContentWarnings', () => {
  beforeEach(() => localStorage.clear());

  let pageFixture: ComponentFixture<MastodonContentWarnings>;

  async function page(
    data: Record<string, unknown>,
    connected: boolean | 'anonymous' = false,
    serverRender = false,
  ): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      deferBlockBehavior: DeferBlockBehavior.Manual,
      imports: [MastodonContentWarnings],
      providers: [
        ...(serverRender
          ? [
              { provide: PLATFORM_ID, useValue: 'server' },
              {
                provide: Auth,
                useFactory: () => {
                  throw new Error('SSR must not instantiate browser session state');
                },
              },
            ]
          : []),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data } } },
      ],
    });
    await TestBed.compileComponents();
    TestBed.inject(Server).setBaseUrl('https://mastodon.social');
    if (connected === true) TestBed.inject(Auth).setToken('connected');
    if (connected === 'anonymous') TestBed.inject(Auth).enterAnonymous('https://public.example');
    const fixture = TestBed.createComponent(MastodonContentWarnings);
    pageFixture = fixture;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('prerenders the answer without instantiating browser-only account state', async () => {
    const root = await page({}, false, true);
    expect(root.querySelector('.intro')?.textContent).toContain(
      'Always expand posts marked with content warnings',
    );
    expect(root.querySelector<HTMLInputElement>('.server-guide input')?.value).toBe('');
    expect(root.querySelector('.server-guide a')).toBeNull();
  });

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

  it('signed in, keeps the Mastodon guide before the optional client switches', async () => {
    const root = await page({ inShell: true }, true);
    expect(root.querySelector('.intro')?.textContent).toContain(
      'Always expand posts marked with content warnings',
    );
    expect(root.querySelector('.server-guide a')?.getAttribute('href')).toBe(
      'https://mastodon.social/settings/preferences/appearance',
    );
    expect(root.textContent!.indexOf('Open your Mastodon settings')).toBeLessThan(
      root.textContent!.indexOf('Optional: read in Mawkingbird'),
    );
    expect(root.querySelector('.sign-in-choices')).toBeNull();
  });
  it('opens only a validated server link without authenticating or changing the browsing server', async () => {
    const root = await page({});
    const input = root.querySelector<HTMLInputElement>('.server-guide input')!;
    expect(input.value).toBe('');
    expect(root.querySelector('.server-guide a')).toBeNull();
    for (const value of [
      'example.social',
      '@reader@example.social',
      'reader@example.social',
      'https://example.social/',
    ]) {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      pageFixture.detectChanges();
      expect(root.querySelector('.server-guide a')?.getAttribute('href')).toBe(
        'https://example.social/settings/preferences/appearance',
      );
    }
    for (const value of [
      'javascript:alert(1)',
      'https://user:password@example.social',
      'not a server',
      '@reader',
      'https://example.social/path',
      'https://example.social?x=1',
    ]) {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      pageFixture.detectChanges();
      expect(root.querySelector('.server-guide a'), value).toBeNull();
      expect(input.getAttribute('aria-invalid')).toBe('true');
    }
    expect(TestBed.inject(Auth).isAuthenticated).toBe(false);
    expect(TestBed.inject(Server).baseUrl()).toBe('https://mastodon.social');
    TestBed.inject(HttpTestingController).expectNone(PREFS);
  });

  it('keeps the server link usable when reading preferences fails', async () => {
    const root = await page({ inShell: true }, true);
    const [block] = await pageFixture.getDeferBlocks();
    await block.render(DeferBlockState.Complete);
    TestBed.inject(HttpTestingController)
      .expectOne(PREFS)
      .flush({}, { status: 503, statusText: 'Unavailable' });
    pageFixture.detectChanges();
    expect(root.querySelector('.server-guide a')?.getAttribute('href')).toBe(
      'https://mastodon.social/settings/preferences/appearance',
    );
    expect(root.querySelector('.intro')?.textContent).toContain('Save changes');
    expect(root.querySelector('app-content-warnings-workbench')).not.toBeNull();
  });

  it('does not treat an Anonymous reading server as the visitors own account', async () => {
    const root = await page({}, 'anonymous');
    pageFixture.detectChanges();
    expect(root.querySelector<HTMLInputElement>('.server-guide input')?.value).toBe('');
    expect(TestBed.inject(Auth).isAnonymous).toBe(true);
    expect(root.querySelector('.sign-in-choices a')).not.toBeNull();
    TestBed.inject(HttpTestingController).expectNone(PREFS);
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
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
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
      'https://mastodon.social/settings/preferences/appearance',
    );
  });

  it('points to per-person trust', () => {
    http.expectOne(PREFS).flush({});
    fixture.detectChanges();
    expect(root.querySelector('a[href="/settings/content"]')).not.toBeNull();
  });
});
