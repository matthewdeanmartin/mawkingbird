import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MbRadioGroup } from './radio-group';

@Component({
  imports: [MbRadioGroup, FormsModule, ReactiveFormsModule],
  template: `
    <mb-radio-group label="Reactive choice" [options]="options" [formControl]="choice" />
    <mb-radio-group label="Template choice" [options]="options" [(ngModel)]="templateChoice" />
  `,
})
class RadioHost {
  options = [
    { value: 'a', label: 'First' },
    { value: 'b', label: 'Second' },
  ];
  choice = new FormControl<string | null>('a', Validators.required);
  templateChoice = 'b';
}

describe('MbRadioGroup', () => {
  it('provides a legend and connects option and group descriptions', async () => {
    const fixture = TestBed.createComponent(MbRadioGroup);
    fixture.componentRef.setInput('label', 'Visibility');
    fixture.componentRef.setInput('options', [
      { value: 'a', label: 'Everyone', hint: 'A public post' },
    ]);
    fixture.componentRef.setInput('hint', 'Choose a default');
    fixture.componentRef.setInput('error', 'Choose one');
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const input = root.querySelector('input')!;
    expect(root.querySelector('legend')!.textContent?.trim()).toBe('Visibility');
    expect(root.querySelector('label')!.htmlFor).toBe(input.id);
    expect(
      input
        .getAttribute('aria-describedby')!
        .split(' ')
        .map((id) => root.querySelector(`#${id}`)!.textContent?.trim()),
    ).toEqual(['Choose a default', 'A public post', 'Choose one']);
  });

  it('isolates native names across groups and supports both forms APIs', async () => {
    const fixture = TestBed.createComponent(RadioHost);
    await fixture.whenStable();
    const inputs: HTMLInputElement[] = [...fixture.nativeElement.querySelectorAll('input')];
    expect(inputs[0].name).toBe(inputs[1].name);
    expect(inputs[0].name).not.toBe(inputs[2].name);
    inputs[1].click();
    inputs[2].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.choice.value).toBe('b');
    expect(fixture.componentInstance.templateChoice).toBe('a');
    expect(inputs[1].checked).toBe(true);
    expect(inputs[2].checked).toBe(true);
  });

  it('supports reset, validation, rollback and group disable without user emissions', async () => {
    const fixture = TestBed.createComponent(RadioHost);
    await fixture.whenStable();
    const host = fixture.componentInstance;
    const inputs: HTMLInputElement[] = [...fixture.nativeElement.querySelectorAll('input')];
    inputs[1].click();
    await fixture.whenStable();
    host.choice.setValue('a');
    await fixture.whenStable();
    expect(inputs[0].checked).toBe(true);
    host.choice.reset();
    await fixture.whenStable();
    expect(inputs[0].checked || inputs[1].checked).toBe(false);
    expect(host.choice.hasError('required')).toBe(true);
    host.choice.disable();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
    inputs[1].click();
    expect(host.choice.value).toBeNull();
  });

  it('marks touched when focus leaves the group, not between its options', async () => {
    const fixture = TestBed.createComponent(RadioHost);
    await fixture.whenStable();
    const inputs: HTMLInputElement[] = [...fixture.nativeElement.querySelectorAll('input')];
    inputs[0].dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: inputs[1] }),
    );
    expect(fixture.componentInstance.choice.touched).toBe(false);
    inputs[1].dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: inputs[2] }),
    );
    expect(fixture.componentInstance.choice.touched).toBe(true);
  });
});
