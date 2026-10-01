import { Component, input } from '@angular/core';

/** Bounded action appearance. Native buttons own type/disabled; links own href/routerLink. */
@Component({
  selector: 'button[mbButton], a[mbButton]',
  template: '<ng-content />',
  host: {
    '[attr.data-variant]': 'variant()',
    '[attr.data-size]': 'size()',
    '[attr.data-tone]': 'tone()',
  },
})
export class MbButton {
  readonly variant = input<'solid' | 'outline'>('solid');
  readonly size = input<'regular' | 'small'>('regular');
  readonly tone = input<'accent' | 'danger'>('accent');
}
