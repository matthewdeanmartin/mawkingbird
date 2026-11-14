import { HttpClient, HttpParams, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { nativePublishingInterceptor } from './native-publishing-http';
import { nativeSocialInterceptor } from './native-social-http';
import { RentryProvider } from '../../connections/paste/rentry-provider';

const invoke = vi.fn();
beforeEach(() => {
  invoke.mockReset();
  vi.stubGlobal('__TAURI__', { core: { invoke } });
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([nativePublishingInterceptor, nativeSocialInterceptor])),
      provideHttpClientTesting(),
    ],
  });
});
afterEach(() => {
  TestBed.inject(HttpTestingController).verify();
  vi.unstubAllGlobals();
});
it('routes anonymous shortening with the destination encoded only once', async () => {
  const http = TestBed.inject(HttpClient);
  const destination = 'https://example.com/a?x=1&y=two#part';
  invoke.mockResolvedValue({ status: 200, body: 'https://tinyurl.com/short', headers: {} });
  expect(
    await firstValueFrom(
      http.get('https://tinyurl.com/api-create.php', {
        params: { url: destination },
        responseType: 'text',
      }),
    ),
  ).toBe('https://tinyurl.com/short');
  expect(invoke).toHaveBeenLastCalledWith('shorten_link', {
    provider: 'tinyurl',
    destination,
    slug: null,
  });
  invoke.mockResolvedValue({
    status: 200,
    body: '{"shorturl":"https://is.gd/alias"}',
    headers: {},
  });
  expect(
    await firstValueFrom(
      http.get('https://is.gd/create.php', {
        params: { format: 'json', url: destination, shorturl: 'alias' },
      }),
    ),
  ).toEqual({ shorturl: 'https://is.gd/alias' });
  expect(invoke).toHaveBeenLastCalledWith('shorten_link', {
    provider: 'isgd',
    destination,
    slug: 'alias',
  });
});
it('uses the shared Rentry adapter for create, edit and delete without exposing an edit code', async () => {
  const provider = TestBed.inject(RentryProvider);
  const input = {
    title: 'Title',
    content: 'Markdown',
    language: 'markdown',
    expiry: 'never' as const,
    visibility: 'unlisted' as const,
  };
  invoke.mockResolvedValue({
    status: 200,
    body: JSON.stringify({
      status: '200',
      url: 'https://rentry.co/page',
      edit_code: 'native-rentry:page',
    }),
    headers: {},
  });
  const created = await firstValueFrom(provider.create(input));
  expect(created.editKey).toBe('native-rentry:page');
  expect(invoke).toHaveBeenLastCalledWith('rentry_request', {
    action: 'new',
    slug: null,
    handle: null,
    text: '# Title\n\nMarkdown',
  });
  await firstValueFrom(provider.update(created.slug, created.editKey, input));
  expect(invoke).toHaveBeenLastCalledWith('rentry_request', {
    action: 'edit',
    slug: 'page',
    handle: 'native-rentry:page',
    text: '# Title\n\nMarkdown',
  });
  await firstValueFrom(provider.delete(created.slug, created.editKey));
  expect(invoke).toHaveBeenLastCalledWith('rentry_request', {
    action: 'delete',
    slug: 'page',
    handle: 'native-rentry:page',
    text: null,
  });
});
it('rejects raw edit codes, cross-paste handles, arbitrary routes and credentials before IPC', async () => {
  const http = TestBed.inject(HttpClient);
  for (const key of ['raw-secret', 'native-rentry:other']) {
    await expect(
      firstValueFrom(
        http.post('https://rentry.co/api/delete/page', new HttpParams().set('edit_code', key)),
      ),
    ).rejects.toMatchObject({ status: 502 });
  }
  for (const url of [
    'https://rentry.co/api/new?x=1',
    'https://tinyurl.com/admin',
    'https://tinyurl.com/api-create.php?url=a&url=b',
    'http://is.gd/create.php',
  ]) {
    await expect(firstValueFrom(http.get(url))).rejects.toMatchObject({ status: 502 });
  }
  await expect(
    firstValueFrom(
      http.get('https://tinyurl.com/api-create.php?url=https://example.com', {
        headers: { Authorization: 'Bearer secret' },
      }),
    ),
  ).rejects.toMatchObject({ status: 502 });
  expect(invoke).not.toHaveBeenCalled();
});
it('makes a single attempt on an uncertain write and preserves the native failure message', async () => {
  invoke.mockRejectedValue({ kind: 'network', message: 'Not confirmed; no retry.' });
  await expect(
    firstValueFrom(
      TestBed.inject(HttpClient).post(
        'https://rentry.co/api/new',
        new HttpParams().set('text', 'hello'),
      ),
    ),
  ).rejects.toMatchObject({ status: 502, error: { message: 'Not confirmed; no retry.' } });
  expect(invoke).toHaveBeenCalledTimes(1);
});
it('passes unrelated application requests to the ordinary handler', async () => {
  const pending = firstValueFrom(TestBed.inject(HttpClient).get('/i18n/en.json'));
  TestBed.inject(HttpTestingController).expectOne('/i18n/en.json').flush({});
  await pending;
  expect(invoke).not.toHaveBeenCalled();
});

import { PLATFORM_LOCAL_PUBLISHING } from './platform-http';
import { ShortenerSettings } from '../../connections/shortener/shortener-settings';
import {
  ShortenerTransport,
  ProxyConsentRequired,
} from '../../connections/shortener/shortener-transport';
import { VaultBridge } from '../../connections/vault/vault-bridge';
import { PasteHistory } from '../../connections/paste/paste-history';

it('keeps anonymous native shorteners local and does not load imported keys or access the vault', async () => {
  localStorage.setItem(
    'mockingbird_shortener_keys',
    JSON.stringify({ tinyurl: { key: 'secret' } }),
  );
  const vault = {
    readThrough: vi.fn(),
    writeThrough: vi.fn(),
    removeThrough: vi.fn(),
    verdictFor: vi.fn(),
  };
  TestBed.overrideProvider(PLATFORM_LOCAL_PUBLISHING, { useValue: true });
  TestBed.overrideProvider(VaultBridge, { useValue: vault });
  const settings = TestBed.inject(ShortenerSettings);
  expect(settings.hasKey('tinyurl')).toBe(false);
  expect(localStorage.getItem('mockingbird_shortener_keys')).toBeNull();
  settings.activate('tinyurl');
  expect(settings.resolve()?.auth).toBeNull();
  expect(() => settings.setKey('tinyurl', 'secret')).toThrow();
  settings.activate('dub');
  expect(settings.resolve()).toBeNull();
  await settings.reconcileVault();
  await settings.syncToVault();
  expect(vault.readThrough).not.toHaveBeenCalled();
  expect(vault.writeThrough).not.toHaveBeenCalled();
  settings.deactivate();
});
it('does not retry an anonymous create through a proxy after native transport failure', async () => {
  TestBed.overrideProvider(PLATFORM_LOCAL_PUBLISHING, { useValue: true });
  const settings = TestBed.inject(ShortenerSettings);
  settings.activate('isgd');
  invoke.mockRejectedValue({ kind: 'network', message: 'Offline' });
  const request = firstValueFrom(
    TestBed.inject(ShortenerTransport).request('isgd', {
      method: 'GET',
      url: 'https://is.gd/create.php?format=json&url=https%3A%2F%2Fexample.com',
      idempotent: false,
    }),
  );
  await expect(request).rejects.not.toBeInstanceOf(ProxyConsentRequired);
  expect(invoke).toHaveBeenCalledTimes(1);
  settings.deactivate();
});
it('loads only native Rentry references as edit capabilities from local paste history', () => {
  TestBed.overrideProvider(PLATFORM_LOCAL_PUBLISHING, { useValue: true });
  localStorage.setItem(
    'mockingbird_paste_edit_keys',
    JSON.stringify({
      old: 'secret-code',
      page: 'native-rentry:page',
      wrong: 'native-rentry:other',
    }),
  );
  localStorage.setItem(
    'mockingbird_pastes',
    JSON.stringify([{ slug: 'page', providerId: 'rentry' }]),
  );
  const history = TestBed.inject(PasteHistory);
  expect(history.editKeyFor('old')).toBe('');
  expect(history.editKeyFor('wrong')).toBe('');
  expect(history.editKeyFor('page')).toBe('native-rentry:page');
  expect(localStorage.getItem('mockingbird_paste_edit_keys')).not.toContain('secret-code');
  localStorage.removeItem('mockingbird_pastes');
  localStorage.removeItem('mockingbird_paste_edit_keys');
});
