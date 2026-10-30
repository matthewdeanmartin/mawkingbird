import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../auth';
import { Account } from '../../models';
import { Pseudonymity } from '../../pseudonymity';
import { AnonymousOnMastodon } from './anonymous-on-mastodon';
import { PseudonymityWorkbench } from './pseudonymity-workbench';

const VERIFY = '/api/v1/accounts/verify_credentials';
const UPDATE = '/api/v1/accounts/update_credentials';

function me(overrides: Partial<Account> = {}): Account {
  return {
    id: '1',
    username: 'me',
    acct: 'me',
    display_name: 'Me',
    note: '',
    url: '',
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    discoverable: true,
    indexable: true,
    hide_collections: false,
    noindex: false,
    fields: [],
    ...overrides,
  } as Account;
}

describe('AnonymousOnMastodon', () => {
  beforeEach(() => localStorage.clear());

  async function page(data: Record<string, unknown>): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [AnonymousOnMastodon],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data } } },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(AnonymousOnMastodon);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('signed out, is an honest guide and signs in back to this page', async () => {
    const root = await page({});
    expect(root.querySelector('h1')?.textContent).toContain(
      'How to be (pseudo)anonymous on Mastodon',
    );
    expect(root.textContent).toContain('the email address you signed up with');
    expect(root.querySelector('.sign-in-choices a')?.getAttribute('href')).toBe(
      '/login/mastodon?next=%2Fhow-to-be-anonymous-on-mastodon',
    );
    expect(root.querySelector('app-pseudonymity-workbench')).toBeNull();
  });

  it('signed in, shows the checklist instead of the pitch', async () => {
    const root = await page({ inShell: true });
    expect(root.querySelector('.steps')).toBeNull();
    expect(root.querySelector('.sign-in-choices')).toBeNull();
  });
});

describe('PseudonymityWorkbench', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<PseudonymityWorkbench>;
  let root: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [PseudonymityWorkbench],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    // Pseudonymity mode is stored per signed-in account.
    TestBed.inject(Auth).setToken('pseudonymous-account');
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PseudonymityWorkbench);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  function load(account: Account): void {
    http.expectOne(VERIFY).flush(account);
    fixture.detectChanges();
  }

  /** The checklist's submit button, whatever it currently says. */
  function applyButton(): HTMLButtonElement | null {
    return root.querySelector<HTMLButtonElement>(
      '[aria-labelledby="pseudo-server-title"] > button',
    );
  }

  it('sends the pre-ticked switches in one update, never locking unasked', () => {
    load(me());
    expect(applyButton()?.textContent).toContain('Apply 3 changes');
    expect(root.querySelector('#pseudo-more-title')).toBeNull();

    applyButton()!.click();
    const req = http.expectOne(UPDATE);
    expect(req.request.method).toBe('PATCH');
    const body = req.request.body as FormData;
    expect(body.get('hide_collections')).toBe('true');
    expect(body.get('discoverable')).toBe('false');
    expect(body.get('indexable')).toBe('false');
    expect(body.has('locked')).toBe(false);

    req.flush(me({ hide_collections: true, discoverable: false, indexable: false }));
    fixture.detectChanges();
    expect(root.textContent).toContain('Your server confirmed every change');
    // The server half is done, so Mawkingbird's own features are offered next.
    expect(root.querySelector('#pseudo-more-title')).not.toBeNull();
    expect(root.querySelector('app-focused-next-steps')).not.toBeNull();
  });

  it('believes only what the server sent back', () => {
    load(me());
    applyButton()!.click();
    // The server ignored hide_collections.
    http.expectOne(UPDATE).flush(me({ discoverable: false, indexable: false }));
    fixture.detectChanges();
    expect(root.textContent).toContain('Your server kept its own value for');
    expect(root.textContent).toContain('Hide who you follow and who follows you');
  });

  it('points out what it cannot change: search engines and revealing profile links', () => {
    load(
      me({
        fields: [{ name: 'Blog', value: 'https://me.example', verified_at: '2026-01-01' }],
      }),
    );
    const manual = root.querySelector('[aria-labelledby="pseudo-manual-title"]')!;
    expect(manual.textContent).toContain('Search engines may list your profile');
    expect(manual.querySelector('a[href$="/settings/privacy"]')).not.toBeNull();
    expect(manual.textContent).toContain('Blog: https://me.example');
    expect(manual.textContent).toContain('verified');
  });

  it('goes straight to the extras when the server is already set, and switches the mode on', () => {
    load(me({ hide_collections: true, discoverable: false, indexable: false, noindex: true }));
    // Only the optional lock is left: offered, but nothing is ticked for them.
    expect(applyButton()?.textContent).toContain('Nothing to apply');
    expect(applyButton()?.disabled).toBe(true);
    const turnOn = [...root.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Turn on pseudonymity mode'),
    )!;
    turnOn.click();
    fixture.detectChanges();
    const pseudonymity = TestBed.inject(Pseudonymity);
    expect(pseudonymity.enabled()).toBe(true);
    expect(pseudonymity.cleanLinks()).toBe(true);
    expect(pseudonymity.cleanMedia()).toBe(true);
    expect(root.textContent).toContain('Pseudonymity mode is on for this account');
  });

  it('does not offer switches an older server never reported', () => {
    const old = me();
    delete old.indexable;
    delete old.hide_collections;
    load(old);
    expect(applyButton()?.textContent).toContain('Apply 1 change');
    expect(root.textContent).not.toContain('full-text search');
  });
});

describe('PseudonymityWorkbench without an account scope', () => {
  it('says the mode could not be saved rather than claiming it is on', () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [PseudonymityWorkbench],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PseudonymityWorkbench);
    fixture.detectChanges();
    http
      .expectOne(VERIFY)
      .flush(me({ hide_collections: true, discoverable: false, indexable: false }));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    [...root.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Turn on pseudonymity mode'))!
      .click();
    fixture.detectChanges();
    expect(root.textContent).not.toContain('Pseudonymity mode is on');
    expect(root.textContent).toContain("couldn't save the setting");
  });
});
