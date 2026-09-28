import { TestBed } from '@angular/core/testing';
import { MbActionMenu } from './action-menu';

describe('MbActionMenu', () => {
  it('emits only enabled actions and keeps native buttons out of the page Tab order', async () => {
    const fixture = TestBed.createComponent(MbActionMenu);
    fixture.componentRef.setInput('label', 'Feed actions');
    const actions = [
      { id: 'rename', label: 'Rename' },
      { id: 'export', label: 'Export', disabled: true },
    ];
    fixture.componentRef.setInput('actions', actions);
    await fixture.whenStable();
    const selected: string[] = [];
    fixture.componentInstance.chosen.subscribe((value) => selected.push(value));
    fixture.componentInstance.choose(actions[1]);
    expect(selected).toEqual([]);
    fixture.componentInstance.choose(actions[0]);
    expect(selected).toEqual(['rename']);
    const items: HTMLButtonElement[] = [
      ...fixture.nativeElement.querySelectorAll('[role="menuitem"]'),
    ];
    expect(items.map((item) => item.tabIndex)).toEqual([-1, -1]);
    expect(items[1].disabled).toBe(true);
    expect(items.every((item) => item.type === 'button')).toBe(true);
  });
});
