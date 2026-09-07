import { ErrorHandler, Injectable, inject } from '@angular/core';
import { ErrorLog } from './error-log';
import { ApiMetrics } from './observability/api-metrics';
import { UpdateRecovery } from './update-recovery';
import { DiagnosticLog } from './diagnostic-log';

/**
 * Root {@link ErrorHandler}. Beyond the default it does two things:
 *
 *  1. Routes a deployment-caused chunk-load failure into {@link UpdateRecovery}
 *     (reload once to pick up the new bundle) instead of surfacing it as an
 *     unexplained crash.
 *  2. Records every error into the {@link ErrorLog} ring buffer so the bug
 *     reporter can show the user what broke — the fix for "the app died and I
 *     never even got a message."
 *  3. Folds the same error into {@link ApiMetrics} as a grouped, persisted
 *     counter, so the Observability page can show what has been going wrong
 *     across sessions. The two are complementary: ErrorLog keeps the last few
 *     errors in full for a bug report and dies with the tab; the metrics side
 *     keeps counts per kind, forever, without growing.
 *
 * Paired with `provideBrowserGlobalErrorListeners()` in `appConfig`, which
 * forwards window `error` and `unhandledrejection` events here — important
 * because a failed dynamic import arrives as a rejected promise, and it means
 * this handler sees window-level errors too, not just Angular ones.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly recovery = inject(UpdateRecovery);
  private readonly errorLog = inject(ErrorLog);
  private readonly metrics = inject(ApiMetrics);
  private readonly diagnostics = inject(DiagnosticLog);

  handleError(error: unknown): void {
    this.errorLog.record('angular', error);
    this.metrics.recordClientError('angular', error);
    if (this.recovery.recover(error)) {
      return;
    }
    this.diagnostics.write('error', 'Mockingbird App', 'uncaught', { error }, error);
  }
}
