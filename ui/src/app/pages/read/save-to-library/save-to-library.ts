import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { Status } from '../../../models';
import { ReaderLibrary } from '../../../providers/read/reader-library';
import { documentTitle, isDocument } from '../reader-document';
import { readerRouteId } from '../reader-route-id';

// i18n reader.saveToLibrary.save: Save to library
// i18n reader.saveToLibrary.remove: Remove from library

/**
 * "Save this for later" on a row you have not opened.
 *
 * ## Why this is its own control, next to two that look like it
 *
 * A feed row can already carry two keep-for-later gestures — `Bookmarks` on a
 * status card, `Read later` on an RSS headline — and adding a third needs a
 * reason better than "the store has a `save()` nobody calls". The reason is
 * that the three answer different questions:
 *
 * - **Bookmark** is a *server* record on your Mastodon account, syncing to
 *   every client you own and to none of your other feeds. It is the social
 *   network's own filing cabinet, and it holds posts, not documents.
 * - **Read later** stars an *RSS item within its feed*. It lives in
 *   `rss-read-state` beside the read marks, is scoped to the RSS page, and is
 *   deliberately never pruned.
 * - **The library** is the reading device's shelf: it holds documents from
 *   every source together, tracks how far through each one you are, and is the
 *   only one of the three that can answer "what am I in the middle of".
 *
 * So this control does not compete with those; it is the one whose absence left
 * a shipped feature unreachable. It is deliberately the *narrowest* of the
 * three — it appears only on rows that are documents, where the other two
 * appear on everything.
 *
 * ## What it will not offer to save
 *
 * `isDocument()` decides, and it is asked with what a feed row actually knows:
 * this post, and no thread around it. A tweetstorm's first post therefore does
 * **not** qualify from the timeline — the chain that makes it a document is not
 * loaded there — while an RSS item, an obviously long post, and anything with
 * an expanded article do. That is the honest reading of the operator's rule
 * (short or never-viewed tweets are never tracked) rather than a gap: opening
 * the storm shelves it correctly through `ReaderLibrary.open()`, which does see
 * the chain.
 */
@Component({
  selector: 'app-save-to-library',
  standalone: true,
  imports: [TranslocoModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './save-to-library.html',
  styleUrl: './save-to-library.css',
})
export class SaveToLibrary {
  private readonly library = inject(ReaderLibrary);

  /** The post or RSS item this row is about. */
  readonly status = input.required<Status>();

  /**
   * True when the row's linked article has been fetched and kept prose.
   *
   * The feed reader expands articles in place, and a row that did counts as a
   * document even if the post itself is two words long.
   */
  readonly hasArticle = input(false);

  /** The title the article gave us, when there is one; else the post decides. */
  readonly articleTitle = input<string | null>(null);

  /** Where the document actually lives, when the article resolved a final URL. */
  readonly articleUrl = input<string | null>(null);

  readonly siteName = input<string | null>(null);

  /** Only documents get the control. Everything else is an ordinary post. */
  protected readonly eligible = computed(() => isDocument([this.status()], this.hasArticle()));

  protected readonly routeId = computed(() => readerRouteId(this.status()));

  protected readonly saved = computed(() => this.library.has(this.routeId()));

  protected toggle(event: Event): void {
    // The row underneath opens the post; saving must not also navigate.
    event.stopPropagation();
    event.preventDefault();
    const id = this.routeId();
    if (this.library.has(id)) {
      this.library.remove(id);
      return;
    }
    const status = this.status();
    this.library.save({
      id,
      url: this.articleUrl() ?? status.url ?? '',
      title: this.articleTitle() || documentTitle(status),
      siteName: this.siteName(),
    });
  }
}
