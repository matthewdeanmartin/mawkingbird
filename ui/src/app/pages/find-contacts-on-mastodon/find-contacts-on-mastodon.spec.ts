import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ContactDiscovery } from '../settings/import-export/contact-discovery';
import { ContactsWorkbench } from './contacts-workbench';
import { FindContactsOnMastodon } from './find-contacts-on-mastodon';

describe('FindContactsOnMastodon', () => {
  beforeEach(() => localStorage.clear());

  async function page(data: Record<string, unknown>): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [FindContactsOnMastodon],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data } } },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(FindContactsOnMastodon);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('signed out, says contacts stay in the browser and signs in back to this page', async () => {
    const root = await page({});
    expect(root.querySelector('h1')?.textContent).toContain('Find your phone contacts on Mastodon');
    expect(root.textContent).toContain('Your contacts stay in this browser');
    expect(root.querySelector('.sign-in-choices a')?.getAttribute('href')).toBe(
      '/login/mastodon?next=%2Ffind-contacts-on-mastodon',
    );
    expect(root.querySelector('app-contacts-workbench')).toBeNull();
  });

  it('signed in, shows the finder instead of the pitch', async () => {
    const root = await page({ inShell: true });
    expect(root.querySelector('.steps')).toBeNull();
    expect(root.querySelector('.sign-in-choices')).toBeNull();
  });
});

describe('ContactsWorkbench', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ContactsWorkbench],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('offers the CSV upload everywhere, and the next steps only once a search has run', () => {
    const fixture = TestBed.createComponent(ContactsWorkbench);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('#contacts input[type="file"]')).not.toBeNull();
    expect(root.querySelector('app-focused-next-steps')).toBeNull();

    TestBed.inject(ContactDiscovery).callCount.set(1);
    fixture.detectChanges();
    expect(
      root.querySelector('app-focused-next-steps a[href="/find-contacts-on-mastodon/invite"]'),
    ).not.toBeNull();
  });
});
