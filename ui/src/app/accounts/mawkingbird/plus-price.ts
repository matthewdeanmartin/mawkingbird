import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PlusCatalogue } from './plus-catalogue';

// i18n plus.price.loading: Checking price…
// i18n plus.price.unavailable: Pricing is temporarily unavailable.
// i18n plus.price.retry: Retry
@Component({
  selector: 'app-plus-price',
  imports: [TranslocoPipe],
  template: `@if (catalogue.label(); as price) {
      <span>{{ price }}</span>
    } @else if (catalogue.loading()) {
      <span>{{ 'plus.price.loading' | transloco }}</span>
    } @else {
      <span>{{ 'plus.price.unavailable' | transloco }}</span>
      <button class="btn btn-outline" type="button" (click)="catalogue.load(true)">
        {{ 'plus.price.retry' | transloco }}
      </button>
    }`,
})
export class PlusPrice {
  readonly catalogue = inject(PlusCatalogue);
  constructor() {
    void this.catalogue.load();
  }
}
