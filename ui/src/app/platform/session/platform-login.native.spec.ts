import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NATIVE_SOCIAL, forgetNativeAccount } from './platform-login.native';
const invoke = vi.fn();
beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  vi.stubGlobal('__TAURI__', { core: { invoke } });
});
afterEach(() => vi.unstubAllGlobals());
it('routes browser authorization and deletion to provider-specific native commands', async () => {
  const native = TestBed.inject(NATIVE_SOCIAL)!;
  await native.blueskyLogin('reader.bsky.social');
  expect(invoke).toHaveBeenCalledWith('bluesky_login', { identifier: 'reader.bsky.social' });
  await native.misskeyLogin('https://misskey.io');
  expect(invoke).toHaveBeenCalledWith('misskey_login', { server: 'https://misskey.io' });
  forgetNativeAccount('native-bluesky:opaque');
  expect(invoke).toHaveBeenCalledWith('forget_social_account', { handle: 'native-bluesky:opaque' });
  forgetNativeAccount('native-misskey:opaque');
  expect(invoke).toHaveBeenCalledWith('forget_social_account', { handle: 'native-misskey:opaque' });
});
it('carries an opaque handle and bounded JSON operation without accepting arbitrary headers', async () => {
  const native = TestBed.inject(NATIVE_SOCIAL)!;
  invoke.mockResolvedValue({ status: 204, body: 'null', headers: {} });
  const response = await native.blueskyFetch(
    'native-bluesky:opaque',
    'https://pds.example/xrpc/app.bsky.notification.updateSeen',
    { method: 'POST', body: '{"seenAt":"now"}' },
  );
  expect(response.status).toBe(204);
  expect(invoke).toHaveBeenCalledWith(
    'bluesky_request',
    expect.objectContaining({
      handle: 'native-bluesky:opaque',
      body: { seenAt: 'now' },
      method: 'POST',
    }),
  );
  invoke.mockClear();
  await expect(
    native.blueskyFetch('native-bluesky:opaque', 'https://evil.example/', {
      headers: { Authorization: 'Bearer secret' },
    }),
  ).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
});
