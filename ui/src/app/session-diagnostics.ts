import { inject, Injectable } from '@angular/core';
import { DiagnosticLog } from './diagnostic-log';

const PREFIX = '[Mawkingbird Session]';

/**
 * Token-safe console diagnostics for the account stable.
 *
 * ## Why this exists
 *
 * A user reported that leaving the app took their *other* saved accounts with
 * it. Reconstructing that from the outside was guesswork: the app is client-side
 * only, so nothing about it is visible in a server log, and every method that
 * writes `mastodon_mock_sessions` did so silently. The single line that caused
 * it (`logout()` calling `persistSessions(remaining)`) left no trace at all, and
 * the auto-switch that followed made the app look like it had merely *changed*
 * accounts rather than deleted one.
 *
 * So every transition that adds, removes, activates or deactivates a session
 * announces itself, and — this is the part that would actually have caught the
 * bug — reports the session count **before and after**. A count that drops on an
 * operation that is not supposed to forget anything is visible in the console at
 * the moment it happens, without needing to reproduce it.
 *
 * ## What is never logged
 *
 * Tokens, in whole or in part. Not even a prefix: these are bearer credentials
 * against a real instance, and a console log is pasted into bug reports. Sessions
 * are identified by their local `id` (an opaque UUID that authenticates nothing)
 * and by handle where one is known.
 */
@Injectable({ providedIn: 'root' })
export class SessionDiagnostics {
  private readonly log = inject(DiagnosticLog);

  /**
   * A session-stable transition.
   *
   * @param before How many sessions were saved before the operation.
   * @param after How many are saved after it. Equal to `before` for anything
   * that is not supposed to forget an account — an inequality here is the bug.
   */
  transition(
    event: string,
    before: number,
    after: number,
    details: Record<string, unknown> = {},
  ): void {
    const payload = { savedBefore: before, savedAfter: after, ...details };
    if (after < before) {
      // Deliberate forgetting is rare and always user-initiated, so make it loud
      // enough to spot in a busy console rather than filing it under info.
      this.log.write('warn', PREFIX.slice(1, -1), `${event} (forgot ${before - after})`, payload);
      return;
    }
    this.log.write('info', PREFIX.slice(1, -1), event, payload);
  }

  info(event: string, details: Record<string, unknown> = {}): void {
    this.log.write('info', PREFIX.slice(1, -1), event, details);
  }

  warn(event: string, details: Record<string, unknown> = {}): void {
    this.log.write('warn', PREFIX.slice(1, -1), event, details);
  }
}
