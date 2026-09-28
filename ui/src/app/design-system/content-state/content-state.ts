import { Component, input } from '@angular/core';
/** Presentation only. Callers own loading, retries, localization and retained content. */
@Component({
  selector: 'mb-content-state',
  template: `
    <div class="message" [attr.role]="announcement() === 'off' ? null : announcement()">
      <strong>{{ title() }}</strong>
      @if (description()) {
        <p>{{ description() }}</p>
      }
    </div>
    <div class="actions"><ng-content /></div>
  `,
  styleUrl: './content-state.css',
  host: { '[attr.data-kind]': 'kind()' },
})
export class MbContentState {
  readonly title = input.required<string>();
  readonly description = input('');
  readonly kind = input<'empty' | 'loading' | 'error'>('empty');
  readonly announcement = input<'off' | 'status' | 'alert'>('off');
}
