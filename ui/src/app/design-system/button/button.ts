import { Component, input } from '@angular/core';

/**
 * Bounded action appearance. Native buttons own type/disabled; links own href/routerLink.
 *
 * Four weights, loudest first (design_system/components.md, "Button weights"):
 * - `solid`: the one primary action in a region.
 * - `outline`: other standalone actions.
 * - `compact`: actions in dense places such as rows, rails, card footers and
 *   result headers. A quiet small rectangle, not a pill; based on PostAction.
 * - `link`: a word that looks like a link and does something or goes
 *   somewhere ("Clear filters", "← Back"). On a button or a link.
 */
@Component({
  selector: 'button[mbButton], a[mbButton]',
  template: '<ng-content />',
  host: {
    '[attr.data-variant]': 'variant()',
    '[attr.data-size]': 'size()',
    '[attr.data-tone]': 'tone()',
    '[attr.data-shape]': 'shape()',
  },
})
export class MbButton {
  readonly variant = input<'solid' | 'outline' | 'compact' | 'link'>('solid');
  readonly size = input<'regular' | 'small'>('regular');
  readonly tone = input<'accent' | 'danger'>('accent');
  readonly shape = input<'pill' | 'rounded'>('pill');
}
