import { Component, ViewEncapsulation, input } from '@angular/core';

@Component({
  selector: 'section[mbRailCard], article[mbRailCard]',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  styleUrl: './rail-card.css',
  host: { '[attr.data-overflow]': 'overflow()', '[attr.data-tone]': 'tone()' },
})
export class MbRailCard {
  readonly overflow = input<'clip' | 'visible'>('clip');
  readonly tone = input<'default' | 'accent' | 'subtle'>('default');
}
