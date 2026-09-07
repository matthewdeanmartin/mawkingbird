import { Component, inject } from '@angular/core';
import { HouseAdStore } from '../../../house-ad-store';
import { HOUSE_ADS_SHOWN } from '../../../house-ads';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Settings → Ads: the whole inventory, what you clicked, and the off switches.
 *
 * Reachable at `/settings/spotlight` rather than `/settings/ads`. The rail's
 * markup already avoids `ad-*` class names because blockers hide those
 * cosmetically (there is a test pinning that); a deep link whose path contains
 * `/ads` is the same hazard one layer out, and the label the user sees is "Ads"
 * either way. The CSS classes here follow the rail's `spotlight-` naming for
 * exactly the same reason.
 *
 * Every control applies immediately. There is no Save button because there is
 * nothing to submit — this is browser-local state, and the rail reads the same
 * signals, so a toggle here changes the rail on the next render.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.spotlight.title: Endorsements
// i18n settings.spotlight.intro: The cards in the right rail are house endorsements — our own projects, and things we think are worth your time. Nobody pays for them, no third party is involved, and nothing about you leaves this browser.
// i18n settings.spotlight.rotation: Only {{shown}} are shown at a time, and they change every half hour. The donate links further down the rail are not endorsements and stay put.
// i18n settings.spotlight.show: Show endorsements
// i18n settings.spotlight.show.label: Show house endorsements in the right rail
// i18n settings.spotlight.show.hint: Off means none at all, whatever the individual switches below say. Those keep their settings for when you turn it back on.
// i18n settings.spotlight.each: Each one
// i18n settings.spotlight.clicks.explain: Clicks are counted here and nowhere else — there is no server to report them to and no request is made. They're here so you can see which of these you actually found useful.
// i18n settings.spotlight.showOne: Show “{{title}}”
// i18n settings.spotlight.pill.allOff: All endorsements off
// i18n settings.spotlight.pill.off: Off
// i18n settings.spotlight.pill.dismissed: Dismissed until reload
// i18n settings.spotlight.pill.showing: Showing now
// i18n settings.spotlight.pill.upNext: Up next
// i18n settings.spotlight.click.one: click
// i18n settings.spotlight.click.other: clicks
// i18n settings.spotlight.lastClicked: · last {{when}}
// i18n settings.spotlight.neverClicked: Never clicked
// i18n settings.spotlight.enableAll: Turn them all back on
// i18n settings.spotlight.forget.one: Forget my {{count}} click
// i18n settings.spotlight.forget.other: Forget my {{count}} clicks
@Component({
  imports: [TranslocoPipe],
  selector: 'app-settings-spotlight',
  templateUrl: './settings-spotlight.html',
  styleUrl: './settings-spotlight.css',
})
export class SettingsSpotlight {
  protected readonly store = inject(HouseAdStore);
  protected readonly shown = HOUSE_ADS_SHOWN;

  /** "28 Jul 2026", or '' when the timestamp is missing or unparseable. */
  protected clickedOn(iso: string): string {
    if (!iso) {
      return '';
    }
    const when = new Date(iso);
    return Number.isNaN(when.getTime())
      ? ''
      : when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
