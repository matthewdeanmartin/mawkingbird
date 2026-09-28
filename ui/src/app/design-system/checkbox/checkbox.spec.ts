import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MbCheckbox } from './checkbox';

@Component({
  imports: [MbCheckbox, ReactiveFormsModule],
  template: '<mb-checkbox label="Approve followers" [formControl]="control" />',
})
class FormsHost {
  control = new FormControl(false);
}

describe('MbCheckbox', () => {
  it('associates label, hint and error with a unique native control', async () => {
    const first = TestBed.createComponent(MbCheckbox);
    first.componentRef.setInput('label', 'Approve followers');
    first.componentRef.setInput('hint', 'A helpful description');
    first.componentRef.setInput('error', 'Save failed');
    await first.whenStable();
    const root: HTMLElement = first.nativeElement;
    const input = root.querySelector('input')!;
    expect(root.querySelector('label')!.htmlFor).toBe(input.id);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedIds = input.getAttribute('aria-describedby')!.split(' ');
    expect(describedIds.map((id) => root.querySelector(`#${id}`)!.textContent)).toEqual([
      'A helpful description',
      'Save failed',
    ]);
    const second = TestBed.createComponent(MbCheckbox);
    second.componentRef.setInput('label', 'Another setting');
    await second.whenStable();
    expect(second.nativeElement.querySelector('input').id).not.toBe(input.id);
  });

  it('emits user changes and responds to external checked updates', async () => {
    const fixture = TestBed.createComponent(MbCheckbox);
    fixture.componentRef.setInput('label', 'Approve followers');
    const changed = vi.fn();
    fixture.componentInstance.checkedChange.subscribe(changed);
    await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.click();
    await fixture.whenStable();
    expect(changed).toHaveBeenCalledExactlyOnceWith(true);
    fixture.componentRef.setInput('checked', true);
    await fixture.whenStable();
    fixture.componentRef.setInput('checked', false);
    await fixture.whenStable();
    expect(input.checked).toBe(false);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('supports form changes, touched state, disable and reset without spurious changes', async () => {
    const fixture = TestBed.createComponent(FormsHost);
    await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    const control = fixture.componentInstance.control;
    input.click();
    await fixture.whenStable();
    expect(control.value).toBe(true);
    input.dispatchEvent(new Event('blur'));
    expect(control.touched).toBe(true);
    control.disable();
    await fixture.whenStable();
    expect(input.disabled).toBe(true);
    input.click();
    expect(control.value).toBe(true);
    control.enable();
    control.reset();
    await fixture.whenStable();
    expect(input.checked).toBe(false);
    expect(input.disabled).toBe(false);
    expect(control.value).toBe(null);
    expect(control.touched).toBe(false);
  });

  it('keeps status out of the label and clears obsolete error associations', async () => {
    const fixture = TestBed.createComponent(MbCheckbox);
    fixture.componentRef.setInput('label', 'Approve followers');
    fixture.componentRef.setInput('error', 'Save failed');
    fixture.componentRef.setInput('status', 'Saved');
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('label')!.textContent).toBe('Approve followers');
    expect(root.querySelector('[role="status"]')!.textContent).toBe('Saved');
    fixture.componentRef.setInput('error', '');
    await fixture.whenStable();
    expect(root.querySelector('input')!.hasAttribute('aria-describedby')).toBe(false);
    expect(root.querySelector('input')!.hasAttribute('aria-invalid')).toBe(false);
  });
  it('restores a synchronously rejected native toggle without emitting another change', async () => {
    const fixture = TestBed.createComponent(MbCheckbox);
    fixture.componentRef.setInput('label', 'Membership');
    const changed = vi.fn(() => fixture.componentInstance.writeValue(false));
    fixture.componentInstance.checkedChange.subscribe(changed);
    await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.click();
    await fixture.whenStable();
    expect(input.checked).toBe(false);
    expect(changed).toHaveBeenCalledExactlyOnceWith(true);
  });
});
