import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { Server } from '../../server';
import { LoginChooser } from './login-chooser';

/** Stand in for the activated route's query params. */
function withQuery(params: Record<string, string>): void {
  TestBed.overrideProvider(ActivatedRoute, {
    useValue: {
      snapshot: {
        queryParams: params,
        queryParamMap: {
          get: (key: string) => params[key] ?? null,
          has: (key: string) => Object.hasOwn(params, key),
        },
      },
    },
  });
}

describe('LoginChooser', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [Auth, Server, provideRouter([])] });
  });

  it('offers both networks to a signed-out visitor', () => {
    withQuery({});
    const fixture = TestBed.createComponent(LoginChooser);
    fixture.detectChanges();

    const hrefs = Array.from(
      fixture.nativeElement.querySelectorAll('a[href]') as NodeListOf<HTMLAnchorElement>,
    ).map((a) => a.getAttribute('href'));

    expect(hrefs).toContain('/login/mastodon');
    expect(hrefs).toContain('/login/bluesky');
  });

  it('does not show a server picker — that lives on the Mastodon page now', () => {
    withQuery({});
    const fixture = TestBed.createComponent(LoginChooser);
    fixture.detectChanges();

    // Asserted against text-entry inputs specifically: the page does carry one
    // checkbox (the analytics opt-out), and a blanket "no inputs" check would
    // fail on it while proving nothing about server selection.
    expect(fixture.nativeElement.querySelector('input[type="text"], input[type="url"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-server-discovery')).toBeNull();
  });

  /**
   * The way out has to *be* a way out. `/` re-seeds the first-run preview and
   * asks "log in or continue?" — which is the question this visitor is
   * answering by clicking the link, so sending them there loops them straight
   * back into it. `/anonymous` enters directly, no modal.
   */
  it('sends the anonymous escape hatch somewhere that will not ask again', () => {
    withQuery({});
    const fixture = TestBed.createComponent(LoginChooser);
    fixture.detectChanges();

    const hrefs = Array.from(
      fixture.nativeElement.querySelectorAll('a[href]') as NodeListOf<HTMLAnchorElement>,
    ).map((a) => a.getAttribute('href'));

    expect(hrefs).toContain('/anonymous');
    expect(hrefs).not.toContain('/');
  });

  /**
   * The opt-out has now moved twice (login page → front page → here) and the
   * reason has survived both moves: the person most likely to want it is the one
   * who has not signed in, and they should not have to create an account to find
   * the switch. This pins it to whichever page is the signed-out one.
   */
  it('carries the analytics opt-out, reachable without an account', () => {
    withQuery({});
    const fixture = TestBed.createComponent(LoginChooser);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('input[name="analytics"]')).not.toBeNull();
  });

  /**
   * The OAuth regression guard, and the reason this route did not simply move.
   *
   * `<base href>login` is registered with the remote instance as the app's
   * `redirect_uri`, and instances validate the callback against exactly what was
   * registered — so `/login` must keep answering the callback. The chooser
   * cannot handle it (only `Login` owns `handleOAuthCallback`), so it forwards,
   * and the code and state have to survive the hop intact or the sign-in is lost.
   */
  it('forwards an OAuth callback to the Mastodon page with its code and state intact', () => {
    withQuery({ code: 'auth-code-123', state: 'state-abc' });
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    TestBed.createComponent(LoginChooser).detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/login/mastodon'], {
      queryParams: { code: 'auth-code-123', state: 'state-abc' },
      replaceUrl: true,
    });
  });

  /**
   * A bare `?state=` with no code is the OAuth error path (the user hit "cancel"
   * on the instance's consent screen). It has to reach the page that can explain
   * itself, rather than silently showing a chooser as though nothing happened.
   */
  it('forwards a state-only callback, which is how a cancelled sign-in comes back', () => {
    withQuery({ state: 'state-abc' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    TestBed.createComponent(LoginChooser).detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/login/mastodon'], {
      queryParams: { state: 'state-abc' },
      replaceUrl: true,
    });
  });

  it('keeps add-account on the chooser and preserves add on both doors', () => {
    withQuery({ add: '1' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const fixture = TestBed.createComponent(LoginChooser);
    fixture.detectChanges();
    const hrefs = Array.from(
      fixture.nativeElement.querySelectorAll('a[href]') as NodeListOf<HTMLAnchorElement>,
    ).map((a) => a.getAttribute('href'));

    expect(navigate).not.toHaveBeenCalled();
    expect(hrefs).toContain('/login/mastodon?add=1');
    expect(hrefs).toContain('/login/bluesky?add=1');
  });

  it('sends an already signed-in visitor home rather than asking again', () => {
    withQuery({});
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    TestBed.createComponent(LoginChooser).detectChanges();

    expect(navigate).toHaveBeenCalledWith('/home', { replaceUrl: true });
  });

  /** ?add=1 is precisely the "yes, I know I'm signed in" signal; it must win. */
  it('keeps ?add=1 on the chooser for a signed-in user instead of bouncing home', () => {
    withQuery({ add: '1' });
    TestBed.inject(Auth).setToken('a-token');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    TestBed.createComponent(LoginChooser).detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
