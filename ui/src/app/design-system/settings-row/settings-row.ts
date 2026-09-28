import { Component, input } from '@angular/core';

/** A group heading and a responsive content column, not an input label. */
@Component({
  selector: 'mb-settings-row',
  template: `
    <div class="row">
      <div class="heading">{{ heading() }}</div>
      <div class="controls"><ng-content /></div>
    </div>
  `,
  styleUrl: './settings-row.css',
})
export class MbSettingsRow {
  readonly heading = input.required<string>();
}
