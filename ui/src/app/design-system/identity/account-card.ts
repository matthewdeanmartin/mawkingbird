import {
  Component,
  ViewEncapsulation,
  input,
  booleanAttribute,
  ChangeDetectionStrategy,
} from '@angular/core';

@Component({
  selector: 'div[mbAccountCard]',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  styleUrl: './account-card.css',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { '[attr.data-inline]': 'inline()' },
})
export class MbAccountCard {
  readonly inline = input(false, { transform: booleanAttribute });
}
