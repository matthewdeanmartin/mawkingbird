import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { MbButton } from '../button/button';
import { MbControl, MbField } from '../field/field';
import { MbAddBox } from './add-box';

@Component({
  imports: [FormsModule, MbAddBox, MbButton, MbControl, MbField],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <form mbAddBox (ngSubmit)="sent.set(sent() + 1)">
      <mb-field label="Channel"><input mbControl name="channel" [(ngModel)]="value" /></mb-field>
      <button mbButton type="submit">Add</button>
    </form>
  `,
})
class Host {
  readonly sent = signal(0);
  value = '';
}

describe('MbAddBox', () => {
  async function mount() {
    const fixture = TestBed.createComponent(Host);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    return {
      fixture,
      input: root.querySelector('input')!,
      button: root.querySelector('button')!,
    };
  }

  it('submits a filled box once', async () => {
    const { fixture, input, button } = await mount();
    input.value = '@example';
    input.dispatchEvent(new Event('input'));
    button.click();
    expect(fixture.componentInstance.sent()).toBe(1);
    fixture.nativeElement.remove();
  });

  it('answers an empty or blank submit by focusing the box, and never submits it', async () => {
    const { fixture, input, button } = await mount();
    button.click();
    expect(document.activeElement).toBe(input);
    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    button.focus();
    button.click();
    expect(document.activeElement).toBe(input);
    expect(fixture.componentInstance.sent()).toBe(0);
    fixture.nativeElement.remove();
  });
});
