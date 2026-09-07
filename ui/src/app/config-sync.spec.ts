import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigSync } from './config-sync';
import { PORTABLE_CONFIG_KIND } from './portable-config';

function configText(theme: string): string {
  return JSON.stringify({
    kind: PORTABLE_CONFIG_KIND,
    schemaVersion: 1,
    minimumReaderVersion: 1,
    exportedAt: '2026-08-02T00:00:00.000Z',
    privacy: 'standard',
    values: { mockingbird_client_prefs: JSON.stringify({ theme }) },
  });
}

describe('ConfigSync', () => {
  let service: ConfigSync;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ConfigSync);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.clear();
    http.verify();
    vi.unstubAllGlobals();
  });

  it('verifies a remote file by hashing two uncached credential-free fetches', async () => {
    const text = configText('dark');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(text, { status: 200 }))
      .mockResolvedValueOnce(new Response(text, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.fetchStable('https://example.com/config.json');

    expect(result.stable).toBe(true);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store', credentials: 'omit' });
  });

  it('forces an unstable source to on-demand checks', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(configText('dark'), { status: 200 }))
      .mockResolvedValueOnce(new Response(configText('light'), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.fetchStable('https://example.com/config.json');
    service.configure('https://example.com/config.json', 'daily', result);

    expect(result.stable).toBe(false);
    expect(service.settings()?.frequency).toBe('manual');
    expect(service.settings()?.automaticAllowed).toBe(false);
  });

  it('publishes a permanent unlisted Pastepile without an API key', async () => {
    const pending = service.publishPermanent(configText('dark'));
    const request = http.expectOne('https://www.pastepile.com/api/public/pastes');

    expect(request.request.body).toMatchObject({ expiry: 'never', visibility: 'unlisted' });
    expect(request.request.headers.has('X-API-Key')).toBe(false);
    request.flush({
      slug: 'abc',
      url: 'https://www.pastepile.com/p/abc',
      raw_url: 'https://www.pastepile.com/raw/abc',
      edit_key: 'edit-secret',
    });

    await expect(pending).resolves.toEqual({
      slug: 'abc',
      url: 'https://www.pastepile.com/p/abc',
      rawUrl: 'https://www.pastepile.com/raw/abc',
      editKey: 'edit-secret',
    });
  });
});
