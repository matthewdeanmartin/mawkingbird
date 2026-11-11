import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CorsProxySettings } from '../cors-proxy/cors-proxy-settings';
import { ShortenerProxyConsent } from './proxy-consent';
import { ShortenerReachability } from './shortener-reachability';
import { ShortenerSettings } from './shortener-settings';
import { enableProxyFlags } from '../../testing/enable-proxy-flags';

describe('ShortenerReachability', () => {
  let reachability: ShortenerReachability;
  let httpMock: HttpTestingController;
  let settings: ShortenerSettings;
  let proxySettings: CorsProxySettings;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    // These specs use a third-party proxy as the vehicle for testing proxy
    enableProxyFlags();
    reachability = TestBed.inject(ShortenerReachability);
    httpMock = TestBed.inject(HttpTestingController);
    settings = TestBed.inject(ShortenerSettings);
    proxySettings = TestBed.inject(CorsProxySettings);
    settings.activate('isgd');
  });

  afterEach(() => {
    httpMock.verify();
  });

  // A read, not a create: pressing Test must leave nothing behind, and probing
  // the write path once reported is.gd unreachable while its reads were fine.
  const isgdRequest = () =>
    httpMock.expectOne((r) => r.url.startsWith('https://is.gd/forward.php'));

  const dubRequest = () => httpMock.expectOne((r) => r.url.startsWith('https://api.dub.co'));

  it('reports a direct success as needing no proxy', async () => {
    const promise = firstValueFrom(reachability.probe('isgd'));
    isgdRequest().flush({ shorturl: 'https://is.gd/abc' });

    const result = await promise;
    expect(result.status).toBe('direct');
    expect(result.message).toContain('No CORS proxy needed');
  });

  it('probes without an Accept header, the same way a real is.gd call goes out', async () => {
    // A probe that took a different route than the feature could pass while the
    // feature fails — which is how the preflight bug went unnoticed.
    const promise = firstValueFrom(reachability.probe('isgd'));
    const req = isgdRequest();
    expect(req.request.headers.has('Accept')).toBe(false);
    req.flush({ shorturl: 'https://is.gd/abc' });

    await promise;
  });

  // These four use Dub rather than is.gd. is.gd is marked `corsOpen`, so an
  // opaque failure there is deliberately *not* treated as a CORS problem and
  // never reaches the proxy — which makes it the wrong vehicle for testing proxy
  // behaviour. Dub genuinely refuses browsers, so it exercises the real path.
  it('reports that a proxy is needed when direct fails and none is configured', async () => {
    settings.setKey('dub', 'dub-token');
    settings.activate('dub');
    const promise = firstValueFrom(reachability.probe('dub'));
    dubRequest().error(new ProgressEvent('error'), { status: 0 });

    const result = await promise;
    expect(result.status).toBe('needs-proxy');
    expect(result.message).toContain('no CORS proxy is configured');
  });

  it('reports the proxy route when direct fails but the proxy carries it', async () => {
    settings.setKey('dub', 'dub-token');
    settings.activate('dub');
    proxySettings.select('allorigins');
    TestBed.inject(ShortenerProxyConsent).grant('dub', 'allorigins');

    const promise = firstValueFrom(reachability.probe('dub'));
    dubRequest().error(new ProgressEvent('error'), { status: 0 });
    httpMock
      .expectOne((r) => r.url.startsWith('https://api.allorigins.win/raw'))
      .flush({ shorturl: 'https://is.gd/abc' });

    const result = await promise;
    expect(result.status).toBe('proxy');
    expect(result.message).toContain('AllOrigins');
  });

  it('reports unreachable when the proxy leg fails too', async () => {
    // The AllOrigins-is-500ing case, which is what prompted this probe.
    settings.setKey('dub', 'dub-token');
    settings.activate('dub');
    proxySettings.select('allorigins');
    TestBed.inject(ShortenerProxyConsent).grant('dub', 'allorigins');

    const promise = firstValueFrom(reachability.probe('dub'));
    dubRequest().error(new ProgressEvent('error'), { status: 0 });
    httpMock
      .expectOne((r) => r.url.startsWith('https://api.allorigins.win/raw'))
      .flush('<html>500</html>', { status: 500, statusText: 'Internal Server Error' });

    const result = await promise;
    expect(result.status).toBe('unreachable');
    // Names the proxy, so the user knows which hop to blame.
    expect(result.message).toContain('AllOrigins');
  });

  it('reports that configured is not consented', async () => {
    settings.setKey('dub', 'dub-token');
    settings.activate('dub');
    proxySettings.select('allorigins');

    const promise = firstValueFrom(reachability.probe('dub'));
    dubRequest().error(new ProgressEvent('error'), { status: 0 });

    const result = await promise;
    expect(result.status).toBe('needs-consent');
    expect(result.message).toContain('until you consent');
    httpMock.expectNone((r) => r.url.startsWith('https://api.allorigins.win/raw'));
  });

  it('treats a real answer from the service as reachable, whatever it said', async () => {
    // A 401 means the request arrived. That is the question being asked here.
    settings.setKey('dub', 'dub-token');
    settings.activate('dub');

    const promise = firstValueFrom(reachability.probe('dub'));
    httpMock
      .expectOne((r) => r.url.startsWith('https://api.dub.co'))
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    const result = await promise;
    expect(result.status).toBe('direct');
  });

  /**
   * The bug this pins, end to end: is.gd's database broke, so a create answered
   * `Error, database insert failed` as plain text with no ACAO. The browser saw
   * `status: 0`, the app inferred CORS, offered the proxy, the proxy had no route
   * to is.gd and said 403, and the user was told "This key is not allowed to do
   * that" — about a service with no accounts and no keys.
   *
   * A service that does send CORS headers gets no proxy offer, because for it an
   * opaque failure is evidence of something a proxy cannot fix.
   */
  it('never offers a proxy for a service that answers browsers directly', async () => {
    proxySettings.select('allorigins');
    TestBed.inject(ShortenerProxyConsent).grant('isgd', 'allorigins');

    const promise = firstValueFrom(reachability.probe('isgd'));
    isgdRequest().error(new ProgressEvent('error'), { status: 0 });

    const result = await promise;
    expect(result.status).toBe('unreachable');
    // The decisive assertion: consent was granted and a proxy was configured, and
    // it still was not tried.
    httpMock.expectNone((r) => r.url.startsWith('https://api.allorigins.win/raw'));
  });

  it('never claims to know why a request failed', async () => {
    // A browser cannot distinguish CORS from DNS from offline, so no verdict may
    // assert a cause. Guarding the copy, since that is where it would creep in.
    const promise = firstValueFrom(reachability.probe('isgd'));
    isgdRequest().error(new ProgressEvent('error'), { status: 0 });

    const result = await promise;
    expect(result.message).not.toMatch(/blocked by CORS|CORS error|is offline/i);
  });
});
