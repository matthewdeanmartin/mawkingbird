import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { externalFetch } from '../providers/external-fetch';
import { Server } from '../server';
import { ApiMetrics } from './api-metrics';
import { MawkingbirdMetrics } from './mawkingbird-metrics';
import { CorsProxySettings } from '../providers/cors-proxy/cors-proxy-settings';
import { metricsInterceptor } from './metrics.interceptor';
import { DiagnosticLog } from '../diagnostic-log';

describe('metricsInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let metrics: ApiMetrics;
  let mawkingbird: MawkingbirdMetrics;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([metricsInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(Server).setBaseUrl('https://mastodon.social');
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    metrics = TestBed.inject(ApiMetrics);
    mawkingbird = TestBed.inject(MawkingbirdMetrics);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('counts Anonymous public requests to the selected server', () => {
    http
      .get('https://mastodon.social/api/v1/timelines/public', { context: externalFetch() })
      .subscribe();
    httpMock.expectOne('https://mastodon.social/api/v1/timelines/public').flush([]);

    expect(metrics.totals().count).toBe(1);
  });

  it('still excludes external providers and feeds', () => {
    http.get('https://feeds.example/news.rss', { context: externalFetch() }).subscribe();
    httpMock.expectOne('https://feeds.example/news.rss').flush('ok');

    expect(metrics.totals().count).toBe(0);
  });

  // -------------------------------------------------------------- Mawkingbird

  /** Stub the proxy settings so the chosen entry decides the billing tier. */
  function chooseProxy(id: string | null): void {
    TestBed.resetTestingModule();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([metricsInterceptor])),
        provideHttpClientTesting(),
        {
          provide: CorsProxySettings,
          useValue: { chosen: () => (id === null ? null : { id }) },
        },
      ],
    });
    TestBed.inject(Server).setBaseUrl('https://mastodon.social');
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    metrics = TestBed.inject(ApiMetrics);
    mawkingbird = TestBed.inject(MawkingbirdMetrics);
  }

  it('records a Mawkingbird call without polluting the instance endpoint stats', () => {
    chooseProxy('mawkingbird-free');
    http.get('https://cors.mawkingbird.com/feeds?url=x', { context: externalFetch() }).subscribe();
    httpMock.expectOne((r) => r.url.startsWith('https://cors.mawkingbird.com')).flush('ok');

    expect(mawkingbird.totals().calls).toBe(1);
    // The endpoint table describes a Mastodon instance; this call is not one.
    expect(metrics.totals().count).toBe(0);
  });

  it('bills a proxied call to the paid tier when the supporter entry is chosen', () => {
    // The tier must come from the *chosen* entry rather than from the request's
    // headers: this interceptor is outermost and plusTokenInterceptor is last,
    // so the token is attached to a clone made downstream of here, and testing
    // for the header would label every proxied call free.
    chooseProxy('mawkingbird-plus');
    http.get('https://cors.mawkingbird.com/feeds?url=x', { context: externalFetch() }).subscribe();
    httpMock.expectOne((r) => r.url.startsWith('https://cors.mawkingbird.com')).flush('ok');

    expect(mawkingbird.totals().paid).toBe(1);
    expect(mawkingbird.totals().free).toBe(0);
  });

  it('bills a proxied call to the free tier on the free entry', () => {
    chooseProxy('mawkingbird-free');
    http.get('https://cors.mawkingbird.com/feeds?url=x', { context: externalFetch() }).subscribe();
    httpMock.expectOne((r) => r.url.startsWith('https://cors.mawkingbird.com')).flush('ok');

    expect(mawkingbird.totals().free).toBe(1);
    expect(mawkingbird.totals().paid).toBe(0);
  });

  it('counts a failed Mawkingbird call as an error, not as nothing', () => {
    chooseProxy('mawkingbird-free');
    http
      .get('https://cors.mawkingbird.com/feeds?url=x', { context: externalFetch() })
      .subscribe({ error: () => undefined });
    httpMock
      .expectOne((r) => r.url.startsWith('https://cors.mawkingbird.com'))
      .flush('nope', { status: 502, statusText: 'Bad Gateway' });

    expect(mawkingbird.totals().calls).toBe(1);
    expect(mawkingbird.totals().errors).toBe(1);
    expect(TestBed.inject(DiagnosticLog).entries().at(-1)).toMatchObject({
      level: 'error',
      area: 'Mockingbird HTTP',
      event: 'request:failed',
    });
  });

  it('leaves an ordinary feed host out of the Mawkingbird counters', () => {
    chooseProxy('mawkingbird-free');
    http.get('https://feeds.example/news.rss', { context: externalFetch() }).subscribe();
    httpMock.expectOne('https://feeds.example/news.rss').flush('ok');

    expect(mawkingbird.totals().calls).toBe(0);
  });
});
