import { Component, input } from '@angular/core';
import { MbPopover } from '../popover/popover';

/** Optional help, opened explicitly by mouse, touch, Enter or Space. */
@Component({
  selector: 'mb-help',
  imports: [MbPopover],
  template: `<mb-popover [label]="label()" icon="help"><ng-content /></mb-popover>`,
  host: {
    '(click)': '$event.stopPropagation()',
    '(keydown)': 'keys($event)',
    '[style.display]': '"inline-flex"',
    '[style.vertical-align]': '"middle"',
  },
})
export class MbHelp {
  readonly label = input.required<string>();

  protected keys(event: KeyboardEvent): void {
    if (event.key !== 'Escape') event.stopPropagation();
  }
}
