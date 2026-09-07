import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import {
  looksCorsBlocked,
  providerErrorInBody,
  toTwitterApiError,
  TwitterApiError,
} from './twitter-errors';

const SOURCE = 'twitterapi-io' as const;

describe('providerErrorInBody', () => {
  // The spec is explicit that HTTP 200 does not mean success, and this is not a
  // hypothetical: probing through AllOrigins returned 200 wrapping a 403 body.
  it('detects the real AllOrigins failure shape', () => {
    const error = providerErrorInBody(
      {
        error: 'Forbidden',
        message: 'API key required. Please include x-api-key in your request header.',
        code: -1,
      },
      SOURCE,
    );
    expect(error?.code).toBe('INVALID_API_KEY');
    // The message must point at the likely real cause — a proxy that dropped
    // the header — rather than sending the user to regenerate a fine key.
    expect(error?.message).toMatch(/stripped the key header|proxy/i);
  });

  it('accepts a real success envelope', () => {
    expect(
      providerErrorInBody({ status: 'success', msg: 'success', data: { id: '12' } }, SOURCE),
    ).toBeNull();
  });

  it('treats a non-success status as a failure even with no error field', () => {
    const error = providerErrorInBody({ status: 'error', msg: 'something broke' }, SOURCE);
    expect(error).toBeInstanceOf(TwitterApiError);
    expect(error?.providerMessage).toBe('something broke');
  });

  it('maps a credit exhaustion message', () => {
    expect(
      providerErrorInBody({ status: 'error', message: 'Insufficient credits' }, SOURCE)?.code,
    ).toBe('INSUFFICIENT_CREDITS');
  });

  it('maps a not-found message', () => {
    expect(providerErrorInBody({ error: 'user not found' }, SOURCE)?.code).toBe('USER_NOT_FOUND');
  });

  it('ignores non-object bodies rather than throwing', () => {
    expect(providerErrorInBody('plain text', SOURCE)).toBeNull();
    expect(providerErrorInBody(null, SOURCE)).toBeNull();
    expect(providerErrorInBody(undefined, SOURCE)).toBeNull();
  });
});

describe('toTwitterApiError', () => {
  const http = (status: number, body?: unknown, headers?: HttpHeaders) =>
    new HttpErrorResponse({ status, error: body, headers });

  it('reports a direct status 0 as needing a proxy, without guessing a cause', () => {
    const error = toTwitterApiError(http(0), SOURCE, { viaProxy: false });
    expect(error.code).toBe('CORS_UNAVAILABLE');
    expect(error.message).toMatch(/needs a CORS proxy/i);
  });

  it('blames the proxy, by name, when the proxy leg dies', () => {
    const error = toTwitterApiError(http(0), SOURCE, { viaProxy: true, proxyLabel: 'Corsfix' });
    expect(error.message).toContain('Corsfix');
  });

  it('blames the proxy for a 5xx on the proxy leg', () => {
    // Otherwise the user checks an API key that was never the problem.
    const error = toTwitterApiError(http(503), SOURCE, { viaProxy: true, proxyLabel: 'Corsfix' });
    expect(error.code).toBe('PROVIDER_UNAVAILABLE');
    expect(error.message).toMatch(/never reached/i);
  });

  it('mentions header-stripping on a proxied 401', () => {
    const error = toTwitterApiError(http(401), SOURCE, {
      viaProxy: true,
      proxyLabel: 'AllOrigins',
    });
    expect(error.code).toBe('INVALID_API_KEY');
    expect(error.message).toMatch(/custom headers/i);
  });

  it.each([
    [400, 'BAD_REQUEST'],
    [401, 'INVALID_API_KEY'],
    [402, 'INSUFFICIENT_CREDITS'],
    [404, 'USER_NOT_FOUND'],
    [408, 'TIMEOUT'],
    [429, 'RATE_LIMITED'],
    [500, 'PROVIDER_UNAVAILABLE'],
    [504, 'TIMEOUT'],
  ])('maps HTTP %i to %s', (status, code) => {
    expect(toTwitterApiError(http(status), SOURCE).code).toBe(code);
  });

  it('prefers the body-level reason for an ambiguous 403', () => {
    // 403 means protected content, no credits, or a plan limit. Only the body
    // can say which, so a body that speaks must win.
    const error = toTwitterApiError(http(403, { error: 'Insufficient credits' }), SOURCE);
    expect(error.code).toBe('INSUFFICIENT_CREDITS');
  });

  it('names all three possibilities for a silent 403', () => {
    const error = toTwitterApiError(http(403), SOURCE);
    expect(error.code).toBe('PROTECTED_CONTENT');
    expect(error.message).toMatch(/protected/i);
    expect(error.message).toMatch(/credit/i);
  });

  it('blames the proxy on a bare proxied 429, and says nothing was spent', () => {
    // Which side threw the 429 is answerable rather than a coin flip: a proxy
    // refusing on its own behalf sends its own error page with no provider
    // body. Saying so matters because the request never reached the service, so
    // no credits were used — and the earlier "either X or Y" wording left the
    // user unable to tell whether they had just paid for a failure.
    const error = toTwitterApiError(http(429), SOURCE, { viaProxy: true, proxyLabel: 'CORS.SH' });
    expect(error.message).toContain('CORS.SH');
    expect(error.message).toMatch(/nothing was spent/i);
  });

  it('blames the data service when the 429 carries a provider message', () => {
    // The service's own refusal comes with a body. That is the discriminator.
    const error = toTwitterApiError(
      http(429, { status: 'error', message: 'Too many requests' }),
      SOURCE,
      { viaProxy: true, proxyLabel: 'CORS.SH' },
    );
    expect(error.message).toMatch(/Twitter data service is rate-limiting/i);
    expect(error.message).not.toContain('CORS.SH');
  });

  it('reads a throttling 403 as throttling, not as a missing key', () => {
    // Measured 2026-08-01: TwitterAPI.io throttles by answering
    //   403 {"error":"Forbidden","message":"API key required..."}
    // on a key that IS being sent and DOES have credits — the same key answered
    // /oapi/my/info moments earlier, and a direct curl with no proxy failed
    // identically. Passing that message through sends someone to re-paste a key
    // that was never the problem.
    const error = toTwitterApiError(
      http(403, { error: 'Forbidden', message: 'API key required. Please include x-api-key' }),
      SOURCE,
    );
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.message).toMatch(/throttles/i);
    expect(error.message).toMatch(/balance is unaffected/i);
  });

  it('honours Retry-After on a 429', () => {
    const headers = new HttpHeaders({ 'Retry-After': '30' });
    expect(toTwitterApiError(http(429, undefined, headers), SOURCE).retryAfterMs).toBe(30_000);
  });

  it('ignores an unparseable Retry-After rather than waiting NaN', () => {
    const headers = new HttpHeaders({ 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' });
    expect(toTwitterApiError(http(429, undefined, headers), SOURCE).retryAfterMs).toBeUndefined();
  });

  it('passes an existing TwitterApiError through unchanged', () => {
    const original = new TwitterApiError('POST_NOT_FOUND', 'gone', SOURCE);
    expect(toTwitterApiError(original, SOURCE)).toBe(original);
  });
});

describe('transient classification', () => {
  // Retries cost money and a timed-out call may already have been billed, so
  // only genuinely transient failures may be repeated.
  it.each(['RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'TIMEOUT', 'NETWORK_ERROR'] as const)(
    '%s is retryable',
    (code) => {
      expect(new TwitterApiError(code, 'x', SOURCE).transient).toBe(true);
    },
  );

  it.each(['INVALID_API_KEY', 'INSUFFICIENT_CREDITS', 'BAD_REQUEST', 'USER_NOT_FOUND'] as const)(
    '%s is not retryable',
    (code) => {
      expect(new TwitterApiError(code, 'x', SOURCE).transient).toBe(false);
    },
  );
});

describe('looksCorsBlocked', () => {
  it('is true only for the opaque status 0', () => {
    expect(looksCorsBlocked(new HttpErrorResponse({ status: 0 }))).toBe(true);
    expect(looksCorsBlocked(new HttpErrorResponse({ status: 500 }))).toBe(false);
    expect(looksCorsBlocked(new Error('nope'))).toBe(false);
  });
});
