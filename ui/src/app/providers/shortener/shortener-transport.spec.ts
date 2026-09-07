import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CorsProxySettings } from '../cors-proxy/cors-proxy-settings';
import { ShortenerProxyConsent } from './proxy-consent';
import { LinkProviderError } from './shortener-errors';
import { ShortenerSettings } from './shortener-settings';
import { ProxyConsentRequired, ShortenerTransport } from './shortener-transport';
import { enableProxyFlags } from '../../testing/enable-proxy-flags';

describe('ShortenerTransport', () => {
  let transport: ShortenerTransport;
  let httpMock: HttpTestingController;
  let settings: ShortenerSettings;
  let proxySettings: CorsProxySettings;
  let consent: ShortenerProxyConsent;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    // These specs use a third-party proxy as the vehicle for testing proxy
    enableProxyFlags();
    transport = TestBed.inject(ShortenerTransport);
    httpMock = TestBed.inject(HttpTestingController);
    settings = TestBed.inject(ShortenerSettings);
    proxySettings = TestBed.inject(CorsProxySettings);
    consent = TestBed.inject(ShortenerProxyConsent);

    settings.setKey('dub', 'dub-token');
    settings.activate('dub');
  });

  afterEach(() => {
    httpMock.verify();
  });

  const spec = { method: 'GET', url: 'https://api.dub.co/links', idempotent: true } as const;

  it('goes direct first, with the provider auth header', async () => {
    const result = transport.request<{ ok: boolean }>('dub', spec);
    const promise = firstValueFrom(result);

    const req = httpMock.expectOne('https://api.dub.co/links');
    expect(req.request.headers.get('Authorization')).toBe('Bearer dub-token');
    req.flush({ ok: true });

    expect(await promise).toEqual({ ok: true });
  });

  it('asks the caller to configure a proxy when a direct request is CORS-blocked', async () => {
    const promise = firstValueFrom(transport.request('dub', spec));

    httpMock.expectOne('https://api.dub.co/links').error(new ProgressEvent('error'), { status: 0 });

    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProxyConsentRequired);
    expect((error as ProxyConsentRequired).noProxyConfigured).toBe(true);
  });

  it('refuses to use a configured proxy until consent is recorded', async () => {
    proxySettings.select('allorigins');

    const promise = firstValueFrom(transport.request('dub', spec));
    httpMock.expectOne('https://api.dub.co/links').error(new ProgressEvent('error'), { status: 0 });

    const error = await promise.catch((e: unknown) => e);
    // The whole point: a configured proxy is not permission to send the key.
    expect(error).toBeInstanceOf(ProxyConsentRequired);
    expect((error as ProxyConsentRequired).noProxyConfigured).toBe(false);
  });

  it('retries through the proxy once consent is on file', async () => {
    proxySettings.select('allorigins');
    consent.grant('dub', 'allorigins');

    const promise = firstValueFrom(transport.request<{ ok: boolean }>('dub', spec));
    httpMock.expectOne('https://api.dub.co/links').error(new ProgressEvent('error'), { status: 0 });

    const proxied = httpMock.expectOne((req) =>
      req.url.startsWith('https://api.allorigins.win/raw'),
    );
    // Both credentials ride along: one authenticates to the shortener, the
    // other would authenticate to the proxy if it needed a key.
    expect(proxied.request.headers.get('Authorization')).toBe('Bearer dub-token');
    proxied.flush({ ok: true });

    expect(await promise).toEqual({ ok: true });
  });

  it('does not reuse consent granted for a different proxy', async () => {
    proxySettings.select('allorigins');
    consent.grant('dub', 'corssh');

    const promise = firstValueFrom(transport.request('dub', spec));
    httpMock.expectOne('https://api.dub.co/links').error(new ProgressEvent('error'), { status: 0 });

    // A different proxy is a different company reading the key.
    await expect(promise).rejects.toBeInstanceOf(ProxyConsentRequired);
  });

  it('surfaces an ordinary HTTP failure as a normalized error, not a proxy prompt', async () => {
    const promise = firstValueFrom(transport.request('dub', spec));

    httpMock.expectOne('https://api.dub.co/links').flush(null, { status: 401, statusText: 'no' });

    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LinkProviderError);
    expect((error as LinkProviderError).code).toBe('AUTHENTICATION_FAILED');
  });

  it('fails fast when no shortener is configured', async () => {
    settings.clearKey('dub');

    const error = await firstValueFrom(transport.request('dub', spec)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LinkProviderError);
    httpMock.expectNone('https://api.dub.co/links');
  });

  it('sends no Accept header when the caller asks to stay CORS-simple', async () => {
    // The bug this guards: `Accept: application/json` is not CORS-safelisted, so
    // it forces a preflight. is.gd answers OPTIONS without
    // `Access-Control-Allow-Headers`, so the preflight fails and the real request
    // is never sent — a service that works fine is made to look CORS-blocked.
    settings.activate('isgd');
    const promise = firstValueFrom(
      transport.request('isgd', {
        method: 'GET',
        url: 'https://is.gd/create.php?format=json&url=https%3A%2F%2Fexample.com%2F',
        idempotent: true,
        simpleRequest: true,
      }),
    );

    const req = httpMock.expectOne((r) => r.url.startsWith('https://is.gd/create.php'));
    expect(req.request.headers.has('Accept')).toBe(false);
    req.flush({ shorturl: 'https://is.gd/abc' });

    await promise;
  });

  it('still sends Accept for providers that did not ask to stay simple', async () => {
    const promise = firstValueFrom(transport.request('dub', spec));

    const req = httpMock.expectOne('https://api.dub.co/links');
    expect(req.request.headers.get('Accept')).toBe('application/json');
    req.flush({});

    await promise;
  });

  it('blames the proxy, not the shortener, when the proxy leg 5xxs', async () => {
    // AllOrigins returning its own 500 must not read as "your API key is bad".
    // Non-idempotent so the 500 is final rather than retried with a backoff.
    proxySettings.select('allorigins');
    consent.grant('dub', 'allorigins');

    const promise = firstValueFrom(transport.request('dub', { ...spec, idempotent: false }));
    httpMock.expectOne('https://api.dub.co/links').error(new ProgressEvent('error'), { status: 0 });
    httpMock
      .expectOne((r) => r.url.startsWith('https://api.allorigins.win/raw'))
      .flush('<html>500</html>', { status: 500, statusText: 'Internal Server Error' });

    const error = (await promise.catch((e: unknown) => e)) as LinkProviderError;
    expect(error).toBeInstanceOf(LinkProviderError);
    expect(error.message).toContain('AllOrigins');
    expect(error.message).toContain('never reached the shortener');
  });

  it('says the proxy answered without CORS headers when its leg also dies', async () => {
    // An error page served without CORS headers: the browser blocks the proxy's
    // reply too, so nothing at all can be concluded about the shortener.
    proxySettings.select('allorigins');
    consent.grant('dub', 'allorigins');

    const promise = firstValueFrom(transport.request('dub', spec));
    httpMock.expectOne('https://api.dub.co/links').error(new ProgressEvent('error'), { status: 0 });
    httpMock
      .expectOne((r) => r.url.startsWith('https://api.allorigins.win/raw'))
      .error(new ProgressEvent('error'), { status: 0 });

    const error = (await promise.catch((e: unknown) => e)) as LinkProviderError;
    expect(error.code).toBe('CORS_BLOCKED');
    expect(error.message).toContain('AllOrigins');
  });

  it('records which leg carried the request, for the reachability probe', async () => {
    proxySettings.select('allorigins');
    consent.grant('dub', 'allorigins');

    const promise = firstValueFrom(transport.request('dub', spec));
    httpMock.expectOne('https://api.dub.co/links').error(new ProgressEvent('error'), { status: 0 });
    httpMock.expectOne((r) => r.url.startsWith('https://api.allorigins.win/raw')).flush({ ok: 1 });

    await promise;
    expect(transport.lastRouteUsed).toBe('proxy');
  });

  it('never retries a create, even on a transient failure', async () => {
    const promise = firstValueFrom(
      transport.request('dub', {
        method: 'POST',
        url: 'https://api.dub.co/links',
        idempotent: false,
      }),
    );

    httpMock.expectOne('https://api.dub.co/links').flush(null, { status: 503, statusText: 'down' });

    // A retried create can produce two links where the user asked for one.
    await expect(promise).rejects.toBeTruthy();
    httpMock.expectNone('https://api.dub.co/links');
  });
});
