import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CorsProxySettings } from '../cors-proxy/cors-proxy-settings';
import { ProxyConsent } from '../proxy-consent-store';
import { TwitterApiError } from './twitter-errors';
import { TwitterSettings } from './twitter-settings';
import { TwitterUsage } from './twitter-usage';
import { buildUrl, TwitterProxyRequired, TwitterTransport } from './twitter-transport';
import { enableProxyFlags } from '../../testing/enable-proxy-flags';

const PROBE = { path: '/twitter/user/info', params: { userName: 'jack' } };

describe('TwitterTransport', () => {
  let transport: TwitterTransport;
  let httpMock: HttpTestingController;
  let settings: TwitterSettings;
  let proxySettings: CorsProxySettings;
  let consent: ProxyConsent;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    // These specs use a third-party proxy as the vehicle for testing proxy
    enableProxyFlags();
    transport = TestBed.inject(TwitterTransport);
    httpMock = TestBed.inject(HttpTestingController);
    settings = TestBed.inject(TwitterSettings);
    proxySettings = TestBed.inject(CorsProxySettings);
    consent = TestBed.inject(ProxyConsent);

    settings.setKey('twitterapi-io', 'tw-key');
    settings.activate('twitterapi-io');
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Configure a proxy that forwards headers, and consent to it. */
  function configureConsentedProxy(): void {
    proxySettings.select('corssh');
    proxySettings.setKey('proxy-key');
    consent.grant('twitterapi-io', 'corssh');
  }

  describe('refusing to spend money before it can succeed', () => {
    it('sends nothing at all when no proxy is configured', async () => {
      // The core of the proxy-first design: an unconfigured app costs zero
      // requests and zero seconds, rather than firing a doomed direct call.
      await expect(firstValueFrom(transport.request(PROBE))).rejects.toBeInstanceOf(
        TwitterProxyRequired,
      );
      httpMock.expectNone(() => true);
    });

    it('reports that no proxy is configured, distinctly from missing consent', async () => {
      const error = await firstValueFrom(transport.request(PROBE)).catch((e: unknown) => e);
      expect((error as TwitterProxyRequired).noProxyConfigured).toBe(true);
    });

    it('sends nothing when a proxy exists but consent has not been given', async () => {
      proxySettings.select('corssh');
      proxySettings.setKey('proxy-key');

      const error = await firstValueFrom(transport.request(PROBE)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(TwitterProxyRequired);
      // Distinct from the above: the fix is a click, not a setup task.
      expect((error as TwitterProxyRequired).noProxyConfigured).toBe(false);
      httpMock.expectNone(() => true);
    });

    it('refuses when no key is stored, rather than firing a billable 401', async () => {
      settings.clearKey('twitterapi-io');
      configureConsentedProxy();

      const error = await firstValueFrom(transport.request(PROBE)).catch((e: unknown) => e);
      expect((error as TwitterApiError).code).toBe('INVALID_CONFIGURATION');
      httpMock.expectNone(() => true);
    });
  });

  describe('the daily spending limit', () => {
    it('refuses without sending once the hard limit is reached', async () => {
      // Checked before the request, not after: a limit that only reported
      // afterwards would be a receipt.
      configureConsentedProxy();
      const usage = TestBed.inject(TwitterUsage);
      usage.setLimits(1, 2);
      usage.record(2);

      const error = await firstValueFrom(transport.request(PROBE)).catch((e: unknown) => e);
      expect((error as TwitterApiError).code).toBe('INVALID_CONFIGURATION');
      expect((error as TwitterApiError).message).toMatch(/daily limit/i);
      httpMock.expectNone(() => true);
    });

    it('counts a request at send time, not on success', async () => {
      // A failed or timed-out request has still been received and billed;
      // counting only successes under-reports exactly when things go wrong.
      configureConsentedProxy();
      const usage = TestBed.inject(TwitterUsage);
      const promise = firstValueFrom(transport.request(PROBE)).catch(() => null);
      httpMock
        .expectOne((r) => r.url.includes('proxy.cors.sh'))
        .flush({}, { status: 401, statusText: 'Unauthorized' });
      await promise;
      expect(usage.today()).toBe(1);
    });

    it('counts the direct probe too', async () => {
      const usage = TestBed.inject(TwitterUsage);
      const promise = firstValueFrom(transport.probeDirect(PROBE));
      httpMock
        .expectOne((r) => r.url.startsWith('https://api.twitterapi.io'))
        .error(new ProgressEvent('error'), { status: 0 });
      await promise;
      expect(usage.today()).toBe(1);
    });
  });

  describe('the proxied request', () => {
    it('coalesces simultaneous Mawkingbird reads without sharing the provider result', async () => {
      vi.useFakeTimers();
      try {
        proxySettings.select('mawkingbird');
        consent.grant('twitterapi-io', 'mawkingbird');
        const first = firstValueFrom(transport.request({ ...PROBE, params: { userName: 'one' } }));
        const second = firstValueFrom(transport.request({ ...PROBE, params: { userName: 'two' } }));
        await vi.advanceTimersByTimeAsync(20);

        const request = httpMock.expectOne(
          (candidate) =>
            candidate.method === 'POST' && candidate.url.endsWith('/batch?route=twitterapi'),
        );
        expect(request.request.headers.get('X-API-Key')).toBe('tw-key');
        const sent = JSON.parse(request.request.body as string) as {
          requests: { id: string; url: string }[];
        };
        request.flush({
          results: sent.requests.map(({ id, url }) => ({
            id,
            status: 200,
            ok: true,
            body: JSON.stringify({
              status: 'success',
              user: new URL(url).searchParams.get('userName'),
            }),
          })),
        });
        await expect(first).resolves.toMatchObject({ user: 'one' });
        await expect(second).resolves.toMatchObject({ user: 'two' });
        expect(TestBed.inject(TwitterUsage).today()).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('carries both credentials and never calls the API directly', async () => {
      configureConsentedProxy();
      const promise = firstValueFrom(transport.request<{ status: string }>(PROBE));

      // Never the bare API host — that request is known to be impossible.
      httpMock.expectNone((r) => r.url.startsWith('https://api.twitterapi.io'));

      const req = httpMock.expectOne((r) => r.url.includes('proxy.cors.sh'));
      // The source's key, for TwitterAPI.io...
      expect(req.request.headers.get('X-API-Key')).toBe('tw-key');
      // ...and the proxy's own key, for CORS.SH. Two parties, two credentials.
      expect(req.request.headers.get('x-cors-api-key')).toBe('proxy-key');

      req.flush({ status: 'success', msg: 'success', data: { id: '12' } });
      await expect(promise).resolves.toEqual(expect.objectContaining({ status: 'success' }));
    });

    it('encodes the target URL exactly once', async () => {
      configureConsentedProxy();
      const promise = firstValueFrom(
        transport.request({ path: '/twitter/tweet/advanced_search', params: { query: '#a b&c' } }),
      );
      const req = httpMock.expectOne((r) => r.url.includes('proxy.cors.sh'));
      // Double-encoding is a bug this repo has shipped before. `%2523` would be
      // an encoded '%23' — i.e. encoded twice.
      expect(req.request.urlWithParams).not.toContain('%2523');
      req.flush({ status: 'success' });
      await promise;
    });
  });

  describe('HTTP 200 is not success', () => {
    it('throws on an error body delivered under a 200', async () => {
      // Measured reality: a proxy can relay a 403 body under its own 200.
      configureConsentedProxy();
      const promise = firstValueFrom(transport.request(PROBE));
      httpMock
        .expectOne((r) => r.url.includes('proxy.cors.sh'))
        .flush({ error: 'Forbidden', message: 'API key required. Please include x-api-key' });

      const error = await promise.catch((e: unknown) => e);
      expect((error as TwitterApiError).code).toBe('INVALID_API_KEY');
    });

    it('passes a genuine success envelope through', async () => {
      configureConsentedProxy();
      const promise = firstValueFrom(transport.request<{ data: { id: string } }>(PROBE));
      httpMock
        .expectOne((r) => r.url.includes('proxy.cors.sh'))
        .flush({ status: 'success', data: { id: '12' } });
      await expect(promise).resolves.toEqual(expect.objectContaining({ data: { id: '12' } }));
    });
  });

  describe('retry policy', () => {
    it('does not retry a rejected key', async () => {
      // Retrying a 401 spends money to be told the same thing again.
      configureConsentedProxy();
      const promise = firstValueFrom(transport.request(PROBE));
      httpMock
        .expectOne((r) => r.url.includes('proxy.cors.sh'))
        .flush({ error: 'bad key' }, { status: 401, statusText: 'Unauthorized' });

      await expect(promise).rejects.toBeInstanceOf(TwitterApiError);
      httpMock.expectNone(() => true);
    });

    it('does not retry an out-of-credits response', async () => {
      configureConsentedProxy();
      const promise = firstValueFrom(transport.request(PROBE));
      httpMock
        .expectOne((r) => r.url.includes('proxy.cors.sh'))
        .flush({}, { status: 402, statusText: 'Payment Required' });

      await expect(promise).rejects.toBeInstanceOf(TwitterApiError);
      httpMock.expectNone(() => true);
    });
  });

  describe('probeDirect', () => {
    it('calls the API host with no proxy, so the user can watch it fail', async () => {
      const promise = firstValueFrom(transport.probeDirect(PROBE));
      const req = httpMock.expectOne((r) => r.url.startsWith('https://api.twitterapi.io'));
      expect(req.request.headers.get('X-API-Key')).toBe('tw-key');
      req.error(new ProgressEvent('error'), { status: 0 });
      // A failure is the expected answer, and is reported as a verdict rather
      // than an exception — nothing has gone wrong with the app.
      await expect(promise).resolves.toBe(false);
    });

    it('reports true if the service ever starts answering browsers', async () => {
      const promise = firstValueFrom(transport.probeDirect(PROBE));
      httpMock
        .expectOne((r) => r.url.startsWith('https://api.twitterapi.io'))
        .flush({ status: 'success', data: {} });
      await expect(promise).resolves.toBe(true);
    });

    it('reports false when the body carries an error under a 200', async () => {
      const promise = firstValueFrom(transport.probeDirect(PROBE));
      httpMock
        .expectOne((r) => r.url.startsWith('https://api.twitterapi.io'))
        .flush({ error: 'Forbidden' });
      await expect(promise).resolves.toBe(false);
    });
  });
});

describe('buildUrl', () => {
  const config = {
    entry: {
      id: 'twitterapi-io' as const,
      label: 'TwitterAPI.io',
      pitch: '',
      baseUrl: 'https://api.twitterapi.io',
      authHeader: 'X-API-Key',
      authPrefix: '',
      keyUrl: '',
      pricingNote: '',
      homepage: '',
      implemented: true,
    },
    auth: { header: 'X-API-Key', value: 'k' },
  };

  it('joins the path to the base URL', () => {
    expect(buildUrl(config, { path: '/twitter/user/info' })).toBe(
      'https://api.twitterapi.io/twitter/user/info',
    );
  });

  it('encodes advanced-search syntax once', () => {
    const url = buildUrl(config, {
      path: '/twitter/tweet/advanced_search',
      params: { query: 'from:jack filter:media' },
    });
    expect(url).toContain('query=from%3Ajack+filter%3Amedia');
  });

  it('omits empty and undefined parameters', () => {
    const url = buildUrl(config, { path: '/x', params: { a: '', b: undefined, c: 'keep' } });
    expect(url).toBe('https://api.twitterapi.io/x?c=keep');
  });

  it('keeps large numeric ids as strings', () => {
    // Post ids exceed Number.MAX_SAFE_INTEGER; they must never round-trip
    // through a JS number (spec §8.1).
    const id = '1833951636005552366';
    expect(buildUrl(config, { path: '/x', params: { tweetId: id } })).toContain(id);
  });
});
