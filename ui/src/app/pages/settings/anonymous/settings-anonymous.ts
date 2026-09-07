import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { AnonymousPreferences } from '../../../providers/anonymous/anonymous-preferences';

/**
 * English source strings; `public/i18n/en.json` is generated from these by
 * `scripts/extract-i18n.mjs`. Edit the comment, never the JSON.
 */
// i18n settings.anonymous.title: Anonymous
// i18n settings.anonymous.intro: Control how the browser-local Anonymous home feed is assembled.
// i18n settings.anonymous.maxAge: Maximum age of posts from followed accounts
// i18n settings.anonymous.maxAge.hint: Older posts are left out when Anonymous builds Home. Posts from followed hashtags are not affected.
// i18n settings.anonymous.age.days30: 30 days
// i18n settings.anonymous.age.months3: 3 months
// i18n settings.anonymous.age.months6: 6 months
// i18n settings.anonymous.age.years1: 1 year
// i18n settings.anonymous.age.years2: 2 years
// i18n settings.anonymous.age.years5: 5 years
@Component({
  selector: 'app-settings-anonymous',
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './settings-anonymous.html',
  styleUrl: './settings-anonymous.css',
})
export class SettingsAnonymous {
  protected prefs = inject(AnonymousPreferences);

  /**
   * Retention choices, as keys rather than English.
   *
   * These read like fixed quantities, but "1 year" and "2 years" differ by
   * grammatical number, and languages with more than two plural categories
   * (Russian has six) inflect "5 years" differently again. One key per option
   * lets each locale write each one correctly, rather than composing a number
   * with a noun the app would have to decline.
   */
  protected readonly ageOptions = [
    { days: 30, key: 'settings.anonymous.age.days30' },
    { days: 90, key: 'settings.anonymous.age.months3' },
    { days: 180, key: 'settings.anonymous.age.months6' },
    { days: 365, key: 'settings.anonymous.age.years1' },
    { days: 730, key: 'settings.anonymous.age.years2' },
    { days: 1825, key: 'settings.anonymous.age.years5' },
  ];

  protected setMaximumAge(days: string | number): void {
    this.prefs.setFollowedPostMaxAgeDays(Number(days));
  }
}
