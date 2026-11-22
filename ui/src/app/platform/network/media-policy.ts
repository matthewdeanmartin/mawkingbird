import { Injectable, signal } from '@angular/core';

/**
 * What a screen wants posts to spend on media, when it wants something other
 * than the app-wide defaults (spec/lite-next-hour.md, Sprint A).
 *
 * Lite's shell sets {@link override} from its load-control bar while it is
 * open and clears it on the way out; the shared status card follows it live.
 * With no override, cards keep their usual behaviour (the reader's image
 * preference and the data saver).
 */
export type PicturePolicy = 'off' | 'tap' | 'on';

export interface MediaOverride {
  /** Photo previews and link-card images: none, wait for a tap, or load. */
  pictures: PicturePolicy;
  /** Author pictures; initials stand in when false. */
  avatars: boolean;
  /** Video and audio players (posters, embeds); a Play button stands in when false. */
  previews: boolean;
}

/** Remembered image URLs; a day of heavy reading stays far below this. */
const MAX_SEEN = 2_000;

@Injectable({ providedIn: 'root' })
export class MediaPolicy {
  readonly override = signal<MediaOverride | null>(null);

  /**
   * Pictures this tab has already loaded. Under "tap to load" they show at
   * once: the browser already has the bytes, so holding them back would save
   * nothing and only hide what the reader saw a moment ago in the full app.
   */
  private readonly seen = new Set<string>();

  noteLoaded(url: string | null | undefined): void {
    if (!url) return;
    this.seen.add(url);
    if (this.seen.size > MAX_SEEN) {
      const oldest = this.seen.values().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
  }

  wasLoaded(url: string | null | undefined): boolean {
    return !!url && this.seen.has(url);
  }
}
