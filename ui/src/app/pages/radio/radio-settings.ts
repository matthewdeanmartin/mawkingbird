import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbSettingsRow } from '../../design-system/settings-row/settings-row';
import { RadioPlayer } from './radio-player';

// i18n radio.settings.title: Radio settings
// i18n radio.settings.intro: These choices apply to Radio for this account in this browser.
// i18n radio.settings.players: Allowed players
// i18n radio.settings.playersHint: Radio loads and starts these services' players without asking. Feeds still load players only when you choose.
// i18n radio.settings.noPlayers: No services are allowed yet. Radio asks the first time a service's track plays.
// i18n radio.settings.forget: Remove {{provider}}
// i18n radio.settings.playback: Playback
// i18n radio.settings.continuous: Play the next track automatically
// i18n radio.settings.continuousHint: Turn off to stop after each recording, for example while listening to podcasts.
// i18n radio.settings.volume: Starting volume

const PROVIDER_LABELS: Record<string, string> = { soundcloud: 'SoundCloud', mixcloud: 'Mixcloud' };

/** Radio-only preferences, kept beside the player rather than in the main settings. */
@Component({
  selector: 'app-radio-settings',
  imports: [FormsModule, TranslocoPipe, MbButton, MbCheckbox, MbField, MbControl, MbSettingsRow],
  template: `
    <h2>{{ 'radio.settings.title' | transloco }}</h2>
    <p class="hint">{{ 'radio.settings.intro' | transloco }}</p>
    <mb-settings-row [heading]="'radio.settings.players' | transloco">
      <p class="hint">{{ 'radio.settings.playersHint' | transloco }}</p>
      @for (provider of providers(); track provider.id) {
        <div class="provider">
          <span>{{ provider.label }}</span>
          <button
            mbButton
            variant="outline"
            size="small"
            type="button"
            (click)="player.forgetProvider(provider.id)"
          >
            {{ 'radio.settings.forget' | transloco: { provider: provider.label } }}
          </button>
        </div>
      } @empty {
        <p>{{ 'radio.settings.noPlayers' | transloco }}</p>
      }
    </mb-settings-row>
    <mb-settings-row [heading]="'radio.settings.playback' | transloco">
      <mb-checkbox
        [label]="'radio.settings.continuous' | transloco"
        [hint]="'radio.settings.continuousHint' | transloco"
        [checked]="player.continuous()"
        (checkedChange)="player.setContinuous($event)"
      />
      <mb-field
        [label]="'radio.settings.volume' | transloco"
        [hint]="(player.volume() * 100).toFixed(0) + '%'"
      >
        <input
          mbControl
          type="range"
          min="0"
          max="1"
          step="0.05"
          name="volume"
          [ngModel]="player.volume()"
          (ngModelChange)="player.setVolume(+$event)"
        />
      </mb-field>
    </mb-settings-row>
  `,
  styles: `
    :host {
      display: block;
    }
    .hint {
      margin: 0;
      color: var(--muted);
    }
    .provider {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    p {
      margin: 0;
    }
  `,
})
export class RadioSettings {
  readonly player = inject(RadioPlayer);
  readonly providers = computed(() =>
    [...this.player.externalAllowed()]
      .sort()
      .map((id) => ({ id, label: PROVIDER_LABELS[id] ?? id })),
  );
}
