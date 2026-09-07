import { Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { HumanTimePipe } from '../../../human-time.pipe';
import { Status } from '../../../models';
import { RssReadState } from '../../../providers/rss/rss-read-state';

// i18n pages.rss.headline.removeFromReadLater: Remove {{title}} from Read later
// i18n pages.rss.headline.saveToReadLater: Save {{title}} to read later
// i18n pages.rss.headline.untitled: (untitled)

/** Strip tags and collapse whitespace — a headline is text, not markup. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One item as a dense scan row: read dot, title, source, time, star.
 *
 * A separate component rather than a `dense` input on `app-status-card`. That
 * card is used on Home, profiles, threads, search and bookmarks; giving it a
 * mode that hides the avatar, the body, the media and the action bar would mean
 * every future change to it has to be reasoned about twice, for the benefit of
 * exactly one page. This renders four fields and owns none of that.
 *
 * Deliberately presentational: it reads read/star state (so the row can show
 * it) but reports clicks upward rather than deciding what opening an item
 * means. The pane owns that, because the pane is what knows whether something
 * else is already expanded.
 */
@Component({
  selector: 'app-headline-row',
  imports: [HumanTimePipe, TranslocoPipe],
  templateUrl: './headline-row.html',
  styleUrl: './headline-row.css',
  host: {
    '[class.unread]': '!read()',
    '[class.expanded]': 'expanded()',
  },
})
export class HeadlineRow {
  private readState = inject(RssReadState);
  private transloco = inject(TranslocoService);

  readonly status = input.required<Status>();
  readonly expanded = input(false);

  /** The row was activated — the pane decides whether that expands or collapses. */
  readonly opened = output<void>();

  protected readonly read = computed(() => this.readState.isRead(this.status().id));
  protected readonly starred = computed(() => this.readState.isStarred(this.status().id));

  /**
   * The headline.
   *
   * The adapter puts the feed item's title in a leading `<strong>` when the body
   * does not already start with it, so the first line of the rendered content is
   * the title in the common case. Falling back to the leading text of the body
   * covers title-less items (some microblog feeds) rather than rendering a blank
   * row.
   */
  protected readonly title = computed(() => {
    const content = this.status().content;
    const strong = /<strong>(.*?)<\/strong>/s.exec(content);
    const text = plainText(strong ? strong[1] : content);
    return text || this.transloco.translate('pages.rss.headline.untitled');
  });

  /** The feed this came from. */
  protected readonly source = computed(
    () => this.status().account.display_name || this.status().account.acct,
  );

  /**
   * The star is a sibling of the row button, not a child of it — nesting an
   * interactive control inside another is invalid HTML and leaves screen-reader
   * users with one ambiguous target instead of two named ones. Laid out on the
   * same line by the host grid.
   */
  protected toggleStar(): void {
    this.readState.toggleStarred(this.status().id);
  }
}
