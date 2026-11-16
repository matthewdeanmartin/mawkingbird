import { Component, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbSettingsRow } from '../../design-system/settings-row/settings-row';
import type { NativeUpdateCheck } from '../../platform/http/connector-types';
import { PLATFORM_UPDATES } from '../../platform/http/platform-http';

// i18n settings.about.title: ℹ️ About
// i18n settings.about.intro: Which version of Mawkingbird Native you have, and whether a newer one is out.
// i18n settings.about.updates: Updates
// i18n settings.about.check: Check for updates
// i18n settings.about.checking: Checking…
// i18n settings.about.current: You have version {{version}}.
// i18n settings.about.upToDate: You're up to date.
// i18n settings.about.available: Version {{version}} is available.
// i18n settings.about.notes: Release notes
// i18n settings.about.download: Open download page
// i18n settings.about.failed: Couldn't check. Try again later.
// i18n settings.about.rateLimited: GitHub is busy. Try again later.
// i18n settings.about.manualOnly: The app only checks when you press the button. It never downloads or installs anything by itself.

/**
 * Settings → About (native only, parity item 3).
 *
 * One request to GitHub's public releases, only when the button is pressed.
 * No background checks, no download, no install, no signing keys (owner
 * decision 2026-11-16). The download page opens in the system browser.
 */
@Component({
  selector: 'app-settings-about',
  imports: [MbButton, MbSettingsRow, TranslocoPipe],
  template: `
    <div class="spage-head">
      <h1>{{ 'settings.about.title' | transloco }}</h1>
      <p>{{ 'settings.about.intro' | transloco }}</p>
    </div>
    <div class="spage-body">
      <div class="ssection">
        <mb-settings-row [heading]="'settings.about.updates' | transloco">
          @if (result(); as r) {
            <p>{{ 'settings.about.current' | transloco: { version: r.current } }}</p>
          }
          <button mbButton type="button" [disabled]="checking()" (click)="check()">
            {{ (checking() ? 'settings.about.checking' : 'settings.about.check') | transloco }}
          </button>
          <div role="status" class="update-result">
            @if (failure(); as key) {
              <p>{{ key | transloco }}</p>
            } @else if (result(); as r) {
              @if (r.update_available && r.latest) {
                <p class="update-available">
                  {{ 'settings.about.available' | transloco: { version: r.latest } }}
                </p>
                @if (r.notes) {
                  <h3 class="notes-heading">{{ 'settings.about.notes' | transloco }}</h3>
                  <pre class="update-notes">{{ r.notes }}</pre>
                }
                @if (r.url) {
                  <a
                    mbButton
                    variant="outline"
                    [href]="r.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    >{{ 'settings.about.download' | transloco }} ↗</a
                  >
                }
              } @else {
                <p>{{ 'settings.about.upToDate' | transloco }}</p>
              }
            }
          </div>
          <p class="hint">{{ 'settings.about.manualOnly' | transloco }}</p>
        </mb-settings-row>
      </div>
    </div>
  `,
  styles: `
    .update-result {
      margin-block: 0.75rem;
    }
    .update-notes {
      white-space: pre-wrap;
      font: inherit;
      max-height: 16rem;
      overflow: auto;
      border-left: 2px solid var(--border);
      padding-left: 0.75rem;
    }
    .notes-heading {
      font-size: 1em;
      margin: 0.5rem 0 0.25rem;
    }
  `,
})
export class SettingsAbout {
  private readonly updates = inject(PLATFORM_UPDATES);
  protected readonly checking = signal(false);
  protected readonly result = signal<NativeUpdateCheck | null>(null);
  protected readonly failure = signal<string | null>(null);

  protected async check(): Promise<void> {
    if (!this.updates || this.checking()) return;
    this.checking.set(true);
    this.failure.set(null);
    try {
      this.result.set(await this.updates.check());
    } catch (error) {
      const kind = (error as { cause?: { kind?: string } })?.cause?.kind;
      this.failure.set(
        kind === 'rate_limit' ? 'settings.about.rateLimited' : 'settings.about.failed',
      );
    } finally {
      this.checking.set(false);
    }
  }
}
