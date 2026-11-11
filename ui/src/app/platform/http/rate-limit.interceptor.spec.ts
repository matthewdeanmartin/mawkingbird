import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimitInterceptor } from './rate-limit.interceptor';

describe('rateLimitInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([rateLimitInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Restore the clock *before* the assertion that can throw. `verify()` raises
    // on an outstanding request, and an afterEach that throws skips the rest of
    // itself — which would leave this realm's clock frozen for every later test
    // in the file (spec files share a realm: the builder sets `isolate: false`).
    vi.useRealTimers();
    httpMock.verify();
  });

  it('retries a rate-limited GET once after Retry-After', async () => {
    const values: string[] = [];
    http.get<string>('/api/data').subscribe((value) => values.push(value));
    httpMock.expectOne('/api/data').flush(null, {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'Retry-After': '1' },
    });
    httpMock.expectNone('/api/data');

    await vi.advanceTimersByTimeAsync(1000);
    httpMock.expectOne('/api/data').flush('ok');
    expect(values).toEqual(['ok']);
  });

  it('does not automatically retry a mutation', async () => {
    let status = 0;
    http.post('/api/change', {}).subscribe({ error: (error) => (status = error.status) });
    httpMock.expectOne('/api/change').flush(null, {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'Retry-After': '1' },
    });
    expect(status).toBe(429);

    await vi.advanceTimersByTimeAsync(1000);
    httpMock.expectNone('/api/change');
  });

  it('holds later calls when a successful response reports no remaining capacity', async () => {
    const reset = Date.now() + 1000;
    http.get('/api/first').subscribe();
    httpMock.expectOne('/api/first').flush(
      {},
      {
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(reset),
        },
      },
    );

    http.get('/api/second').subscribe();
    httpMock.expectNone('/api/second');
    await vi.advanceTimersByTimeAsync(1000);
    httpMock.expectOne('/api/second').flush({});
  });
});
