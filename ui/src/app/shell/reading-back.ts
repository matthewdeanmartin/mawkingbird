import { Component, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import { ReadingHistory } from './reading-history';

/** One location, appearance and history behavior across every profile and thread. */
@Component({
  selector: 'app-reading-back',
  imports: [MbButton, TranslocoPipe],
  template: `<button mbButton variant="link" type="button" (click)="history.back(fallback())">
    <span aria-hidden="true">←</span> {{ 'pages.profile.actions.backWord' | transloco }}
  </button>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      display: block;
      padding: 0.5rem 1rem;
    }
  `,
})
export class ReadingBack {
  protected history = inject(ReadingHistory);
  /** Where Back goes when the page was opened directly, with nothing to go back to. */
  readonly fallback = input('/home');
}
