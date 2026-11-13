import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import { ReadingHistory } from './reading-history';

/** One location, appearance and history behavior across every profile and thread. */
@Component({
  selector: 'app-reading-back',
  imports: [MbButton, TranslocoPipe],
  template: `<button mbButton variant="link" type="button" (click)="history.back()">
    <span aria-hidden="true">←</span> {{ 'pages.profile.actions.backWord' | transloco }}
  </button>`,
  styles: `
    :host {
      display: block;
      padding: 0.5rem 1rem;
    }
  `,
})
export class ReadingBack {
  protected history = inject(ReadingHistory);
}
