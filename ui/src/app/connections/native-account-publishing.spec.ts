import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { PLATFORM_CONNECTORS, PLATFORM_LOCAL_PUBLISHING } from '../platform/http/platform-http';
import { nativePublishingInterceptor } from '../platform/http/native-publishing-http';
import { ShortenerSettings } from './shortener/shortener-settings';
import { ShortenerTransport } from './shortener/shortener-transport';
import { GistSettings } from './paste/gist-settings';
import { GistProvider } from './paste/gist-provider';
import { VaultBridge } from './vault/vault-bridge';
import { DubProvider } from './shortener/dub-provider';
import { ShortioProvider } from './shortener/shortio-provider';
import { TlyProvider } from './shortener/tly-provider';
import { TinyurlShortenerProvider } from './shortener/tinyurl-shortener-provider';
import { RebrandlyProvider } from './shortener/rebrandly-provider';

const handle = 'native-connector:' + 'a'.repeat(43);
const bridge = { connect: vi.fn(), forget: vi.fn(), request: vi.fn() };
const vault = {
  readThrough: vi.fn(),
  writeThrough: vi.fn(),
  removeThrough: vi.fn(),
  verdictFor: vi.fn(),
};
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  bridge.connect.mockResolvedValue(handle);
  bridge.forget.mockResolvedValue(undefined);
  bridge.request.mockResolvedValue({ status: 200, headers: {}, body: '{"login":"writer"}' });
  vi.stubGlobal('__TAURI__', {
    core: { invoke: (_: string, args: object) => bridge.request(args) },
  });
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([nativePublishingInterceptor])),
      provideHttpClientTesting(),
      { provide: PLATFORM_LOCAL_PUBLISHING, useValue: true },
      { provide: PLATFORM_CONNECTORS, useValue: bridge },
      { provide: VaultBridge, useValue: vault },
    ],
  });
});
afterEach(() => {
  TestBed.inject(HttpTestingController).verify();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it('persists a shortener handle only after verification and retains it when OS removal fails', async () => {
  const settings = TestBed.inject(ShortenerSettings);
  bridge.connect.mockRejectedValueOnce(new Error('Rejected credential'));
  await expect(settings.connectNative('dub', 'secret', '')).rejects.toThrow('Rejected');
  expect(settings.hasKey('dub')).toBe(false);
  await settings.connectNative('rebrandly', 'secret', 'workspace-1');
  expect(bridge.connect).toHaveBeenLastCalledWith(
    'rebrandly',
    'secret',
    undefined,
    'workspace-1',
    undefined,
  );
  expect(settings.resolve()?.auth?.value).toBe(handle);
  expect(JSON.stringify(localStorage)).not.toContain('secret');
  expect(JSON.stringify(localStorage)).toContain(handle);
  bridge.forget.mockRejectedValueOnce(new Error('OS locked'));
  await expect(settings.forgetNative('rebrandly')).rejects.toThrow('OS locked');
  expect(settings.hasKey('rebrandly')).toBe(true);
  await settings.forgetNative('rebrandly');
  expect(settings.hasKey('rebrandly')).toBe(false);
  expect(vault.writeThrough).not.toHaveBeenCalled();
});
it('restores saved native references without restoring plaintext keys or contacting the cloud', async () => {
  localStorage.setItem(
    'mockingbird_shortener_keys',
    JSON.stringify({
      dub: { key: handle, connectedAt: 1 },
      tly: { key: 'raw-secret', connectedAt: 1 },
    }),
  );
  const settings = TestBed.inject(ShortenerSettings);
  expect(settings.hasKey('dub')).toBe(true);
  expect(settings.expiresAt()).toBeNull();
  expect(settings.hasKey('tly')).toBe(false);
  await settings.syncToVault();
  await settings.reconcileVault();
  settings.enforceLifetime();
  expect(vault.readThrough).not.toHaveBeenCalled();
  expect(vault.verdictFor).not.toHaveBeenCalled();
  expect(JSON.stringify(localStorage)).not.toContain('raw-secret');
});
it('routes every account-backed shortener create through typed IPC with only an opaque credential', async () => {
  const settings = TestBed.inject(ShortenerSettings);
  for (const provider of [
    TestBed.inject(DubProvider),
    TestBed.inject(ShortioProvider),
    TestBed.inject(TlyProvider),
    TestBed.inject(TinyurlShortenerProvider),
    TestBed.inject(RebrandlyProvider),
  ]) {
    await settings.connectNative(provider.id, 'private-token', 'go.example.com');
    const link = {
      id: 'link1',
      idString: 'link1',
      domain: 'go.example.com',
      key: 'link1',
      path: 'link1',
      alias: 'link1',
      slashtag: 'link1',
      url: 'https://example.com',
      originalURL: 'https://example.com',
      long_url: 'https://example.com',
      destination: 'https://example.com',
      shortLink: 'https://go.example.com/link1',
      shortURL: 'https://go.example.com/link1',
      short_url: 'https://go.example.com/link1',
      tiny_url: 'https://go.example.com/link1',
      shortUrl: 'go.example.com/link1',
    };
    bridge.request.mockResolvedValue({
      status: 200,
      headers: {},
      body: JSON.stringify(provider.id === 'tinyurl' ? { data: link } : link),
    });
    const created = await firstValueFrom(
      provider.createLink({ destinationUrl: 'https://example.com' }),
    );
    expect(created.destinationUrl).toBe('https://example.com');
    expect(bridge.request).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: provider.id, handle, method: 'POST' }),
    );
    expect(JSON.stringify(bridge.request.mock.lastCall)).not.toContain('private-token');
  }
});
it('keeps T.LY DELETE bodies and Rebrandly workspace headers inside the scoped contract', async () => {
  const settings = TestBed.inject(ShortenerSettings);
  await settings.connectNative('tly', 'secret', '');
  bridge.request.mockResolvedValue({ status: 204, headers: {}, body: 'null' });
  await firstValueFrom(TestBed.inject(TlyProvider).deleteLink('https://t.ly/abc'));
  expect(bridge.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ method: 'DELETE', body: { short_url: 'https://t.ly/abc' } }),
  );
  await settings.connectNative('rebrandly', 'secret', 'workspace-1');
  await firstValueFrom(TestBed.inject(RebrandlyProvider).deleteLink('abc'));
  expect(bridge.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ method: 'DELETE', workspace: 'workspace-1' }),
  );
});
it('does not retry a credentialed create after a lost native response', async () => {
  await TestBed.inject(ShortenerSettings).connectNative('dub', 'secret', '');
  bridge.request.mockRejectedValue(new Error('Response lost'));
  await expect(
    firstValueFrom(
      TestBed.inject(ShortenerTransport).request('dub', {
        method: 'POST',
        url: 'https://api.dub.co/links',
        body: { url: 'https://example.com' },
        idempotent: false,
      }),
    ),
  ).rejects.toThrow('Response lost');
  expect(bridge.request).toHaveBeenCalledTimes(1);
});
it('connects Gist using an OS reference, passes writes through IPC, and preserves connection after failed deletion', async () => {
  const settings = TestBed.inject(GistSettings);
  await settings.connectNative('private-token');
  expect(settings.profile()?.login).toBe('writer');
  expect(settings.token()).toBe(handle);
  expect(JSON.stringify(localStorage)).not.toContain('private-token');
  const provider = TestBed.inject(GistProvider);
  bridge.request.mockResolvedValue({
    status: 201,
    headers: {},
    body: JSON.stringify({
      id: 'abc123',
      html_url: 'https://gist.github.com/abc123',
      files: { 'hello.md': { filename: 'hello.md' } },
    }),
  });
  await firstValueFrom(
    provider.create({
      title: 'Hello',
      content: 'body',
      language: 'markdown',
      expiry: 'never',
      visibility: 'unlisted',
    }),
  );
  expect(bridge.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      provider: 'gist',
      handle,
      method: 'POST',
      body: { description: 'Hello', public: false, files: { 'hello.md': { content: 'body' } } },
    }),
  );
  bridge.request.mockResolvedValue({ status: 204, headers: {}, body: 'null' });
  await firstValueFrom(provider.delete('abc123', ''));
  expect(bridge.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ method: 'DELETE', url: 'https://api.github.com/gists/abc123' }),
  );
  bridge.forget.mockRejectedValueOnce(new Error('OS locked'));
  await expect(settings.disconnectNative()).rejects.toThrow('OS locked');
  expect(settings.connected()).toBe(true);
  await settings.disconnectNative();
  expect(settings.connected()).toBe(false);
  expect(vault.writeThrough).not.toHaveBeenCalled();
});
