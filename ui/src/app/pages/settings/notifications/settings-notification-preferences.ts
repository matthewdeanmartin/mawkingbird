import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbField, MbControl } from '../../../design-system/field/field';
import { MbPageHeader } from '../../../design-system/page-header/page-header';
import { MbSettingsRow } from '../../../design-system/settings-row/settings-row';
import { MenuIndicators } from '../../../menu-indicators';

// i18n settings.indicators.title: Notification Frequence and Intensity
// i18n settings.indicators.hint: Choose when the Notification and Chat menu icons show activity. Changes apply immediately and are saved in this browser. Chat unread markers and live messages work as usual.
// i18n settings.indicators.delivery: Notification delivery
// i18n settings.indicators.hours: Delivery hours
// i18n settings.indicators.hours.hint: Enter hours from 0–23, separated by commas. Leave empty for immediate dots. Times use this device's timezone and round to the nearest hour.
// i18n settings.indicators.hours.error: Enter hours from 0–23 separated by commas, or leave empty for immediate dots.
// i18n settings.indicators.quietTitle: Quiet hours
// i18n settings.indicators.start: Quiet hours start
// i18n settings.indicators.end: Quiet hours end
// i18n settings.indicators.hour.hint: Hour from 0–23 in this device's timezone.
// i18n settings.indicators.chat: Chat
// i18n settings.indicators.batch: Batch interval in minutes
// i18n settings.indicators.batch.hint: Use 0 for immediate indicators, or up to 1440 minutes between batches.
// i18n settings.indicators.quiet: Quiet hours hold replies and DMs too. Equal start and end hours disable quiet hours. Chat stays quiet while its page is visible and the app has focus.
@Component({
  selector: 'app-settings-notification-preferences',
  imports: [FormsModule, TranslocoPipe, MbField, MbControl, MbPageHeader, MbSettingsRow],
  templateUrl: './settings-notification-preferences.html',
})
export class SettingsNotificationPreferences {
  protected readonly indicators = inject(MenuIndicators);
  protected readonly invalidHours = signal(false);

  protected hours(value: string): void {
    const hours = value.trim() ? value.split(',').map((part) => Number(part.trim())) : [];
    const valid =
      (!value.trim() || value.split(',').every((part) => part.trim().length > 0)) &&
      hours.every((hour) => Number.isFinite(hour) && hour >= 0 && hour < 24);
    this.invalidHours.set(!valid);
    if (valid) this.indicators.configure({ hours });
  }
}
