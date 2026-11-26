import {
  HttpClient,
  HttpErrorResponse,
  HttpParams,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { nativePublicFetch, nativePublicInterceptor } from './native-public-http';

const invoke = vi.fn();
beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  vi.stubGlobal('__TAURI__', { core: { invoke } });
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([nativePublicInterceptor])),
      provideHttpClientTesting(),
    ],
  });
});
afterEach(() => {
  TestBed.inject(HttpTestingController).verify();
  vi.unstubAllGlobals();
});

it('sends the probe and query-bearing public read through native IPC, preserving pagination headers', async () => {
  invoke.mockResolvedValue({
    status: 200,
    body: '[{"id":"1"}]',
    headers: {
      'content-type': 'application/json',
      link: '<https://mastodon.social/api/v1/statuses?max_id=1>; rel="next"',
    },
  });
  const result = await firstValueFrom(
    TestBed.inject(HttpClient).get('https://mastodon.social/api/v1/statuses', {
      params: { max_id: '2' },
      observe: 'response',
    }),
  );
  expect(result.body).toEqual([{ id: '1' }]);
  expect(result.headers.get('link')).toContain('max_id=1');
  expect(invoke).toHaveBeenCalledWith('public_mastodon_get', {
    url: 'https://mastodon.social/api/v1/statuses?max_id=2',
  });
  invoke.mockResolvedValue({
    status: 200,
    body: '{"title":"Mastodon"}',
    headers: { 'content-type': 'application/json' },
  });
  const response = await nativePublicFetch(
    'https://mastodon.social/api/v1/instance',
    new AbortController().signal,
  );
  expect(await response.json()).toEqual({ title: 'Mastodon' });
});

it('never forwards credentials or writes to the public command', async () => {
  const http = TestBed.inject(HttpClient);
  await expect(
    firstValueFrom(http.post('https://mastodon.social/api/v1/statuses', {})),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    firstValueFrom(
      http.get('https://mastodon.social/api/v1/accounts', {
        headers: { Authorization: 'Bearer private' },
      }),
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect(invoke).not.toHaveBeenCalledWith('public_mastodon_get', expect.anything());
  expect(invoke).toHaveBeenCalledWith('report_native_event', { event: 'transport_denied' });
});

it('keeps local assets on Angular transport and preserves upstream errors', async () => {
  const http = TestBed.inject(HttpClient);
  const local = firstValueFrom(http.get('i18n/en.json'));
  TestBed.inject(HttpTestingController).expectOne('i18n/en.json').flush({ ok: true });
  expect(await local).toEqual({ ok: true });
  invoke.mockResolvedValue({
    status: 429,
    body: '{"error":"Slow down"}',
    headers: { 'retry-after': '10' },
  });
  try {
    await firstValueFrom(http.get('https://mastodon.social/api/v1/instance'));
    throw new Error('expected rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(429);
    expect((error as HttpErrorResponse).headers.get('retry-after')).toBe('10');
  }
});

it('distinguishes a blocked destination from network failure and refuses aborted probes', async () => {
  const http = TestBed.inject(HttpClient);
  invoke.mockRejectedValue({ kind: 'policy', message: 'Private destination blocked' });
  await expect(
    firstValueFrom(http.get('https://example.com/api/v1/instance')),
  ).rejects.toMatchObject({ status: 403 });
  invoke.mockRejectedValue({ kind: 'network', message: 'DNS unavailable' });
  await expect(
    firstValueFrom(http.get('https://example.com/api/v1/instance')),
  ).rejects.toMatchObject({ status: 0 });
  const controller = new AbortController();
  controller.abort();
  invoke.mockClear();
  await expect(
    nativePublicFetch('https://example.com/api/v1/instance', controller.signal),
  ).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
});

it('uses a native account reference without forwarding it as a provider bearer token', async () => {
  invoke.mockResolvedValue({ status: 200, body: '{"id":"1"}', headers: {} });
  const result = await firstValueFrom(
    TestBed.inject(HttpClient).get('https://mastodon.social/api/v1/accounts/verify_credentials', {
      headers: { Authorization: 'Bearer native-mastodon:reference' },
    }),
  );
  expect(result).toEqual({ id: '1' });
  expect(invoke).toHaveBeenCalledWith('mastodon_account_get', {
    url: 'https://mastodon.social/api/v1/accounts/verify_credentials',
    handle: 'native-mastodon:reference',
  });
});

it('maps like and unlike to a typed native action and preserves the returned status', async () => {
  const http = TestBed.inject(HttpClient);
  for (const [action, liked] of [
    ['favourite', true],
    ['unfavourite', false],
  ] as const) {
    invoke.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ id: '123', favourited: liked }),
      headers: {},
    });
    const result = await firstValueFrom(
      http.post(
        `https://mastodon.social/api/v1/statuses/123/${action}`,
        {},
        {
          headers: { Authorization: 'Bearer native-mastodon:reference' },
        },
      ),
    );
    expect(result).toEqual({ id: '123', favourited: liked });
    expect(invoke).toHaveBeenLastCalledWith('mastodon_favourite', {
      handle: 'native-mastodon:reference',
      server: 'https://mastodon.social',
      statusId: '123',
      liked,
    });
  }
});

it('does not turn the like action into arbitrary writes, query injection, or anonymous writes', async () => {
  const http = TestBed.inject(HttpClient);
  const options = { headers: { Authorization: 'Bearer native-mastodon:reference' } };
  for (const url of [
    'https://user:secret@mastodon.social/api/v1/statuses/123/favourite',
    'http://mastodon.social/api/v1/statuses/123/favourite',
    'https://mastodon.social:444/api/v1/statuses/123/favourite',
  ]) {
    await expect(firstValueFrom(http.post(url, {}, options))).rejects.toMatchObject({
      status: 403,
    });
  }
  expect(invoke).not.toHaveBeenCalledWith('mastodon_account_write', expect.anything());
  // Not a plain like: Rust's write table decides, and refuses what it doesn't list.
  invoke.mockRejectedValue({ kind: 'policy', message: 'Not supported.' });
  for (const url of [
    'https://mastodon.social/api/v1/admin/accounts/123/action',
    'https://mastodon.social/api/v1/statuses/123/favourite?access_token=x',
  ]) {
    await expect(firstValueFrom(http.post(url, {}, options))).rejects.toMatchObject({
      status: 403,
    });
  }
  await expect(
    firstValueFrom(
      http.post(
        'https://mastodon.social/api/v1/statuses/123/favourite',
        { extra: 'body' },
        options,
      ),
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    firstValueFrom(http.post('https://mastodon.social/api/v1/statuses/123/favourite', {})),
  ).rejects.toMatchObject({ status: 403 });
  expect(invoke).not.toHaveBeenCalledWith('mastodon_favourite', expect.anything());
});

it('carries redraft attachment descriptions and focal points through the native account command', async () => {
  const url = 'https://mastodon.social/api/v1/media/7';
  const body = { description: 'A fox in snow', focus: '0.2,-0.3' };
  invoke.mockResolvedValue({
    status: 200,
    body: JSON.stringify({ id: '7', ...body }),
    headers: {},
  });
  const response = await firstValueFrom(
    TestBed.inject(HttpClient).put(url, body, {
      headers: { Authorization: 'Bearer native-mastodon:reference' },
    }),
  );
  expect(response).toEqual({ id: '7', ...body });
  expect(invoke).toHaveBeenCalledWith('mastodon_account_write', {
    handle: 'native-mastodon:reference',
    input: { url, method: 'PUT', body },
  });
});

it('sends every other account write through the reviewed command with the opaque handle', async () => {
  const http = TestBed.inject(HttpClient);
  const handle = 'native-mastodon:reference';
  const headers = { Authorization: `Bearer ${handle}` };
  const base = 'https://mastodon.social/api/v1';
  invoke.mockResolvedValue({ status: 200, body: '{"id":"9"}', headers: {} });
  const sent = () => invoke.mock.lastCall;

  expect(await firstValueFrom(http.delete(`${base}/statuses/9`, { headers }))).toEqual({ id: '9' });
  expect(sent()).toEqual([
    'mastodon_account_write',
    { handle, input: { url: `${base}/statuses/9`, method: 'DELETE' } },
  ]);

  await firstValueFrom(
    http.post(
      `${base}/statuses`,
      { status: 'hello' },
      { headers: { ...headers, 'Idempotency-Key': 'key-1' } },
    ),
  );
  expect(sent()).toEqual([
    'mastodon_account_write',
    {
      handle,
      input: {
        url: `${base}/statuses`,
        method: 'POST',
        body: { status: 'hello' },
        idempotencyKey: 'key-1',
      },
    },
  ]);

  await firstValueFrom(
    http.put(`${base}/lists/3`, new HttpParams().set('title', 'A & B'), { headers }),
  );
  expect(sent()).toEqual([
    'mastodon_account_write',
    { handle, input: { url: `${base}/lists/3`, method: 'PUT', form: [['title', 'A & B']] } },
  ]);

  const form = new FormData();
  form.append('domain', 'bad.example');
  await firstValueFrom(http.post(`${base}/domain_blocks`, form, { headers }));
  expect(sent()).toEqual([
    'mastodon_account_write',
    {
      handle,
      input: { url: `${base}/domain_blocks`, method: 'POST', form: [['domain', 'bad.example']] },
    },
  ]);

  await firstValueFrom(
    http.delete(`${base}/domain_blocks`, { headers, params: { domain: 'bad.example' } }),
  );
  expect(sent()).toEqual([
    'mastodon_account_write',
    { handle, input: { url: `${base}/domain_blocks?domain=bad.example`, method: 'DELETE' } },
  ]);
});

it('explains unsupported video uploads and sends nothing', async () => {
  const form = new FormData();
  form.append('file', new File(['x'], 'video.mp4', { type: 'video/mp4' }));
  await expect(
    firstValueFrom(
      TestBed.inject(HttpClient).post('https://mastodon.social/api/v2/media', form, {
        headers: { Authorization: 'Bearer native-mastodon:reference' },
      }),
    ),
  ).rejects.toMatchObject({
    status: 403,
    error: {
      error:
        'Native uploads support PNG, JPEG, GIF and WebP pictures up to 16 MiB. Your server may have a lower limit.',
    },
  });
  expect(invoke).not.toHaveBeenCalledWith('mastodon_account_write', expect.anything());
});

it('marks old read-only credentials with an actionable reauthorization error', async () => {
  invoke.mockRejectedValue({ kind: 'reauthorize', message: 'Reconnect with Full access.' });
  await expect(
    firstValueFrom(
      TestBed.inject(HttpClient).post(
        'https://mastodon.social/api/v1/statuses/123/favourite',
        {},
        {
          headers: { Authorization: 'Bearer native-mastodon:reference' },
        },
      ),
    ),
  ).rejects.toMatchObject({ status: 403, error: { code: 'native_reauthorization_required' } });
});

it('sends picture bytes and alt text through the dedicated authenticated upload command', async () => {
  invoke.mockResolvedValue({
    status: 200,
    body: '{"id":"picture","url":"https://cdn.example/p.png"}',
    headers: {},
  });
  const form = new FormData();
  form.append('file', new File(['picture bytes'], 'a.png', { type: 'image/png' }));
  form.append('description', 'A fox in snow');
  const result = await firstValueFrom(
    TestBed.inject(HttpClient).post('https://mastodon.social/api/v2/media', form, {
      headers: { Authorization: 'Bearer native-mastodon:reference' },
    }),
  );
  expect(result).toMatchObject({ id: 'picture' });
  expect(invoke).toHaveBeenCalledWith('mastodon_picture_upload', {
    handle: 'native-mastodon:reference',
    input: {
      url: 'https://mastodon.social/api/v2/media',
      mime: 'image/png',
      data: btoa('picture bytes'),
      description: 'A fox in snow',
    },
  });
  expect(invoke).not.toHaveBeenCalledWith('mastodon_account_write', expect.anything());
});
