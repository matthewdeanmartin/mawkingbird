import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { beforeEach, expect, it, vi } from 'vitest';
import { PLATFORM_CONNECTORS } from './platform-http';
import { MataroaSettings } from '../../connections/mataroa/mataroa-settings';
import { MataroaApi } from '../../connections/mataroa/mataroa-api';
import { RaindropSession } from '../../connections/raindrop/raindrop-session';
import { VaultBridge } from '../../connections/vault/vault-bridge';
import { ConnectionMataroa } from '../../settings/connections/mataroa/connection-mataroa';
import { ConnectionRaindrop } from '../../settings/connections/raindrop/connection-raindrop';

const handle = 'native-connector:' + 'a'.repeat(43);
const connect = vi.fn(),
  forget = vi.fn(),
  request = vi.fn();
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  connect.mockResolvedValue(handle);
  forget.mockResolvedValue(undefined);
  request.mockResolvedValue({
    status: 200,
    headers: {},
    body: '{"ok":true,"post_list":[],"items":[]}',
  });
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withXhr()),
      provideHttpClientTesting(),
      { provide: PLATFORM_CONNECTORS, useValue: { connect, forget, request } },
    ],
  });
});
it('stores only an opaque Mataroa reference and keeps it on failed OS deletion', async () => {
  const vault = vi.spyOn(TestBed.inject(VaultBridge), 'writeThrough');
  const settings = TestBed.inject(MataroaSettings);
  await settings.connect('private-api-key', 'writer.mataroa.blog');
  expect(connect).toHaveBeenCalledWith('mataroa', 'private-api-key', undefined);
  expect(settings.feedUrl()).toBe('https://writer.mataroa.blog/rss/');
  expect(JSON.stringify(localStorage)).toContain(handle);
  expect(JSON.stringify(localStorage)).not.toContain('private-api-key');
  expect(vault).not.toHaveBeenCalled();
  expect(await settings.syncToVault()).toEqual({ kind: 'skipped' });
  forget.mockRejectedValueOnce(new Error('OS store locked'));
  await expect(settings.disconnect()).rejects.toThrow('OS store locked');
  expect(settings.connected()).toBe(true);
  await settings.disconnect();
  expect(settings.connected()).toBe(false);
  expect(localStorage.getItem('mockingbird_mataroa_connection')).toBeNull();
});
it('Mataroa list and publish bypass web proxy and send only a native reference', async () => {
  await TestBed.inject(MataroaSettings).connect('private-api-key', 'writer.mataroa.blog');
  const api = TestBed.inject(MataroaApi);
  await firstValueFrom(api.listPosts());
  await firstValueFrom(api.createPost('Title', 'Markdown'));
  expect(request).toHaveBeenLastCalledWith({
    provider: 'mataroa',
    handle,
    method: 'POST',
    url: 'https://mataroa.blog/api/posts/',
    body: { title: 'Title', body: 'Markdown', published_at: expect.any(String) },
  });
  expect(JSON.stringify(request.mock.calls)).not.toContain('private-api-key');
  TestBed.inject(HttpTestingController).expectNone(() => true);
});
it('validates before connecting and leaves no renderer record on rejected credentials', async () => {
  connect.mockRejectedValue(new Error('Rejected credential'));
  await expect(
    TestBed.inject(MataroaSettings).connect('bad-key', 'writer.mataroa.blog'),
  ).rejects.toThrow('Rejected credential');
  expect(TestBed.inject(MataroaSettings).connected()).toBe(false);
  await expect(TestBed.inject(RaindropSession).connect('bad-token')).rejects.toThrow(
    'Rejected credential',
  );
  expect(TestBed.inject(RaindropSession).connected()).toBe(false);
  expect(JSON.stringify(localStorage)).not.toMatch(/bad-key|bad-token/);
});
it('Raindrop reads and writes use native credentials without browser fetch or vault sync', async () => {
  const session = TestBed.inject(RaindropSession);
  const vault = vi.spyOn(TestBed.inject(VaultBridge), 'writeThrough');
  await session.connect('private-test-token');
  expect(JSON.stringify(localStorage)).not.toContain('private-test-token');
  expect(session.accessToken()).toBe(handle);
  await session.collections();
  await session.bookmarks(-1, 2, 20, 'reading');
  expect(request).toHaveBeenLastCalledWith({
    provider: 'raindrop',
    handle,
    method: 'GET',
    url: 'https://api.raindrop.io/rest/v1/raindrops/-1?page=2&perpage=20&search=reading',
  });
  await session.removeBookmark(42);
  expect(request).toHaveBeenLastCalledWith({
    provider: 'raindrop',
    handle,
    method: 'DELETE',
    url: 'https://api.raindrop.io/rest/v1/raindrop/42',
  });
  expect(vault).not.toHaveBeenCalled();
  await session.disconnect();
  expect(forget).toHaveBeenCalledWith(handle);
  expect(session.connected()).toBe(false);
});
it('native reload accepts handles but refuses imported plaintext credentials', () => {
  localStorage.setItem(
    'mockingbird_mataroa_connection',
    JSON.stringify({
      apiKey: handle,
      blogUrl: 'https://writer.mataroa.blog/',
      connectedAt: Date.now(),
    }),
  );
  localStorage.setItem(
    'mockingbird_raindrop_token',
    JSON.stringify({ accessToken: 'imported-plaintext', connectedAt: Date.now() }),
  );
  expect(TestBed.inject(MataroaSettings).connected()).toBe(true);
  expect(TestBed.inject(RaindropSession).connected()).toBe(false);
  expect(JSON.stringify(localStorage)).not.toContain('imported-plaintext');
});
it('native Mataroa settings connect without proxy setup or consent', async () => {
  const fixture = TestBed.createComponent(ConnectionMataroa);
  fixture.detectChanges();
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  expect(root.querySelector('mb-checkbox')).toBeNull();
  expect(root.querySelector('a[href*="cors-proxy"]')).toBeNull();
  for (const [name, value] of [
    ['apiKey', 'private-api-key'],
    ['blogUrl', 'https://writer.mataroa.blog/'],
  ]) {
    const input = root.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }
  fixture.detectChanges();
  await fixture.whenStable();
  root.querySelector('form')!.dispatchEvent(new Event('submit'));
  await fixture.whenStable();
  fixture.detectChanges();
  expect(TestBed.inject(MataroaSettings).connected()).toBe(true);
  expect(root.textContent).toContain('Saved on this device');
  expect(root.textContent).not.toContain('CORS proxy');
});
it('native Raindrop settings surface a rejected credential and allow retry', async () => {
  const fixture = TestBed.createComponent(ConnectionRaindrop);
  fixture.detectChanges();
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const input = root.querySelector<HTMLInputElement>('input[name="raindropToken"]')!;
  input.value = 'bad-token';
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  await fixture.whenStable();
  connect.mockRejectedValueOnce(new Error('Rejected credential'));
  root.querySelector('form')!.dispatchEvent(new Event('submit'));
  await fixture.whenStable();
  fixture.detectChanges();
  expect(root.textContent).toContain('Rejected credential');
  expect(root.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  expect(root.textContent).not.toContain('localStorage');
});
