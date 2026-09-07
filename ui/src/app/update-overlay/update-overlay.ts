import { Component, inject, signal } from '@angular/core';
import { BugReportDialog } from '../bug-report-dialog/bug-report-dialog';
import { UpdateRecovery } from '../update-recovery';

/**
 * Themed overlay for the deployment-recovery flow (see {@link UpdateRecovery}).
 *
 * Two states, driven by signals:
 *  - `updating`: a new version was deployed under the running tab; the app is
 *    reloading itself to pick it up. A brief, friendly "updating" splash so the
 *    reload isn't a jarring silent flash.
 *  - `failed`: the reload already happened and the app *still* couldn't load the
 *    new bundle (half-finished deploy, inconsistent CDN). We stop the automatic
 *    loop and let the user press "Try again".
 */
@Component({
  selector: 'app-update-overlay',
  imports: [BugReportDialog],
  template: `
    @if (recovery.failed()) {
      <div class="update-overlay" role="alertdialog" aria-labelledby="update-title">
        <div class="spinner-slot">⚠️</div>
        <h1 id="update-title">Couldn't finish updating</h1>
        <p class="muted">
          A new version was released, but this tab couldn't load it — usually a temporary deployment
          or caching hiccup. Try again in a moment.
        </p>
        <div class="overlay-actions">
          <button class="btn btn-outline" type="button" (click)="reporting.set(true)">
            Report this
          </button>
          <button class="btn" type="button" (click)="recovery.retry()">Try again</button>
        </div>
      </div>
      @if (reporting()) {
        <app-bug-report-dialog (closed)="reporting.set(false)" />
      }
    } @else if (recovery.updating()) {
      <div class="update-overlay" role="status" aria-live="polite">
        <div class="spinner" aria-hidden="true"></div>
        <h1>Updating to the latest version…</h1>
        <p class="muted">A new release just shipped. Reloading to catch you up.</p>
      </div>
    }
  `,
  styleUrl: './update-overlay.css',
})
export class UpdateOverlay {
  protected recovery = inject(UpdateRecovery);
  protected reporting = signal(false);
}
