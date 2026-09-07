import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../auth';
import { MenuIndicators } from '../menu-indicators';

function fakeIndicators() {
  return { start: vi.fn(), ordinary: signal(false), chat: signal(false) };
}
import { Hotkeys } from '../hotkeys';
import { ClientPrefs } from '../client-prefs';
import { PreviewSeed } from '../first-run/preview-seed';
import { stubLocation } from '../testing/stub-location';
import { Server } from '../server';
import { serverInterceptor } from '../server.interceptor';
import { WritingZen } from '../writing-zen';
import { Shell } from './shell';
import {
  PlusBadgeEntitlement,
  type PlusBadgeState,
} from '../providers/account/plus-badge-entitlement';
import { FeatureFlags } from '../feature-flags';

class FakePlusBadgeEntitlement {
  readonly state = signal<PlusBadgeState>('free');
  readonly check = vi.fn().mockResolvedValue(undefined);
}

describe('Shell account switching', () => {
  let httpMock: HttpTestingController;
  let auth: Auth;
  let server: Server;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        // Register the real serverInterceptor so requests are prefixed with the active
        // instance — the whole point of this bug.
        provideHttpClient(withInterceptors([serverInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PlusBadgeEntitlement, useValue: new FakePlusBadgeEntitlement() },
        { provide: MenuIndicators, useFactory: fakeIndicators },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(Auth);
    server = TestBed.inject(Server);

    // Two saved sessions on different instances; "art" is active.
    server.setBaseUrl('https://mastodon.art');
    auth.setToken('art-token');
    server.setBaseUrl('https://mastodon.social');
    auth.setToken('social-token');
    auth.switchTo('art-token');
  });

  afterEach(() => httpMock.verify());

  function createShell() {
    const fixture = TestBed.createComponent(Shell);
    // ngOnInit verifies the active account; satisfy that request first.
    fixture.detectChanges();
    httpMock
      .expectOne('https://mastodon.art/api/v1/accounts/verify_credentials')
      .flush({ id: '1', username: 'arty' } as never);
    drainRailRequests();
    return fixture;
  }

  /** The rendered rails fetch trends/instance metadata; account for those requests. */
  function drainRailRequests() {
    httpMock.match(
      (r) =>
        r.url.includes('/api/v1/trends/') ||
        r.url.includes('/api/v2/instance') ||
        r.url.includes('/api/v1/followed_tags') ||
        // The server card counts the server's announcements.
        r.url.includes('/api/v1/announcements'),
    );
  }

  // Rendering the full Shell (rails and all) can exceed the default 5s timeout
  it('renders the two menu signals independently', () => {
    const fixture = createShell();
    const indicators = TestBed.inject(MenuIndicators);
    indicators.chat.set(true);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('a[href="/conversations"] .activity-dot'),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('a[href="/notifications"] .activity-dot'),
    ).toBeNull();
    indicators.ordinary.set(true);
    indicators.chat.set(false);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('a[href="/notifications"] .activity-dot'),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('a[href="/conversations"] .activity-dot'),
    ).toBeNull();
    drainRailRequests();
  });
  // on a loaded machine; the work is synchronous, just heavy.
  it('switching restores the target instance and verifies against it', { timeout: 20_000 }, () => {
    const fixture = createShell();
    const social = auth.sessions().find((s) => s.token === 'social-token')!;

    fixture.componentInstance.switchTo(social);

    // Must hit mastodon.social — not the previously-active mastodon.art.
    const req = httpMock.expectOne('https://mastodon.social/api/v1/accounts/verify_credentials');
    req.flush({ id: '2', username: 'socialite' } as never);

    expect(auth.token()).toBe('social-token');
    expect(server.baseUrl()).toBe('https://mastodon.social');
  });

  it('offers separate add-account paths for Mastodon and Bluesky', { timeout: 20_000 }, () => {
    const fixture = createShell();
    fixture.detectChanges();
    drainRailRequests();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('+ Add Mastodon account');
    expect(text).toContain('+ Add Bluesky account');

    const assigned: string[] = [];
    stubLocation({ onAssign: (url) => assigned.push(url) });
    fixture.componentInstance.addMastodonAccount();
    fixture.componentInstance.addBlueskyAccount();

    expect(assigned).toEqual(['login/mastodon?add=1', 'login/bluesky?add=1']);
  });

  /** Drive a switch to the social account and have its instance reject the token. */
  function failSwitchToSocial(): any {
    const fixture = createShell();
    const cmp = fixture.componentInstance as any;
    const social = auth.sessions().find((s) => s.token === 'social-token')!;
    cmp.switchTo(social);
    httpMock
      .expectOne('https://mastodon.social/api/v1/accounts/verify_credentials')
      .flush('nope', { status: 401, statusText: 'Unauthorized' });
    return cmp;
  }

  it(
    'a failed switch reverts to the previous account and keeps the session',
    { timeout: 20_000 },
    () => {
      const cmp = failSwitchToSocial();

      // Reverted, not logged out: still on the art account and server.
      expect(auth.token()).toBe('art-token');
      expect(server.baseUrl()).toBe('https://mastodon.art');
      // The rejected session is NOT deleted.
      expect(auth.sessions().some((s) => s.token === 'social-token')).toBe(true);
      // The user gets an actionable dialog, not a toast that leaves them stuck.
      expect(cmp.deadSession()?.token).toBe('social-token');
    },
  );

  // The bug this guards: the failed switch leaves the broken account *inactive*,
  // so the account menu's Log out (which acts on the active account) can never
  // reach it. Without this the account is unusable and undeletable.
  it('a rejected account can be removed without becoming active', { timeout: 20_000 }, () => {
    const cmp = failSwitchToSocial();

    cmp.forgetDeadSession();

    expect(auth.sessions().some((s) => s.token === 'social-token')).toBe(false);
    // The account the user was actually using is untouched.
    expect(auth.token()).toBe('art-token');
    expect(server.baseUrl()).toBe('https://mastodon.art');
    expect(cmp.deadSession()).toBeNull();
  });

  // Boot is the other half of the same trap: the stored token was rejected on
  // load and the old code called logout(), silently deleting the account.
  it('a token rejected on boot offers the dialog instead of deleting', { timeout: 20_000 }, () => {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    httpMock
      .expectOne('https://mastodon.art/api/v1/accounts/verify_credentials')
      .flush('nope', { status: 401, statusText: 'Unauthorized' });
    drainRailRequests();
    const cmp = fixture.componentInstance as any;

    expect(cmp.deadSession()?.token).toBe('art-token');
    // The saved session survives, so Reauthenticate has something to refresh.
    expect(auth.sessions().some((s) => s.token === 'art-token')).toBe(true);
    // ...but the known-bad token is no longer active.
    expect(auth.token()).toBeNull();
  });

  it('reauthenticating points at the dead account instance without activating it', () => {
    auth.prepareReauth('social-token');

    // Login opens against the account's own host...
    expect(server.baseUrl()).toBe('https://mastodon.social');
    // ...but the known-bad token is not active, or every request would 401.
    expect(auth.token()).toBeNull();
    // The session survives, so cancelling the login leaves it in the switcher.
    expect(auth.sessions().some((s) => s.token === 'social-token')).toBe(true);
  });

  it(
    'boots Anonymous without verifying credentials and preserves saved sessions',
    { timeout: 20_000 },
    () => {
      auth.enterAnonymous('https://mastodon.social');

      const fixture = TestBed.createComponent(Shell);
      fixture.detectChanges();

      httpMock.expectNone('https://mastodon.social/api/v1/accounts/verify_credentials');
      drainRailRequests();
      expect(auth.sessions().map((session) => session.token)).toEqual([
        'art-token',
        'social-token',
      ]);
      expect(auth.account()?.display_name).toBe('Anonymous');
      expect(fixture.nativeElement.querySelector('.login-nav')).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('+ Add an account');
      expect(fixture.nativeElement.textContent).toContain('Observability');
      const findFriends = fixture.nativeElement.querySelector(
        'a[href="/find-friends"]',
      ) as HTMLAnchorElement;
      expect(findFriends.textContent).toContain('Find Friends');
      expect(fixture.nativeElement.querySelector('.anonymous-post-login')).toBeNull();
      expect(fixture.nativeElement.querySelector('.profile-stats')?.textContent).toContain('Posts');
    },
  );

  it('hides the Canary destination from the More menu on the Canary build', () => {
    const fixture = createShell();
    const component = fixture.componentInstance as unknown as { isCanary: boolean };
    component.isCanary = true;
    fixture.detectChanges();
    drainRailRequests();

    const links = [...(fixture.nativeElement as HTMLElement).querySelectorAll('a')];
    expect(links.some((link) => link.textContent?.includes('Canary'))).toBe(false);
  });

  it('marks the test deployment with a permanent banner', () => {
    const fixture = createShell();
    const component = fixture.componentInstance as unknown as { isTest: boolean };
    component.isTest = true;
    fixture.detectChanges();
    drainRailRequests();

    const banner = fixture.nativeElement.querySelector('.test-build-banner') as HTMLElement | null;
    expect(banner?.textContent).toContain('nothing here is real');
    // Says where the real app is, because the reader who needs this banner is
    // the one who thought they were already there.
    expect(banner?.querySelector('a')?.getAttribute('href')).toBe('https://mawkingbird.com/');
  });

  it('hides the plan badge entirely when Plus is flagged off', () => {
    // Shipped broken: the flag defaults to `test`, so production showed a
    // "Free" badge whose card pitched a $30/year subscription and linked to a
    // route the guard bounced. Off means the badge is not there at all.
    TestBed.inject(FeatureFlags).setState('mawkingbird-plus', 'off');
    const fixture = createShell();

    expect(fixture.nativeElement.querySelector('.plan-badge')).toBeNull();
    expect(fixture.nativeElement.querySelector('.plan-popover')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('a year');
  });

  it('links the Free and Plus plan badges to an accurate benefits card', () => {
    // The badge only renders where Plus can actually be bought; see the flag
    // test below.
    TestBed.inject(FeatureFlags).setState('mawkingbird-plus', 'production');
    const fixture = createShell();
    const plan = TestBed.inject(PlusBadgeEntitlement) as unknown as FakePlusBadgeEntitlement;
    const badge = () => fixture.nativeElement.querySelector('.plan-badge') as HTMLButtonElement;
    const popover = fixture.nativeElement.querySelector('.plan-popover') as HTMLElement;

    expect(badge().textContent).toContain('Free');
    // The badge no longer navigates: it discloses. The link to the Plus page is
    // inside the card, where a pointer can actually reach it.
    expect(badge().tagName).toBe('BUTTON');
    expect(popover.querySelector('.plan-cta')?.getAttribute('href')).toBe(
      '/settings/mawkingbird-plus',
    );
    expect(popover.textContent).toContain('Mawkingbird Free');
    // The free column is shown to a free reader and the Plus column beside it,
    // so the badge is a comparison. No numbers: the popover has no room to say
    // what "60 a minute" means, and a number nobody can scale is worse than a
    // plain sentence. They live on /plans.
    expect(popover.textContent).toContain('A couple of full articles a day');
    expect(popover.textContent).toContain('Open as many as you like');
    expect(popover.textContent).toContain('$30 a year');

    // The card is a disclosure, not a hover popover: it opens on click and
    // survives the pointer leaving the badge, which is the whole point of the
    // change. Nothing but an explicit dismissal closes it.
    expect(badge().getAttribute('aria-expanded')).toBe('false');
    expect(popover.classList.contains('plan-popover-open')).toBe(false);

    badge().click();
    fixture.detectChanges();
    expect(badge().getAttribute('aria-expanded')).toBe('true');
    expect(popover.classList.contains('plan-popover-open')).toBe(true);

    // Escape closes it and hands focus back to the badge.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(popover.classList.contains('plan-popover-open')).toBe(false);
    expect(document.activeElement).toBe(badge());

    // An outside click closes it too.
    badge().click();
    fixture.detectChanges();
    expect(popover.classList.contains('plan-popover-open')).toBe(true);
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(popover.classList.contains('plan-popover-open')).toBe(false);

    plan.state.set('plus');
    fixture.detectChanges();

    expect(badge().textContent).toContain('Plus');
    expect(popover.textContent).toContain('your subscription is active');
    // A subscriber is told what they have, not what they are missing.
    expect(popover.textContent).not.toContain('A couple of full articles a day');
    expect(popover.textContent).toContain('Open as many as you like');
    drainRailRequests();
  });

  it('shows no such banner on production or canary', () => {
    const fixture = createShell();
    fixture.detectChanges();
    drainRailRequests();

    expect(fixture.nativeElement.querySelector('.test-build-banner')).toBeNull();
  });

  // Starter Kits and "Find my friends" were separate rows here until they were
  // collapsed into the Find Friends hub; this asserts the surviving entry point.
  it('always includes Find Friends in the More menu for signed-in users', () => {
    const fixture = createShell();
    const link = fixture.nativeElement.querySelector(
      'a[href="/find-friends"]',
    ) as HTMLAnchorElement;
    const canary = fixture.nativeElement.querySelector('a[href="canary/"]') as HTMLAnchorElement;

    expect(link.textContent).toContain('Find Friends');
    expect(canary.textContent).toContain('Canary');
  });
});

/**
 * The two zens are different features and the shell is where that shows.
 *
 * Global zen (`ClientPrefs.zenMode`) drops the rails and keeps the header and
 * footer. Writing zen drops everything. The interesting case is both at once:
 * writing zen hides a strict superset, so the result must be indistinguishable
 * from writing zen alone.
 */
describe('Shell zen modes', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([serverInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PlusBadgeEntitlement, useValue: new FakePlusBadgeEntitlement() },
        { provide: MenuIndicators, useFactory: fakeIndicators },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    // Anonymous: no verify_credentials, so the shell renders in one pass.
    TestBed.inject(Auth).mode.set('anonymous');
  });

  afterEach(() => {
    httpMock.match(() => true);
    httpMock.verify();
  });

  function render() {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    return fixture;
  }

  function chrome(fixture: ReturnType<typeof render>) {
    const host = fixture.nativeElement as HTMLElement;
    return {
      header: !!host.querySelector('.topbar'),
      skipLink: !!host.querySelector('.skip-link'),
      footer: !!host.querySelector('app-app-footer'),
      leftRail: !!host.querySelector('.rail-left'),
      rightRail: !!host.querySelector('.rail-right'),
    };
  }

  it('shows the whole chrome by default', () => {
    expect(chrome(render())).toEqual({
      header: true,
      skipLink: true,
      footer: true,
      leftRail: true,
      rightRail: true,
    });
  });

  it('global zen drops the rails but keeps the header and footer', () => {
    const fixture = render();
    TestBed.inject(ClientPrefs).zenMode.set(true);
    fixture.detectChanges();

    expect(chrome(fixture)).toEqual({
      header: true,
      skipLink: true,
      footer: true,
      leftRail: false,
      rightRail: false,
    });
  });

  it('writing zen drops everything, header and footer included', () => {
    const fixture = render();
    TestBed.inject(WritingZen).enter();
    fixture.detectChanges();

    expect(chrome(fixture)).toEqual({
      header: false,
      skipLink: false,
      footer: false,
      leftRail: false,
      rightRail: false,
    });
  });

  it('both zens at once is indistinguishable from writing zen alone', () => {
    const fixture = render();
    TestBed.inject(WritingZen).enter();
    fixture.detectChanges();
    const writingZenOnly = chrome(fixture);

    TestBed.inject(ClientPrefs).zenMode.set(true);
    fixture.detectChanges();

    expect(chrome(fixture)).toEqual(writingZenOnly);
  });

  it('restores the chrome when writing zen ends', () => {
    const fixture = render();
    const zen = TestBed.inject(WritingZen);
    zen.enter();
    fixture.detectChanges();
    zen.exit();
    fixture.detectChanges();

    expect(chrome(fixture)).toEqual({
      header: true,
      skipLink: true,
      footer: true,
      leftRail: true,
      rightRail: true,
    });
  });
});

/**
 * The first-run modal, and the requirement it exists to satisfy: the visitor is
 * looking at the *app* — rails, header, footer and a real timeline — while
 * being asked whether to sign in. Its predecessor was a standalone page with
 * none of those things, which is the whole reason for sprint 2b.
 */
describe('Shell first-run modal', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([serverInterceptor])),
        provideHttpClientTesting(),
        // The anonymous answer navigates to the kits now, so the route has to
        // exist here or every test that answers the modal logs a rejected
        // navigation. Blank component: this suite is about the shell.
        provideRouter([{ path: 'bundled-starter-kits', children: [] }]),
        { provide: PlusBadgeEntitlement, useValue: new FakePlusBadgeEntitlement() },
        { provide: MenuIndicators, useFactory: fakeIndicators },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(Auth).mode.set('anonymous');
  });

  afterEach(() => {
    httpMock.match(() => true);
    httpMock.verify();
  });

  function render() {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    return fixture;
  }

  it('stays out of the way when no preview is running', () => {
    const host = render().nativeElement as HTMLElement;

    expect(host.querySelector('app-first-run-modal')).toBeNull();
  });

  /**
   * The shortcuts are global and navigational, so "g" then "h" would move the
   * app *behind* a modal that cannot be dismissed — leaving the visitor staring
   * at a question about a page that is no longer underneath it.
   */
  it('holds the keyboard shortcuts back until the modal is answered', () => {
    TestBed.inject(PreviewSeed).markEmpty('https://mastodon.social');
    const hotkeys = TestBed.inject(Hotkeys);
    const start = vi.spyOn(hotkeys, 'start');
    const fixture = render();

    expect(start).not.toHaveBeenCalled();

    fixture.componentInstance['answerFirstRun']('anonymous');

    expect(start).toHaveBeenCalled();
  });

  it('starts the shortcuts normally when there is no modal', () => {
    const start = vi.spyOn(TestBed.inject(Hotkeys), 'start');
    render();

    expect(start).toHaveBeenCalled();
  });

  /** Exit criterion 2: the modal appears *over the app*, not instead of it. */
  it('shows the modal over the full three-column chrome', () => {
    TestBed.inject(PreviewSeed).markEmpty('https://mastodon.social');
    const host = render().nativeElement as HTMLElement;

    expect(host.querySelector('app-first-run-modal')).not.toBeNull();
    expect(host.querySelector('.topbar')).not.toBeNull();
    expect(host.querySelector('.rail-left')).not.toBeNull();
    expect(host.querySelector('.rail-right')).not.toBeNull();
    expect(host.querySelector('app-app-footer')).not.toBeNull();
  });

  /**
   * Exit criterion 4, and the thing that makes "continue without logging in"
   * safe to treat as durable: having declined once, the visitor is never asked
   * again, so the header button is their only way in later. If this disappears,
   * anonymous becomes a dead end.
   */
  it('leaves a visible Log in button after the visitor continues anonymously', () => {
    TestBed.inject(PreviewSeed).markEmpty('https://mastodon.social');
    const fixture = render();

    fixture.componentInstance['answerFirstRun']('anonymous');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.login-nav')).not.toBeNull();
    expect(host.querySelector('app-first-run-modal')).toBeNull();
  });

  /**
   * Watching a first-time user: they answered "continue", the seeded timeline
   * vanished with the seed, and the empty state's single button did not read as
   * the next step. Staying on Home left them with nothing to do — so the answer
   * navigates to the one screen that turns a stranger into a working timeline in
   * one press, rather than to the hub that asks which method they would like.
   */
  it('takes an anonymous visitor to people they can follow', async () => {
    TestBed.inject(PreviewSeed).markEmpty('https://mastodon.social');
    const fixture = render();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance['answerFirstRun']('anonymous');

    expect(navigate).toHaveBeenCalledWith('/bundled-starter-kits');
  });

  it('clears the seed and dismisses when the visitor continues anonymously', () => {
    const preview = TestBed.inject(PreviewSeed);
    preview.markEmpty('https://mastodon.social');
    const fixture = render();

    fixture.componentInstance['answerFirstRun']('anonymous');
    fixture.detectChanges();

    expect(preview.active).toBe(false);
    expect(TestBed.inject(Auth).isAnonymous).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('app-first-run-modal')).toBeNull();
  });

  /**
   * The seed is temporary on *every* path. Someone who signs in must not find
   * an anonymous account in their switcher carrying three follows they never
   * chose — which is what made "clear it only on continue" the wrong rule.
   */
  it.each(['mastodon', 'bluesky'] as const)(
    'clears the seed before leaving for the %s login',
    (network) => {
      const preview = TestBed.inject(PreviewSeed);
      preview.markEmpty('https://mastodon.social');
      const fixture = render();
      // jsdom will not navigate and will not let `location.assign` be spied in
      // place; `stubLocation` swaps the whole object and test-setup restores it.
      const assigned: string[] = [];
      stubLocation({ onAssign: (url) => assigned.push(url) });

      fixture.componentInstance['answerFirstRun'](network);

      expect(preview.active).toBe(false);
      expect(assigned).toEqual([`login/${network}`]);
    },
  );

  /** Anonymous has to be left behind, or the login page bounces them home. */
  it('leaves the anonymous account when heading for a login page', () => {
    TestBed.inject(PreviewSeed).markEmpty('https://mastodon.social');
    const fixture = render();
    stubLocation();

    fixture.componentInstance['answerFirstRun']('mastodon');

    expect(TestBed.inject(Auth).isAuthenticated).toBe(false);
  });
});
