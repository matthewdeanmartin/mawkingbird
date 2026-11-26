import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
  provideHttpClient,
  withInterceptors,
  withXhr,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionMeterInterceptor } from './connection-meter.interceptor';
import {
  MAX_RETRY_AFTER_MS,
  READ_POLICY,
  attemptTimeout,
  readPolicy,
  requestPolicyInterceptor,
  retryDelay,
  retryable,
} from './request-policy';

const URL = '/api/v1/timelines/home';

describe('request policy helpers', () => {
  it('retries only statuses where a repeat read can help', () => {
    expect([0, 408, 429, 502, 503, 504].every(retryable)).toBe(true);
    expect([400, 401, 403, 404, 422, 500].some(retryable)).toBe(false);
  });

  it('waits longer per attempt on a slow or unstable connection', () => {
    expect(attemptTimeout(READ_POLICY, 'good')).toBe(20_000);
    expect(attemptTimeout(READ_POLICY, 'slow')).toBe(40_000);
    expect(attemptTimeout(READ_POLICY, 'flaky')).toBe(40_000);
  });

  it('jitters backoff around the base delay', () => {
    const err = new HttpErrorResponse({ status: 0 });
    expect(retryDelay(1, READ_POLICY, err, 0, () => 0)).toBe(700);
    expect(retryDelay(1, READ_POLICY, err, 0, () => 1)).toBe(1300);
    expect(retryDelay(2, READ_POLICY, err, 0, () => 0.5)).toBe(3000);
    expect(retryDelay(5, READ_POLICY, err, 0, () => 0.5)).toBe(3000);
  });

  it('honours Retry-After in seconds or as a date, within a limit', () => {
    const after = (value: string) =>
      new HttpErrorResponse({ status: 429, headers: new HttpHeaders({ 'Retry-After': value }) });
    expect(retryDelay(1, READ_POLICY, after('2'))).toBe(2000);
    const now = Date.UTC(2026, 10, 21, 12, 0, 0);
    expect(retryDelay(1, READ_POLICY, after(new Date(now + 5000).toUTCString()), now)).toBe(5000);
    expect(retryDelay(1, READ_POLICY, after(String(MAX_RETRY_AFTER_MS / 1000 + 60)))).toBeNull();
  });
});

describe('requestPolicyInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withXhr(),
          withInterceptors([requestPolicyInterceptor, connectionMeterInterceptor]),
        ),
        provideHttpClientTesting(),
      ],
    });
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

  it('leaves requests without a policy alone', () => {
    let failed = false;
    http.get(URL).subscribe({ error: () => (failed = true) });
    httpMock.expectOne(URL).error(new ProgressEvent('error'), { status: 0 });
    vi.advanceTimersByTime(10_000);
    httpMock.expectNone(URL);
    expect(failed).toBe(true);
  });

  it('retries a dropped read after a backoff and delivers the answer', () => {
    let body: unknown = null;
    http.get(URL, { context: readPolicy() }).subscribe((b) => (body = b));
    httpMock.expectOne(URL).error(new ProgressEvent('error'), { status: 0 });
    httpMock.expectNone(URL);
    vi.advanceTimersByTime(1_000);
    httpMock.expectOne(URL).flush([{ id: '1' }]);
    expect(body).toEqual([{ id: '1' }]);
  });

  it('gives up after the configured retries', () => {
    let error: HttpErrorResponse | null = null;
    http.get(URL, { context: readPolicy() }).subscribe({ error: (e) => (error = e) });
    httpMock.expectOne(URL).flush('', { status: 503, statusText: 'Unavailable' });
    vi.advanceTimersByTime(1_000);
    httpMock.expectOne(URL).flush('', { status: 503, statusText: 'Unavailable' });
    vi.advanceTimersByTime(3_000);
    httpMock.expectOne(URL).flush('', { status: 503, statusText: 'Unavailable' });
    vi.advanceTimersByTime(10_000);
    httpMock.expectNone(URL);
    expect(error!.status).toBe(503);
  });

  it('does not retry a client error', () => {
    let error: HttpErrorResponse | null = null;
    http.get(URL, { context: readPolicy() }).subscribe({ error: (e) => (error = e) });
    httpMock.expectOne(URL).flush('', { status: 404, statusText: 'Not Found' });
    vi.advanceTimersByTime(10_000);
    httpMock.expectNone(URL);
    expect(error!.status).toBe(404);
  });

  it('never retries a write', () => {
    let failed = false;
    http.post(URL, {}, { context: readPolicy() }).subscribe({ error: () => (failed = true) });
    httpMock.expectOne(URL).error(new ProgressEvent('error'), { status: 0 });
    vi.advanceTimersByTime(10_000);
    httpMock.expectNone(URL);
    expect(failed).toBe(true);
  });

  it('abandons a hung attempt as status 0 and retries it', () => {
    let body: unknown = null;
    http.get(URL, { context: readPolicy() }).subscribe((b) => (body = b));
    const hung = httpMock.expectOne(URL);
    vi.advanceTimersByTime(READ_POLICY.attemptTimeoutMs);
    expect(hung.cancelled).toBe(true);
    vi.advanceTimersByTime(1_000);
    httpMock.expectOne(URL).flush({ ok: true });
    expect(body).toEqual({ ok: true });
  });
});
