import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { Server } from '../../server';
import { LoginBluesky } from './login-bluesky';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { seedBskyIdentity } from '../../testing/seed-storage';
import { stubLocation } from '../../testing/stub-location';

const CREATE_SESSION = 'https://bsky.social/xrpc/com.atproto.server.createSession';
const PROFILE_KEY = 'mockingbird_bsky_identity_profile';
const CREDENTIALS_KEY = 'mockingbird_bsky_identity_credentials';
const MODE_KEY = 'mastodon_mock_account_mode';

describe('LoginBluesky', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [Auth, Server, provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => localStorage.clear());

  /** Drive a successful sign-in, flushing both calls the flow makes. */
  function signIn(handle = 'someone.bsky.social', password = 'app-pass-1234') {
    const fixture = TestBed.createComponent(LoginBluesky);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as any;
    cmp.handle.set(handle);
    cmp.appPassword.set(password);
    cmp.submitAppPassword();

    httpMock.expectOne(CREATE_SESSION).flush({
      did: 'did:plc:abc123',
      handle,
      accessJwt: 'access-jwt-value',
      refreshJwt: 'refresh-jwt-value',
    });
    httpMock
      .expectOne((r) => r.url.includes('app.bsky.actor.getProfile'))
      .flush({ displayName: 'Someone', avatar: 'https://cdn/av.png' });
    return { fixture, cmp };
  }

  it('signs in and lands on Home as a Bluesky-primary account', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    signIn();

    const auth = TestBed.inject(Auth);
    expect(auth.isBlueskyPrimary).toBe(true);
    expect(auth.kind()).toBe('bluesky');
    expect(auth.account()?.acct).toBe('someone.bsky.social');
    expect(navigate).toHaveBeenCalledWith('/home');
  });

  it('sends the app password to createSession and nowhere else', () => {
    const fixture = TestBed.createComponent(LoginBluesky);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as any;
    cmp.handle.set('someone.bsky.social');
    cmp.appPassword.set('app-pass-1234');
    cmp.submitAppPassword();

    const req = httpMock.expectOne(CREATE_SESSION);
    expect(req.request.body).toEqual({
      identifier: 'someone.bsky.social',
      password: 'app-pass-1234',
    });
  });

  it('uses the Bluesky entryway as the primary sign-in action', () => {
    const begin = vi
      .spyOn(TestBed.inject(BlueskySession), 'beginOAuthIdentity')
      .mockReturnValue(new Promise<never>(() => undefined));
    const fixture = TestBed.createComponent(LoginBluesky);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as any;

    cmp.submitBluesky();

    expect(begin).toHaveBeenCalledWith('https://bsky.social', false);
    httpMock.expectNone(CREATE_SESSION);
  });

  it('uses targeted OAuth for a specific handle', () => {
    const begin = vi
      .spyOn(TestBed.inject(BlueskySession), 'beginOAuthIdentity')
      .mockReturnValue(new Promise<never>(() => undefined));
    const fixture = TestBed.createComponent(LoginBluesky);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as any;
    cmp.handle.set('  @someone.bsky.social  ');

    cmp.submit();

    expect(begin).toHaveBeenCalledWith('someone.bsky.social', false);
    httpMock.expectNone(CREATE_SESSION);
  });

  /**
   * The worst bug available on this page: a credential in an *exportable* key,
   * which would outlive the browser data it came from and travel inside a
   * settings export the user thinks is safe to share.
   *
   * This used to also assert the app password was persisted nowhere at all.
   * That changed deliberately — it is now kept in the secret half so the vault
   * can sync it, ending the paste-on-every-device problem (see the manifest
   * entry for `mockingbird_bsky_credentials`). The invariant that mattered is
   * unchanged and still pinned below: secrets live in the secret half, and the
   * exportable half names the account and nothing more.
   */
  it('keeps every credential in the secret half, never the exportable one', () => {
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    signIn('someone.bsky.social', 'app-pass-1234');

    const profiles = JSON.parse(localStorage.getItem(PROFILE_KEY)!);
    const credentialMap = JSON.parse(localStorage.getItem(CREDENTIALS_KEY)!);
    const profile = profiles['did:plc:abc123'];
    const credentials = credentialMap['did:plc:abc123'];

    // The exportable half names the account and carries no credential — not the
    // tokens, and not the app password either.
    expect(profile.handle).toBe('someone.bsky.social');
    expect(profile.did).toBe('did:plc:abc123');
    expect(JSON.stringify(profile)).not.toContain('access-jwt-value');
    expect(JSON.stringify(profile)).not.toContain('refresh-jwt-value');
    expect(JSON.stringify(profile)).not.toContain('app-pass-1234');

    // The secret half carries the tokens and the app password.
    expect(credentials.accessJwt).toBe('access-jwt-value');
    expect(credentials.refreshJwt).toBe('refresh-jwt-value');
    expect(credentials.appPassword).toBe('app-pass-1234');

    // And it appears in exactly one place: the secret key, nowhere else.
    const elsewhere = Object.keys(localStorage)
      .filter((k) => k !== CREDENTIALS_KEY)
      .map((k) => localStorage.getItem(k) ?? '')
      .join('|');
    expect(elsewhere).not.toContain('app-pass-1234');
  });

  /**
   * The identity must land in the *unscoped* keys, not the scoped connector keys.
   * At submit time the active kind is not yet `bluesky`, so a naive write goes to
   * the previous account's namespace — where the next boot never looks.
   */
  it('writes the identity keys, not the scoped connector keys', () => {
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    signIn();

    expect(localStorage.getItem(PROFILE_KEY)).not.toBeNull();
    const connectorKeys = Object.keys(localStorage).filter(
      (k) =>
        k.startsWith('mockingbird_bsky_profile') || k.startsWith('mockingbird_bsky_credentials'),
    );
    expect(connectorKeys).toEqual([]);
  });

  it('does not claim to be signed in when the login fails', () => {
    const fixture = TestBed.createComponent(LoginBluesky);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as any;
    cmp.handle.set('someone.bsky.social');
    cmp.appPassword.set('wrong');
    cmp.submitAppPassword();

    httpMock
      .expectOne(CREATE_SESSION)
      .flush({ error: 'AuthenticationRequired' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    const auth = TestBed.inject(Auth);
    expect(auth.isAuthenticated).toBe(false);
    expect(localStorage.getItem(MODE_KEY)).toBeNull();
    expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
    expect(cmp.error()).toContain('rejected');
  });

  /**
   * bsky.social is an entryway and cannot authenticate an account on someone
   * else's PDS. Telling that user "wrong password" sends them to re-check
   * credentials that are correct.
   */
  it('offers the self-hosted hint for a non-bsky.social handle that was rejected', () => {
    const fixture = TestBed.createComponent(LoginBluesky);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as any;
    cmp.handle.set('me.example.com');
    cmp.appPassword.set('app-pass');
    cmp.submitAppPassword();

    httpMock.expectOne(CREATE_SESSION).flush(null, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(cmp.selfHostedHint()).toBe(true);
    expect(fixture.nativeElement.querySelector('.bsky-hint')?.textContent).toContain(
      'host your own PDS',
    );
  });

  /** A custom domain on Bluesky's own PDS is common and works; don't mislead. */
  it('does not offer the self-hosted hint for a bsky.social handle', () => {
    const fixture = TestBed.createComponent(LoginBluesky);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as any;
    cmp.handle.set('someone.bsky.social');
    cmp.appPassword.set('wrong');
    cmp.submitAppPassword();

    httpMock.expectOne(CREATE_SESSION).flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(cmp.selfHostedHint()).toBe(false);
  });

  it('explains a rate limit rather than blaming the password', () => {
    const fixture = TestBed.createComponent(LoginBluesky);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as any;
    cmp.handle.set('someone.bsky.social');
    cmp.appPassword.set('app-pass');
    cmp.submitAppPassword();

    httpMock
      .expectOne(CREATE_SESSION)
      .flush({ error: 'RateLimitExceeded' }, { status: 429, statusText: 'Too Many Requests' });

    expect(cmp.error()).toContain('rate-limiting');
  });

  it('tolerates a leading @ and surrounding whitespace in the handle', () => {
    const fixture = TestBed.createComponent(LoginBluesky);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as any;
    cmp.handle.set('  @someone.bsky.social  ');
    cmp.appPassword.set('app-pass');
    cmp.submitAppPassword();

    expect(httpMock.expectOne(CREATE_SESSION).request.body.identifier).toBe('someone.bsky.social');
  });

  it('forgets the app password from memory once signed in', () => {
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    const { cmp } = signIn();

    expect(cmp.appPassword()).toBe('');
  });

  it('explains a blocked request rather than reporting bad credentials', () => {
    const fixture = TestBed.createComponent(LoginBluesky);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as any;
    cmp.handle.set('someone.bsky.social');
    cmp.appPassword.set('app-pass');
    cmp.submitAppPassword();

    httpMock.expectOne(CREATE_SESSION).error(new ProgressEvent('error'), { status: 0 });

    expect(cmp.error()).toContain('Could not reach Bluesky');
  });

  it('sends an already signed-in visitor to Home', () => {
    TestBed.inject(Auth).setToken('mastodon-token');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    TestBed.createComponent(LoginBluesky).detectChanges();

    expect(navigate).toHaveBeenCalledWith('/home', { replaceUrl: true });
  });

  it('allows an already signed-in visitor to add a Bluesky alt', () => {
    TestBed.inject(Auth).setToken('mastodon-token');
    vi.spyOn(TestBed.inject(ActivatedRoute).snapshot.queryParamMap, 'has').mockImplementation(
      (name) => name === 'add',
    );
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(LoginBluesky);
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
  });

  it('adds a second Bluesky identity without replacing the first', () => {
    const auth = TestBed.inject(Auth);
    auth.setToken('mastodon-token');
    seedBskyIdentity({ did: 'did:plc:first', handle: 'first.bsky.social' });
    vi.spyOn(TestBed.inject(ActivatedRoute).snapshot.queryParamMap, 'has').mockImplementation(
      (name) => name === 'add',
    );
    const assigned: string[] = [];
    stubLocation({ onAssign: (url) => assigned.push(url) });

    signIn('second.bsky.social');

    expect(auth.blueskyAccounts().map((choice) => choice.account?.acct)).toEqual([
      'first.bsky.social',
      'second.bsky.social',
    ]);
    expect(auth.account()?.acct).toBe('second.bsky.social');
    expect(assigned).toEqual(['home']);
  });

  it('requires both fields before it will submit', () => {
    const fixture = TestBed.createComponent(LoginBluesky);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as any;
    cmp.handle.set('someone.bsky.social');
    cmp.appPassword.set('');
    cmp.submitAppPassword();

    httpMock.expectNone(CREATE_SESSION);
  });
});
