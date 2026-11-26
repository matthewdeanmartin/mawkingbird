import { Component, input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'mb-notice',
  template: `<div
    [attr.role]="announcement() === 'off' ? null : announcement()"
    [attr.data-tone]="tone()"
  >
    @if (title()) {
      <strong>{{ title() }}</strong>
    }
    <ng-content />
  </div>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './notice.css',
})
export class MbNotice {
  readonly title = input('');
  readonly tone = input<'info' | 'error'>('info');
  readonly announcement = input<'off' | 'status' | 'alert'>('off');
}
