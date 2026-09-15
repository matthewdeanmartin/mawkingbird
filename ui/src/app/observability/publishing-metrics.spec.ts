import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DiagnosticLog } from '../diagnostic-log';
import { metricsInterceptor } from './metrics.interceptor';
import { publishingFetch, PublishingMetrics } from './publishing-metrics';
import { ApiMetrics } from './api-metrics';
import { CorsProxySettings } from '../providers/cors-proxy/cors-proxy-settings';
import { MawkingbirdMetrics } from './mawkingbird-metrics';

describe('Publishing request diagnostics', () => {
  let http: HttpClient;
  let mock: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([metricsInterceptor])),
        provideHttpClientTesting(),
        { provide: CorsProxySettings, useValue: { chosen: () => ({ id: 'mawkingbird-plus' }) } },
      ],
    });
    http = TestBed.inject(HttpClient);
    mock = TestBed.inject(HttpTestingController);
    TestBed.inject(DiagnosticLog).clear();
  });
  afterEach(() => {
    mock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('records service timing without retaining a destination, body or echoed error', () => {
    const url = 'https://tinyurl.com/api-create.php?url=private-message';
    http
      .post(url, 'private-body', { context: publishingFetch('tinyurl') })
      .subscribe({ error: () => undefined });
    mock
      .expectOne(url)
      .flush(
        { error: 'private-body secret-key private-message' },
        { status: 403, statusText: 'Forbidden' },
      );
    expect(TestBed.inject(PublishingMetrics).stats()).toEqual([
      { service: 'tinyurl', calls: 1, errors: 1, totalMs: expect.any(Number) },
    ]);
    const log = TestBed.inject(DiagnosticLog).toText();
    expect(log).toContain('request:complete');
    expect(log).toContain('tinyurl');
    expect(log).not.toMatch(/private-message|private-body|secret-key|api-create/);
    expect(TestBed.inject(ApiMetrics).totals().count).toBe(0);
  });

  it('counts proxy attempts both for the provider and the Mawkingbird allowance', () => {
    const url = 'https://cors.mawkingbird.com/?route=shortener&url=private-destination';
    http.get(url, { context: publishingFetch('dub', 'proxy') }).subscribe();
    mock.expectOne(url).flush({});
    expect(TestBed.inject(PublishingMetrics).stats()[0]).toMatchObject({
      service: 'dub',
      calls: 1,
      errors: 0,
    });
    expect(TestBed.inject(MawkingbirdMetrics).totals().calls).toBe(1);
    expect(TestBed.inject(DiagnosticLog).toText()).not.toContain('private-destination');
  });
});
