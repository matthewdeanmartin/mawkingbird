import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../../platform/session/auth';
import { saveBlueskyIdentity } from '../../../connections/bluesky/bluesky-identity-store';
import { BlueskySession } from '../../../connections/bluesky/bluesky-session';
import { BlueskyOAuthCallback } from './bluesky-oauth-callback';

describe('BlueskyOAuthCallback', () => {
  const bsky = { finishOAuth: vi.fn() };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    saveBlueskyIdentity(
      {
        service: 'https://pds.example',
        did: 'did:plc:oauth',
        handle: 'oauth.example',
      },
      { authMethod: 'oauth' },
      true,
    );
    TestBed.configureTestingModule({
      providers: [
        Auth,
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BlueskySession, useValue: bsky },
      ],
    });
  });

  it('activates the returned DID and replaces the callback URL with Home', async () => {
    bsky.finishOAuth.mockResolvedValue({ kind: 'identity', session: {}, adding: false });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(BlueskyOAuthCallback);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(TestBed.inject(Auth).kind()).toBe('bluesky');
    expect(TestBed.inject(Auth).account()?.acct).toBe('oauth.example');
    expect(navigate).toHaveBeenCalledWith('/home', { replaceUrl: true });
  });

  it('shows an actionable error without activating an account', async () => {
    localStorage.clear();
    bsky.finishOAuth.mockRejectedValue(new Error('access_denied'));

    const fixture = TestBed.createComponent(BlueskyOAuthCallback);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(TestBed.inject(Auth).isAuthenticated).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'cancelled',
    );
  });

  it('returns to the mini-app that started the sign-in', async () => {
    sessionStorage.setItem('mockingbird_login_next', '/crosspost');
    bsky.finishOAuth.mockResolvedValue({ kind: 'identity', session: {}, adding: false });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(BlueskyOAuthCallback);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith('/crosspost', { replaceUrl: true });
    expect(sessionStorage.getItem('mockingbird_login_next')).toBeNull();
  });

  it('returns a connector link to the page that started it without switching accounts', async () => {
    localStorage.clear();
    sessionStorage.setItem('mockingbird_bsky_connector_return', '/settings/connections/bluesky');
    bsky.finishOAuth.mockResolvedValue({ kind: 'connector', session: {} });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(BlueskyOAuthCallback);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(TestBed.inject(Auth).isAuthenticated).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/settings/connections/bluesky', { replaceUrl: true });
    expect(sessionStorage.getItem('mockingbird_bsky_connector_return')).toBeNull();
  });

  it('sends a failed connector link back to the connection page, not sign-in', async () => {
    sessionStorage.setItem('mockingbird_bsky_connector_return', '/settings/connections/bluesky');
    bsky.finishOAuth.mockRejectedValue(new Error('access_denied'));

    const fixture = TestBed.createComponent(BlueskyOAuthCallback);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const back = (fixture.nativeElement as HTMLElement).querySelector('a');
    expect(back?.getAttribute('href')).toBe('/settings/connections/bluesky');
    expect(back?.textContent).toContain('Back to the Bluesky connection');
  });
});
