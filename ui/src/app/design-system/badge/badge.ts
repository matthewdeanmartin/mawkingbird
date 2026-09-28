import { Component, input } from '@angular/core';
/** Informational text, never an interactive control or a verification claim. */
@Component({
  selector: 'mb-badge',
  template: '<ng-content />',
  styleUrl: './badge.css',
  host: { '[attr.data-tone]': 'tone()' },
})
export class MbBadge {
  readonly tone = input<'neutral' | 'attention'>('neutral');
}
