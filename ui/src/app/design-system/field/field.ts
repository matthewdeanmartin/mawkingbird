import {
  booleanAttribute,
  Component,
  contentChild,
  Directive,
  forwardRef,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core';
import { MbSaveFeedback } from '../save-feedback/save-feedback';

let nextId = 0;

/** Apply to exactly one native control inside mb-field. Native forms stay native. */
@Directive({
  selector: 'input[mbControl], select[mbControl], textarea[mbControl]',
  host: {
    class: 'mb-control',
    '[id]': 'field.controlId',
    '[required]': 'required()',
    '[attr.aria-describedby]': 'field.descriptionIds()',
    '[attr.aria-invalid]': 'field.error() ? "true" : null',
  },
})
export class MbControl {
  readonly field = inject(forwardRef(() => MbField)) as MbField;
  readonly required = input(false, { transform: booleanAttribute });
}

/** Presentation around a native input, select or textarea, with linked descriptions. */
@Component({
  selector: 'mb-field',
  imports: [MbSaveFeedback],
  template: `
    <label class="mb-field-label" [class.mb-field-label-hidden]="hideLabel()" [for]="controlId">
      {{ label() }}
      @if (control()?.required()) {
        <span aria-hidden="true"> *</span>
      }
    </label>
    <ng-content />
    @if (hint()) {
      <p class="mb-field-hint" [id]="controlId + '-hint'">{{ hint() }}</p>
    }
    <mb-save-feedback state="error" [message]="error()" [errorId]="controlId + '-error'" />
  `,
  // Projected native controls do not receive the wrapper's scoped attributes.
  // Every CSS selector is explicitly namespaced to mb-field.
  encapsulation: ViewEncapsulation.None,
  styleUrl: './field.css',
})
export class MbField {
  readonly label = input.required<string>();
  /** Compact editors retain an accessible label without repeating visible captions. */
  readonly hideLabel = input(false, { transform: booleanAttribute });
  readonly hint = input('');
  readonly error = input('');
  readonly control = contentChild(MbControl);
  readonly controlId = `mb-field-${nextId++}`;

  descriptionIds(): string | null {
    return (
      [this.hint() ? `${this.controlId}-hint` : '', this.error() ? `${this.controlId}-error` : '']
        .filter(Boolean)
        .join(' ') || null
    );
  }
}
