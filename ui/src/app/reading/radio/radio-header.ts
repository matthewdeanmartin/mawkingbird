import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { RadioIcon } from './radio-icon';

// i18n radio.settingsLink: Radio settings

/**
 * A Radio page's title row: the heading, the page's own actions, and the
 * settings shortcut every Radio page carries (settings are not a menu tab).
 */
@Component({
  selector: 'app-radio-header',
  imports: [RouterLink, TranslocoPipe, MbButton, RadioIcon],
  template: `
    <header class="radio-header">
      <h1>{{ heading() }}</h1>
      <div class="radio-header-actions">
        <ng-content />
        <a
          mbButton
          variant="outline"
          size="small"
          routerLink="/radio/settings"
          [attr.aria-label]="'radio.settingsLink' | transloco"
          [title]="'radio.settingsLink' | transloco"
        >
          <app-radio-icon name="settings" />
        </a>
      </div>
    </header>
  `,
  styles: `
    :host {
      display: block;
    }
    .radio-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px 16px;
    }
    h1 {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .radio-header-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
  `,
})
export class RadioHeader {
  readonly heading = input.required<string>();
}
