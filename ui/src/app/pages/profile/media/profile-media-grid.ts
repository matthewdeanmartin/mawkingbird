import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TrustedAccounts } from '../../../trusted-accounts';
import { ProfileMediaItem } from './profile-media-item';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * The photo wall on a profile's Media tab.
 *
 * Three columns of square, text-free tiles — one per image — because the whole
 * point of this tab is to look at somebody's pictures rather than read their
 * posts. Clicking a tile opens the photo viewer.
 *
 * Nothing here loads on its own: the parent hands over the items it has, and
 * more arrive only when the reader presses "More". No infinite scroll anywhere
 * in this feature.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n pages.profile.media.loadingPictures: Loading pictures…
// i18n pages.profile.media.nothingToShow: Nothing to show here.
// i18n pages.profile.media.noPicturesYet: No pictures yet.
// i18n pages.profile.media.sensitiveImageReveal: Sensitive image, click to reveal
// i18n pages.profile.media.openPicture: Open picture
// i18n pages.profile.media.sensitiveBadge: Sensitive
// i18n pages.profile.media.loading: Loading…
// i18n pages.profile.media.more: More
@Component({
  selector: 'app-profile-media-grid',
  imports: [TranslocoPipe],
  templateUrl: './profile-media-grid.html',
  styleUrl: './profile-media-grid.css',
})
export class ProfileMediaGrid {
  private trusted = inject(TrustedAccounts);

  readonly items = input.required<ProfileMediaItem[]>();
  readonly loading = input(false);
  readonly loadingMore = input(false);
  /** No more media to fetch — hides the More button. */
  readonly exhausted = input(false);
  /** Why the wall is empty or short, when something went wrong. */
  readonly error = input<string | null>(null);

  readonly opened = output<ProfileMediaItem>();
  readonly more = output<void>();

  /**
   * Scraped URLs that turned out to be tiny once the browser loaded them.
   *
   * The URL heuristics in `looksLikePhoto` catch the obvious beacons, but a feed
   * can serve a 16×16 icon from a perfectly innocent-looking path. Real
   * dimensions are only knowable after a load, so anything that arrives smaller
   * than a thumbnail is dropped here rather than left as a speck on the wall.
   */
  private undersized = signal<Set<string>>(new Set());

  protected visible = computed(() => {
    const dropped = this.undersized();
    return this.items().filter((item) => !dropped.has(item.key));
  });

  /**
   * Whether this image sits behind a blur.
   *
   * The same rule the timeline uses, deliberately: sensitive means blurred
   * unless the viewer has marked the author trusted. A photo wall is a much
   * denser surface than a timeline, so silently dropping the rule here would
   * expose a screenful at once.
   */
  protected blurred(item: ProfileMediaItem): boolean {
    if (this.revealed().has(item.key)) {
      return false;
    }
    return item.status.sensitive && !this.trusted.sensitiveShown(item.status.account);
  }

  /** Tiles the viewer has clicked through, per session. */
  private revealed = signal<Set<string>>(new Set());

  protected reveal(event: Event, item: ProfileMediaItem): void {
    event.preventDefault();
    event.stopPropagation();
    this.revealed.update((set) => new Set(set).add(item.key));
  }

  protected open(item: ProfileMediaItem): void {
    // A blurred tile spends its first click on revealing itself. Opening the
    // viewer straight into a sensitive image would defeat the blur entirely.
    if (this.blurred(item)) {
      return;
    }
    this.opened.emit(item);
  }

  /**
   * Drop images the browser reports as too small to be content.
   *
   * 100px matches the URL-side heuristic, so both halves of the filter agree on
   * what counts as a photo.
   */
  protected onLoaded(event: Event, item: ProfileMediaItem): void {
    const img = event.target as HTMLImageElement | null;
    if (!img) {
      return;
    }
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (width > 0 && height > 0 && (width < 100 || height < 100)) {
      this.undersized.update((set) => new Set(set).add(item.key));
    }
  }

  /** A source that 404s should leave a gap, not a broken-image icon. */
  protected onError(item: ProfileMediaItem): void {
    this.undersized.update((set) => new Set(set).add(item.key));
  }

  protected trackKey(_index: number, item: ProfileMediaItem): string {
    return item.key;
  }
}
