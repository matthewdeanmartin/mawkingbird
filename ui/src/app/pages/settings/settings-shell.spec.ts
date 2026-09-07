import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
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
