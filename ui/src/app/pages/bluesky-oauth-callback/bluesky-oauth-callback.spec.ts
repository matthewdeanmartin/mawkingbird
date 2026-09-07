import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { saveBlueskyIdentity } from '../../providers/bluesky/bluesky-identity-store';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { BlueskyOAuthCallback } from './bluesky-oauth-callback';

describe('BlueskyOAuthCallback', () => {
  const bsky = { finishOAuthIdentity: vi.fn() };

  beforeEach(() => {
    localStorage.clear();
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
    bsky.finishOAuthIdentity.mockResolvedValue({ session: {}, adding: false });
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
    bsky.finishOAuthIdentity.mockRejectedValue(new Error('access_denied'));

    const fixture = TestBed.createComponent(BlueskyOAuthCallback);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(TestBed.inject(Auth).isAuthenticated).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'cancelled',
    );
  });
});
