import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbIcon } from '../../design-system/icon/icon';
import { MbPageHeader } from '../../design-system/page-header/page-header';

// i18n radio.settingsLink: Radio settings

/**
 * A Radio page's title row: the heading, the page's own actions, and the
 * settings shortcut every Radio page carries (settings are not a menu tab).
 */
@Component({
  selector: 'app-radio-header',
  imports: [RouterLink, TranslocoPipe, MbButton, MbIcon, MbPageHeader],
  template: `
    <mb-page-header embedded [title]="heading()">
      <ng-content />
      <a
        mbButton
        variant="compact"
        routerLink="/radio/settings"
        [attr.aria-label]="'radio.settingsLink' | transloco"
        [title]="'radio.settingsLink' | transloco"
      >
        <mb-icon name="settings" />
      </a>
    </mb-page-header>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class RadioHeader {
  readonly heading = input.required<string>();
}
