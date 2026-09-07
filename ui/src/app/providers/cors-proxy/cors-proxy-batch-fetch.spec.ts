import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Server } from '../../server';
import { CorsProxyBatchFetch } from './cors-proxy-batch-fetch';
import { CorsProxySettings } from './cors-proxy-settings';

describe('CorsProxyBatchFetch', () => {
  let http: HttpTestingController;
  let batch: CorsProxyBatchFetch;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(Server).setBaseUrl('https://mastodon.social');
    TestBed.inject(CorsProxySettings).select('mawkingbird');
    http = TestBed.inject(HttpTestingController);
    batch = TestBed.inject(CorsProxyBatchFetch);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  it('coalesces simultaneous article reads and returns each body to its caller', async () => {
    const one = firstValueFrom(batch.text('https://one.example/', 'article'));
    const two = firstValueFrom(batch.text('https://two.example/', 'article'));
    await vi.advanceTimersByTimeAsync(20);

    const request = http.expectOne(
      (candidate) => candidate.method === 'POST' && candidate.url.endsWith('/batch?route=article'),
    );
    const sent = JSON.parse(request.request.body as string) as {
      requests: { id: string; url: string }[];
    };
    request.flush({
      results: sent.requests.map(({ id, url }) => ({
        id,
        status: 200,
        ok: true,
        body: `<html>${url}</html>`,
      })),
    });

    await expect(one).resolves.toContain('one.example');
    await expect(two).resolves.toContain('two.example');
  });

  it('keeps an article failure attached to only that caller', async () => {
    const good = firstValueFrom(batch.text('https://good.example/', 'article'));
    const bad = firstValueFrom(batch.text('https://bad.example/', 'article'));
    await vi.advanceTimersByTimeAsync(20);
    const request = http.expectOne((candidate) => candidate.url.endsWith('/batch?route=article'));
    const sent = JSON.parse(request.request.body as string) as {
      requests: { id: string }[];
    };
    request.flush({
      results: [
        { id: sent.requests[0].id, status: 200, ok: true, body: '<html>good</html>' },
        { id: sent.requests[1].id, status: 429, ok: false, body: 'limited' },
      ],
    });
    await expect(good).resolves.toContain('good');
    await expect(bad).rejects.toMatchObject({ status: 429 });
  });
});
