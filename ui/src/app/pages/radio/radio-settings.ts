import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbSettingsRow } from '../../design-system/settings-row/settings-row';
import { RadioPlayer } from './radio-player';
import { AUDIO_SERVICES, ProviderPreferences } from '../../audio-embeds/provider-preferences';

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
// i18n radio.settings.services: Audio services
// i18n radio.settings.servicesHint: When a post links the same music on several services, players for services you subscribe to come first, and players for paid services you don't subscribe to are left out, as long as the post offers one you can play fully. Hidden services never show a player.
// i18n radio.settings.subscribe: I subscribe to {{service}}
// i18n radio.settings.hide: Hide {{service}} players
// i18n radio.settings.showAll: Show all players, including services I don't subscribe to
// i18n radio.settings.showAllHint: Hidden services stay hidden.

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
    <mb-settings-row [heading]="'radio.settings.services' | transloco">
      <p class="hint">{{ 'radio.settings.servicesHint' | transloco }}</p>
      <ul class="services">
        @for (service of services; track service.id) {
          <li>
            <span class="name">{{ service.label }}</span>
            @if (service.paid) {
              <mb-checkbox
                [label]="'radio.settings.subscribe' | transloco: { service: service.label }"
                [checked]="prefs.prefs().subscribed.includes(service.id)"
                (checkedChange)="prefs.setSubscribed(service.id, $event)"
              />
            }
            <mb-checkbox
              [label]="'radio.settings.hide' | transloco: { service: service.label }"
              [checked]="prefs.prefs().hidden.includes(service.id)"
              (checkedChange)="prefs.setHidden(service.id, $event)"
            />
          </li>
        }
      </ul>
      <mb-checkbox
        [label]="'radio.settings.showAll' | transloco"
        [hint]="'radio.settings.showAllHint' | transloco"
        [checked]="prefs.prefs().showAll"
        [disabled]="!prefs.prefs().subscribed.length"
        (checkedChange)="prefs.setShowAll($event)"
      />
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
    .services {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .services li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 16px;
    }
    .name {
      flex: 0 0 9rem;
      font-weight: 600;
    }
  `,
})
export class RadioSettings {
  readonly player = inject(RadioPlayer);
  readonly prefs = inject(ProviderPreferences);
  readonly services = AUDIO_SERVICES;
  readonly providers = computed(() =>
    [...this.player.externalAllowed()]
      .sort()
      .map((id) => ({ id, label: PROVIDER_LABELS[id] ?? id })),
  );
}
