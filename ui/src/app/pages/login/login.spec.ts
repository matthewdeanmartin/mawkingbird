import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { Server } from '../../server';
import { sha256Base64Url } from '../../pkce';
import { stubLocation } from '../../testing/stub-location';
import { Login } from './login';

const OAUTH_APP_KEY = 'mastodon_mock_oauth_app';

/** The `state` a seeded pending flow expects back from the authorization server. */
const PENDING_STATE = 'pending-state';

/** Seed the sessionStorage record startOAuth() would have written. */
function storePendingOAuth(): void {
  sessionStorage.setItem(
    OAUTH_APP_KEY,
    JSON.stringify({
      clientId: 'client-abc',
      clientSecret: 'secret-xyz',
      redirectUri: 'http://localhost/_ui/login',
      state: PENDING_STATE,
      codeVerifier: 'pending-verifier',
      server: '',
    }),
  );
}

function buildRoute(queryParams: Record<string, string>): Partial<ActivatedRoute> {
  return {
    snapshot: { queryParamMap: convertToParamMap(queryParams) } as ActivatedRoute['snapshot'],
  };
}

describe('Login', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  function setUp(queryParams: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: buildRoute(queryParams) },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Login);
    return fixture;
  }

  it('on init with no ?code, lists dev users and does not touch oauth/token', () => {
    const fixture = setUp();
    fixture.detectChanges();

    httpMock.expectOne('/api/v1/_mock/dev_users').flush([]);
    httpMock.expectNone('/oauth/token');
  });

  it('startOAuth registers an app, stores it, and redirects to /oauth/authorize', async () => {
    const fixture = setUp();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/dev_users').flush([]);

    const hrefSetter = vi.fn();
    stubLocation({ onHref: hrefSetter });

    fixture.componentInstance.startOAuth();

    const req = httpMock.expectOne('/api/v1/apps');
    expect(req.request.method).toBe('POST');
    req.flush({
      id: '1',
      name: 'mastodon_mock UI',
      website: null,
      redirect_uri: 'http://localhost/login',
      redirect_uris: ['http://localhost/login'],
      client_id: 'client-abc',
      client_secret: 'secret-xyz',
      vapid_key: 'vapid',
      scopes: ['read', 'write'],
    });

    // Computing the PKCE challenge is async (crypto.subtle), so the redirect
    // happens a microtask after the app registration resolves.
    await vi.waitFor(() => expect(hrefSetter).toHaveBeenCalledTimes(1));
    const redirectedTo = hrefSetter.mock.calls[0][0] as string;
    expect(redirectedTo).toContain('/oauth/authorize?');
    expect(redirectedTo).toContain('client_id=client-abc');
    expect(redirectedTo).toContain('response_type=code');
    expect(redirectedTo).toContain('code_challenge_method=S256');

    const authorizeParams = new URL(redirectedTo).searchParams;
    expect(authorizeParams.get('state')).toBeTruthy();
    expect(authorizeParams.get('code_challenge')).toBeTruthy();
    // Only the challenge travels; the verifier must never leave this browser.
    expect(redirectedTo).not.toContain('code_verifier');

    const stored = JSON.parse(sessionStorage.getItem(OAUTH_APP_KEY)!);
    expect(stored).toEqual({
      clientId: 'client-abc',
      clientSecret: 'secret-xyz',
      redirectUri: stored.redirectUri,
      state: authorizeParams.get('state'),
      codeVerifier: expect.any(String),
      server: '',
    });
    // The stored verifier is the preimage of the challenge that was sent.
    expect(await sha256Base64Url(stored.codeVerifier)).toBe(authorizeParams.get('code_challenge'));
  });

  it('startOAuth requests read-only scopes when that access level is chosen', async () => {
    const fixture = setUp();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/dev_users').flush([]);
    stubLocation({ onHref: vi.fn() });

    // Choosing read-only must narrow the scope at *registration*, because that
    // is what the instance mints the token against — a client-side restriction
    // would be theatre.
    (fixture.componentInstance as any).oauthAccess.set('read');
    fixture.componentInstance.startOAuth();

    const req = httpMock.expectOne('/api/v1/apps');
    expect(req.request.body.scopes).toBe('read');
  });

  it('startOAuth requests full scopes by default', () => {
    const fixture = setUp();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/dev_users').flush([]);
    stubLocation({ onHref: vi.fn() });

    fixture.componentInstance.startOAuth();

    expect(httpMock.expectOne('/api/v1/apps').request.body.scopes).toBe('read write follow');
  });

  it('startOAuth surfaces an error if app registration fails', () => {
    const fixture = setUp();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/dev_users').flush([]);

    fixture.componentInstance.startOAuth();
    httpMock.expectOne('/api/v1/apps').flush('boom', { status: 500, statusText: 'Server Error' });

    expect((fixture.componentInstance as any).oauthError()).toBe('Could not register the app.');
    expect((fixture.componentInstance as any).oauthWorking()).toBe(false);
  });

  it('on init with ?code but no stored app, does not attempt exchange', () => {
    const fixture = setUp({ code: 'mockcode_alan' });
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/dev_users').flush([]);
    httpMock.expectNone('/oauth/token');
  });

  it('on init with ?code and a stored app, exchanges the code and signs in', () => {
    storePendingOAuth();
    const fixture = setUp({ code: 'mockcode_alan', state: PENDING_STATE });
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/dev_users').flush([]);

    const tokenReq = httpMock.expectOne('/oauth/token');
    expect(tokenReq.request.method).toBe('POST');
    const body = tokenReq.request.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('mockcode_alan');
    expect(body.get('client_id')).toBe('client-abc');
    // PKCE: the verifier proves this browser started the flow.
    expect(body.get('code_verifier')).toBe('pending-verifier');
    tokenReq.flush({
      access_token: 'fresh-token',
      token_type: 'Bearer',
      scope: 'read write',
      created_at: 0,
    });

    // submit() fires verify_credentials with the freshly exchanged token.
    const verifyReq = httpMock.expectOne('/api/v1/accounts/verify_credentials');
    verifyReq.flush({ id: '1', username: 'alan', display_name: 'Alan Turing' } as never);

    expect(sessionStorage.getItem(OAUTH_APP_KEY)).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith([], { queryParams: {} });
    expect(navigateByUrlSpy).toHaveBeenCalledWith('/home');
    expect(TestBed.inject(Auth).token()).toBe('fresh-token');
  });

  it('on init with ?code, surfaces an error if the exchange fails', () => {
    storePendingOAuth();
    const fixture = setUp({ code: 'bad-code', state: PENDING_STATE });
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/dev_users').flush([]);

    const tokenReq = httpMock.expectOne('/oauth/token');
    tokenReq.flush('invalid_grant', { status: 400, statusText: 'Bad Request' });

    expect((fixture.componentInstance as any).oauthError()).toBe('Code exchange failed.');
    expect((fixture.componentInstance as any).oauthWorking()).toBe(false);
    // The pending record is consumed even on failure, so a later injected code
    // has no client credentials left to redeem itself with.
    expect(sessionStorage.getItem(OAUTH_APP_KEY)).toBeNull();
  });

  it('rejects a callback whose state does not match the pending flow', () => {
    // Login CSRF: an attacker sends the victim to /login?code=<their code>.
    // Without a matching state the code must never be redeemed, or the victim
    // silently ends up signed into the attacker's account.
    storePendingOAuth();
    const fixture = setUp({ code: 'attacker-code', state: 'not-the-pending-state' });
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/dev_users').flush([]);

    httpMock.expectNone('/oauth/token');
    expect((fixture.componentInstance as any).oauthError()).toContain('state mismatch');
    expect(sessionStorage.getItem(OAUTH_APP_KEY)).toBeNull();
  });

  it('rejects a callback that carries no state at all', () => {
    storePendingOAuth();
    const fixture = setUp({ code: 'attacker-code' });
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/dev_users').flush([]);

    httpMock.expectNone('/oauth/token');
    expect((fixture.componentInstance as any).oauthError()).toContain('state mismatch');
  });

  it('rejects a pending record written before state existed', () => {
    // A flow started by an older build has no state to check against, so the
    // only safe move is to drop it and make the user start again.
    sessionStorage.setItem(
      OAUTH_APP_KEY,
      JSON.stringify({
        clientId: 'client-abc',
        clientSecret: 'secret-xyz',
        redirectUri: 'http://localhost/_ui/login',
      }),
    );
    const fixture = setUp({ code: 'mockcode_alan', state: 'anything' });
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/dev_users').flush([]);

    httpMock.expectNone('/oauth/token');
    expect(sessionStorage.getItem(OAUTH_APP_KEY)).toBeNull();
  });

  it('submit() rejects an empty token without calling the API', () => {
    const fixture = setUp();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/dev_users').flush([]);

    fixture.componentInstance.submit();
    httpMock.expectNone('/api/v1/accounts/verify_credentials');
  });

  it('continues anonymously without verifying credentials', () => {
    const fixture = setUp();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/dev_users').flush([]);

    fixture.componentInstance.continueAnonymously();

    const auth = TestBed.inject(Auth);
    expect(auth.isAnonymous).toBe(true);
    expect(auth.token()).toBeNull();
    expect(auth.sessions()).toEqual([]);
    expect(navigateSpy).toHaveBeenCalledWith('/home');
    httpMock.expectNone('/api/v1/accounts/verify_credentials');
  });

  it('does not select a degraded server until the user accepts the warning', async () => {
    const fixture = setUp();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/dev_users').flush([]);
    const component = fixture.componentInstance as unknown as {
      onServerInput(value: string): void;
      applyServerNow(): void;
      useDegradedServer(): void;
      serverStatus(): string;
      intent: { set(value: string | null): void };
    };
    // The server picker lives behind the opening question now, so a test about
    // the picker has to answer it first — exactly as a visitor does.
    component.intent.set('have');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            title: 'Degraded Server',
            contact_account: { avatar_static: 'https://cdn.example/avatar.png' },
          }),
          { status: 200 },
        ),
      )
      .mockRejectedValueOnce(new Error('CDN blocked'));

    component.onServerInput('degraded.example');
    component.applyServerNow();
    await vi.waitFor(() => expect(component.serverStatus()).toBe('degraded'));
    fixture.detectChanges();

    expect(TestBed.inject(Server).baseUrl()).toBe('');
    expect(fixture.nativeElement.textContent).toContain('Use anyway');
    component.useDegradedServer();
    expect(TestBed.inject(Server).baseUrl()).toBe('https://degraded.example');
  });

  /**
   * The page used to show the server picker, "I have an account", "I'm new here"
   * and "Continue anonymously" all at once — three bordered panels stacked into
   * one column on a phone, behind a server field that only an existing Mastodon
   * user can fill in. Which network they wanted was already settled by
   * LoginChooser, so the remaining question is what they came to do.
   */
  describe('opening question', () => {
    function textOf(fixture: ReturnType<typeof setUp>): string {
      return (fixture.nativeElement as HTMLElement).textContent ?? '';
    }

    function answer(fixture: ReturnType<typeof setUp>, value: string): void {
      (fixture.componentInstance as unknown as { intent: { set(v: string): void } }).intent.set(
        value,
      );
      fixture.detectChanges();
    }

    it('asks one question and shows nothing else', () => {
      const fixture = setUp();
      fixture.detectChanges();
      httpMock.expectOne('/api/v1/_mock/dev_users').flush([]);

      const text = textOf(fixture);
      expect(text).toContain('What brings you here?');
      // None of the machinery is on the first screen.
      expect(text).not.toContain('I have an account');
      expect(text).not.toContain("I'm new here");
      expect((fixture.nativeElement as HTMLElement).querySelector('#server-combo')).toBeNull();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('app-server-discovery'),
      ).toBeNull();
    });

    it('shows only the panel the answer calls for', () => {
      const fixture = setUp();
      fixture.detectChanges();
      httpMock.expectOne('/api/v1/_mock/dev_users').flush([]);

      answer(fixture, 'have');
      expect(textOf(fixture)).toContain('I have an account');
      expect(textOf(fixture)).not.toContain("I'm new here");

      answer(fixture, 'need');
      expect(textOf(fixture)).toContain("I'm new here");
      expect(textOf(fixture)).not.toContain('I have an account');
    });

    it('brings the server picker back once an answer needs it', () => {
      const fixture = setUp();
      fixture.detectChanges();
      httpMock.expectOne('/api/v1/_mock/dev_users').flush([]);

      answer(fixture, 'have');

      expect((fixture.nativeElement as HTMLElement).querySelector('#server-combo')).not.toBeNull();
    });

    it('lets the visitor go back and choose again', () => {
      const fixture = setUp();
      fixture.detectChanges();
      httpMock.expectOne('/api/v1/_mock/dev_users').flush([]);

      answer(fixture, 'have');
      const back = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '.intent-back',
      );
      expect(back).not.toBeNull();

      back!.click();
      fixture.detectChanges();

      expect(textOf(fixture)).toContain('What brings you here?');
    });
  });

  it('loginAs() mints a fresh token via _mock/login and signs in', () => {
    const fixture = setUp();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/_mock/dev_users').flush([]);
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance.loginAs({
      id: '1',
      username: 'alan',
      display_name: 'Alan Turing',
      role: 'user',
      access_token: 'stale_token',
    });

    const loginReq = httpMock.expectOne('/api/v1/_mock/login');
    expect(loginReq.request.method).toBe('POST');
    expect(loginReq.request.body).toEqual({ username: 'alan' });
    loginReq.flush({
      access_token: 'fresh_token',
      token_type: 'Bearer',
      scope: 'read write',
      created_at: 0,
    });

    const verifyReq = httpMock.expectOne('/api/v1/accounts/verify_credentials');
    verifyReq.flush({ id: '1', username: 'alan', display_name: 'Alan Turing' } as never);

    expect(TestBed.inject(Auth).token()).toBe('fresh_token');
  });
});
