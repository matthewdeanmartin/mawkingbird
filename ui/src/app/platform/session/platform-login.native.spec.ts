import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  NATIVE_FOLLOW_COLLECT,
  NATIVE_NOTIFICATION_COLLECT,
  NATIVE_PROFILES,
  NATIVE_SOCIAL,
  forgetNativeAccount,
} from './platform-login.native';
const invoke = vi.fn();
beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  vi.stubGlobal('__TAURI__', { core: { invoke } });
});
afterEach(() => vi.unstubAllGlobals());
it('deduplicates active notification backfill and allows the next bounded pass', async () => {
  const collect = TestBed.inject(NATIVE_NOTIFICATION_COLLECT)!;
  invoke.mockResolvedValue({ imported: 80, complete: false });
  const first = collect('native-mastodon:opaque');
  expect(collect('native-mastodon:opaque')).toBe(first);
  expect(await first).toEqual({ imported: 80, complete: false });
  expect(invoke).toHaveBeenCalledTimes(1);
  await collect('native-mastodon:opaque');
  expect(invoke).toHaveBeenCalledTimes(2);
});
it('allows a completed people inventory to be updated again', async () => {
  const collect = TestBed.inject(NATIVE_FOLLOW_COLLECT)!;
  invoke.mockResolvedValue({ complete: true });
  const first = collect('native-mastodon:refreshable');
  expect(collect('native-mastodon:refreshable')).toBe(first);
  await first;
  await collect('native-mastodon:refreshable');
  expect(invoke).toHaveBeenCalledTimes(2);
});
it('sends a bounded read batch through the native archive command', async () => {
  await TestBed.inject(NATIVE_PROFILES)!.markReadBatch('native-mastodon:reader', [7, 8]);
  expect(invoke).toHaveBeenCalledWith('archive_mark_read_batch', {
    handle: 'native-mastodon:reader',
    postIds: [7, 8],
  });
});
it('sends a profile page keyset without an offset ceiling', async () => {
  await TestBed.inject(NATIVE_PROFILES)!.postsAfter('native-mastodon:reader', 9, 'all', true, {
    createdAt: '2026-01-01T00:00:00Z',
    localId: 42,
  });
  expect(invoke).toHaveBeenCalledWith('archive_profile_posts_after', {
    handle: 'native-mastodon:reader',
    actorId: 9,
    filter: 'all',
    hideRead: true,
    beforeCreatedAt: '2026-01-01T00:00:00Z',
    beforeId: 42,
  });
});
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
