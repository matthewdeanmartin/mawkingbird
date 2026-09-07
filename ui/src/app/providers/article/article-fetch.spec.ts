import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { diagnoseHttpError } from './article-fetch';

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
