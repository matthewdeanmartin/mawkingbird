import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AppInstall } from '../../shell/app-install/app-install';
import { MbButton } from '../../design-system/button/button';
import { MbDisclosure } from '../../design-system/disclosure/disclosure';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { MbSettingsRow } from '../../design-system/settings-row/settings-row';

// i18n settings.app.title: Install Mawkingbird
// i18n settings.app.intro: Download Mawkingbird for your computer.
// i18n settings.app.windows: Windows (x64)
// i18n settings.app.windowsInstaller: Installer (.exe)
// i18n settings.app.windowsMsi: MSI package
// i18n settings.app.mac: macOS (Apple Silicon)
// i18n settings.app.macDmg: Disk image (.dmg)
// i18n settings.app.linux: Linux (x86-64)
// i18n settings.app.linuxAppImage: AppImage
// i18n settings.app.linuxDeb: Debian package (.deb)
// i18n settings.app.linuxRpm: RPM package
// i18n settings.app.advancedPwa: Advanced: install the web app (PWA)
// i18n settings.app.row: Install from your browser
// i18n settings.app.install: Install Mawkingbird
// i18n settings.app.installed: Installed. You're using Mawkingbird as an app right now.
// i18n settings.app.justInstalled: Installed. Open Mawkingbird from your home screen, dock or app list.
// i18n settings.app.ios: On iPhone or iPad: tap Share, then "Add to Home Screen". (Sharing into Mawkingbird from other apps isn't available on iOS.)
// i18n settings.app.macSafari: In Safari on a Mac: choose File → Add to Dock.
// i18n settings.app.manual: This browser doesn't offer an install button to websites. In Chrome or Edge, use the install icon in the address bar or the browser menu's "Install" item. Firefox can't install web apps on most systems.
// i18n settings.app.shareRow: Sharing into Mawkingbird
// i18n settings.app.share: Once installed (Android, or Chrome and Edge on a computer), Mawkingbird appears in the Share menu. Sharing a link or text opens a new post with it filled in; nothing is posted until you press Post.

/** Settings → Install app: desktop downloads first, browser installation in a disclosure. */
@Component({
  selector: 'app-settings-app',
  imports: [MbSettingsRow, MbButton, MbDisclosure, MbContentLink, TranslocoPipe],
  template: `
    <div class="spage-head">
      <h1>{{ 'settings.app.title' | transloco }}</h1>
      <p>{{ 'settings.app.intro' | transloco }}</p>
    </div>
    <div class="spage-body">
      <div class="ssection">
        <mb-settings-row [heading]="'settings.app.windows' | transloco">
          <ul class="download-list">
            @for (download of downloads.windows; track download.href) {
              <li>
                <a mbContentLink [href]="download.href">{{ download.label | transloco }}</a>
              </li>
            }
          </ul>
        </mb-settings-row>
        <mb-settings-row [heading]="'settings.app.mac' | transloco">
          <ul class="download-list">
            @for (download of downloads.mac; track download.href) {
              <li>
                <a mbContentLink [href]="download.href">{{ download.label | transloco }}</a>
              </li>
            }
          </ul>
        </mb-settings-row>
        <mb-settings-row [heading]="'settings.app.linux' | transloco">
          <ul class="download-list">
            @for (download of downloads.linux; track download.href) {
              <li>
                <a mbContentLink [href]="download.href">{{ download.label | transloco }}</a>
              </li>
            }
          </ul>
        </mb-settings-row>
        <mb-disclosure [label]="'settings.app.advancedPwa' | transloco">
          <mb-settings-row [heading]="'settings.app.row' | transloco">
            @if (install.installed()) {
              <p class="install-note" role="status">{{ 'settings.app.installed' | transloco }}</p>
            } @else if (justInstalled()) {
              <p class="install-note" role="status">
                {{ 'settings.app.justInstalled' | transloco }}
              </p>
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
        </mb-disclosure>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .install-note {
      margin: 0;
      line-height: 1.5;
    }
    .download-list {
      margin: 0;
      padding-inline-start: 1.25rem;
    }
    .download-list li + li {
      margin-block-start: 0.35rem;
    }
  `,
})
export class SettingsApp {
  protected readonly downloads = {
    windows: [
      {
        label: 'settings.app.windowsInstaller',
        href: 'https://github.com/matthewdeanmartin/mawkingbird/releases/download/native-v0.1.0/Mawkingbird.Native_0.1.0_x64-setup.exe',
      },
      {
        label: 'settings.app.windowsMsi',
        href: 'https://github.com/matthewdeanmartin/mawkingbird/releases/download/native-v0.1.0/Mawkingbird.Native_0.1.0_x64_en-US.msi',
      },
    ],
    mac: [
      {
        label: 'settings.app.macDmg',
        href: 'https://github.com/matthewdeanmartin/mawkingbird/releases/download/native-v0.1.0/Mawkingbird.Native_0.1.0_aarch64.dmg',
      },
    ],
    linux: [
      {
        label: 'settings.app.linuxAppImage',
        href: 'https://github.com/matthewdeanmartin/mawkingbird/releases/download/native-v0.1.0/Mawkingbird.Native_0.1.0_amd64.AppImage',
      },
      {
        label: 'settings.app.linuxDeb',
        href: 'https://github.com/matthewdeanmartin/mawkingbird/releases/download/native-v0.1.0/Mawkingbird.Native_0.1.0_amd64.deb',
      },
      {
        label: 'settings.app.linuxRpm',
        href: 'https://github.com/matthewdeanmartin/mawkingbird/releases/download/native-v0.1.0/Mawkingbird.Native-0.1.0-1.x86_64.rpm',
      },
    ],
  };
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
