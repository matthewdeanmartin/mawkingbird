import { Component, inject } from '@angular/core';
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
  template: `
    @if (recovery.failed()) {
      <div class="update-overlay" role="alertdialog" aria-labelledby="update-title">
        <div class="spinner-slot">⚠️</div>
        <h1 id="update-title">Couldn't finish updating</h1>
        <p class="muted">
          This tab couldn't load part of Mawkingbird. Check your connection and try again, or open
          Mawkingbird in a new tab to start from the homepage.
        </p>
        <div class="overlay-actions">
          <a
            class="btn btn-outline"
            href="https://mawkingbird.com/"
            target="_blank"
            rel="noopener noreferrer"
            >Open Mawkingbird in a new tab</a
          >
          <button class="btn" type="button" (click)="recovery.retry()">Try again</button>
        </div>
      </div>
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
}
