import { Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbControl, MbField } from '../../design-system/field/field';

// i18n bulkWords.title: Add many at once
// i18n bulkWords.open: Add many at once…
// i18n bulkWords.label: One per line
// i18n bulkWords.hint: Paste or type a list, one word or phrase per line. The settings below apply to every line. Blank lines and repeats are skipped.
// i18n bulkWords.count: {{count}} to add
// i18n bulkWords.add: Add all
// i18n bulkWords.cancel: Cancel

/**
 * Lines of a pasted list: trimmed, blanks dropped, and each word once, the
 * first spelling kept. `key` says which spellings count as the same word.
 */
export function parseWordList(
  text: string,
  key: (word: string) => string = (word) => word.toLowerCase(),
): string[] {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const word = line.trim();
    const id = word && key(word);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    words.push(word);
  }
  return words;
}

/**
 * A dialog for muting many words in one go: a textarea, one per line, and
 * whatever rule controls the page projects, which apply to the whole list.
 * Fifty words is one paste and one click, not fifty trips through the form.
 */
@Component({
  selector: 'app-bulk-words-dialog',
  imports: [TranslocoPipe, MbDialog, MbButton, MbField, MbControl],
  template: `<mb-dialog
    [title]="'bulkWords.title' | transloco"
    [closeLabel]="'bulkWords.cancel' | transloco"
    [description]="'bulkWords.hint' | transloco"
    [busy]="busy()"
    (dismissed)="closed.emit()"
  >
    <mb-field [label]="'bulkWords.label' | transloco">
      <textarea
        mbControl
        rows="10"
        autocapitalize="none"
        spellcheck="false"
        [value]="text()"
        (input)="text.set($any($event.target).value)"
        [disabled]="busy()"
      ></textarea>
    </mb-field>
    <ng-content />
    <p class="bulk-count" aria-live="polite">
      {{ 'bulkWords.count' | transloco: { count: words().length } }}
    </p>
    <ng-container mbDialogActions>
      <button mbButton type="button" variant="outline" [disabled]="busy()" (click)="closed.emit()">
        {{ 'bulkWords.cancel' | transloco }}
      </button>
      <button
        mbButton
        type="button"
        [disabled]="busy() || !words().length"
        (click)="added.emit(words())"
      >
        {{ 'bulkWords.add' | transloco }}
      </button>
    </ng-container>
  </mb-dialog>`,
  styles: `
    textarea {
      min-height: 160px;
      max-height: 40dvh;
      resize: vertical;
      font-family: inherit;
    }
    .bulk-count {
      color: var(--muted);
      font-size: 13px;
    }
  `,
})
export class BulkWordsDialog {
  /** Which spellings are the same word, for the count and the list emitted. */
  readonly key = input<(word: string) => string>((word) => word.toLowerCase());
  readonly busy = input(false);
  /** The words, deduplicated, in the order given. */
  readonly added = output<string[]>();
  readonly closed = output<void>();
  protected readonly text = signal('');
  protected readonly words = computed(() => parseWordList(this.text(), this.key()));
}
