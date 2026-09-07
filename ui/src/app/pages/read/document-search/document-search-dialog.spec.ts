import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SearchMatch } from '../document-search';
import { DocumentSearchDialog } from './document-search-dialog';

const PAGES = [
  'The first page mentions otters once.',
  'The second page mentions otters twice: otters again.',
  'The third page mentions nothing of interest.',
];

describe('DocumentSearchDialog', () => {
  let fixture: ComponentFixture<DocumentSearchDialog>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const results = (): string[] =>
    [...el().querySelectorAll('.search-result')].map(
      (row) => row.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );

  function search(query: string) {
    fixture.componentInstance['query'].set(query);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(DocumentSearchDialog);
    fixture.componentRef.setInput('pages', PAGES);
    fixture.componentRef.setInput('currentPage', 1);
    fixture.detectChanges();
  });

  it('says what it searches before anything is typed', () => {
    expect(el().textContent).toContain('Searches the whole document');
  });

  /** The point of the feature: matches from pages that are not on screen. */
  it('lists matches from every page, with the page they are on', () => {
    search('otters');

    expect(results()).toHaveLength(3);
    expect(el().textContent).toContain('3 matches');
    expect(results()[0]).toContain('page 1');
    expect(results()[2]).toContain('page 2');
  });

  it('counts one match in the singular', () => {
    search('third');
    expect(el().textContent).toContain('1 match');
  });

  it('says so when there is nothing', () => {
    search('penguins');
    expect(el().textContent).toContain('No matches');
    expect(results()).toHaveLength(0);
  });

  it('marks the matched text inside its context line', () => {
    search('otters');
    expect(el().querySelector('mark')?.textContent).toBe('otters');
  });

  it('shows which results are on the page already open', () => {
    fixture.componentRef.setInput('currentPage', 2);
    search('otters');

    const rows = [...el().querySelectorAll('.search-result')];
    expect(rows[0].classList.contains('on-this-page')).toBe(false);
    expect(rows[1].classList.contains('on-this-page')).toBe(true);
  });

  it('reports the match that was chosen', () => {
    search('otters');
    let chosen: SearchMatch | null = null;
    fixture.componentInstance.goTo.subscribe((match) => (chosen = match));

    el().querySelectorAll<HTMLButtonElement>('.search-result')[2].click();

    expect(chosen).not.toBeNull();
    expect(chosen!.page).toBe(2);
  });

  /** Escape closes the dialog, not the reader behind it. */
  it('closes on Escape without letting the key through', () => {
    let closed = false;
    fixture.componentInstance.closed.subscribe(() => (closed = true));

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    el().querySelector('.search-dialog')!.dispatchEvent(event);

    expect(closed).toBe(true);
  });
});
