import {
  Component,
  computed,
  importProvidersFrom,
  inject,
  signal,
} from "@angular/core";
import {
  provideRouter,
  withDisabledInitialNavigation,
  withHashLocation,
} from "@angular/router";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { ClientPrefs } from "../../ui/src/app/client-prefs";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";
import { ReadToolbar } from "../../ui/src/app/pages/read/read-toolbar/read-toolbar";
import { SelectionTools } from "../../ui/src/app/pages/read/selection-tools/selection-tools";
import {
  NotesRail,
  type RailNote,
} from "../../ui/src/app/pages/read/notes-rail/notes-rail";
import { LibraryPanel } from "../../ui/src/app/pages/read/library-panel/library-panel";
import { DocumentSearchDialog } from "../../ui/src/app/pages/read/document-search/document-search-dialog";
import {
  ReaderLibrary,
  type LibraryEntry,
  type Shelf,
} from "../../ui/src/app/providers/read/reader-library";

function preferences() {
  const prefs = new ClientPrefs();
  Object.defineProperties(prefs, {
    apply: { value: () => undefined },
    persist: { value: () => undefined },
  });
  prefs.readerLibraryCollapsed.set([]);
  prefs.readerPageFlip.set(true);
  return prefs;
}

function library() {
  const rows = signal<(LibraryEntry & { id: string })[]>([
    {
      id: "preview-document",
      url: "https://example.com/reading",
      title: "A quiet reading session",
      siteName: "Preview",
      shelf: "reading",
      pinnedShelf: false,
      page: 1,
      pages: 3,
      addedAt: 0,
      openedAt: 0,
    },
  ]);
  return {
    total: computed(() => rows().length),
    shelf: (shelf: Shelf) => rows().filter((row) => row.shelf === shelf),
    setShelf: (id: string, shelf: Shelf, pinnedShelf = true) =>
      rows.update((list) =>
        list.map((row) =>
          row.id === id ? { ...row, shelf, pinnedShelf } : row,
        ),
      ),
    remove: (id: string) =>
      rows.update((list) => list.filter((row) => row.id !== id)),
    clear: () => rows.set([]),
  };
}

@Component({
  selector: "ds-reader-controls",
  imports: [
    ReadToolbar,
    SelectionTools,
    NotesRail,
    LibraryPanel,
    DocumentSearchDialog,
  ],
  template: `
    <h1>Reader controls, same reader.</h1>
    <p>
      Real controls with in-memory preferences and library. Pagination,
      extraction and selection algorithms are unchanged.
    </p>
    <div style="position: relative">
      <app-read-toolbar
        [page]="page()"
        [pageCount]="3"
        [minutesLeft]="4"
        [libraryEnabled]="true"
        [libraryOpen]="showLibrary()"
        [canSearch]="true"
        [searchOpen]="showSearch()"
        (previousPage)="page.update(previous)"
        (nextPage)="page.update(next)"
        (findInDocument)="showSearch.set(!showSearch())"
        (toggleLibrary)="showLibrary.set(!showLibrary())"
        (exit)="result.set('Exit requested')"
      />
      @if (showSearch()) {
        <app-document-search-dialog
          [pages]="pages"
          [currentPage]="page()"
          (goTo)="page.set($event.page); showSearch.set(false)"
          (closed)="showSearch.set(false)"
        />
      }
    </div>
    <section
      aria-label="Reading passage"
      style="position: relative; padding-block: 80px 16px; max-width: 68ch; margin-inline: auto"
    >
      <app-selection-tools
        selection="A quiet passage"
        [at]="{ x: 140, y: 70 }"
        [alreadyHighlighted]="highlighted()"
        (highlight)="highlighted.set(!highlighted())"
        (note)="result.set('Note requested')"
        (share)="result.set('Share requested')"
      />
      <p>
        A quiet passage. The reading measure, paging engine and annotation
        anchors are not restyled by this fixture.
      </p>
    </section>
    <app-notes-rail
      [notes]="notes()"
      [currentPage]="page()"
      (goTo)="page.set($event.page!)"
      (edit)="result.set('Edit requested')"
      (share)="result.set('Share requested')"
      (remove)="notes.set([])"
    />
    @if (showLibrary()) {
      <app-library-panel
        currentId="preview-document"
        (closed)="showLibrary.set(false)"
      />
    }
    <p role="status">{{ result() }}</p>
  `,
})
class ReaderControls {
  readonly prefs = inject(ClientPrefs);
  readonly page = signal(1);
  readonly previous = (page: number) => Math.max(1, page - 1);
  readonly next = (page: number) => Math.min(3, page + 1);
  readonly pages = [
    "A quiet passage.",
    "Another quiet passage.",
    "The last passage.",
  ];
  readonly highlighted = signal(false);
  readonly showSearch = signal(false);
  readonly showLibrary = signal(false);
  readonly result = signal("");
  readonly notes = signal<RailNote[]>([
    {
      page: 1,
      moved: false,
      annotation: {
        id: "preview-note",
        note: "Remember this passage.",
        createdAt: 0,
        updatedAt: 0,
        anchor: { block: 0, start: 0, end: 15, quote: "A quiet passage" },
      },
    },
  ]);
}

export default {
  title: "Adoption/Reader controls",
  component: ReaderControls,
  decorators: [
    applicationConfig({
      providers: [
        importProvidersFrom(translocoTesting()),
        provideRouter([], withDisabledInitialNavigation(), withHashLocation()),
        { provide: ClientPrefs, useFactory: preferences },
        { provide: ReaderLibrary, useFactory: library },
      ],
    }),
  ],
} satisfies Meta<ReaderControls>;
export const Reading: StoryObj<ReaderControls> = {};
