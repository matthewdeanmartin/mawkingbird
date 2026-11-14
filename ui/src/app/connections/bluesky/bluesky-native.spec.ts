import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NATIVE_SOCIAL } from '../../platform/session/platform-login';
import { BlueskySession } from './bluesky-session';
import { blueskyIdentity, clearAllBlueskyIdentities } from './bluesky-identity-store';
import { BlueskyOAuth } from './bluesky-oauth';

const native = { blueskyLogin: vi.fn(), blueskyFetch: vi.fn(), misskeyLogin: vi.fn() };
const browser = { signIn: vi.fn(), fetch: vi.fn(), revoke: vi.fn() };
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  native.blueskyLogin.mockResolvedValue({
    nativeHandle: 'native-bluesky:opaque',
    profile: {
      service: 'https://pds.example',
      did: 'did:plc:reader',
      handle: 'reader.bsky.social',
    },
  });
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: NATIVE_SOCIAL, useValue: native },
      { provide: BlueskyOAuth, useValue: browser },
    ],
  });
});
afterEach(() => {
  TestBed.inject(HttpTestingController).verify();
  clearAllBlueskyIdentities();
  localStorage.clear();
});
it('completes native browser OAuth as an identity with only an opaque reference in storage', async () => {
  const session = TestBed.inject(BlueskySession);
  await session.beginOAuthIdentity('https://bsky.social', false);
  expect(blueskyIdentity('did:plc:reader')?.credentials).toMatchObject({
    authMethod: 'oauth',
    nativeHandle: 'native-bluesky:opaque',
  });
  expect(session.session()?.accessJwt).toBeUndefined();
  expect(session.session()?.refreshJwt).toBeUndefined();
  expect(session.session()?.appPassword).toBeUndefined();
  expect(browser.signIn).not.toHaveBeenCalled();
  native.blueskyFetch.mockResolvedValue(new Response('{}'));
  await session.oauthFetch('https://pds.example/xrpc/app.bsky.feed.getTimeline');
  expect(native.blueskyFetch).toHaveBeenCalledWith(
    'native-bluesky:opaque',
    'https://pds.example/xrpc/app.bsky.feed.getTimeline',
    undefined,
  );
  expect(browser.fetch).not.toHaveBeenCalled();
});
it('restores native connector references after service reconstruction and preserves them on profile changes', async () => {
  await TestBed.inject(BlueskySession).beginOAuthConnector('reader.bsky.social');
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: NATIVE_SOCIAL, useValue: native },
      { provide: BlueskyOAuth, useValue: browser },
    ],
  });
  const session = TestBed.inject(BlueskySession);
  expect(session.session()?.nativeHandle).toBe('native-bluesky:opaque');
  session.setPdsUrl('https://pds.example');
  expect(session.session()?.nativeHandle).toBe('native-bluesky:opaque');
  session.unlink();
  expect(session.session()).toBeNull();
  expect(browser.revoke).not.toHaveBeenCalled();
});
it('does not store an identity when native OAuth fails', async () => {
  native.blueskyLogin.mockRejectedValue({ kind: 'cancelled', message: 'Declined' });
  await expect(
    TestBed.inject(BlueskySession).beginOAuthIdentity('https://bsky.social', false),
  ).rejects.toMatchObject({ kind: 'cancelled' });
  expect(blueskyIdentity('did:plc:reader')).toBeNull();
});
