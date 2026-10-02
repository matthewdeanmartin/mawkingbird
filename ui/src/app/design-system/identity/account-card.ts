import { Component, ViewEncapsulation, input, booleanAttribute } from '@angular/core';

@Component({
  selector: 'div[mbAccountCard]',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  styleUrl: './account-card.css',
  host: { '[attr.data-inline]': 'inline()' },
})
export class MbAccountCard {
  readonly inline = input(false, { transform: booleanAttribute });
}
