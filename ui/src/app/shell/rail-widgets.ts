import { computed, inject, Injectable } from '@angular/core';
import { AppMode, AppModeService } from '../platform/build/app-mode';
import { DiscoveryWindow } from '../wellness/discovery-window';

/**
 * The shell rails' widgets, by name, so a mode can drop the ones that do not
 * belong to it and add its own.
 *
 * Rails are never essential: they vanish in zen mode and on phones, so
 * nothing a mode needs may live only here. What this table decides is which
 * *extras* a mode keeps on a wide screen.
 */
export type RailWidget =
  /** Left: your accounts and the profile card. */
  | 'profile'
  /** Left: accounts boosted into your timeline. */
  | 'whoToFollow'
  /** Left: the server's trending hashtags. */
  | 'trends'
  /** Right: the Mawkingbird Plus promotion (also behind the `mawkingbird-plus` flag). */
  | 'plus'
  /** Right: house ads and endorsements. Everywhere. */
  | 'houseAds'
  /** Right: the Just My Server switch. */
  | 'justMyServer'
  /** Right: your Bluesky service. */
  | 'blueskyService'
  /** Right: Bluesky trending topics. */
  | 'blueskyTrends'
  /** Right: the server card (donate, server info, announcements). */
  | 'serverCard'
  /** Right, inside the server card: News, Trending posts, All feeds. */
  | 'feedLinks'
  /** Left, Blog: the author of the blog or post being read. */
  | 'blogAuthor'
  /** Left, Blog: more posts from the same blog. */
  | 'blogMore'
  /** Right, Blog, at the bottom: blogs read recently. */
  | 'blogRecent'
  /** Right, Video: starter kits of YouTubers on Mastodon. */
  | 'youtubers';

/**
 * The Mastodon reading workflow's finders: things that help you find posts,
 * feeds and accounts to follow. In a focused mode they are distractions
 * (owner, 2026-11-17).
 */
const DISCOVERY: readonly RailWidget[] = [
  'whoToFollow',
  'trends',
  'blueskyTrends',
  'justMyServer',
  'feedLinks',
];

/**
 * Rail widgets that are discovery in Wellness's sense and hide while a
 * discovery window is closed. Not Just My Server: that is a switch, not a feed.
 */
const WINDOWED: readonly RailWidget[] = ['whoToFollow', 'trends', 'blueskyTrends', 'feedLinks'];

/**
 * Widgets each mode hides. Anything not listed shows, so a new shared widget
 * appears everywhere until a mode opts out of it.
 */
export const RAIL_HIDDEN: Readonly<Partial<Record<AppMode, readonly RailWidget[]>>> = {
  blog: DISCOVERY,
  // In Explore the page is the finder; rail finders would only repeat it.
  explore: DISCOVERY,
  radio: DISCOVERY,
  unbird: DISCOVERY,
  video: DISCOVERY,
};

/** Widgets that belong to some modes only, and show nowhere else. */
export const RAIL_ONLY: Readonly<Partial<Record<RailWidget, readonly AppMode[]>>> = {
  blogAuthor: ['blog'],
  blogMore: ['blog'],
  blogRecent: ['blog'],
  youtubers: ['video'],
};

export function railShows(mode: AppMode, widget: RailWidget): boolean {
  const only = RAIL_ONLY[widget];
  if (only && !only.includes(mode)) {
    return false;
  }
  return !RAIL_HIDDEN[mode]?.includes(widget);
}

/** The current mode's rail policy, for rail templates. */
@Injectable({ providedIn: 'root' })
export class RailWidgets {
  private readonly mode = inject(AppModeService).mode;
  private readonly discovery = inject(DiscoveryWindow);
  private readonly cache = new Map<RailWidget, () => boolean>();

  /** A signal-backed check; stable per widget, so templates may call it freely. */
  shows(widget: RailWidget): boolean {
    let check = this.cache.get(widget);
    if (!check) {
      check = computed(
        () =>
          railShows(this.mode(), widget) &&
          // Closed discovery stays closed in the rails too: trends and finders
          // are discovery, just smaller.
          (this.discovery.open() || !WINDOWED.includes(widget)),
      );
      this.cache.set(widget, check);
    }
    return check();
  }
}
