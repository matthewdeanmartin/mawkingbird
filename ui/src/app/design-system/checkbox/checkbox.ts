import { Component, forwardRef, input, linkedSignal, output, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextId = 0;

/** Native checkbox with one owned label, description and feedback layout. */
@Component({
  selector: 'mb-checkbox',
  templateUrl: './checkbox.html',
  styleUrl: './checkbox.css',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MbCheckbox), multi: true },
  ],
})
export class MbCheckbox implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly hint = input('');
  readonly error = input('');
  readonly status = input('');
  readonly disabled = input(false);
  readonly indeterminate = input(false);
  readonly checked = input(false);
  readonly checkedChange = output<boolean>();
  readonly value = linkedSignal(() => this.checked());
  readonly controlId = `mb-checkbox-${nextId++}`;
  readonly formDisabled = signal(false);
  private onChange: (value: boolean) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  descriptionIds(): string | null {
    const ids = [
      this.hint() ? `${this.controlId}-hint` : '',
      this.error() ? `${this.controlId}-error` : '',
    ].filter(Boolean);
    return ids.join(' ') || null;
  }

  change(event: Event): void {
    const value = (event.target as HTMLInputElement).checked;
    this.value.set(value);
    this.checkedChange.emit(value);
    this.onChange(value);
  }

  touch(): void {
    this.onTouched();
  }

  writeValue(value: boolean | null): void {
    // A forms write must not emit a user change (including form reset).
    this.value.set(value === true);
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(value: boolean): void {
    this.formDisabled.set(value);
  }
}
