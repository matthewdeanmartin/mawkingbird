import { Component, input, model } from '@angular/core';

@Component({
  selector: 'mb-disclosure',
  template: `<details [open]="expanded()" (toggle)="toggle($event)">
    <summary>{{ label() }}</summary>
    <div class="content"><ng-content /></div>
  </details>`,
  styleUrl: './disclosure.css',
})
export class MbDisclosure {
  readonly label = input.required<string>();
  readonly expanded = model(false);
  toggle(event: Event): void {
    this.expanded.set((event.target as HTMLDetailsElement).open);
  }
}
