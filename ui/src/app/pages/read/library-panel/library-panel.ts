import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  LibraryEntry,
  ReaderLibrary,
  Shelf,
  progressOf,
} from '../../../providers/read/reader-library';
import { ClientPrefs } from '../../../client-prefs';

// i18n reader.library.title: Library
// i18n reader.library.close: Close
// i18n reader.library.empty: Nothing here yet. Anything you open in the reader lands on a shelf.
// i18n reader.library.emptyShelf: Nothing on this shelf.
// i18n reader.library.shelf.intend: Intend to read
// i18n reader.library.shelf.reading: Still reading
// i18n reader.library.shelf.read: Read
// i18n reader.library.percent: {{percent}}%
// i18n reader.library.currentDocument: Currently reading
// i18n reader.library.rowMenu: Options for {{title}}
// i18n reader.library.moveTo: Move to
// i18n reader.library.remove: Remove
// i18n reader.library.automatic: Follow my progress
// i18n reader.library.pinnedHint: Filed by hand
// i18n reader.library.clearAll: Clear all
// i18n reader.library.clearAllConfirm: Clear all {{count}}?
// i18n reader.library.clearAllCancel: Keep them
// i18n reader.library.clearAllTitle: Remove every document from the library

/** One shelf, with the heading it gets and the order it appears in. */
const SHELVES: readonly { id: Shelf; labelKey: string }[] = [
  { id: 'intend', labelKey: 'reader.library.shelf.intend' },
  { id: 'reading', labelKey: 'reader.library.shelf.reading' },
  { id: 'read', labelKey: 'reader.library.shelf.read' },
];

/**
 * Everything the reader has picked up, as a sheet over the reading column.
 *
 * ## Why it looks like the RSS rail
 *
 * The operator's call, and the right one: consistency beats a bespoke design
 * here, and `/rss` already solved this exact problem — a narrow, scrollable
 * list of things to read, with group headings and a selected row that reads as
 * "you are here". The `.rail-row` treatment, its hover and its `.active` fill
 * are lifted from `rss-page.css` rather than re-derived, so the two surfaces
 * cannot drift apart by accident.
 *
 * ## Why a sheet and not a route
 *
 * Dismissing it has to return the reader to exactly where they were, mid-page,
 * mid-sentence. A navigation away and back would re-resolve the document,
 * re-paginate it and land them at a restored position rather than the one they
 * were actually looking at.
 *
 * ## What is not here
 *
 * The panel's own open/closed state lives in `ClientPrefs`, not in the library
 * store. Mixing view state into a store that is shaped for a later sync is how
 * a sync conflict becomes "my laptop closed the panel on my phone".
 */
@Component({
  selector: 'app-library-panel',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './library-panel.html',
  styleUrl: './library-panel.css',
})
export class LibraryPanel {
  private readonly library = inject(ReaderLibrary);
  protected readonly prefs = inject(ClientPrefs);

  /** The document being read right now, so its row can say so. */
  readonly currentId = input('');

  readonly closed = output<void>();

  /**
   * Row positions while this panel is mounted.
   *
   * The store exposes most-recently-opened order, which is useful when a fresh
   * panel opens. It is hostile during navigation, though: finishing a load
   * updates `openedAt`, moves the clicked row to the top, and makes the title
   * under the pointer appear to turn into another document. Keep the opening
   * order for rows that remain on a shelf; genuinely new rows join the end.
   */
  private readonly rowOrder: Record<Shelf, string[]> = {
    intend: [],
    reading: [],
    read: [],
  };

  protected readonly shelves = computed(() =>
    SHELVES.map((shelf) => ({
      ...shelf,
      rows: this.stableRows(shelf.id),
      collapsed: this.prefs.readerLibraryCollapsed().includes(shelf.id),
    })),
  );

  protected readonly total = this.library.total;

  private stableRows(shelf: Shelf): ReturnType<ReaderLibrary['shelf']> {
    const rows = this.library.shelf(shelf);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const retained = this.rowOrder[shelf].filter((id) => byId.has(id));
    const retainedIds = new Set(retained);
    const added = rows.map((row) => row.id).filter((id) => !retainedIds.has(id));
    const order = [...retained, ...added];
    this.rowOrder[shelf] = order;
    return order.map((id) => byId.get(id)!);
  }

  /** Whichever row's menu is open, by id. At most one at a time. */
  protected readonly openMenu = signal<string | null>(null);

  protected readonly otherShelves = (shelf: Shelf): readonly { id: Shelf; labelKey: string }[] =>
    SHELVES.filter((s) => s.id !== shelf);

  protected percent(entry: LibraryEntry): number {
    return Math.round(progressOf(entry) * 100);
  }

  protected toggleShelf(shelf: Shelf): void {
    const collapsed = this.prefs.readerLibraryCollapsed();
    this.prefs.setReaderLibraryCollapsed(
      collapsed.includes(shelf) ? collapsed.filter((s) => s !== shelf) : [...collapsed, shelf],
    );
  }

  protected toggleMenu(id: string): void {
    this.openMenu.update((open) => (open === id ? null : id));
  }

  protected moveTo(id: string, shelf: Shelf): void {
    this.library.setShelf(id, shelf);
    this.openMenu.set(null);
  }

  /** Hand a document back to automatic shelving without moving it. */
  protected unpin(id: string, shelf: Shelf): void {
    this.library.setShelf(id, shelf, false);
    this.openMenu.set(null);
  }

  protected remove(id: string): void {
    this.library.remove(id);
    this.openMenu.set(null);
  }

  /**
   * Whether "Clear all" is waiting for a second press.
   *
   * Two presses rather than a `confirm()` dialog: the panel is a sheet over a
   * page someone is reading, and a modal would tear them out of it for a
   * decision that belongs in the sheet. Emptying a shelf that caps at a year of
   * reading is not undoable, so it does not happen on one stray tap.
   */
  protected readonly confirmingClear = signal(false);

  protected askClearAll(): void {
    this.openMenu.set(null);
    this.confirmingClear.set(true);
  }

  protected cancelClearAll(): void {
    this.confirmingClear.set(false);
  }

  protected clearAll(): void {
    this.library.clear();
    this.confirmingClear.set(false);
  }
}
