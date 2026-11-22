import { HttpErrorResponse } from '@angular/common/http';

/**
 * Mastodon refuses a post search made only of filters (`language:ms`,
 * `is:sensitive`, `-cats`) with HTTP 400 "At least one keyword or phrase is
 * required" (`SearchQueryTransformer::Query#validate_clauses!`). Plain words
 * and phrases are ANDed; `-word` excludes; `prefix:value` filters. A hashtag
 * is a word. The only exceptions are `in:library` and `from:me`, which search
 * your own posts.
 *
 * Catching it here lets the page say what to add instead of sending a request
 * the server is certain to refuse.
 */
const TOKEN = /[-+]?"[^"]*"|\S+/g;
const PREFIX = /^[\p{L}_]+:/u;

/** The filters in an operator-only query, for the message; null when it has a word. */
export function filtersWithoutTerm(query: string): string[] | null {
  const tokens = query.match(TOKEN) ?? [];
  if (!tokens.length) return null;
  const lower = tokens.map((t) => t.toLowerCase());
  if (lower.includes('in:library') || lower.includes('from:me')) return null;
  const positive = tokens.some((token) => {
    if (token.startsWith('-')) return false;
    const body = token.replace(/^\+/, '');
    if (body.startsWith('"')) return body.replace(/"/g, '').trim().length > 0;
    return body.length > 0 && !PREFIX.test(body);
  });
  return positive ? null : tokens;
}

/** The bare code of a `language:xx` filter in a query, or ''. */
export function languageInQuery(query: string): string {
  const m = /(?:^|\s)\+?language:([a-z]{2,3})(?:[-_][a-z0-9]+)?(?=\s|$)/i.exec(query);
  return m ? m[1].toLowerCase() : '';
}

/** What a failed search tells the reader. */
export interface SearchFailure {
  /** `needsSignIn`: signed-out search cannot filter people by language. */
  kind: 'needsWord' | 'failed' | 'needsSignIn';
  /** HTTP status; 0 when the server could not be reached. */
  status?: number;
  /** The server's own `error` text, when it sent one. */
  detail?: string;
  /** For `needsWord`: the filters the query consisted of. */
  filters?: string;
}

export function describeSearchError(error: unknown): SearchFailure {
  if (!(error instanceof HttpErrorResponse)) return { kind: 'failed' };
  const body = error.error as { error?: unknown } | string | null;
  const detail =
    typeof body === 'object' && body && typeof body.error === 'string' ? body.error : undefined;
  // A server that predates this client's check, or a query it parsed differently.
  if (detail && /keyword or phrase is required/i.test(detail)) {
    return { kind: 'needsWord', status: error.status, detail };
  }
  return { kind: 'failed', status: error.status, ...(detail ? { detail } : {}) };
}
