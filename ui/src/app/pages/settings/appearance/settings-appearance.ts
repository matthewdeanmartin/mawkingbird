import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MockApi } from '../../../mock-api';
import { ClientPrefs } from '../../../client-prefs';
import { AppearanceSettings } from '../../../models';
import { Server } from '../../../server';
import { BlueControls } from '../blue/blue-controls';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Appearance: the shared Mockingbird Blue controls (theme, accent, undo send,
 * reader typography — instant, localStorage) plus media/motion/spoiler
 * preferences stored on the mock server and only shown there.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.appearance.title: Appearance
// i18n settings.appearance.intro: Adjust how the web interface looks and behaves.
// i18n settings.appearance.media: Media display
// i18n settings.appearance.media.default: Hide media marked as sensitive
// i18n settings.appearance.media.showAll: Always show media
// i18n settings.appearance.media.hideAll: Always hide media
// i18n settings.appearance.animations: Animations
// i18n settings.appearance.reduceMotion: Reduce motion in animations
// i18n settings.appearance.disableSwiping: Disable swiping motions
// i18n settings.appearance.contentWarnings: Content warnings
// i18n settings.appearance.expandSpoilers: Always expand posts marked with content warnings
// i18n common.saved: Saved ✓
// i18n common.saving: Saving…
// i18n common.saveChanges: Save changes
@Component({
  selector: 'app-settings-appearance',
  imports: [FormsModule, BlueControls, TranslocoPipe],
  templateUrl: './settings-appearance.html',
})
export class SettingsAppearance implements OnInit {
  private api = inject(MockApi);
  private server = inject(Server);

  protected readonly prefs = inject(ClientPrefs);

  /** Whether the server-backed preference rows apply (mock instance only). */
  protected readonly isMock = this.server.isMock;

  protected displayMedia = signal<AppearanceSettings['display_media']>('default');
  protected reduceMotion = signal(false);
  protected disableSwiping = signal(false);
  protected expandSpoilers = signal(false);
  protected saving = signal(false);
  protected saved = signal(false);

  ngOnInit(): void {
    if (!this.isMock) {
      return;
    }
    this.api.mockSettings().subscribe((settings) => {
      const a = settings.appearance;
      this.displayMedia.set(a.display_media);
      this.reduceMotion.set(a.reduce_motion);
      this.disableSwiping.set(a.disable_swiping);
      this.expandSpoilers.set(a.expand_spoilers);
    });
  }

  protected save(): void {
    if (this.saving() || !this.isMock) {
      return;
    }
    this.saving.set(true);
    this.saved.set(false);

    const appearance: AppearanceSettings = {
      theme: this.prefs.themeMode(),
      display_media: this.displayMedia(),
      reduce_motion: this.reduceMotion(),
      disable_swiping: this.disableSwiping(),
      expand_spoilers: this.expandSpoilers(),
    };

    this.api.updateMockSettings({ appearance }).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
      },
      error: () => this.saving.set(false),
    });
  }
}
