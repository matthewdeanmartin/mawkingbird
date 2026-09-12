import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideRouter } from '@angular/router';
import { Observable } from 'rxjs';
import { Streaming } from './streaming';
import { MenuIndicators } from './menu-indicators';
import { Api } from './api';
import { Auth } from './auth';
import { Server } from './server';
import { authInterceptor } from './auth.interceptor';
import { serverInterceptor } from './server.interceptor';
import { scopeSuffixForDid } from './account-scope';
import { seedBskyIdentity } from './testing/seed-storage';
import {
  MASTODON_CONNECTOR_PROFILE_KEY,
  MASTODON_CONNECTOR_TOKEN_KEY,
} from './providers/mastodon/mastodon-connector';

describe('Bluesky connector request ownership', () => {
  let http: HttpTestingController;
  const did = 'did:plc:one';

  function connector(identity: string, server: string, token?: string): void {
    const suffix = scopeSuffixForDid(identity);
    localStorage.setItem(
      MASTODON_CONNECTOR_PROFILE_KEY + suffix,
      JSON.stringify({ state: token ? 'signed-in' : 'anonymous', server }),
    );
    if (token) localStorage.setItem(MASTODON_CONNECTOR_TOKEN_KEY + suffix, token);
  }

  beforeEach(() => {
    localStorage.clear();
    seedBskyIdentity({ did, handle: 'one.bsky.social' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([serverInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  function verifyRequest(server: string, token: string | null): void {
    TestBed.inject(Api).verifyCredentials().subscribe();
    const request = http.expectOne(`${server}/api/v1/accounts/verify_credentials`);
    expect(request.request.headers.get('Authorization')).toBe(token ? `Bearer ${token}` : null);
    request.flush({ id: 'test' });
  }

  it('restores the connector host on the first cold-start request before Auth initializes', () => {
    localStorage.setItem('mastodon_mock_account_mode', 'bluesky');
    localStorage.setItem('mastodon_mock_server', 'https://previous.example');
    connector(did, 'https://connector.example', 'connector-token');
    verifyRequest('https://connector.example', 'connector-token');
    expect(TestBed.inject(Auth).lacksMastodonToken).toBe(false);
  });

  it('restores host and token after visiting a Mastodon identity on another server', () => {
    connector(did, 'https://connector.example', 'connector-token');
    const auth = TestBed.inject(Auth);
    TestBed.inject(Server).setBaseUrl('https://mastodon.example');
    auth.setToken('primary-token');
    expect(auth.enterBluesky(did)).toBe(true);
    verifyRequest('https://connector.example', 'connector-token');
    expect(auth.switchTo('primary-token')).toBe(true);
    verifyRequest('https://mastodon.example', 'primary-token');
    auth.enterBluesky(did);
    verifyRequest('https://connector.example', 'connector-token');
  });

  it('keeps two Bluesky identities connector hosts and credentials independent', () => {
    seedBskyIdentity({ did: 'did:plc:two', handle: 'two.bsky.social' });
    connector(did, 'https://one.example', 'token-one');
    connector('did:plc:two', 'https://two.example', 'token-two');
    const auth = TestBed.inject(Auth);
    auth.enterBluesky(did);
    verifyRequest('https://one.example', 'token-one');
    auth.enterBluesky('did:plc:two');
    verifyRequest('https://two.example', 'token-two');
    auth.enterBluesky(did);
    verifyRequest('https://one.example', 'token-one');
  });

  it('restores an anonymous connector host without a previous identity token', () => {
    connector(did, 'https://public.example');
    const auth = TestBed.inject(Auth);
    auth.setToken('previous-token');
    auth.enterBluesky(did);
    expect(auth.lacksMastodonToken).toBe(true);
    verifyRequest('https://public.example', null);
  });

  it('clears the previous Mastodon destination when Bluesky has no connector', () => {
    const auth = TestBed.inject(Auth);
    TestBed.inject(Server).setBaseUrl('https://previous.example');
    auth.setToken('previous-token');
    auth.enterBluesky(did);
    expect(TestBed.inject(Server).baseUrl()).toBe('');
    expect(auth.token()).toBeNull();
  });

  it('does not send a connector token to a manually changed global server', () => {
    connector(did, 'https://connector.example', 'connector-token');
    TestBed.inject(Auth).enterBluesky(did);
    TestBed.inject(Server).setBaseUrl('https://unrelated.example');
    verifyRequest('https://unrelated.example', null);
  });

  it('enables Mastodon indicator streams for a Bluesky connector and closes them when disconnected', () => {
    const auth = TestBed.inject(Auth);
    auth.enterBluesky(did);
    const closed = vi.fn();
    const open = vi
      .spyOn(TestBed.inject(Streaming), 'open')
      .mockImplementation(() => new Observable(() => closed));
    const indicators = TestBed.inject(MenuIndicators);
    indicators.start();
    expect(open).not.toHaveBeenCalled();
    auth.connectMastodon('connector-token');
    indicators.tick();
    expect(open).toHaveBeenCalledWith({ stream: 'user:notification' });
    expect(open).toHaveBeenCalledWith({ stream: 'direct' });
    auth.disconnectMastodon();
    indicators.tick();
    expect(closed).toHaveBeenCalledTimes(2);
  });
});
