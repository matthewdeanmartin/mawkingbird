import { HttpErrorResponse } from '@angular/common/http';
import { TwitterSourceId } from './twitter-source';

/**
 * Normalized failures from a Twitter data service.
 *
 * Follows the spec's §10 error model, with one addition it does not have:
 * `PROXY_REQUIRED` and `PROXY_CONSENT_REQUIRED`, because in this app a request
 * that cannot be proxied is not a network failure — it is a configuration state
 * with a specific fix, and flattening it into `CORS_UNAVAILABLE` would send the
 * user to check an API key that was never the problem.
 */
export type TwitterErrorCode =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_API_KEY'
  | 'INSUFFICIENT_CREDITS'
  | 'BAD_REQUEST'
  | 'USER_NOT_FOUND'
  | 'POST_NOT_FOUND'
  | 'PROTECTED_CONTENT'
  | 'CONTENT_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_CHANGED'
  | 'PROXY_REQUIRED'
  | 'PROXY_CONSENT_REQUIRED'
  | 'CORS_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNSUPPORTED'
  | 'UNKNOWN';

export class TwitterApiError extends Error {
  constructor(
    readonly code: TwitterErrorCode,
    message: string,
    readonly source: TwitterSourceId,
    readonly httpStatus?: number,
    readonly retryAfterMs?: number,
    /** The service's own message, when it sent one. Never includes the key. */
    readonly providerMessage?: string,
  ) {
    super(message);
    this.name = 'TwitterApiError';
  }

  /**
   * Whether retrying this exact request could plausibly succeed.
   *
   * Consulted by the transport's retry policy. Deliberately conservative: these
   * calls cost money, and a timed-out request may already have been billed, so
   * anything ambiguous counts as non-transient.
   */
  get transient(): boolean {
    return (
      this.code === 'RATE_LIMITED' ||
      this.code === 'PROVIDER_UNAVAILABLE' ||
      this.code === 'TIMEOUT' ||
      this.code === 'NETWORK_ERROR'
    );
  }
}

/**
 * Whether a failure is the browser's opaque cross-origin refusal.
 *
 * `status: 0` is all a browser will say: CORS, DNS, offline, and an extension
 * cancelling the request are deliberately indistinguishable. Never report a
 * cause here that the evidence does not support.
 */
export function looksCorsBlocked(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 0;
}

/**
 * Body shape both services use for errors. Fields are optional because a
 * provider that changes one must produce a controlled error, not a `TypeError`.
 */
interface ProviderErrorBody {
  status?: string;
  msg?: string;
  message?: string;
  error?: string | number;
  code?: number;
}

/**
 * Detect a failure hiding inside an HTTP 200.
 *
 * The spec warns about this (§10, "Do not treat HTTP 200 alone as success") and
 * it is not hypothetical: probing through AllOrigins returned HTTP 200 whose
 * body was `{"error":"Forbidden","message":"API key required..."}` — the proxy
 * had faithfully relayed a 403 body while presenting its own 200. Anything that
 * parses a response must call this first.
 *
 * Returns the error to throw, or null when the body is a real success.
 */
export function providerErrorInBody(
  body: unknown,
  source: TwitterSourceId,
): TwitterApiError | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const envelope = body as ProviderErrorBody;

  // TwitterAPI.io signals success explicitly; anything else in that field is a
  // failure regardless of the HTTP status.
  const failed =
    (typeof envelope.status === 'string' && envelope.status !== 'success') ||
    envelope.error !== undefined;
  if (!failed) {
    return null;
  }

  const providerMessage =
    envelope.message ??
    envelope.msg ??
    (typeof envelope.error === 'string' ? envelope.error : undefined);
  const text = (providerMessage ?? '').toLowerCase();

  // The service is telling us why; map the cases with a specific fix.
  if (text.includes('api key') || text.includes('unauthorized') || text.includes('forbidden')) {
    return new TwitterApiError(
      'INVALID_API_KEY',
      'The Twitter data service rejected the API key. If the request went through a CORS proxy, the proxy may have stripped the key header rather than the key being wrong.',
      source,
      undefined,
      undefined,
      providerMessage,
    );
  }
  if (text.includes('credit') || text.includes('balance') || text.includes('quota')) {
    return new TwitterApiError(
      'INSUFFICIENT_CREDITS',
      'Your account with the Twitter data service is out of credits.',
      source,
      undefined,
      undefined,
      providerMessage,
    );
  }
  if (text.includes('not found')) {
    return new TwitterApiError(
      'USER_NOT_FOUND',
      'The Twitter data service could not find that account or post.',
      source,
      undefined,
      undefined,
      providerMessage,
    );
  }
  return new TwitterApiError(
    'UNKNOWN',
    providerMessage
      ? `The Twitter data service reported: ${providerMessage}`
      : 'The Twitter data service reported an error without explaining it.',
    source,
    undefined,
    undefined,
    providerMessage,
  );
}

/**
 * Say who is throttling, rather than naming both and shrugging.
 *
 * A proxy refusing on its own behalf answers with its own error page and no
 * provider body. The data service's refusal carries a provider message. So an
 * embedded provider error means the service is the culprit; its absence, with a
 * proxy in the path, means the proxy is.
 *
 * Worth distinguishing because the fixes are opposites: waiting a minute clears
 * a free proxy tier, while the data service throttling means slowing down or
 * upgrading the plan — and telling someone to wait when they should upgrade
 * (or vice versa) wastes their time either way.
 */
export function rateLimitMessage(
  viaProxy: boolean,
  proxy: string,
  providerMessage?: string,
): string {
  if (providerMessage) {
    return (
      'The Twitter data service is rate-limiting you. Wait a minute and try again, ' +
      'or slow down how often you refresh. Your credit balance is unaffected.'
    );
  }
  if (viaProxy) {
    return (
      `${proxy} is rate-limiting you — the request never reached the Twitter data service, ` +
      'so nothing was spent. Free proxy tiers throttle quickly; wait a minute, or use a ' +
      'different proxy on the CORS proxy settings page.'
    );
  }
  return 'The Twitter data service is rate-limiting you. Wait a minute and try again.';
}

/** Map a transport-level failure to the normalized model (spec §10.1). */
export function toTwitterApiError(
  error: unknown,
  source: TwitterSourceId,
  context: { viaProxy: boolean; proxyLabel?: string } = { viaProxy: false },
): TwitterApiError {
  if (error instanceof TwitterApiError) {
    return error;
  }

  if (!(error instanceof HttpErrorResponse)) {
    return new TwitterApiError(
      'UNKNOWN',
      error instanceof Error ? error.message : 'Unknown error reading Twitter data.',
      source,
    );
  }

  // A body-level error can ride along with any status; prefer its detail.
  const embedded = providerErrorInBody(error.error, source);

  const proxy = context.proxyLabel ?? 'the CORS proxy';

  if (error.status === 0) {
    return new TwitterApiError(
      'CORS_UNAVAILABLE',
      context.viaProxy
        ? `Could not reach the Twitter data service through ${proxy}. The proxy may be down, rate-limiting you, or answering without the CORS headers a browser needs.`
        : 'Your browser could not reach the Twitter data service directly. These services do not answer browsers, so this request needs a CORS proxy.',
      source,
      0,
    );
  }

  // A 5xx on the proxy leg is the proxy failing, not the service — saying
  // otherwise sends the user to check a key that was never the problem.
  if (context.viaProxy && error.status >= 500) {
    return new TwitterApiError(
      'PROVIDER_UNAVAILABLE',
      `${proxy} failed with a ${error.status}, so the request never reached the Twitter data service.`,
      source,
      error.status,
    );
  }

  switch (error.status) {
    case 400:
      return new TwitterApiError(
        'BAD_REQUEST',
        embedded?.providerMessage
          ? `The Twitter data service rejected the request: ${embedded.providerMessage}`
          : 'The Twitter data service rejected the request.',
        source,
        400,
        undefined,
        embedded?.providerMessage,
      );
    case 401:
      return new TwitterApiError(
        'INVALID_API_KEY',
        context.viaProxy
          ? `The Twitter data service rejected the API key. ${proxy} may have stripped the key header — not every proxy forwards custom headers.`
          : 'The Twitter data service rejected the API key.',
        source,
        401,
        undefined,
        embedded?.providerMessage,
      );
    case 402:
      return new TwitterApiError(
        'INSUFFICIENT_CREDITS',
        'Your account with the Twitter data service is out of credits.',
        source,
        402,
        undefined,
        embedded?.providerMessage,
      );
    case 403:
      // 403 is overloaded across these services: throttling, out of credits, a
      // protected account, or a plan restriction. The body is the only way to
      // tell, and when it is silent the honest answer names the rest.
      //
      // Throttling first, because it is the one that lies. Measured 2026-08-01:
      // TwitterAPI.io throttles by returning
      //   403 {"error":"Forbidden","message":"API key required..."}
      // on a key that *is* being sent and *does* have credits — the same key
      // answered `/oapi/my/info` moments earlier, and a direct curl with no
      // proxy in the path failed identically. Passing that message through
      // sends someone to re-paste a key that was never the problem.
      if (embedded && /api key required|invalid api key/i.test(embedded.providerMessage ?? '')) {
        return new TwitterApiError(
          'RATE_LIMITED',
          'The Twitter data service is refusing requests for this key right now. It reports ' +
            'the key as missing even when it is being sent correctly, which is how it throttles. ' +
            'Your credit balance is unaffected — wait a few minutes and try again.',
          source,
          403,
          undefined,
          embedded.providerMessage,
        );
      }
      return (
        embedded ??
        new TwitterApiError(
          'PROTECTED_CONTENT',
          'The Twitter data service refused the request. The content may be protected, or your plan or credit balance may not cover it.',
          source,
          403,
        )
      );
    case 404:
      return new TwitterApiError(
        'USER_NOT_FOUND',
        'The Twitter data service could not find that account or post.',
        source,
        404,
        undefined,
        embedded?.providerMessage,
      );
    case 408:
      return new TwitterApiError('TIMEOUT', 'The Twitter data service timed out.', source, 408);
    case 429:
      // Which side threw the 429 is answerable, and the earlier "either by the
      // proxy or by the service" wording gave up too early. A proxy refusing on
      // its own behalf returns its own error page; the data service's refusal
      // carries a provider message in the body. So when there is an embedded
      // provider error, the service is the one throttling — otherwise, with a
      // proxy in the path, it is the proxy.
      //
      // The distinction matters because the fixes are opposites: waiting fixes a
      // free proxy tier, while the data service's limit means slowing down or
      // upgrading the plan.
      return new TwitterApiError(
        'RATE_LIMITED',
        rateLimitMessage(context.viaProxy, proxy, embedded?.providerMessage),
        source,
        429,
        retryAfterMs(error),
        embedded?.providerMessage,
      );
    case 500:
    case 502:
    case 503:
      return new TwitterApiError(
        'PROVIDER_UNAVAILABLE',
        'The Twitter data service is unavailable right now.',
        source,
        error.status,
      );
    case 504:
      return new TwitterApiError('TIMEOUT', 'The Twitter data service timed out.', source, 504);
    default:
      return new TwitterApiError(
        'UNKNOWN',
        `The Twitter data service answered ${error.status}.`,
        source,
        error.status,
        undefined,
        embedded?.providerMessage,
      );
  }
}

/**
 * Whether the CORS proxy refused on its own behalf, rather than relaying the
 * data service's refusal.
 *
 * The evidence is the one this file already relies on when it words a 429: the
 * data service explains itself in the response body, so a refusal carrying a
 * `providerMessage` came *from the service*, and a bare 403/429 with a proxy in
 * the path came from the proxy. Nothing else in the response distinguishes them —
 * a proxy returns its own error page under its own status.
 *
 * Used by the retry policy. Retrying a proxy's own refusal is close to pointless:
 * the free tiers this app runs on limit by origin over minutes, not the seconds a
 * retry waits, and the retries were spending that time inside the Home feed's
 * round — which is what made the whole page look frozen when the proxies went
 * down together. The service's own throttling is still retried; it does clear.
 *
 * `Retry-After` overrides this, because a proxy that says when to come back is
 * answering the question rather than leaving it to be inferred.
 */
export function isProxyOriginRefusal(error: TwitterApiError): boolean {
  if (error.retryAfterMs !== undefined) {
    return false;
  }
  if (error.providerMessage) {
    return false;
  }
  return (error.httpStatus === 429 || error.httpStatus === 403) && error.code === 'RATE_LIMITED';
}

/** `Retry-After` in milliseconds, when the service sent a usable one. */
function retryAfterMs(error: HttpErrorResponse): number | undefined {
  const header = error.headers?.get('Retry-After');
  if (!header) {
    return undefined;
  }
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}
