import { HttpErrorResponse } from '@angular/common/http';
import { ShortenerId } from './shortener-provider';

/**
 * Normalized failure modes across every shortening provider.
 *
 * The point of a closed union here is that the *page* can react to a failure
 * without knowing which provider produced it: a slug collision offers to pick a
 * different slug, an auth failure sends you to the connector page, a rate limit
 * says how long to wait. Provider-specific status codes cannot do that, because
 * the same code means different things to different services — Short.io's `409`
 * is a slug collision while Dub returns `422` for the same condition.
 */
export type LinkProviderErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'SLUG_CONFLICT'
  | 'INVALID_DESTINATION'
  | 'VALIDATION_FAILED'
  | 'RATE_LIMITED'
  | 'PLAN_LIMIT'
  | 'UNSUPPORTED_OPERATION'
  | 'PROVIDER_UNAVAILABLE'
  | 'CORS_BLOCKED'
  | 'UNKNOWN';

/**
 * A provider failure, with everything the UI needs and nothing it must not show.
 *
 * `message` is written for a human and is safe to render. The raw provider body
 * is deliberately *not* carried on this object: shortener error bodies routinely
 * echo back the workspace id, the account email, or a fragment of the key that
 * failed, and there is no version of showing that to the user which is worth the
 * risk. What survives for diagnostics is the status and the provider's request
 * id, both of which are safe and are the two things support actually asks for.
 */
export class LinkProviderError extends Error {
  constructor(
    readonly code: LinkProviderErrorCode,
    message: string,
    readonly provider: ShortenerId,
    /** HTTP status, or 0 when the request never got a response (CORS, offline). */
    readonly status = 0,
    /** The provider's request/trace id when it sends one. Safe to display. */
    readonly requestId: string | null = null,
    /** Seconds to wait, from `Retry-After`, when the provider supplied one. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'LinkProviderError';
  }

  /** Whether retrying the identical request could plausibly succeed. */
  get transient(): boolean {
    return this.code === 'RATE_LIMITED' || this.code === 'PROVIDER_UNAVAILABLE';
  }
}

/** The spec's status→code table, minus the parts a provider must decide itself. */
function codeForStatus(status: number): LinkProviderErrorCode {
  if (status === 400 || status === 422) {
    return 'VALIDATION_FAILED';
  }
  if (status === 401) {
    return 'AUTHENTICATION_FAILED';
  }
  if (status === 403) {
    return 'FORBIDDEN';
  }
  if (status === 404) {
    return 'NOT_FOUND';
  }
  if (status === 409) {
    return 'SLUG_CONFLICT';
  }
  if (status === 429) {
    return 'RATE_LIMITED';
  }
  if (status >= 500 && status <= 599) {
    return 'PROVIDER_UNAVAILABLE';
  }
  return 'UNKNOWN';
}

/** Human-facing copy per code. Deliberately free of provider jargon. */
const MESSAGES: Record<LinkProviderErrorCode, string> = {
  AUTHENTICATION_FAILED:
    'That API key was rejected. Check it on the Link shortener connector, or issue a new one.',
  FORBIDDEN: 'This key is not allowed to do that. It may be missing a scope or a permission.',
  NOT_FOUND: 'That link no longer exists on the service. It may have been deleted elsewhere.',
  SLUG_CONFLICT: 'That custom back-half is already taken. Try a different one.',
  INVALID_DESTINATION: 'The service rejected that destination URL.',
  VALIDATION_FAILED: 'The service rejected the details of this link.',
  RATE_LIMITED: 'The service is rate-limiting this key. Wait a moment and try again.',
  PLAN_LIMIT: "This is beyond the service's limits for your plan.",
  UNSUPPORTED_OPERATION: "This service can't do that.",
  PROVIDER_UNAVAILABLE: 'The service is having trouble right now. Try again shortly.',
  CORS_BLOCKED:
    "This service's API refuses to answer web browsers directly. A CORS proxy is needed.",
  UNKNOWN: 'Something went wrong talking to the service.',
};

/**
 * Whether a failed request never actually reached the provider.
 *
 * Angular reports a CORS rejection, a DNS failure, and an offline browser
 * identically: `status === 0` with a `ProgressEvent` error. That ambiguity is
 * unavoidable — the browser deliberately withholds the reason so a page cannot
 * probe other origins — so this is a *possible* CORS block, and the connect flow
 * treats it as the prompt to offer a proxy rather than as proof.
 */
export function looksCorsBlocked(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 0;
}

/** `Retry-After` in seconds, whether the provider sent seconds or an HTTP date. */
function retryAfterSeconds(error: HttpErrorResponse, now: number = Date.now()): number | null {
  const raw = error.headers?.get('Retry-After');
  if (!raw) {
    return null;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.round(seconds));
  }
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, Math.round((date - now) / 1000)) : null;
}

/** The provider's own trace id, under whichever header it happens to use. */
function requestIdOf(error: HttpErrorResponse): string | null {
  const headers = error.headers;
  if (!headers) {
    return null;
  }
  for (const name of ['x-request-id', 'x-requestid', 'request-id', 'cf-ray', 'x-amzn-requestid']) {
    const value = headers.get(name);
    if (value) {
      return value;
    }
  }
  return null;
}

/** Extra mapping a provider applies before the generic status table. */
export interface ProviderErrorHints {
  /**
   * Refine a code the status table cannot get right on its own.
   *
   * Returning `undefined` keeps the table's answer. This is where a provider
   * encodes "my 422 with this body is really a slug collision" without every
   * other provider inheriting that belief.
   */
  refine?(status: number, body: unknown): LinkProviderErrorCode | undefined;
}

/**
 * Turn anything thrown by an adapter into a {@link LinkProviderError}.
 *
 * Total by construction: a non-HTTP throw (a bug in an adapter's response
 * parsing, say) becomes `UNKNOWN` rather than escaping as a raw exception, so
 * the UI has exactly one error shape to render.
 */
export function toLinkProviderError(
  error: unknown,
  provider: ShortenerId,
  hints: ProviderErrorHints = {},
): LinkProviderError {
  if (error instanceof LinkProviderError) {
    return error;
  }

  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return new LinkProviderError('CORS_BLOCKED', MESSAGES.CORS_BLOCKED, provider, 0);
    }
    const code = hints.refine?.(error.status, error.error) ?? codeForStatus(error.status);
    return new LinkProviderError(
      code,
      MESSAGES[code],
      provider,
      error.status,
      requestIdOf(error),
      retryAfterSeconds(error),
    );
  }

  // An adapter's own guard (unsupported operation, malformed response) arrives
  // here as a plain Error. Its message is ours, written for a human, so it is
  // safe to keep — unlike a provider body.
  if (error instanceof Error && error.message) {
    return new LinkProviderError('UNKNOWN', error.message, provider);
  }

  return new LinkProviderError('UNKNOWN', MESSAGES.UNKNOWN, provider);
}

/** The error an adapter throws for an operation its service genuinely lacks. */
export function unsupported(provider: ShortenerId, what: string): LinkProviderError {
  return new LinkProviderError('UNSUPPORTED_OPERATION', what, provider);
}
