import { computed, inject, Injectable, signal } from '@angular/core';
import { ClientPrefs } from '../../client-prefs';
import { detectLanguage, LangCode } from '../../language-detect';
import { dictionaryById, dictionaryUrl, isSingleWord } from '../../providers/read/dictionaries';
import { Anchor, ReaderAnnotations } from '../../providers/read/reader-annotations';
import { selectionWithin } from '../../share-dialog/share-selection';
import { SelectionPoint } from './selection-tools/selection-tools';
import { RailNote } from './notes-rail/notes-rail';
import {
  anchorForQuote,
  anchorIsIntact,
  documentBlocks,
  DocumentBlocks,
  pageOfBlock,
} from './reader-anchor';

/**
 * The reading tools — vocabulary, highlights, notes — as one object the reader
 * component holds rather than four fields it grows.
 *
 * ## Why this is not in `ReaderCore`
 *
 * The same reason the reader got its own page: `thread.ts` became 1,200 lines
 * by accreting features onto a component whose actual job was rendering a
 * conversation, and `ReaderCore` renders a document. Selection state, anchor
 * arithmetic, dictionary URLs and the notes rail are one coherent concern with
 * one owner, and keeping them here means the reader stays a component about
 * layout and paging.
 *
 * Not `providedIn: 'root'`: this is per-reader state (which passage is
 * selected, which note is being edited), and a singleton would leak one
 * document's selection into another's. The reader provides it.
 */
@Injectable()
export class ReadingTools {
  private readonly annotations = inject(ReaderAnnotations);
  private readonly prefs = inject(ClientPrefs);

  /** The document being read, set by the reader when it changes. */
  private readonly documentId = signal('');
  private readonly markdown = signal('');
  private readonly paginated = signal<readonly string[]>([]);
  private readonly renderedPages = signal(false);

  /** The live selection, and where to put the popover. */
  readonly selection = signal('');
  readonly selectionAt = signal<SelectionPoint>({ x: 0, y: 0 });

  /** Which annotation the note composer is editing, if any. */
  readonly editing = signal<string | null>(null);
  readonly draftNote = signal('');

  /** Whether the search dialog is showing. */
  readonly searchOpen = signal(false);

  /** A match to scroll to and mark, cleared once the page has been turned. */
  readonly markedText = signal('');

  /** The document, split the way both pagination and anchors see it. */
  private readonly blocks = computed<DocumentBlocks>(() => documentBlocks(this.markdown()));

  /**
   * The document's language, for the dictionary subdomain.
   *
   * Detected from the text rather than declared, because an article's own
   * language tag is frequently the *site's* language: a German blog post on an
   * English-language platform is tagged `en` and is still German. The detector
   * is cheap and returns a distribution; the leading share wins, and `und`
   * simply means the default edition.
   */
  readonly language = computed<LangCode | null>(() => {
    const text = this.markdown().slice(0, 4000);
    if (!text.trim()) {
      return null;
    }
    const [leading] = detectLanguage(text);
    return leading && leading.lang !== 'und' ? leading.lang : null;
  });

  /** Every annotation on this document, with where it landed. */
  readonly notes = computed<RailNote[]>(() => {
    const blocks = this.blocks();
    const pages = this.paginated();
    return this.annotations.forDocument(this.documentId()).map((annotation) => {
      const intact = anchorIsIntact(blocks, annotation.anchor);
      return {
        annotation,
        moved: !intact,
        page: intact
          ? this.renderedPages()
            ? pageOfQuote(pages, annotation.anchor.quote)
            : pageOfBlock(pages, annotation.anchor.block)
          : null,
      };
    });
  });

  /**
   * The rail shows only when there is something written in it.
   *
   * A bare highlight is not a note. Someone who marks passages while reading and
   * writes nothing has asked for marks in the text, not a column beside it —
   * and per the brief, an empty rail on every article is a permanent tax.
   */
  readonly hasNotes = computed(() => this.notes().some((note) => note.annotation.note.trim()));

  /** Highlights that can actually be drawn, as plain text to mark. */
  readonly intactQuotes = computed(() =>
    this.notes()
      .filter((note) => !note.moved)
      .map((note) => note.annotation.anchor.quote),
  );

  /** True when the current selection is already a highlight. */
  readonly selectionIsHighlighted = computed(() => {
    const anchor = this.anchorForSelection();
    return anchor !== null && this.findExisting(anchor) !== null;
  });

  /** Whether the popover should offer Define rather than the mark tools. */
  readonly selectionIsWord = computed(() => isSingleWord(this.selection()));

  /** Point the tools at a document. Clears everything belonging to the last one. */
  setDocument(id: string, markdown: string, pages: readonly string[], rendered = false): void {
    if (id !== this.documentId()) {
      this.dismiss();
      this.searchOpen.set(false);
      this.markedText.set('');
      this.documentId.set(id);
    }
    this.markdown.set(markdown);
    this.paginated.set(pages);
    this.renderedPages.set(rendered);
  }

  /**
   * Read the selection out of the article body.
   *
   * `selectionWithin` is container-scoped for a reason, and the container must
   * be the **article body** rather than the page: a selection made in the notes
   * rail must not become a quote from the article. Passing the wrong element
   * here is silent and wrong, which is why the reader passes one element and
   * this takes it rather than looking one up.
   */
  captureSelection(container: Element | null, at: SelectionPoint): void {
    const text = selectionWithin(container);
    this.selection.set(text);
    if (text) {
      this.selectionAt.set(at);
    }
  }

  /**
   * Drop the popover and the selection behind it.
   *
   * Called on every page turn: turning the page with a selection live leaves an
   * anchored popover pointing at text that is no longer on screen.
   */
  dismiss(): void {
    this.selection.set('');
    this.editing.set(null);
    this.draftNote.set('');
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
    }
  }

  /** Where `Define` should send the reader, or null when it cannot. */
  defineUrl(word: string): string | null {
    const provider = dictionaryById(this.prefs.readerDictionary());
    return dictionaryUrl(provider, word, this.language(), this.prefs.readerDictionaryCustom());
  }

  /**
   * Mark the selection, or unmark it when it is already marked.
   *
   * Returns the annotation id when one was created, so a caller can go straight
   * into the note composer.
   */
  toggleHighlight(): string | null {
    const anchor = this.anchorForSelection();
    if (!anchor) {
      this.dismiss();
      return null;
    }
    const existing = this.findExisting(anchor);
    if (existing) {
      this.annotations.remove(this.documentId(), existing);
      this.dismiss();
      return null;
    }
    const created = this.annotations.add(this.documentId(), anchor);
    this.dismiss();
    return created.id;
  }

  /** Highlight if needed, then open the composer on it. */
  startNote(): void {
    const anchor = this.anchorForSelection();
    if (!anchor) {
      this.dismiss();
      return;
    }
    const existing = this.findExisting(anchor);
    const id = existing ?? this.annotations.add(this.documentId(), anchor).id;
    const current = this.annotations.forDocument(this.documentId()).find((a) => a.id === id);
    this.selection.set('');
    this.editing.set(id);
    this.draftNote.set(current?.note ?? '');
  }

  /** Open the composer on a note already in the rail. */
  editNote(id: string, existing: string): void {
    this.selection.set('');
    this.editing.set(id);
    this.draftNote.set(existing);
  }

  /**
   * Save the composer.
   *
   * An empty note on a highlight the reader *only* opened the composer for is
   * still a highlight — the mark was the first half of the gesture, and undoing
   * it because they changed their mind about writing would be surprising.
   */
  saveNote(): void {
    const id = this.editing();
    if (!id) {
      return;
    }
    this.annotations.setNote(this.documentId(), id, this.draftNote().trim());
    this.editing.set(null);
    this.draftNote.set('');
  }

  cancelNote(): void {
    this.editing.set(null);
    this.draftNote.set('');
  }

  removeNote(id: string): void {
    this.annotations.remove(this.documentId(), id);
    if (this.editing() === id) {
      this.cancelNote();
    }
  }

  /** The anchor the current selection would produce, or null when it has none. */
  private anchorForSelection(): Anchor | null {
    const text = this.selection().trim();
    return text ? anchorForQuote(this.blocks(), text) : null;
  }

  /** The id of an existing annotation on the same passage, if there is one. */
  private findExisting(anchor: Anchor): string | null {
    const match = this.annotations
      .forDocument(this.documentId())
      .find((entry) => entry.anchor.block === anchor.block && entry.anchor.start === anchor.start);
    return match?.id ?? null;
  }
}

/** Quotes can start mid-paragraph and continue onto the next native column. */
export function pageOfQuote(pages: readonly string[], quote: string): number | null {
  const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();
  const needle = normalize(quote);
  if (!needle) return null;
  for (let index = 0; index < pages.length; index++) {
    const start = normalize(pages[index]);
    const joined = normalize(pages.slice(index).join(''));
    const at = joined.indexOf(needle);
    if (at >= 0 && at < start.length) return index + 1;
  }
  return null;
}
