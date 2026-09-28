import {
  booleanAttribute,
  Component,
  ElementRef,
  forwardRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MbSaveFeedback } from '../save-feedback/save-feedback';

export interface RadioOption {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

let nextId = 0;

@Component({
  selector: 'mb-radio-group',
  imports: [MbSaveFeedback],
  templateUrl: './radio-group.html',
  styleUrl: './radio-group.css',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MbRadioGroup), multi: true },
  ],
})
export class MbRadioGroup implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly options = input.required<readonly RadioOption[]>();
  readonly hint = input('');
  readonly error = input('');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly required = input(false, { transform: booleanAttribute });
  readonly value = input<string | null>(null);
  readonly valueChange = output<string>();
  readonly selection = linkedSignal(() => this.value());
  readonly formDisabled = signal(false);
  readonly groupId = `mb-radio-${nextId++}`;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  descriptionIds(index: number): string | null {
    return (
      [
        this.hint() ? `${this.groupId}-hint` : '',
        this.options()[index].hint ? `${this.groupId}-${index}-hint` : '',
        this.error() ? `${this.groupId}-error` : '',
      ]
        .filter(Boolean)
        .join(' ') || null
    );
  }

  choose(value: string): void {
    this.selection.set(value);
    this.valueChange.emit(value);
    this.onChange(value);
  }

  touch(event: FocusEvent): void {
    if (!this.host.nativeElement.contains(event.relatedTarget as Node | null)) this.onTouched();
  }

  writeValue(value: string | null): void {
    this.selection.set(value ?? null);
  }
  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(value: boolean): void {
    this.formDisabled.set(value);
  }
}
