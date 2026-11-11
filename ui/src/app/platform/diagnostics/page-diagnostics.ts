import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { DiagnosticLog } from './diagnostic-log';

/**
 * The HTTP status behind a failure, for log details.
 *
 * The status is the single most useful field when reading a report after the
 * fact: 503 (the instance is unwell, try again later) and 404 (you don't follow
 * that account) call for completely different next steps, and "it didn't work"
 * distinguishes neither. `null` for anything that isn't an HTTP failure.
 */
export function statusOf(err: unknown): number | null {
  return err instanceof HttpErrorResponse ? err.status : null;
}

/**
 * A short, user-facing sentence for a failed request.
 *
 * Prefers the server's own words — Mastodon's `error` field usually says
 * something more useful than any wording we could invent — and falls back to
 * the status. Callers put this next to the action that failed; it is the
 * counterpart to {@link statusOf}, which is for the log.
 */
export function describeHttpError(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const detail = String(err.error?.error ?? err.error?.message ?? '').trim();
    if (detail) {
      return detail;
    }
    if (err.status === 0) {
      return "Couldn't reach the server.";
    }
    if (err.status >= 500) {
      // Distinguished from a 4xx because the user did nothing wrong and
      // retrying is genuinely the right next move.
      return `The server had a problem (HTTP ${err.status}). Trying again may work.`;
    }
    return `The server rejected that (HTTP ${err.status}).`;
  }
  return 'Something went wrong.';
}

/** Low-volume, production-visible console events for page loads and user actions. */
@Injectable({ providedIn: 'root' })
export class PageDiagnostics {
  private readonly log = inject(DiagnosticLog);

  info(area: string, event: string, details: Record<string, unknown> = {}): void {
    this.log.write('info', `Mockingbird ${area}`, event, details);
  }

  warn(area: string, event: string, details: Record<string, unknown> = {}): void {
    this.log.write('warn', `Mockingbird ${area}`, event, details);
  }

  error(area: string, event: string, error: unknown, details: Record<string, unknown> = {}): void {
    const payload = { ...details, error };
    this.log.write('error', `Mockingbird ${area}`, event, payload, payload);
  }
}
