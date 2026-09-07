import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { findInPages, SearchMatch } from '../document-search';

// i18n reader.search.label: Search this document
// i18n reader.search.placeholder: Find in document
// i18n reader.search.close: Close
// i18n reader.search.none: No matches
// i18n reader.search.count: {{count}} matches
// i18n reader.search.countOne: 1 match
// i18n reader.search.onPage: page {{page}}
// i18n reader.search.hint: Searches the whole document, not just this page.

/**
 * Find a passage anywhere in the document.
 *
 * ## Why this exists rather than the browser's own find
 *
 * `Ctrl+F` searches what is rendered, and in page-flip mode that is **one
 * page**. A reader looking for a phrase they remember from earlier would be
 * told it is not there. So the reader intercepts the key and offers this, which
 * searches the source markdown — see `document-search.ts` for why that also
 * makes a match's page number a lookup rather than a measurement.
 *
 * The interception is narrow on purpose: only on the reader, and only when the
 * document actually paginated. On a single-page document the browser's find is
 * strictly better than ours and taking it away would be hostile.
 */
@Component({
  selector: 'app-document-search-dialog',
  standalone: true,
  imports: [FormsModule, TranslocoModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-search-dialog.html',
  styleUrl: './document-search-dialog.css',
})
export class DocumentSearchDialog {
  /** The document, already paginated — the same slices the reader turns. */
  readonly pages = input<readonly string[]>([]);
  readonly continuous = input(false);

  /** The page showing now, so its matches can be marked as "here". */
  readonly currentPage = input(1);

  /** A match was chosen: go to its page and mark it. */
  readonly goTo = output<SearchMatch>();
  readonly closed = output<void>();

  protected readonly query = signal('');

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  protected readonly matches = computed<SearchMatch[]>(() =>
    findInPages(this.pages(), this.query(), this.continuous()),
  );

  /** Split for rendering, so the match can be marked without building HTML. */
  protected readonly rows = computed(() =>
    this.matches().map((match) => ({
      match,
      before: match.context.slice(0, match.contextOffset),
      hit: match.context.slice(match.contextOffset, match.contextOffset + match.text.length),
      after: match.context.slice(match.contextOffset + match.text.length),
    })),
  );

  /** Searching starts when there is something to search for. */
  protected readonly searched = computed(() => this.query().trim().length >= 2);

  constructor() {
    // The dialog exists to be typed into; opening it and leaving focus behind
    // would make the reader click before they could search.
    effect(() => this.field()?.nativeElement.focus());
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closed.emit();
    }
  }
}
