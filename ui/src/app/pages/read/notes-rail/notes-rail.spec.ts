import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Annotation } from '../../../providers/read/reader-annotations';
import { NotesRail, RailNote } from './notes-rail';

function note(over: Partial<Annotation> = {}, rail: Partial<RailNote> = {}): RailNote {
  return {
    annotation: {
      id: 'a1',
      anchor: { block: 0, start: 0, end: 6, quote: 'quoted passage' },
      note: 'a thought',
      createdAt: 1,
      updatedAt: 1,
      ...over,
    },
    page: 1,
    moved: false,
    ...rail,
  };
}

describe('NotesRail', () => {
  let fixture: ComponentFixture<NotesRail>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  function show(notes: RailNote[], currentPage = 1) {
    fixture.componentRef.setInput('notes', notes);
    fixture.componentRef.setInput('currentPage', currentPage);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(NotesRail);
  });

  /**
   * Per the brief: an empty rail on every article is a permanent tax on the
   * width of the page, for a feature most documents never use.
   */
  it('renders nothing at all when there are no notes', () => {
    show([]);
    expect(el().querySelector('.notes-rail')).toBeNull();
  });

  it('shows the note and the passage it was made on', () => {
    show([note()]);

    expect(el().textContent).toContain('a thought');
    expect(el().textContent).toContain('quoted passage');
  });

  it('emphasises the notes on the page being read', () => {
    show([note({ id: 'a' }), note({ id: 'b' }, { page: 2 })], 1);

    const items = [...el().querySelectorAll('.note')];
    expect(items[0].classList.contains('current')).toBe(true);
    expect(items[1].classList.contains('current')).toBe(false);
  });

  /**
   * The article changed underneath the anchor. The reader's own words are kept
   * and shown; only the claim about *where* they point is withdrawn.
   */
  it('says a passage moved rather than pretending to know where it is', () => {
    show([note({}, { moved: true, page: null })]);

    expect(el().textContent).toContain('Passage moved');
    expect(el().textContent).toContain('a thought');
    // No "go to page" offer, because there is no page to go to.
    expect(el().textContent).not.toContain('page 1');
  });

  it('offers to jump to a passage that is still where it was', () => {
    show([note()]);
    let jumped: RailNote | null = null;
    fixture.componentInstance.goTo.subscribe((n) => (jumped = n));

    [...el().querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('page 1'))!
      .click();

    expect(jumped).not.toBeNull();
  });

  it('reports edit, share and remove', () => {
    show([note()]);
    const seen: string[] = [];
    fixture.componentInstance.edit.subscribe(() => seen.push('edit'));
    fixture.componentInstance.share.subscribe(() => seen.push('share'));
    fixture.componentInstance.remove.subscribe(() => seen.push('remove'));

    for (const label of ['Edit note', 'Share', 'Remove']) {
      [...el().querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent?.trim() === label)!
        .click();
    }

    expect(seen).toEqual(['edit', 'share', 'remove']);
  });

  it('shows a bare highlight with its quote and no body', () => {
    show([note({ note: '' })]);

    expect(el().textContent).toContain('quoted passage');
    expect(el().querySelector('.note-body')).toBeNull();
  });
});
