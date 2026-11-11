import { ErrorHandler, Injectable, Injector, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ErrorLog } from './error-log';
import { ApiMetrics } from '../../observability/api-metrics';
import { UpdateRecovery } from '../build/update-recovery';
import { DiagnosticLog } from './diagnostic-log';
import { AppDialogs } from '../../shell/app-dialogs';
import { isQuotaExceeded, relieveStoragePressure } from '../storage/storage-quota';

// i18n storage.full: This browser's storage for Mawkingbird was full, so your last change could not be saved. Cached data has been cleared to make room. Please try again. If it happens again, Settings → Local storage shows what is using the space.
// i18n storage.fullNothingToFree: This browser's storage for Mawkingbird is full, so your last change could not be saved. There was no cached data left to clear. Settings → Local storage shows what is using the space, and lets you remove it.

/**
 * Root {@link ErrorHandler}. Beyond the default it does two things:
 *
 *  1. Routes a deployment-caused chunk-load failure into {@link UpdateRecovery}
 *     (reload once to pick up the new bundle) instead of surfacing it as an
 *     unexplained crash.
 *  2. Records every error into the {@link ErrorLog} ring buffer so the bug
 *     reporter can show the user what broke — the fix for "the app died and I
 *     never even got a message."
 *  3. Turns a full `localStorage` (`QuotaExceededError`) into something the user
 *     can recover from: refetchable caches are dropped and a dialog says to try
 *     again, instead of an action that silently fails forever.
 *  4. Folds the same error into {@link ApiMetrics} as a grouped, persisted
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
  // Resolved when needed: dialogs and translations are not ready this early in bootstrap.
  private readonly injector = inject(Injector);
  private explainingFullStorage = false;

  handleError(error: unknown): void {
    this.errorLog.record('angular', error);
    this.metrics.recordClientError('angular', error);
    if (this.recovery.recover(error)) {
      return;
    }
    if (isQuotaExceeded(error)) {
      this.recoverFromFullStorage(error);
    }
    this.diagnostics.write('error', 'Mockingbird App', 'uncaught', { error }, error);
  }

  /** Drop caches and tell the user once, however many writes fail in the same moment. */
  private recoverFromFullStorage(error: unknown): void {
    // Measures and logs what filled storage (unless the failing write already did), then drops caches.
    const freed = relieveStoragePressure(error);
    if (this.explainingFullStorage) return;
    this.explainingFullStorage = true;
    try {
      const i18n = this.injector.get(TranslocoService);
      const message = i18n.translate(freed.keys ? 'storage.full' : 'storage.fullNothingToFree');
      void this.injector
        .get(AppDialogs)
        .alert(message)
        .finally(() => (this.explainingFullStorage = false));
    } catch {
      this.explainingFullStorage = false;
    }
  }
}
