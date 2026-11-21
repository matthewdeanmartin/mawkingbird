import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { Terminology } from '../../i18n/terminology';
import { Wellness } from '../../wellness/wellness';
import {
  PRESET_FLAGS,
  WELLNESS_KEYS,
  WELLNESS_PRESETS,
  WellnessKey,
  WellnessPreset,
} from '../../wellness/wellness-model';

/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.wellness.title: 🌱 Wellness
// i18n settings.wellness.intro: What the app counts, shows and invites. Nothing here is a judgement: pick a level, then move any switch you like. Your choices sync with your other settings.
// i18n settings.wellness.notZen: Looking for fewer widgets on screen? That's Zen mode, under Appearance.
// i18n settings.wellness.level: Level
// i18n settings.wellness.preset.off: Off
// i18n settings.wellness.preset.off.hint: How Mawkingbird has always been. The protections that are always on still apply.
// i18n settings.wellness.preset.gentle: Gentle
// i18n settings.wellness.preset.gentle.hint: Numbers out of the feed, no pop-ups, Good Stuff moved to Feeds.
// i18n settings.wellness.preset.strong: Strong
// i18n settings.wellness.preset.strong.hint: Gentle, plus no popularity on profiles, quieter notifications, closed discovery, check-ins and breaks.
// i18n settings.wellness.custom: Custom, starting from {{preset}}
// i18n settings.wellness.protections: Protections
// i18n settings.wellness.inPreset: in {{preset}}
// i18n settings.wellness.soon: arrives in a later update
// i18n settings.wellness.key.hidePostCounts: Hide like, boost, reply and quote counts in feeds
// i18n settings.wellness.key.hidePostCounts.hint: Open a post to see its numbers. Applies on every network.
// i18n settings.wellness.key.hideProfileCounts: Hide follower, following and post counts on profiles
// i18n settings.wellness.key.hideProfileCounts.hint: Also hides the follower-based blue checks, which are popularity in another form. Your private self-check stays.
// i18n settings.wellness.key.noHoverCards: No profile pop-ups on hover
// i18n settings.wellness.key.noHoverCards.hint: Lingering over a name no longer opens a card. Click through to the profile when you mean to.
// i18n settings.wellness.key.limitedNotifications: Limited notifications
// i18n settings.wellness.key.limitedNotifications.hint: Favourites, boosts and new followers stop arriving. Replies, mentions and messages still do.
// i18n settings.wellness.key.hideAnalytics: Hide analytics
// i18n settings.wellness.key.hideAnalytics.hint: Removes the ways into post, account and feed analytics. A bookmarked analytics address still works.
// i18n settings.wellness.key.forceCalm: Always use Calm
// i18n settings.wellness.key.forceCalm.hint: Calm hides posts written to provoke. With this on, it is on in every feed that offers it.
// i18n settings.wellness.key.demoteGoodStuff: Move Good Stuff to Feeds
// i18n settings.wellness.key.demoteGoodStuff.hint: The popularity-ranked view leaves the Algo menu. It's still in Feeds when you go looking for it.
// i18n settings.wellness.key.discoveryWindows: Discovery windows
// i18n settings.wellness.key.discoveryWindows.hint: Explore, trends, Good Stuff and public timelines open for a window you choose, then close.
// i18n settings.wellness.key.checkIn: Check in when I open the app
// i18n settings.wellness.key.checkIn.hint: One question: what are you here for? Then it takes you there.
// i18n settings.wellness.key.breakReminders: Suggest breaks
// i18n settings.wellness.key.breakReminders.hint: Only at natural stopping points, like the end of a batch. Never in the middle of a post.
// i18n settings.wellness.key.autoGrayscale: Fade to gray after a while
// i18n settings.wellness.key.autoGrayscale.hint: After 45 minutes in a day the colour fades out over 15 minutes. Resets at 4am.
// i18n settings.wellness.key.grayscale: Grayscale now
// i18n settings.wellness.key.grayscale.hint: The whole app in gray, right now. Not part of any level.
// i18n settings.wellness.existing: Already protecting you
// i18n settings.wellness.existing.intro: These live on other settings pages too. Changing them here changes them there.
// i18n settings.wellness.alwaysOn: Always on
// i18n settings.wellness.alwaysOn.hint: No infinite scroll. Every feed ends, and you choose whether to load another batch.
// i18n settings.wellness.notificationHours: Notification dots arrive at the hours you pick, with quiet hours overnight.
// i18n settings.wellness.notificationHours.link: Notification timing
// i18n settings.wellness.calm: Calm in the Algo feed

/**
 * Settings → Wellness: one page for what the app counts, shows and invites.
 *
 * The preset/override model is in wellness/wellness-model.ts. The lower half
 * mirrors protections that already have a home elsewhere (Appearance, Writing,
 * Algo, Notifications): the owner asked for them in both places (2026-11-20),
 * on the same reasoning as Writing/Privacy sharing posting defaults: people
 * shouldn't have to guess which category we filed a setting under.
 */
@Component({
  selector: 'app-settings-wellness',
  imports: [FormsModule, RouterLink, TranslocoPipe],
  templateUrl: './settings-wellness.html',
})
export class SettingsWellness {
  protected wellness = inject(Wellness);
  protected prefs = inject(ClientPrefs);
  protected words = inject(Terminology).words;

  protected readonly presets = WELLNESS_PRESETS;
  /**
   * Switches whose behaviour ships in a later sprint. They are listed so the
   * page reads as the whole plan, but disabled so nobody turns on a switch
   * that does nothing yet. Remove a key here when its sprint lands.
   */
  private readonly pending: ReadonlySet<WellnessKey> = new Set<WellnessKey>([
    'demoteGoodStuff',
    'discoveryWindows',
    'checkIn',
    'breakReminders',
    'autoGrayscale',
  ]);

  protected readonly rows = computed(() => {
    const flags = this.wellness.flags();
    return WELLNESS_KEYS.map((key) => ({
      key,
      on: flags[key],
      pending: this.pending.has(key),
      inPreset: PRESET_FLAGS[this.wellness.preset()][key],
    }));
  });

  protected presetKey(preset: WellnessPreset): string {
    return `settings.wellness.preset.${preset}`;
  }

  protected choosePreset(preset: WellnessPreset): void {
    this.wellness.setPreset(preset);
  }

  protected toggle(key: WellnessKey, on: boolean): void {
    this.wellness.set(key, on);
  }
}
