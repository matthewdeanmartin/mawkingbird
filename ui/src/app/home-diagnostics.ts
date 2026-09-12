import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { DiagnosticLog } from './diagnostic-log';

const PREFIX = '[Mockingbird Home]';

/** XRPC error identifiers are useful diagnostics; arbitrary response text is not. */
export function httpErrorCode(error: unknown): string | null {
  const code = error instanceof HttpErrorResponse ? error.error?.error : null;
  return typeof code === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(code) ? code : null;
}

/** Token-safe browser-console diagnostics for the Home feed pipeline. */
@Injectable({ providedIn: 'root' })
export class HomeDiagnostics {
  private readonly log = inject(DiagnosticLog);

  info(event: string, details: Record<string, unknown> = {}): void {
    this.log.write('info', PREFIX.slice(1, -1), event, details);
  }

  warn(event: string, details: Record<string, unknown> = {}): void {
    this.log.write('warn', PREFIX.slice(1, -1), event, details);
  }

  error(event: string, error: unknown, details: Record<string, unknown> = {}): void {
    const payload = { ...details, failure: this.describeFailure(error) };
    this.log.write('error', PREFIX.slice(1, -1), event, payload);
  }

  /** Include only the protocol error identifier from bodies, never credentials or content. */
  private describeFailure(error: unknown): Record<string, unknown> {
    if (error instanceof HttpErrorResponse) {
      return {
        kind: 'http',
        code: httpErrorCode(error),
        status: error.status,
        statusText: error.statusText,
        url: error.url,
        message: error.message,
      };
    }
    if (error instanceof Error) {
      return {
        kind: error.name,
        message: error.message,
        ...(error.cause instanceof Error
          ? { cause: { kind: error.cause.name, message: error.cause.message } }
          : {}),
      };
    }
    return { kind: typeof error, message: String(error) };
  }
}
