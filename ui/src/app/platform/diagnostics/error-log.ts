import { Injectable, signal } from '@angular/core';

/** One captured error, trimmed to a bounded size and stamped with a time. */
export interface LoggedError {
  /** Milliseconds since app start (not wall clock) — no PII, still orderable. */
  at: number;
  /** Where it came from: Angular's handler, or a raw window event. */
  source: 'angular' | 'window-error' | 'unhandled-rejection';
  /** A human-readable one-or-few-line description, size-capped. */
  text: string;
}

const MAX_ENTRIES = 25;
const MAX_TEXT_LEN = 2_000;

/**
 * A tiny in-memory ring buffer of the most recent app errors.
 *
 * This exists because the failure that motivated all of this produced *no*
 * visible message — the app just broke and the console filled up where nobody
 * was looking. Here we keep the last {@link MAX_ENTRIES} errors so the bug
 * reporter can show the user what actually went wrong and offer to include it.
 *
 * It never persists and never leaves the browser on its own. Nothing here is
 * sent anywhere; it only becomes part of a report if the user chooses to file
 * one. Fed by {@link GlobalErrorHandler} and window `error` /
 * `unhandledrejection` listeners.
 */
@Injectable({ providedIn: 'root' })
export class ErrorLog {
  private readonly start = Date.now();
  private readonly buffer = signal<LoggedError[]>([]);

  /** The captured errors, oldest first. */
  readonly entries = this.buffer.asReadonly();

  record(source: LoggedError['source'], error: unknown): void {
    const text = this.describe(error).slice(0, MAX_TEXT_LEN);
    const entry: LoggedError = { at: Date.now() - this.start, source, text };
    this.buffer.update((all) => [...all, entry].slice(-MAX_ENTRIES));
  }

  clear(): void {
    this.buffer.set([]);
  }

  private describe(error: unknown): string {
    if (error instanceof Error) {
      const stack = error.stack ? `\n${error.stack.split('\n').slice(0, 4).join('\n')}` : '';
      return `${error.name}: ${error.message}${stack}`;
    }
    if (typeof error === 'string') {
      return error;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
}
