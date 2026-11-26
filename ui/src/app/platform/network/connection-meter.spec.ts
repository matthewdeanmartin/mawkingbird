import { HttpClient, provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { timeout } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { externalFetch } from '../http/external-fetch';
import { serverRole } from '../http/server-role';
import { CONNECTION_HISTORY_KEY, ConnectionMeter } from './connection-meter';
import { connectionMeterInterceptor } from './connection-meter.interceptor';
import { deserialize } from './connection-history';

/** The meter times requests with performance.now(), so fake it with the clock. */
const FAKED: NonNullable<Parameters<typeof vi.useFakeTimers>[0]>['toFake'] = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'Date',
  'performance',
];

describe('ConnectionMeter', () => {
  let meter: ConnectionMeter;
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr(), withInterceptors([connectionMeterInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    meter = TestBed.inject(ConnectionMeter);
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function fail(url: string, context = serverRole('home')): void {
    http.get(url, { context }).subscribe({ error: () => undefined });
    httpMock.expectOne(url).error(new ProgressEvent('error'), { status: 0 });
  }

  function succeed(url: string, context = serverRole('home')): void {
    http.get(url, { context }).subscribe();
    httpMock.expectOne(url).flush({});
  }

  it('starts with no verdict and shows nothing', () => {
    expect(meter.verdict()).toBe('unknown');
    expect(meter.bad()).toBe(false);
  });

  it('turns a run of unanswered requests into an offline verdict', () => {
    fail('/api/v1/timelines/home');
    fail('/api/v1/notifications');
    fail('/api/v1/timelines/home');
    expect(meter.verdict()).toBe('offline');
    expect(meter.bad()).toBe(true);
  });

  it('counts a server error as the network working', () => {
    for (let i = 0; i < 3; i++) {
      http.get('/api/v1/timelines/home').subscribe({ error: () => undefined });
      httpMock
        .expectOne('/api/v1/timelines/home')
        .flush('boom', { status: 503, statusText: 'Unavailable' });
    }
    expect(meter.verdict()).toBe('good');
  });

  it('ignores foreign-host failures but counts their answers', () => {
    const rss = externalFetch();
    for (let i = 0; i < 4; i++) fail('https://feeds.example/rss.xml', rss);
    expect(meter.assessment().samples).toBe(0);
    succeed('https://feeds.example/rss.xml', rss);
    expect(meter.assessment().samples).toBe(1);
  });

  it('ignores giving up on a slow foreign host', () => {
    vi.useFakeTimers({ toFake: FAKED });
    http
      .get('https://feeds.example/rss.xml', { context: externalFetch() })
      .pipe(timeout(8_000))
      .subscribe({ error: () => undefined });
    httpMock.expectOne('https://feeds.example/rss.xml');
    vi.advanceTimersByTime(8_000);
    expect(meter.assessment().samples).toBe(0);
  });

  it('records a long abandoned wait, but not a quick navigation cancel', () => {
    vi.useFakeTimers({ toFake: FAKED });
    const quick = http.get('/api/v1/timelines/home').subscribe();
    httpMock.expectOne('/api/v1/timelines/home');
    quick.unsubscribe();
    expect(meter.assessment().samples).toBe(0);

    http
      .get('/api/v1/notifications')
      .pipe(timeout(8_000))
      .subscribe({ error: () => undefined });
    httpMock.expectOne('/api/v1/notifications');
    vi.advanceTimersByTime(8_000);
    const samples = meter.historySnapshot().buckets.reduce((n, b) => n + b.n, 0);
    expect(samples).toBe(1);
    expect(meter.historySnapshot().buckets.at(-1)!.fail).toBe(1);
  });

  it('persists its history so a reload keeps the evidence', () => {
    vi.useFakeTimers({ toFake: FAKED });
    fail('/api/v1/timelines/home');
    succeed('/api/v1/timelines/home');
    vi.advanceTimersByTime(10_000);
    const stored = deserialize(localStorage.getItem(CONNECTION_HISTORY_KEY));
    expect(stored.buckets.reduce((n, b) => n + b.n, 0)).toBe(2);
    expect(stored.transitions.length).toBeGreaterThan(0);
  });

  it('notes the browser going offline at once', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    expect(meter.verdict()).toBe('offline');
    expect(meter.historySnapshot().transitions.at(-1)?.online).toBe(false);
  });

  it('probes once when the browser comes back online', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchSpy);
    try {
      window.dispatchEvent(new Event('online'));
      await vi.waitFor(() => expect(meter.lastProbe()).not.toBeNull());
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(String(url)).toMatch(/probe\.txt\?t=\d+$/);
      expect(init).toMatchObject({ cache: 'no-store' });
      expect(meter.lastProbe()!.outcome).toBe('ok');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
