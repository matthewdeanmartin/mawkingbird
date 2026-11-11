import { Component, computed, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AppInstall } from '../../shell/app-install/app-install';
import { MbButton } from '../../design-system/button/button';
import { MbSettingsRow } from '../../design-system/settings-row/settings-row';

// i18n settings.app.title: Install app
// i18n settings.app.intro: Install Mawkingbird to open it in its own window and share links to it from other apps.
// i18n settings.app.row: Mawkingbird as an app
// i18n settings.app.install: Install Mawkingbird
// i18n settings.app.installed: Installed. You're using Mawkingbird as an app right now.
// i18n settings.app.justInstalled: Installed. Open Mawkingbird from your home screen, dock or app list.
// i18n settings.app.ios: On iPhone or iPad: tap Share, then "Add to Home Screen". (Sharing into Mawkingbird from other apps isn't available on iOS.)
// i18n settings.app.macSafari: In Safari on a Mac: choose File → Add to Dock.
// i18n settings.app.manual: This browser doesn't offer an install button to websites. In Chrome or Edge, use the install icon in the address bar or the browser menu's "Install" item. Firefox can't install web apps on most systems.
// i18n settings.app.shareRow: Sharing into Mawkingbird
// i18n settings.app.share: Once installed (Android, or Chrome and Edge on a computer), Mawkingbird appears in the Share menu. Sharing a link or text opens a new post with it filled in; nothing is posted until you press Post.

/** Settings → Install app: the install button where the browser allows one, instructions elsewhere. */
@Component({
  selector: 'app-settings-app',
  imports: [MbSettingsRow, MbButton, TranslocoPipe],
  template: `
    <div class="spage-head">
      <h1>{{ 'settings.app.title' | transloco }}</h1>
      <p>{{ 'settings.app.intro' | transloco }}</p>
    </div>
    <div class="spage-body">
      <div class="ssection">
        <mb-settings-row [heading]="'settings.app.row' | transloco">
          @if (install.installed()) {
            <p class="install-note" role="status">{{ 'settings.app.installed' | transloco }}</p>
          } @else if (justInstalled()) {
            <p class="install-note" role="status">{{ 'settings.app.justInstalled' | transloco }}</p>
          } @else {
            @switch (route()) {
              @case ('prompt') {
                <button mbButton type="button" (click)="installNow()">
                  {{ 'settings.app.install' | transloco }}
                </button>
              }
              @case ('ios') {
                <p class="install-note">{{ 'settings.app.ios' | transloco }}</p>
              }
              @case ('mac-safari') {
                <p class="install-note">{{ 'settings.app.macSafari' | transloco }}</p>
              }
              @default {
                <p class="install-note">{{ 'settings.app.manual' | transloco }}</p>
              }
            }
          }
        </mb-settings-row>
        <mb-settings-row [heading]="'settings.app.shareRow' | transloco">
          <p class="install-note">{{ 'settings.app.share' | transloco }}</p>
        </mb-settings-row>
      </div>
    </div>
  `,
  styles: `
    .install-note {
      margin: 0;
      line-height: 1.5;
    }
  `,
})
export class SettingsApp {
  protected readonly install = inject(AppInstall);
  protected readonly justInstalled = signal(false);
  protected readonly route = computed(() => {
    // Read the signal so the view updates when Chrome's prompt arrives late.
    this.install.canPrompt();
    return this.install.route();
  });

  protected async installNow(): Promise<void> {
    if (await this.install.prompt()) this.justInstalled.set(true);
  }
}
