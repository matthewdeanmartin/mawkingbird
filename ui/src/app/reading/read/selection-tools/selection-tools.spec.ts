import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SelectionTools } from './selection-tools';

describe('SelectionTools', () => {
  let fixture: ComponentFixture<SelectionTools>;

  const labels = (): string[] =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].map(
      (button) => button.textContent?.trim() ?? '',
    );

  function show(selection: string, alreadyHighlighted = false) {
    fixture.componentRef.setInput('selection', selection);
    fixture.componentRef.setInput('alreadyHighlighted', alreadyHighlighted);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(SelectionTools);
  });

  it('shows nothing without a selection', () => {
    show('');
    expect(labels()).toHaveLength(0);
  });

  /**
   * Selecting a word is a lookup; selecting a phrase is a mark. Offering all
   * four tools every time puts four targets under a thumb that wanted one.
   */
  it('offers Define, and only Define, for a single word', () => {
    show('sesquipedalian');
    expect(labels()).toEqual(['Define']);
  });

  it('offers the mark tools, and not Define, for a phrase', () => {
    show('a longer selected phrase');
    expect(labels()).toEqual(['Highlight', 'Note', 'Share']);
  });

  it('offers to remove a highlight that is already there', () => {
    show('a longer selected phrase', true);
    expect(labels()).toEqual(['Remove highlight', 'Note', 'Share']);
  });

  it('reports the word when Define is pressed', () => {
    show('otter');
    let defined = '';
    fixture.componentInstance.define.subscribe((word) => (defined = word));

    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();

    expect(defined).toBe('otter');
  });

  it('places itself at the point it was given', () => {
    fixture.componentRef.setInput('selection', 'otter');
    fixture.componentRef.setInput('at', { x: 120, y: 40 });
    fixture.detectChanges();

    const bar = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.selection-tools',
    );
    expect(bar?.style.left).toBe('120px');
    expect(bar?.style.top).toBe('40px');
  });
});
