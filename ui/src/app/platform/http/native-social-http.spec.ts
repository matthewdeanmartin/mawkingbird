import { HttpClient, provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { nativeSocialInterceptor } from './native-social-http';

const invoke = vi.fn();
beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue({ status: 200, body: '[]', headers: {} });
  vi.stubGlobal('__TAURI__', { core: { invoke } });
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withXhr(), withInterceptors([nativeSocialInterceptor])),
      provideHttpClientTesting(),
    ],
  });
});
afterEach(() => {
  TestBed.inject(HttpTestingController).verify();
  vi.unstubAllGlobals();
});

it('routes Misskey paging and reactions with a handle, never a provider token', async () => {
  const http = TestBed.inject(HttpClient);
  await firstValueFrom(
    http.post('https://misskey.io/api/notes/timeline', {
      i: 'native-misskey:opaque',
      untilId: 'last',
      limit: 20,
    }),
  );
  expect(invoke).toHaveBeenCalledWith('misskey_request', {
    server: 'https://misskey.io',
    endpoint: 'notes/timeline',
    handle: 'native-misskey:opaque',
    body: { untilId: 'last', limit: 20 },
  });
  invoke.mockResolvedValue({ status: 204, body: 'null', headers: {} });
  expect(
    await firstValueFrom(
      http.post('https://misskey.io/api/notes/reactions/create', {
        i: 'native-misskey:opaque',
        noteId: 'note',
        reaction: '❤️',
      }),
    ),
  ).toBeNull();
});
it('rejects raw tokens, authorization headers and query-bearing Misskey writes before IPC', async () => {
  const http = TestBed.inject(HttpClient);
  for (const body of [{ i: 'secret' }, []])
    await expect(firstValueFrom(http.post('https://misskey.io/api/i', body))).rejects.toMatchObject(
      { status: 403 },
    );
  await expect(
    firstValueFrom(http.post('https://misskey.io/api/i?i=secret', {})),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    firstValueFrom(
      http.get('https://public.api.bsky.app/xrpc/app.bsky.feed.getTimeline', {
        headers: { Authorization: 'Bearer secret' },
      }),
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect(invoke).not.toHaveBeenCalled();
});
it('bridges NodeInfo and anonymous Bluesky reads without affecting app assets', async () => {
  const http = TestBed.inject(HttpClient);
  await firstValueFrom(http.get('https://misskey.io/.well-known/nodeinfo'));
  expect(invoke).toHaveBeenCalledWith('misskey_nodeinfo', {
    url: 'https://misskey.io/.well-known/nodeinfo',
  });
  await firstValueFrom(
    http.get('https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=did:plc:reader'),
  );
  expect(invoke).toHaveBeenLastCalledWith(
    'bluesky_request',
    expect.objectContaining({ handle: null, method: 'GET' }),
  );
  const pending = firstValueFrom(http.get('/i18n/en.json'));
  TestBed.inject(HttpTestingController).expectOne('/i18n/en.json').flush({});
  await pending;
});
it('preserves provider failures for the existing UI', async () => {
  invoke.mockResolvedValue({
    status: 403,
    body: '{"error":{"code":"PERMISSION_DENIED"}}',
    headers: {},
  });
  await expect(
    firstValueFrom(
      TestBed.inject(HttpClient).post('https://misskey.io/api/notes/reactions/create', {}),
    ),
  ).rejects.toMatchObject({ status: 403, error: { error: { code: 'PERMISSION_DENIED' } } });
});
