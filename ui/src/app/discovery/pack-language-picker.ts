import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';

export interface PackLanguageOption {
  value: string;
  label: string;
}

/** Shared language control for curated pack catalogues. */
@Component({
  selector: 'app-pack-language-picker',
  template: `
    <label class="kit-filter">
      <span>{{ label() }}</span>
      <select [value]="value()" (change)="valueChange.emit($any($event.target).value)">
        @for (option of options(); track option.value) {
          <option [value]="option.value" [selected]="option.value === value()">
            {{ option.label }}
          </option>
        }
      </select>
    </label>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './pack-language-picker.css',
})
export class PackLanguagePicker {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly options = input.required<readonly PackLanguageOption[]>();
  readonly valueChange = output<string>();
}
