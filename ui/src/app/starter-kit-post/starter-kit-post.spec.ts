import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../auth';
import { ImportFollows } from '../import-follows';
import { AnonymousFollows, ANONYMOUS_FOLLOW_LIMIT } from '../providers/anonymous/anonymous-follows';
import { SHIPPED_STARTER_KITS } from '../starter-kits';
import { StarterKitPost } from './starter-kit-post';

describe('StarterKitPost', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function render(anonymous: boolean) {
    if (anonymous) {
      TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    }
    const fixture = TestBed.createComponent(StarterKitPost);
    fixture.componentRef.setInput('kit', SHIPPED_STARTER_KITS[0]);
    fixture.detectChanges();
    return fixture;
  }

  it('shows every member and keeps the canonical collection as a secondary link', () => {
    const fixture = render(true);
    const el = fixture.nativeElement as HTMLElement;
    const kit = SHIPPED_STARTER_KITS[0];

    // Members open in-app for anonymous viewers too. They used to be off-site
    // anchors, which dropped a first-time visitor onto someone else's web UI at
    // the moment they were deciding whether to stay here.
    expect(el.querySelectorAll('button.kit-member')).toHaveLength(kit.itemCount);
    expect(el.querySelectorAll('.kit-member[href]')).toHaveLength(0);
    // Hover cards are expensive component trees. None should be constructed
    // until the user asks for one, and only that member's card should exist.
    expect(el.querySelectorAll('app-account-hover-card')).toHaveLength(0);
    const memberShell = el.querySelector('.kit-member-shell')!;
    memberShell.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(el.querySelectorAll('app-account-hover-card')).toHaveLength(1);
    expect(el.querySelector('app-account-hover-card button')).toBeNull();
    memberShell.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(el.querySelectorAll('app-account-hover-card')).toHaveLength(0);
    expect((el.querySelector('.kit-link') as HTMLAnchorElement).getAttribute('href')).toBe(
      `/collections/preview/${kit.id}`,
    );
    expect((el.querySelector('.kit-home-link') as HTMLAnchorElement).href).toBe(kit.url);
    httpMock.expectNone((request) => request.url.includes('/api/v2/search'));
  });

  it('resolves a signed-in profile through the active server before opening it', async () => {
    const fixture = render(false);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const account = SHIPPED_STARTER_KITS[0].accounts[0];
    const button = fixture.nativeElement.querySelector('.kit-member') as HTMLButtonElement;

    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    fixture.detectChanges();
    button.click();
    const request = httpMock.expectOne(
      `/api/v2/search?q=${account.acct}&type=accounts&resolve=true&limit=5`,
    );
    request.flush({ accounts: [{ ...account, id: 'local-42' }], statuses: [], hashtags: [] });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/accounts', 'local-42']);
    expect(fixture.nativeElement.querySelector('app-account-hover-card button')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Follow all');
  });

  /**
   * Anonymous visitors could bulk-follow a starter kit but not a bundled
   * collection, even though both ship the same resolved snapshots. An anonymous
   * follow is a browser-local row, so it needs neither a token nor a request.
   */
  it('offers follow-all to anonymous visitors and writes browser-local follows', async () => {
    const fixture = render(true);
    const kit = SHIPPED_STARTER_KITS[0];
    // Component-scoped provider: the card has its own importer, not the root one.
    const importer = fixture.debugElement.injector.get(ImportFollows);
    importer.delayMs = 0;

    const button = [...fixture.nativeElement.querySelectorAll('button')].find(
      (b: HTMLButtonElement) => b.textContent?.includes('Follow all'),
    ) as HTMLButtonElement;
    expect(button).toBeDefined();

    button.click();
    await vi.waitFor(() => expect(importer.running()).toBe(false));
    fixture.detectChanges();

    // Every member followed, and not one search request: the kit already carries
    // the resolved accounts.
    const expected = Math.min(kit.accounts.length, ANONYMOUS_FOLLOW_LIMIT);
    expect(TestBed.inject(AnonymousFollows).count()).toBe(expected);
    httpMock.expectNone((request) => request.url.includes('/api/v2/search'));
    expect(fixture.nativeElement.textContent).toContain(`Followed ${expected} of`);
  });

  /** The anonymous cap is a real ceiling, and a silent stop looks like a bug. */
  it('names the anonymous follow cap when a kit runs past it', async () => {
    const fixture = render(true);
    const follows = TestBed.inject(AnonymousFollows);
    // Fill the quota with unrelated accounts so the kit cannot fit. Follows are
    // keyed on username@host, so `url` and `acct` have to differ too — sharing
    // them would dedupe every filler into one row and never reach the cap.
    for (let i = 0; i < ANONYMOUS_FOLLOW_LIMIT; i++) {
      follows.follow(
        {
          ...SHIPPED_STARTER_KITS[0].accounts[0],
          id: `filler-${i}`,
          username: `filler${i}`,
          acct: `filler${i}@example.test`,
          url: `https://example.test/@filler${i}`,
        },
        'https://mastodon.social',
      );
    }
    expect(follows.count()).toBe(ANONYMOUS_FOLLOW_LIMIT);
    // Component-scoped provider: the card has its own importer, not the root one.
    const importer = fixture.debugElement.injector.get(ImportFollows);
    importer.delayMs = 0;

    const button = [...fixture.nativeElement.querySelectorAll('button')].find(
      (b: HTMLButtonElement) => b.textContent?.includes('Follow all'),
    ) as HTMLButtonElement;
    button.click();
    await vi.waitFor(() => expect(importer.running()).toBe(false));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('can follow up to');
  });
});
