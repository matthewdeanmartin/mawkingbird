import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { LibraryPanel } from './library-panel';
import { ReaderLibrary } from '../../../providers/read/reader-library';
import { ClientPrefs } from '../../../client-prefs';

describe('LibraryPanel', () => {
  let fixture: ComponentFixture<LibraryPanel>;
  let library: ReaderLibrary;

  function doc(id: string, title: string) {
    return { id, url: `https://example.com/${id}`, title };
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function rowTitles(): string[] {
    return [...el().querySelectorAll('.rail-feed .name')].map((n) => n.textContent?.trim() ?? '');
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    library = TestBed.inject(ReaderLibrary);
    fixture = TestBed.createComponent(LibraryPanel);
  });

  it('says so when there is nothing on any shelf', () => {
    fixture.detectChanges();
    expect(el().textContent).toContain('Nothing here yet');
  });

  it('lists a document under the shelf it is on', () => {
    library.open(doc('1', 'A long read'));
    fixture.detectChanges();

    expect(rowTitles()).toContain('A long read');
    // Under "Still reading", which is where opening puts it.
    const headings = [...el().querySelectorAll('.rail-folder')].map((h) => h.textContent ?? '');
    expect(headings.some((h) => h.includes('Still reading') && h.includes('1'))).toBe(true);
  });

  it('links each row to its document', () => {
    library.open(doc('rss:f::g', 'A feed item'));
    fixture.detectChanges();

    const link = el().querySelector<HTMLAnchorElement>('.rail-feed');
    expect(decodeURIComponent(link!.getAttribute('href')!)).toContain('/read/rss:f::g');
  });

  it('marks the document being read as the current one', () => {
    library.open(doc('1', 'This one'));
    library.open(doc('2', 'Not this one'));
    fixture.componentRef.setInput('currentId', '1');
    fixture.detectChanges();

    const current = el().querySelector('.row-wrap.active');
    expect(current?.textContent).toContain('This one');
    expect(current?.querySelector('[aria-current="true"]')).not.toBeNull();
  });

  it('does not move a clicked row when opening it updates the recent order', () => {
    library.open(doc('1', 'First row'), 100);
    library.open(doc('2', 'Second row'), 200);
    fixture.detectChanges();
    expect(rowTitles()).toEqual(['Second row', 'First row']);

    library.open(doc('1', 'First row'), 300);
    fixture.detectChanges();

    expect(rowTitles()).toEqual(['Second row', 'First row']);
  });

  it('shows how far through each document is', () => {
    library.open(doc('1', 'Half done'));
    library.recordPosition('1', 6, 11);
    fixture.detectChanges();

    expect(el().querySelector('.progress')?.textContent).toContain('50%');
  });

  it('collapsing a shelf hides its rows and is remembered', () => {
    library.open(doc('1', 'A long read'));
    fixture.detectChanges();

    const heading = [...el().querySelectorAll<HTMLButtonElement>('.rail-folder')].find((h) =>
      h.textContent?.includes('Still reading'),
    )!;
    heading.click();
    fixture.detectChanges();

    expect(rowTitles()).not.toContain('A long read');
    // A view preference, so it lives in ClientPrefs rather than the library.
    expect(TestBed.inject(ClientPrefs).readerLibraryCollapsed()).toContain('reading');
  });

  it('moves a document to another shelf from its row menu', () => {
    library.open(doc('1', 'A long read'));
    fixture.detectChanges();

    el().querySelector<HTMLButtonElement>('.row-menu-btn')!.click();
    fixture.detectChanges();

    const move = [...el().querySelectorAll<HTMLButtonElement>('.row-menu .tool')].find((b) =>
      b.textContent?.includes('Read'),
    )!;
    move.click();
    fixture.detectChanges();

    expect(library.get('1')?.shelf).toBe('read');
    // Filed by hand, so automation stops moving it.
    expect(library.get('1')?.pinnedShelf).toBe(true);
  });

  it('a hand-filed row says so, and can be handed back to automation', () => {
    library.open(doc('1', 'A long read'));
    library.setShelf('1', 'intend');
    fixture.detectChanges();

    expect(el().textContent).toContain('Filed by hand');

    el().querySelector<HTMLButtonElement>('.row-menu-btn')!.click();
    fixture.detectChanges();
    const automatic = [...el().querySelectorAll<HTMLButtonElement>('.row-menu .tool')].find((b) =>
      b.textContent?.includes('Follow my progress'),
    )!;
    automatic.click();
    fixture.detectChanges();

    expect(library.get('1')?.pinnedShelf).toBe(false);
    // Handed back without being moved.
    expect(library.get('1')?.shelf).toBe('intend');
  });

  it('removes a document from its row menu', () => {
    library.open(doc('1', 'A long read'));
    fixture.detectChanges();

    el().querySelector<HTMLButtonElement>('.row-menu-btn')!.click();
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('.row-menu .danger')!.click();
    fixture.detectChanges();

    expect(library.has('1')).toBe(false);
  });

  it('opens at most one row menu at a time', () => {
    library.open(doc('1', 'One'));
    library.open(doc('2', 'Two'));
    fixture.detectChanges();

    const buttons = [...el().querySelectorAll<HTMLButtonElement>('.row-menu-btn')];
    buttons[0].click();
    fixture.detectChanges();
    buttons[1].click();
    fixture.detectChanges();

    expect(el().querySelectorAll('.row-menu')).toHaveLength(1);
  });
});

/**
 * Emptying the shelves.
 *
 * Asked for after the library filled with duplicates of one document — see the
 * `routeId` fix in `reader-core`. It stays useful after that bug: a year-long
 * shelf is the sort of thing someone wants to start over on.
 */
describe('LibraryPanel clearing everything', () => {
  let fixture: ComponentFixture<LibraryPanel>;
  let library: ReaderLibrary;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const buttonSaying = (text: string): HTMLButtonElement | undefined =>
    [...el().querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    library = TestBed.inject(ReaderLibrary);
    fixture = TestBed.createComponent(LibraryPanel);
    library.open({ id: '1', url: 'https://example.com/1', title: 'One' });
    library.open({ id: '2', url: 'https://example.com/2', title: 'Two' });
    fixture.detectChanges();
  });

  it('offers nothing to clear when the library is empty', () => {
    library.clear();
    fixture.detectChanges();
    expect(buttonSaying('Clear all')).toBeUndefined();
  });

  /** One press must not empty a shelf that cannot be rebuilt. */
  it('asks before clearing, and keeps everything if the answer is no', () => {
    buttonSaying('Clear all')!.click();
    fixture.detectChanges();

    expect(el().textContent).toContain('Clear all 2?');
    expect(library.total()).toBe(2);

    buttonSaying('Keep them')!.click();
    fixture.detectChanges();

    expect(library.total()).toBe(2);
    expect(el().textContent).not.toContain('Clear all 2?');
  });

  it('empties every shelf on the second press', () => {
    buttonSaying('Clear all')!.click();
    fixture.detectChanges();
    buttonSaying('Clear all')!.click();
    fixture.detectChanges();

    expect(library.total()).toBe(0);
    expect(el().textContent).toContain('Nothing here yet');
  });
});

/**
 * Opening a document from the library is moving *within* the reader.
 *
 * If those navigations push, every document opened this session goes into
 * history and Exit — which is `history.back()` — walks back through them one at
 * a time instead of leaving. Reported by the operator: *"I click read, I click
 * on something in the library, I click exit... it doesn't exit reader, it goes
 * to the previous thread in reader mode."*
 */
describe('LibraryPanel navigation and history', () => {
  let fixture: ComponentFixture<LibraryPanel>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.inject(ReaderLibrary).open({
      id: '1',
      url: 'https://example.com/1',
      title: 'A long read',
    });
    fixture = TestBed.createComponent(LibraryPanel);
    fixture.detectChanges();
  });

  it('replaces the history entry rather than pushing a new one', () => {
    const link = (fixture.nativeElement as HTMLElement).querySelector('.rail-feed');
    // The attribute is how `RouterLink` is told; its presence is the contract.
    expect(link?.hasAttribute('replaceurl')).toBe(true);
  });
});
