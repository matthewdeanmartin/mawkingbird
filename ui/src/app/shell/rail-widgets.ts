import { computed, inject, Injectable } from '@angular/core';
import { AppMode, AppModeService } from '../platform/build/app-mode';

/**
 * The shell rails' widgets, by name, so a mode can drop the ones that do not
 * belong to it.
 *
 * Rails are never essential: they vanish in zen mode and on phones, so
 * nothing a mode needs may live only here. What this table decides is which
 * *extras* a mode keeps on a wide screen.
 */
export type RailWidget =
  /** Left: your accounts and the profile badge. */
  | 'profile'
  /** Left: accounts boosted into your timeline. */
  | 'whoToFollow'
  /** Left: the server's trending hashtags. */
  | 'trends'
  /** Right: the Mawkingbird Plus badge and promotion. */
  | 'plus'
  /** Right: house ads and endorsements. */
  | 'houseAds'
  /** Right: the Just My Server switch. */
  | 'justMyServer'
  /** Right: your Bluesky service. */
  | 'blueskyService'
  /** Right: Bluesky trending topics. */
  | 'blueskyTrends'
  /** Right: the Fediverse card (feeds, donate, server info, announcements). */
  | 'serverCard';

/**
 * Widgets each mode hides. Anything not listed shows, so a new widget appears
 * everywhere until a mode opts out of it.
 *
 * Blog (owner, 2026-11-17): keep the badges, ads/endorsements and server
 * card; drop the timeline-tuning widgets, which are about scrolling Home.
 */
export const RAIL_HIDDEN: Readonly<Partial<Record<AppMode, readonly RailWidget[]>>> = {
  blog: ['justMyServer', 'trends'],
};

export function railShows(mode: AppMode, widget: RailWidget): boolean {
  return !RAIL_HIDDEN[mode]?.includes(widget);
}

/** The current mode's rail policy, for rail templates. */
@Injectable({ providedIn: 'root' })
export class RailWidgets {
  private readonly mode = inject(AppModeService).mode;
  private readonly cache = new Map<RailWidget, () => boolean>();

  /** A signal-backed check; stable per widget, so templates may call it freely. */
  shows(widget: RailWidget): boolean {
    let check = this.cache.get(widget);
    if (!check) {
      check = computed(() => railShows(this.mode(), widget));
      this.cache.set(widget, check);
    }
    return check();
  }
}
