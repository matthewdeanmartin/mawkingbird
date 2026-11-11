import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftItem, DraftKind } from '../../drafts/draft-items';
import { WriteWorkspace } from '../write-workspace';
import { WriteBoard } from './write-board';

/**
 * Every test here mounts the board **on its own**, with no `WritePage` anywhere.
 *
 * That is the point of the file as much as the assertions are: where this board
 * lives is not settled — a panel today, possibly its own route tomorrow — and a
 * spec that needed the workspace page to exist would mean the boundary had
 * already leaked.
 */
function item(id: string, kind: DraftKind = 'local', at = '2026-08-08T12:00:00Z'): DraftItem {
  return {
    key: `${kind}:${id}`,
    kind,
    id,
    at,
    preview: `draft ${id}`,
    visibility: 'public',
    badges: [],
    source: { kind: 'local', draft: { id } },
  } as unknown as DraftItem;
}

interface BoardInternals {
  move(item: DraftItem, to: 'ideas' | 'writing' | 'editing' | 'scheduled'): void;
  announcement: () => string;
  onDrop(column: 'ideas' | 'writing' | 'editing' | 'scheduled', event: DragEvent): void;
  onDragStart(item: DraftItem, event: DragEvent): void;
}

function internals(fixture: ComponentFixture<WriteBoard>): BoardInternals {
  return fixture.componentInstance as unknown as BoardInternals;
}

describe('WriteBoard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T12:00:00Z'));
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mount(items: DraftItem[]): ComponentFixture<WriteBoard> {
    const fixture = TestBed.createComponent(WriteBoard);
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();
    return fixture;
  }

  function columnTitles(fixture: ComponentFixture<WriteBoard>): string[] {
    return [...fixture.nativeElement.querySelectorAll('.column-head h4')].map((h) =>
      (h as HTMLElement).textContent?.trim(),
    ) as string[];
  }

  function cardsIn(fixture: ComponentFixture<WriteBoard>, column: string): string[] {
    const sections = [...fixture.nativeElement.querySelectorAll('.board-column')] as HTMLElement[];
    const section = sections.find(
      (s) => s.querySelector('.column-head h4')?.textContent?.trim() === column,
    );
    return [...(section?.querySelectorAll('.card-text') ?? [])].map((n) =>
      (n as HTMLElement).textContent?.trim(),
    ) as string[];
  }

  // ------------------------------------------------------------------ rendering

  it('renders standalone, with no host page', () => {
    const fixture = mount([item('1')]);
    expect(columnTitles(fixture)).toEqual(['Ideas', 'Writing', 'Editing', 'Scheduled']);
  });

  it('places an untriaged draft in Ideas', () => {
    const fixture = mount([item('1')]);
    expect(cardsIn(fixture, 'Ideas')).toEqual(['draft 1']);
  });

  it('places a scheduled draft in Scheduled without anything stored', () => {
    const fixture = mount([item('p1', 'scheduled')]);
    expect(cardsIn(fixture, 'Scheduled')).toEqual(['draft p1']);
  });

  it('honours a stored column', () => {
    TestBed.inject(WriteWorkspace).setColumn('local:1', 'editing');
    const fixture = mount([item('1')]);
    expect(cardsIn(fixture, 'Editing')).toEqual(['draft 1']);
  });

  it('explains an empty column rather than leaving it blank', () => {
    // An unexplained empty column reads as broken rather than as available.
    const fixture = mount([]);
    const empties = [...fixture.nativeElement.querySelectorAll('.column-empty')];
    expect(empties).toHaveLength(4);
    expect((empties[0] as HTMLElement).textContent).toContain('jotted down');
  });

  it('counts the cards in each column heading', () => {
    const fixture = mount([item('1'), item('2'), item('p1', 'scheduled')]);
    const counts = [...fixture.nativeElement.querySelectorAll('.chip-count')].map((n) =>
      (n as HTMLElement).textContent?.trim(),
    );
    expect(counts).toEqual(['2', '0', '0', '1']);
  });

  it('highlights the draft the editor is holding', () => {
    const fixture = TestBed.createComponent(WriteBoard);
    fixture.componentRef.setInput('items', [item('1'), item('2')]);
    fixture.componentRef.setInput('currentKey', 'local:2');
    fixture.detectChanges();

    const current = fixture.nativeElement.querySelector('.card.current .card-text') as HTMLElement;
    expect(current.textContent?.trim()).toBe('draft 2');
  });

  // -------------------------------------------------------------------- moving

  it('moving writes the column and survives a reload', () => {
    const fixture = mount([item('1')]);
    internals(fixture).move(item('1'), 'writing');
    fixture.detectChanges();

    expect(cardsIn(fixture, 'Writing')).toEqual(['draft 1']);
    // A fresh service instance re-reads localStorage.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(WriteWorkspace).column('local:1')).toBe('writing');
  });

  it('refuses a move into Scheduled and says why', () => {
    // A draft becomes scheduled by being scheduled, not by being dragged.
    const fixture = mount([item('1')]);
    internals(fixture).move(item('1'), 'scheduled');
    fixture.detectChanges();

    expect(TestBed.inject(WriteWorkspace).column('local:1')).toBeUndefined();
    expect(cardsIn(fixture, 'Scheduled')).toEqual([]);
    expect(internals(fixture).announcement()).toContain('scheduling');
  });

  it('refuses to move a scheduled draft out of Scheduled', () => {
    // Dragging it out would claim to cancel a publish it has not cancelled.
    const fixture = mount([item('p1', 'scheduled')]);
    internals(fixture).move(item('p1', 'scheduled'), 'ideas');
    fixture.detectChanges();

    expect(cardsIn(fixture, 'Scheduled')).toEqual(['draft p1']);
    expect(cardsIn(fixture, 'Ideas')).toEqual([]);
  });

  it('announces a move, since the change is otherwise only visual', () => {
    const fixture = mount([item('1')]);
    internals(fixture).move(item('1'), 'editing');
    expect(internals(fixture).announcement()).toBe('Moved to Editing.');
  });

  it('offers a keyboard menu on every movable card', () => {
    // A board you can only use with a mouse is one half the users cannot use.
    const fixture = mount([item('1')]);
    const button = fixture.nativeElement.querySelector('.card-menu-button') as HTMLButtonElement;
    expect(button).toBeTruthy();

    button.click();
    fixture.detectChanges();
    const options = [...fixture.nativeElement.querySelectorAll('.card-menu button')].map((b) =>
      (b as HTMLElement).textContent?.trim(),
    );
    expect(options).toEqual(['Ideas', 'Writing', 'Editing']);
  });

  it('escapes the column scroll box rather than being clipped by it', () => {
    // The bug: `.column-cards` scrolls, and a scroll container *clips* its
    // absolutely-positioned descendants — no z-index escapes a clipping
    // rectangle, so the menu rendered underneath the board, cut off after
    // "Move to". Fixed positioning is what takes it out of the clip.
    const fixture = mount([item('1')]);
    (fixture.nativeElement.querySelector('.card-menu-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const menu = fixture.nativeElement.querySelector('.card-menu') as HTMLElement;
    expect(getComputedStyle(menu).position).toBe('fixed');
    // And it is placed, rather than defaulting to the top-left corner.
    expect(menu.style.top).not.toBe('');
    expect(menu.style.left).not.toBe('');
  });

  it('clicking the button again closes the menu', () => {
    const fixture = mount([item('1')]);
    const button = fixture.nativeElement.querySelector('.card-menu-button') as HTMLButtonElement;

    button.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.card-menu')).toBeTruthy();

    button.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.card-menu')).toBeNull();
  });

  it('closes the menu when anything scrolls', () => {
    // A fixed menu does not travel with its card, so a scroll must dismiss it
    // or it floats over unrelated rows.
    const fixture = mount([item('1')]);
    (fixture.nativeElement.querySelector('.card-menu-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.card-menu')).toBeTruthy();

    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.card-menu')).toBeNull();
  });

  it('stops listening for scrolls once destroyed', () => {
    const fixture = mount([item('1')]);
    const removed = vi.spyOn(window, 'removeEventListener');
    fixture.destroy();
    expect(removed).toHaveBeenCalledWith('scroll', expect.any(Function), true);
  });

  it('gives a scheduled card no move menu at all', () => {
    const fixture = mount([item('p1', 'scheduled')]);
    expect(fixture.nativeElement.querySelector('.card-menu-button')).toBeNull();
  });

  it('a drop lands in the same place the menu would', () => {
    // Both routes go through `move()`, so they cannot disagree — this pins that.
    const fixture = mount([item('1')]);
    const board = internals(fixture);
    const prevented = vi.fn();

    board.onDragStart(item('1'), { dataTransfer: null } as unknown as DragEvent);
    board.onDrop('editing', {
      preventDefault: prevented,
      dataTransfer: null,
    } as unknown as DragEvent);
    fixture.detectChanges();

    expect(prevented).toHaveBeenCalled();
    expect(cardsIn(fixture, 'Editing')).toEqual(['draft 1']);
  });

  // ------------------------------------------------------------------- outputs

  it('emits the item to open rather than routing anywhere itself', () => {
    const fixture = mount([item('1')]);
    const opened: DraftItem[] = [];
    fixture.componentInstance.opened.subscribe((i) => opened.push(i));

    (fixture.nativeElement.querySelector('.card-open') as HTMLButtonElement).click();

    expect(opened.map((i) => i.id)).toEqual(['1']);
  });

  it('emits closed rather than knowing what closing means', () => {
    const fixture = mount([]);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);

    const button = [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
      (b as HTMLElement).textContent?.includes('Close board'),
    ) as HTMLButtonElement;
    button.click();

    expect(closed).toBe(1);
  });
});
