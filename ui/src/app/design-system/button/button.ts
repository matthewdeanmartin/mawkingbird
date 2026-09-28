import { Component, input } from '@angular/core';

/** Native button semantics with a bounded visual API. Set type at the call site. */
@Component({
  selector: 'button[mbButton]',
  template: '<ng-content />',
  styleUrl: './button.css',
  host: { '[attr.data-variant]': 'variant()', '[attr.data-size]': 'size()' },
})
export class MbButton {
  readonly variant = input<'solid' | 'outline'>('solid');
  readonly size = input<'regular' | 'small'>('regular');
}
