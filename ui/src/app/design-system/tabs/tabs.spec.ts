import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MbTabs, MbTab } from './tabs';

@Component({
  imports: [MbTabs, MbTab],
  template: `<mb-tabs label="Views" [selected]="selected()" (selectedChange)="changes.push($event)">
    <ng-template mbTab value="a" label="First" [disabled]="disabled()">First panel</ng-template>
    <ng-template mbTab value="b" label="Second">Second panel</ng-template>
  </mb-tabs>`,
})
class Host {
  selected = signal('a');
  disabled = signal(false);
  changes: string[] = [];
}

describe('MbTabs', () => {
  it('accepts caller selection without emitting, and emits user activation', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const tabs: HTMLButtonElement[] = [...fixture.nativeElement.querySelectorAll('[role=tab]')];
    fixture.componentInstance.selected.set('b');
    await fixture.whenStable();
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(fixture.componentInstance.changes).toEqual([]);
    tabs[0].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.changes).toEqual(['a']);
  });

  it('falls back when the selected tab becomes disabled', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    fixture.componentInstance.disabled.set(true);
    await fixture.whenStable();
    const tabs: HTMLButtonElement[] = [...fixture.nativeElement.querySelectorAll('[role=tab]')];
    expect(tabs[0].disabled).toBe(true);
    expect(tabs[0].tabIndex).toBe(-1);
    expect(tabs[1].tabIndex).toBe(0);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(fixture.componentInstance.changes).toEqual([]);
  });
});
