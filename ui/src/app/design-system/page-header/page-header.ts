import { Component, input } from '@angular/core';

@Component({
  selector: 'mb-page-header',
  template: `
    <div class="copy">
      @if (level() === 1) {
        <h1>{{ title() }}</h1>
      } @else {
        <h2>{{ title() }}</h2>
      }
      @if (description()) {
        <p>{{ description() }}</p>
      }
    </div>
    <div class="actions"><ng-content /></div>
  `,
  styleUrl: './page-header.css',
})
export class MbPageHeader {
  readonly title = input.required<string>();
  readonly description = input('');
  readonly level = input<1 | 2>(1);
}

let nextId = 0;
@Component({
  selector: 'mb-section',
  template:
    '<section [attr.aria-labelledby]="headingId"><h2 [id]="headingId">{{ title() }}</h2><ng-content /></section>',
  styleUrl: './section.css',
})
export class MbSection {
  readonly title = input.required<string>();
  readonly headingId = `mb-section-${nextId++}`;
}
