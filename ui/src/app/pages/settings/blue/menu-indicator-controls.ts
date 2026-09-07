import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { MenuIndicators } from '../../../menu-indicators';

// i18n settings.indicators.title: Menu activity indicators
// i18n settings.indicators.hint: Only the Notification and Chat menu icons change. Chat unread markers and live messages work as usual. Times use this device's timezone and round to the nearest hour.
// i18n settings.indicators.hours: Notification delivery hours (0–23, separated by commas)
// i18n settings.indicators.start: Quiet hours start
// i18n settings.indicators.end: Quiet hours end
// i18n settings.indicators.batch: Chat batch interval in minutes (0 for immediate)
// i18n settings.indicators.quiet: Quiet hours hold replies and DMs too. Equal start and end hours disable quiet hours. Chat stays quiet while its page is visible and the app has focus.
@Component({
  selector: 'app-menu-indicator-controls',
  imports: [FormsModule, TranslocoPipe],
  template: `
    <fieldset>
      <legend>{{ 'settings.indicators.title' | transloco }}</legend>
      <p>{{ 'settings.indicators.hint' | transloco }}</p>
      <label
        >{{ 'settings.indicators.hours' | transloco }}
        <input
          [ngModel]="indicators.preferences().hours.join(', ')"
          (change)="hours($any($event.target).value)"
        />
      </label>
      <label
        >{{ 'settings.indicators.start' | transloco }}
        <input
          type="number"
          min="0"
          max="23"
          [ngModel]="indicators.preferences().quietStart"
          (ngModelChange)="indicators.configure({ quietStart: $event })"
        />
      </label>
      <label
        >{{ 'settings.indicators.end' | transloco }}
        <input
          type="number"
          min="0"
          max="23"
          [ngModel]="indicators.preferences().quietEnd"
          (ngModelChange)="indicators.configure({ quietEnd: $event })"
        />
      </label>
      <label
        >{{ 'settings.indicators.batch' | transloco }}
        <input
          type="number"
          min="0"
          max="1440"
          [ngModel]="indicators.preferences().chatMinutes"
          (ngModelChange)="indicators.configure({ chatMinutes: $event })"
        />
      </label>
      <p>{{ 'settings.indicators.quiet' | transloco }}</p>
    </fieldset>
  `,
  styles: `
    label {
      display: grid;
      gap: 0.4rem;
      margin-block: 1rem;
    }
    input {
      max-width: 20rem;
    }
  `,
})
export class MenuIndicatorControls {
  protected indicators = inject(MenuIndicators);
  protected hours(value: string): void {
    const hours = value.split(',').map((part) => Number(part.trim()));
    if (value.trim() && hours.every((hour) => Number.isFinite(hour) && hour >= 0 && hour < 24))
      this.indicators.configure({ hours });
  }
}
