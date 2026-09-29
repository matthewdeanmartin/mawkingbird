import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MbControl, MbField } from './field';

@Component({
  imports: [MbField, MbControl, FormsModule, ReactiveFormsModule],
  template: `
    <mb-field label="Name" hint="Public name" [error]="error" [hideLabel]="hideLabel">
      <input mbControl required [(ngModel)]="name" #nameModel="ngModel" />
    </mb-field>
    <mb-field label="Goal"><input mbControl type="number" [formControl]="goal" /></mb-field>
    <mb-field label="Visibility"
      ><select mbControl [formControl]="visibility">
        <option value="public">Everyone</option>
        <option value="private">Followers</option>
      </select></mb-field
    >
    <mb-field label="Biography"><textarea mbControl [formControl]="bio"></textarea></mb-field>
    <span class="valid">{{ nameModel.valid }}</span>
  `,
})
class FieldHost {
  hideLabel = false;
  name = '';
  error = 'Enter a name';
  goal = new FormControl<number | null>(10);
  visibility = new FormControl('public');
  bio = new FormControl('Hello');
}

describe('MbField', () => {
  it('can visually hide a compact label while preserving its native control association', async () => {
    const fixture = TestBed.createComponent(FieldHost);
    await fixture.whenStable();
    const label: HTMLLabelElement = fixture.nativeElement.querySelector('label');
    expect(label.classList.contains('mb-field-label-hidden')).toBe(false);
    fixture.componentInstance.hideLabel = true;
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(label.classList.contains('mb-field-label-hidden')).toBe(true);
    expect(label.control).toBe(fixture.nativeElement.querySelector('input'));
    expect(label.textContent).toContain('Name');
    expect(label.getAttribute('aria-hidden')).toBeNull();
  });
  it('links native controls to unique labels, hints and errors and removes stale associations', async () => {
    const fixture = TestBed.createComponent(FieldHost);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const controls = [...root.querySelectorAll<HTMLInputElement>('.mb-control')];
    expect(new Set(controls.map((control) => control.id)).size).toBe(4);
    const input = controls[0];
    expect(root.querySelector('label')!.htmlFor).toBe(input.id);
    const ids = input.getAttribute('aria-describedby')!.split(' ');
    expect(ids.map((id) => root.querySelector(`#${id}`)!.textContent?.trim())).toEqual([
      'Public name',
      'Enter a name',
    ]);
    expect(input.required).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fixture.componentInstance.error = '';
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBe(`${input.id}-hint`);
  });

  it('preserves template-driven required validation and native text input binding', async () => {
    const fixture = TestBed.createComponent(FieldHost);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.valid')!.textContent).toBe('false');
    const input = root.querySelector('input')!;
    input.value = 'A reader';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(fixture.componentInstance.name).toBe('A reader');
    expect(root.querySelector('.valid')!.textContent).toBe('true');
  });

  it('preserves numeric, select, textarea, disabled, touched and reset behavior', async () => {
    const fixture = TestBed.createComponent(FieldHost);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const host = fixture.componentInstance;
    const number = root.querySelector<HTMLInputElement>('input[type="number"]')!;
    number.value = '25';
    number.dispatchEvent(new Event('input'));
    number.dispatchEvent(new Event('blur'));
    expect(host.goal.value).toBe(25);
    expect(host.goal.touched).toBe(true);
    number.value = '';
    number.dispatchEvent(new Event('input'));
    expect(host.goal.value).toBeNull();
    const select = root.querySelector('select')!;
    select.value = 'private';
    select.dispatchEvent(new Event('change'));
    expect(host.visibility.value).toBe('private');
    const textarea = root.querySelector('textarea')!;
    textarea.value = 'Updated biography';
    textarea.dispatchEvent(new Event('input'));
    expect(host.bio.value).toBe('Updated biography');
    host.bio.disable();
    host.goal.reset(10);
    await fixture.whenStable();
    expect(textarea.disabled).toBe(true);
    expect(number.value).toBe('10');
    expect(host.goal.touched).toBe(false);
  });
});
