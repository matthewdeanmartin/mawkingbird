import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MbToolbar, MbToolbarButton } from './toolbar';

@Component({
  imports: [MbToolbar, MbToolbarButton],
  template: `<mb-toolbar label="Actions">
      <button mbToolbarButton [disabled]="disabled()">First</button>
      <button mbToolbarButton [pressed]="false">Second</button> </mb-toolbar
    ><mb-toolbar label="Other actions"><button mbToolbarButton>Other</button></mb-toolbar>`,
})
class Host {
  disabled = signal(false);
}

describe('MbToolbar', () => {
  it('isolates tab stops across toolbars and transfers eligibility on disable', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const buttons: HTMLButtonElement[] = [...fixture.nativeElement.querySelectorAll('button')];
    expect(buttons.map((button) => button.tabIndex)).toEqual([0, -1, 0]);
    fixture.componentInstance.disabled.set(true);
    await fixture.whenStable();
    expect(buttons.map((button) => button.tabIndex)).toEqual([-1, 0, 0]);
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[2].hasAttribute('aria-pressed')).toBe(false);
    expect(buttons.every((button) => button.type === 'button')).toBe(true);
  });
});
