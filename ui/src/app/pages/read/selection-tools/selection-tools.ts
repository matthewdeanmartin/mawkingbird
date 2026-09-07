import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { isSingleWord } from '../../../providers/read/dictionaries';

// i18n reader.selection.define: Define
// i18n reader.selection.highlight: Highlight
// i18n reader.selection.note: Note
// i18n reader.selection.share: Share
// i18n reader.selection.label: Tools for the selected text
// i18n reader.selection.defineTitle: Look up “{{word}}” in a dictionary
// i18n reader.selection.removeHighlight: Remove highlight

/** Where a popover sits, in page coordinates. */
export interface SelectionPoint {
  x: number;
  y: number;
}

/**
 * The small bar that appears over a selection in the article.
 *
 * ## Why one word and a phrase get different tools
 *
 * Selecting a word is a lookup; selecting a phrase is a mark. Offering `Define`,
 * `Highlight`, `Note` and `Share` on every selection would put four targets
 * under a reader's thumb where they wanted one, and make each of them harder to
 * hit — on a phone, appreciably so. So the popover asks what kind of selection
 * this is and offers only the tools that answer it.
 *
 * The rule is in `isSingleWord`, next to the dictionary registry that consumes
 * it, because "what counts as a word" is a lexical question rather than a
 * layout one.
 *
 * ## Purely presentational
 *
 * It reports which tool was pressed and knows nothing about dictionaries,
 * anchors or the share dialog. The reader owns all of that, because the reader
 * is what holds the document the selection is *in* — and a popover that could
 * reach into a document would be a popover that could reach into the wrong one.
 */
@Component({
  selector: 'app-selection-tools',
  standalone: true,
  imports: [TranslocoModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './selection-tools.html',
  styleUrl: './selection-tools.css',
})
export class SelectionTools {
  /** The selected text, trimmed. Empty means the popover is not shown. */
  readonly selection = input('');

  /** Where to anchor, in coordinates relative to the article container. */
  readonly at = input<SelectionPoint>({ x: 0, y: 0 });

  /** True when the selection is already highlighted, so `Highlight` can undo. */
  readonly alreadyHighlighted = input(false);

  readonly define = output<string>();
  readonly highlight = output<void>();
  readonly note = output<void>();
  readonly share = output<void>();

  protected readonly word = computed(() => this.selection().trim());

  /** A lookup, not a mark. See the class comment. */
  protected readonly isWord = computed(() => isSingleWord(this.word()));
}
