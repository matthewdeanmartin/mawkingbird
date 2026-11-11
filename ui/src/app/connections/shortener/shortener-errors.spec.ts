import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { LinkProviderError, looksCorsBlocked, toLinkProviderError } from './shortener-errors';

function httpError(
  status: number,
  options: { headers?: Record<string, string>; body?: unknown } = {},
) {
  return new HttpErrorResponse({
    status,
    headers: new HttpHeaders(options.headers ?? {}),
    error: options.body ?? null,
  });
}

describe('toLinkProviderError', () => {
  it.each([
    [400, 'VALIDATION_FAILED'],
    [401, 'AUTHENTICATION_FAILED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'SLUG_CONFLICT'],
    [422, 'VALIDATION_FAILED'],
    [429, 'RATE_LIMITED'],
    [503, 'PROVIDER_UNAVAILABLE'],
  ])('maps HTTP %i to %s', (status, code) => {
    expect(toLinkProviderError(httpError(status), 'dub').code).toBe(code);
  });

  it('treats status 0 as a possible CORS block', () => {
    // The browser deliberately will not say whether this was CORS, DNS or
    // offline, so this is the signal to offer a proxy rather than proof.
    expect(toLinkProviderError(httpError(0), 'dub').code).toBe('CORS_BLOCKED');
    expect(looksCorsBlocked(httpError(0))).toBe(true);
    expect(looksCorsBlocked(httpError(500))).toBe(false);
  });

  it('lets a provider refine a status the generic table gets wrong', () => {
    const refine = (status: number) => (status === 422 ? ('SLUG_CONFLICT' as const) : undefined);

    expect(toLinkProviderError(httpError(422), 'tly', { refine }).code).toBe('SLUG_CONFLICT');
  });

  it('never carries the provider error body, which can echo account details', () => {
    const error = toLinkProviderError(
      httpError(401, { body: { message: 'bad key sk_live_abc for workspace ws_42' } }),
      'dub',
    );

    // The message shown to the user is ours, not the provider's.
    expect(JSON.stringify(error)).not.toContain('sk_live_abc');
    expect(error.message).not.toContain('ws_42');
  });

  it('keeps the request id, which is safe and is what support asks for', () => {
    const error = toLinkProviderError(
      httpError(500, { headers: { 'x-request-id': 'req_9' } }),
      'dub',
    );

    expect(error.requestId).toBe('req_9');
  });

  it('reads Retry-After as seconds or as an HTTP date', () => {
    expect(
      toLinkProviderError(httpError(429, { headers: { 'Retry-After': '30' } }), 'dub')
        .retryAfterSeconds,
    ).toBe(30);

    const future = new Date(Date.now() + 60_000).toUTCString();
    const fromDate = toLinkProviderError(
      httpError(429, { headers: { 'Retry-After': future } }),
      'dub',
    ).retryAfterSeconds;
    expect(fromDate).toBeGreaterThan(50);
    expect(fromDate).toBeLessThanOrEqual(60);
  });

  it('marks only rate limits and outages as worth retrying', () => {
    expect(toLinkProviderError(httpError(429), 'dub').transient).toBe(true);
    expect(toLinkProviderError(httpError(503), 'dub').transient).toBe(true);
    // Retrying a slug collision or a bad key just fails again.
    expect(toLinkProviderError(httpError(409), 'dub').transient).toBe(false);
    expect(toLinkProviderError(httpError(401), 'dub').transient).toBe(false);
  });

  it('passes an existing LinkProviderError through unchanged', () => {
    const original = new LinkProviderError('UNSUPPORTED_OPERATION', 'nope', 'tly');

    expect(toLinkProviderError(original, 'tly')).toBe(original);
  });

  it('turns anything else into UNKNOWN rather than escaping', () => {
    expect(toLinkProviderError('a string', 'dub').code).toBe('UNKNOWN');
    expect(toLinkProviderError(null, 'dub').code).toBe('UNKNOWN');
  });
});
