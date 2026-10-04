import { Component } from '@angular/core';
import { RouterTestingHarness } from '@angular/router/testing';
import { Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsShell } from './settings-shell';
import { Auth } from '../../auth';

describe('SettingsShell', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('renders the settings category sidebar', () => {
    const fixture = TestBed.createComponent(SettingsShell);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const labels = Array.from(el.querySelectorAll('.settings-nav a span:first-child')).map((n) =>
      n.textContent?.trim(),
    );
    expect(labels).toContain('Public profile');
    expect(labels.filter((label) => label === 'Public profile')).toHaveLength(1);
    expect(labels).toContain('Filters');
    expect(labels).toContain('Muted & Blocked');
    expect(labels).toContain('Bulk moderation');
    // Blue's controls all live on Appearance, so it has no page of its own.
    expect(labels).not.toContain('Mockingbird Blue');
    // RSS is listed here *and* in the More menu: the feed list, the cap and
    // OPML import/export are settings by any reading, and a settings page
    // reachable only from another menu is one nobody finds.
    expect(labels).toContain('RSS feeds');
    expect(labels).toContain('Privacy');
    expect(labels).not.toContain('Posting defaults');
    expect(labels).not.toContain('Posting & Privacy');
    expect(labels).not.toContain('Blocked accounts');
    expect(labels).toContain('Approve follow requests');
    expect(labels).toContain('Import/Export Friends & Tags');
    expect(labels).toContain('Import/Export Config');
    // Mock build shows the _mock-backed pages too.
    expect(labels).toContain('Invite links');
  });

  it('places Pseudonymity only under Advanced for signed-in accounts', () => {
    TestBed.inject(Auth).setToken('signed-in-token');
    const fixture = TestBed.createComponent(SettingsShell);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const links = el.querySelectorAll('a[href="/pseudonymity"]');
    expect(links).toHaveLength(1);
    let previous = links[0].previousElementSibling;
    while (previous && !previous.classList.contains('settings-nav-heading'))
      previous = previous.previousElementSibling;
    expect(previous?.textContent?.trim()).toBe('Advanced');
  });

  it('places Notifications only under Content', () => {
    const fixture = TestBed.createComponent(SettingsShell);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const links = el.querySelectorAll('a[href="/notification-preferences"]');
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toContain('Notifications');
    let previous = links[0].previousElementSibling;
    while (previous && !previous.classList.contains('settings-nav-heading'))
      previous = previous.previousElementSibling;
    expect(previous?.textContent?.trim()).toBe('Content');
  });

  it('shows only browser-local settings in Anonymous', () => {
    TestBed.inject(Auth).enterAnonymous();
    const fixture = TestBed.createComponent(SettingsShell);
    fixture.detectChanges();
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.settings-nav a span:first-child'),
    ).map((node) => node.textContent?.trim());

    // A set, not a list: the sidebar is grouped now, and a page filed under two
    // headings is *meant* to appear twice. What must hold is exactly which
    // pages an Anonymous account can reach.
    expect(new Set(labels)).toEqual(
      new Set([
        'Public profile',
        'Server',
        'Connections',
        // Anonymous-capable: a note can be a browser-local draft, so the PKM tag
        // vocabulary is configurable without a server identity.
        'Writing',
        'Appearance',
        'Internationalization',
        'Local storage',
        'Endorsements',
        'Signed-in accounts',
        // Trusted accounts and the CW/sensitive switches are client-side, so they
        // work anonymously even though 'Muted & Blocked' beside them does not.
        'Trust: CW/Sensitive',
        'Notifications',
        // A feed URL carries no credential, so a reading list works with no
        // server identity at all — the most anonymous-capable page there is.
        'RSS feeds',
        'Import/Export Config',
        'Feature flags',
      ]),
    );
  });

  it('files every page under a heading, and never shows an empty one', () => {
    const fixture = TestBed.createComponent(SettingsShell);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    const headings = Array.from(el.querySelectorAll('.settings-nav-heading')).map((n) =>
      n.textContent?.trim(),
    );
    expect(headings).toContain('Basic');
    expect(headings).toContain('People');
    expect(headings).toContain('Accounts');
    expect(headings).toContain('Advanced');

    // Every heading is followed by at least one link before the next heading.
    const children = Array.from(el.querySelector('.settings-nav')!.children);
    children.forEach((node, i) => {
      if (node.classList.contains('settings-nav-heading')) {
        const next = children[i + 1];
        expect(next).toBeDefined();
        expect(next.classList.contains('settings-nav-heading')).toBe(false);
      }
    });
  });

  // Cross-listing is the point: a setting with a claim on two shelves goes on
  // both rather than making the user guess which one we chose.
  it('shows Privacy under both Basic and People', () => {
    const fixture = TestBed.createComponent(SettingsShell);
    fixture.detectChanges();
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.settings-nav a span:first-child'),
    ).map((node) => node.textContent?.trim());

    expect(labels.filter((l) => l === 'Privacy').length).toBe(2);
  });

  it('does not show anonymous server settings for a signed-in account', () => {
    TestBed.inject(Auth).setToken('signed-in-token');
    const fixture = TestBed.createComponent(SettingsShell);
    fixture.detectChanges();
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.settings-nav a span:first-child'),
    ).map((node) => node.textContent?.trim());

    expect(labels).not.toContain('Server');
  });
});

@Component({ template: '<p>Settings destination</p>' })
class SettingsRouteFixture {}

describe('Settings navigation adoption', () => {
  it('keeps native destinations and marks nested and cross-listed active links', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          {
            path: 'settings',
            component: SettingsShell,
            children: [{ path: '**', component: SettingsRouteFixture }],
          },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create('/settings/filters/new?source=review');
    await harness.fixture.whenStable();
    harness.detectChanges();
    const element = harness.routeNativeElement!;
    const filters = element.querySelector('a[href="/settings/filters"]')!;
    expect(filters.getAttribute('aria-current')).toBe('page');
    expect(TestBed.inject(Router).url).toBe('/settings/filters/new?source=review');
    await harness.navigateByUrl('/settings/privacy');
    await harness.fixture.whenStable();
    harness.detectChanges();
    const privacy = element.querySelectorAll('a[href="/settings/privacy"]');
    expect(privacy).toHaveLength(2);
    for (const link of privacy) expect(link.getAttribute('aria-current')).toBe('page');
    expect(filters.getAttribute('aria-current')).toBeNull();
    expect(element.querySelector('nav[mbNavigation]')?.getAttribute('aria-label')).toBe(
      'Settings sections',
    );
  });
});

describe('Settings phone drawer', () => {
  let viewport: MediaQueryList;
  const descriptors = ['showModal', 'close'].map(
    (name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const,
  );

  beforeEach(() => {
    viewport = new EventTarget() as MediaQueryList;
    Object.defineProperty(viewport, 'matches', { value: true, writable: true });
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => viewport),
    );
    for (const [name] of descriptors) {
      Object.defineProperty(HTMLDialogElement.prototype, name, {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.open = name === 'showModal';
        },
      });
    }
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          {
            path: 'settings',
            component: SettingsShell,
            children: [{ path: '**', component: SettingsRouteFixture }],
          },
        ]),
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
    }
  });

  it('opens a modal drawer and closes it after choosing a native settings link', async () => {
    const harness = await RouterTestingHarness.create('/settings/appearance');
    const root = harness.routeNativeElement!;
    root.querySelector<HTMLButtonElement>('.settings-phone-nav button')!.click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const dialog = root.querySelector('dialog')!;
    expect(dialog.getAttribute('data-presentation')).toBe('drawer');
    expect(dialog.open).toBe(true);
    expect(root.querySelector('.settings-phone-nav button')?.getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(
      dialog.querySelector('a[href="/settings/appearance"]')?.getAttribute('aria-current'),
    ).toBe('page');
    dialog.querySelector<HTMLAnchorElement>('a[href="/settings/writing"]')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/settings/writing');
    expect(root.querySelector('dialog')).toBeNull();
    expect(root.querySelector('.settings-content')?.textContent).toContain('Settings destination');
  });

  it('dismisses on Escape and removes the modal when the viewport becomes wider', async () => {
    const fixture = TestBed.createComponent(SettingsShell);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const trigger = root.querySelector<HTMLButtonElement>('.settings-phone-nav button')!;
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    root.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    fixture.detectChanges();
    expect(root.querySelector('dialog')).toBeNull();
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    viewport.dispatchEvent(Object.assign(new Event('change'), { matches: false }));
    fixture.detectChanges();
    expect(root.querySelector('dialog')).toBeNull();
    expect(document.documentElement.style.overflow).not.toBe('hidden');
    expect(root.querySelector('.settings-side nav')).not.toBeNull();
  });
});
