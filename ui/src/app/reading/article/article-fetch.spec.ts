import { ExtensionBridge } from '../../platform/extension/extension-bridge';
import { HttpErrorResponse, HttpHeaders, withXhr } from '@angular/common/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ARTICLE_READ } from '../../platform/http/platform-http';
import { ArticleCache } from './article-cache';
import { ArticleResult } from './article-models';
import { CorsProxy } from '../../connections/cors-proxy/cors-proxy';
import { ArticleFetch, diagnoseHttpError } from './article-fetch';

/** Build the error Angular hands back for a proxied failure. */
function proxyError(
  status: number,
  headers: Record<string, string> = {},
  body: unknown = null,
): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: body,
    headers: new HttpHeaders(headers),
  });
}

describe('diagnoseHttpError', () => {
  it('reads a relayed bot-block rather than calling it a network failure', () => {
    // The case that motivated all of this: thenewstribune.com's own Cloudflare
    // answers 520 to a non-browser fetch. Before the source header existed this
    // became "Couldn't reach this page", which was flatly untrue — the page was
    // reached, and it refused.
    const failure = diagnoseHttpError(
      proxyError(520, { 'X-Proxy-Source': 'upstream', 'X-Proxy-Upstream-Status': '520' }),
    );
    expect(failure.diagnosis).toBe('bot-check');
    expect(failure.source).toBe('upstream');
    expect(failure.upstreamStatus).toBe(520);
  });

  it('treats the same status from the proxy itself as a network problem', () => {
    // Identical status, opposite meaning. Only the source header separates them.
    const failure = diagnoseHttpError(proxyError(520, { 'X-Proxy-Source': 'proxy' }));
    expect(failure.diagnosis).toBe('network');
  });

  it('separates our rate limit from the site’s', () => {
    expect(diagnoseHttpError(proxyError(429, { 'X-Proxy-Source': 'proxy' })).diagnosis).toBe(
      'rate-limited',
    );
    expect(diagnoseHttpError(proxyError(429, { 'X-Proxy-Source': 'upstream' })).diagnosis).toBe(
      'site-rate-limited',
    );
  });

  it('recognises the proxy’s own refusal sentences', () => {
    const cases: [string, string][] = [
      ['The upstream redirected more than 3 times.', 'redirect-loop'],
      ["The upstream response is 9999 bytes, over this route's 2048 byte limit.", 'too-large'],
      ['Disallowed content type.', 'not-html'],
      ['Route "feeds" does not reach 10.0.0.1.', 'blocked-destination'],
      ['The upstream did not respond within 20000ms.', 'upstream-timeout'],
    ];
    for (const [detail, expected] of cases) {
      const failure = diagnoseHttpError(
        proxyError(502, { 'X-Proxy-Source': 'proxy' }, JSON.stringify({ error: detail })),
      );
      expect(failure.diagnosis, detail).toBe(expected);
      expect(failure.detail, detail).toBe(detail);
    }
  });

  it('parses the proxy’s JSON body out of a text response', () => {
    // `responseType: 'text'` means Angular hands back a string even for JSON.
    const failure = diagnoseHttpError(
      proxyError(502, { 'X-Proxy-Source': 'proxy' }, '{"error":"Disallowed content type."}'),
    );
    expect(failure.detail).toBe('Disallowed content type.');
  });

  it('reports a missing page as missing', () => {
    expect(diagnoseHttpError(proxyError(404, { 'X-Proxy-Source': 'upstream' })).diagnosis).toBe(
      'not-found',
    );
  });

  it('reports a login wall as a bot check', () => {
    expect(diagnoseHttpError(proxyError(403, { 'X-Proxy-Source': 'upstream' })).diagnosis).toBe(
      'bot-check',
    );
  });

  it('survives an older proxy that sends no source header', () => {
    // A deploy-order guard: the client must not break when talking to a Worker
    // that predates these headers.
    const failure = diagnoseHttpError(proxyError(502));
    expect(failure.source).toBe('unknown');
    expect(failure.diagnosis).toBe('network');
  });

  it('records a failed connection as a network problem', () => {
    const failure = diagnoseHttpError(proxyError(0));
    expect(failure.diagnosis).toBe('network');
    expect(failure.status).toBe(0);
  });

  it('always carries the status through for display', () => {
    expect(diagnoseHttpError(proxyError(503, { 'X-Proxy-Source': 'upstream' })).status).toBe(503);
  });
});

describe('reading a relayed error body', () => {
  // The proxy cannot rewrite a relayed body — a relay that edits bodies is not
  // a relay — but the client can read it, and the good ones say something
  // worth repeating.
  const CLOUDFLARE_520 = JSON.stringify({
    type: 'https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-520/',
    title: 'Error 520: Web server is returning an unknown error',
    status: 520,
    detail: 'The origin web server sent a response that Cloudflare could not parse.',
    error_code: 520,
    zone: 'www.thenewstribune.com',
    cloudflare_error: true,
  });

  it('quotes the site’s own explanation and names whose it is', () => {
    const failure = diagnoseHttpError(
      proxyError(
        520,
        { 'X-Proxy-Source': 'upstream', 'X-Proxy-Upstream-Status': '520' },
        CLOUDFLARE_520,
      ),
    );
    expect(failure.diagnosis).toBe('bot-check');
    expect(failure.detail).toBe(
      'Error 520: Web server is returning an unknown error (www.thenewstribune.com)',
    );
  });

  it('does not dump raw JSON at the reader', () => {
    const failure = diagnoseHttpError(
      proxyError(520, { 'X-Proxy-Source': 'upstream' }, CLOUDFLARE_520),
    );
    expect(failure.detail).not.toContain('{');
    expect(failure.detail).not.toContain('error_code');
  });

  it('strips markup from an HTML error page', () => {
    const failure = diagnoseHttpError(
      proxyError(
        403,
        { 'X-Proxy-Source': 'upstream' },
        '<html><body><h1>Access denied</h1><p>You are a bot.</p></body></html>',
      ),
    );
    expect(failure.detail).toBe('Access denied You are a bot.');
  });

  it('falls back to message or detail when there is no title', () => {
    const failure = diagnoseHttpError(
      proxyError(503, { 'X-Proxy-Source': 'upstream' }, '{"message":"Service unavailable"}'),
    );
    expect(failure.detail).toBe('Service unavailable');
  });

  it('still prefers our own error field over anything else', () => {
    const failure = diagnoseHttpError(
      proxyError(
        502,
        { 'X-Proxy-Source': 'proxy' },
        '{"error":"Disallowed content type.","title":"ignored"}',
      ),
    );
    expect(failure.detail).toBe('Disallowed content type.');
  });
});

describe('reading the article route’s buffered failure', () => {
  // The `article` route replaces a failed body with the proxy's own document,
  // so the client has one shape to parse instead of guessing at whatever the
  // refusing party sent.
  const BUFFERED = JSON.stringify({
    error: 'The site answered HTTP 520.',
    source: 'upstream',
    upstreamStatus: 520,
    upstreamMessage: 'Error 520: Web server is returning an unknown error',
    host: 'www.thenewstribune.com',
    upstreamServer: 'cloudflare',
  });

  it('prefers the site’s quoted words over the proxy’s summary', () => {
    // `error` here is the proxy restating the status; `upstreamMessage` is what
    // the site actually said, and that is the more useful sentence.
    const failure = diagnoseHttpError(
      proxyError(520, { 'X-Proxy-Source': 'upstream', 'X-Proxy-Upstream-Status': '520' }, BUFFERED),
    );
    expect(failure.detail).toBe('Error 520: Web server is returning an unknown error');
    expect(failure.diagnosis).toBe('bot-check');
    expect(failure.upstreamStatus).toBe(520);
  });

  it('recognises a proxy that has not learned the article route yet', () => {
    // Deploy-order tolerance: the app can ship before the Worker. This must not
    // read as "your article is gone".
    const failure = diagnoseHttpError(
      proxyError(
        404,
        { 'X-Proxy-Source': 'proxy' },
        JSON.stringify({ error: 'No such route: "article".', source: 'proxy' }),
      ),
    );
    expect(failure.diagnosis).toBe('route-unavailable');
  });

  it('still reports a genuinely missing page as missing', () => {
    const failure = diagnoseHttpError(
      proxyError(404, { 'X-Proxy-Source': 'upstream' }, '<html>Not Found</html>'),
    );
    expect(failure.diagnosis).toBe('not-found');
  });
});

describe('native article expansion', () => {
  const url = 'https://publisher.example/old';
  let read: ReturnType<typeof vi.fn>;
  let service: ArticleFetch;
  let saved: Map<string, ArticleResult>;
  beforeEach(() => {
    saved = new Map();
    read = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: PLATFORM_ARTICLE_READ, useValue: read },
        {
          provide: CorsProxy,
          useValue: {
            available() {
              throw new Error('Native must not check proxy configuration');
            },
            proxyRequest() {
              throw new Error('Native must not request a proxy');
            },
          },
        },
        {
          provide: ArticleCache,
          useValue: {
            get: async (key: string) => saved.get(key) ?? null,
            put: async (key: string, value: ArticleResult) => {
              saved.set(key, value);
            },
          },
        },
      ],
    });
    service = TestBed.inject(ArticleFetch);
  });

  it('extracts inert HTML locally, resolves images against the final URL and reuses cache', async () => {
    const paragraph =
      '<p>' +
      'A local reader keeps the text accessible while the publisher remains the source. '.repeat(
        12,
      ) +
      '</p>';
    read.mockResolvedValue({
      status: 200,
      finalUrl: 'https://publisher.example/articles/new',
      body:
        '<html><head><title>Local reading</title></head><body><article><h1>Local reading</h1>' +
        paragraph.repeat(4) +
        '<img src="photo.jpg" onerror="window.compromised=true"><script>window.compromised=true</script><iframe src="http://127.0.0.1/"></iframe></article></body></html>',
    });
    expect(service.available()).toBe(true);
    const result = await service.expand(url);
    expect(result.article).not.toBeNull();
    expect(result.article!.markdown).toContain('A local reader');
    expect(result.article!.images).toContain('https://publisher.example/articles/photo.jpg');
    expect(result.article!.markdown).not.toMatch(/onerror|compromised|iframe/);
    expect(result.finalUrl).toBe('https://publisher.example/articles/new');
    expect((await service.expand(url)).fromCache).toBe(true);
    expect(read).toHaveBeenCalledExactlyOnceWith(url);
    TestBed.inject(HttpTestingController).verify();
  });

  it('preserves publisher rate limits without a proxy retry', async () => {
    read.mockResolvedValue({ status: 429, finalUrl: url, body: '' });
    const result = await service.expand(url);
    expect(result.diagnosis).toBe('site-rate-limited');
    expect(result.debug).toMatchObject({ status: 429, source: 'upstream' });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('explains native safety refusals and timeouts', async () => {
    for (const [kind, diagnosis] of [
      ['policy', 'blocked-destination'],
      ['too-large', 'too-large'],
      ['upstream-timeout', 'upstream-timeout'],
    ]) {
      read.mockRejectedValue({ kind, message: 'Native refusal detail' });
      const result = await service.expand(url, true);
      expect(result.diagnosis).toBe(diagnosis);
      expect(result.debug?.detail).toBe('Native refusal detail');
    }
    TestBed.inject(HttpTestingController).verify();
  });
});

describe('article expansion through Mawkingbird for Firefox', () => {
  const url = 'https://publisher.example/story';
  const paragraph =
    '<p>' + 'The extension reads this page from the reader’s own computer. '.repeat(12) + '</p>';
  let read: ReturnType<typeof vi.fn>;
  let service: ArticleFetch;

  beforeEach(() => {
    read = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: ExtensionBridge, useValue: { present: () => true, read } },
        {
          provide: CorsProxy,
          useValue: {
            available: () => true,
            label: () => 'Test proxy',
            proxyRequest: (target: string) => ({ url: `https://proxy.example/?u=${target}` }),
          },
        },
        {
          provide: ArticleCache,
          useValue: { get: async () => null, put: async () => undefined },
        },
      ],
    });
    service = TestBed.inject(ArticleFetch);
  });

  it('reads an allowed site through the extension instead of the proxy', async () => {
    read.mockResolvedValue({
      ok: true,
      status: 200,
      finalUrl: url,
      contentType: 'text/html',
      body: `<html><head><title>Story</title></head><body><article>${paragraph.repeat(4)}</article></body></html>`,
    });
    const result = await service.expand(url);
    expect(result.article?.markdown).toContain('reads this page');
    expect(read).toHaveBeenCalledWith(url, 'article');
    TestBed.inject(HttpTestingController).verify();
  });

  it('uses the proxy as before for a site the reader has not allowed', async () => {
    read.mockResolvedValue({
      ok: false,
      error: 'needs-access',
      origin: 'https://publisher.example',
    });
    const pending = service.expand(url);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const http = TestBed.inject(HttpTestingController);
    const request = http.match((r) => r.url.startsWith('https://proxy.example/'));
    expect(request.length).toBe(1);
    request[0].flush(`<html><body><article>${paragraph.repeat(4)}</article></body></html>`);
    expect((await pending).article).not.toBeNull();
  });
});

describe('article expansion with Mawkingbird for Firefox and no proxy', () => {
  const url = 'https://publisher.example/story';
  let read: ReturnType<typeof vi.fn>;
  let hasAccess: ReturnType<typeof vi.fn>;
  let service: ArticleFetch;

  beforeEach(() => {
    read = vi.fn();
    hasAccess = vi.fn(async () => false);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: ExtensionBridge, useValue: { present: () => true, read, hasAccess } },
        {
          provide: CorsProxy,
          useValue: {
            available: () => false,
            label: () => 'none',
            proxyRequest: () => {
              throw new Error('No proxy here');
            },
          },
        },
        { provide: ArticleCache, useValue: { get: async () => null, put: vi.fn() } },
      ],
    });
    service = TestBed.inject(ArticleFetch);
  });

  it('offers expansion with only the extension', () => {
    expect(service.available()).toBe(true);
  });

  it('names the site to allow, and caches nothing so a retry after allowing reads it', async () => {
    read.mockResolvedValue({
      ok: false,
      error: 'needs-access',
      origin: 'https://publisher.example',
    });
    const result = await service.expand(url);
    expect(result.article).toBeNull();
    expect(result.debug?.extensionAccess).toBe('https://publisher.example');
    expect(TestBed.inject(ArticleCache).put).not.toHaveBeenCalled();
    TestBed.inject(HttpTestingController).verify();
  });

  it('treats a read of an allowed site as local, outside the proxy quota', async () => {
    expect(await service.servesLocally(url)).toBe(false);
    hasAccess.mockResolvedValue(true);
    expect(await service.servesLocally(url)).toBe(true);
    expect(hasAccess).toHaveBeenLastCalledWith('https://publisher.example');
  });
});
