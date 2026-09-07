import { Component, computed, input } from '@angular/core';
import { PreviewCard } from '../models';

/**
 * A link, rendered as a card.
 *
 * ## Why this exists
 *
 * It is the fallback that keeps article expansion from ever being a dead end.
 * Extraction fails on a lot of the web — paywalls, bot checks, consent walls —
 * but the *metadata* on those same pages is usually intact, because publishers
 * work hard to make their links look good when shared. So a page that refuses
 * to be read still yields a title, a description and an image, and that is
 * worth far more than an error message.
 *
 * `PreviewCard` has been in `models.ts` since the Mastodon shapes were written
 * and nothing has ever rendered it. Mastodon statuses carrying a `card` are the
 * obvious second consumer.
 */
@Component({
  selector: 'app-preview-card',
  imports: [],
  templateUrl: './preview-card.html',
  styleUrl: './preview-card.css',
})
export class PreviewCardComponent {
  readonly card = input.required<PreviewCard>();

  /** Whether images may be shown. Off in text-only reading modes. */
  readonly showImage = input(true);

  /** The host, for the "where is this from" line. */
  readonly host = computed(() => {
    try {
      return new URL(this.card().url).hostname.replace(/^www\./, '');
    } catch {
      return this.card().url;
    }
  });

  /** Prefer the site's own name for itself; fall back to the host. */
  readonly source = computed(() => this.card().provider_name?.trim() || this.host());

  readonly image = computed(() => (this.showImage() ? this.card().image : null));
}
