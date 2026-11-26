import { Component, computed, input, ChangeDetectionStrategy } from '@angular/core';
import { splitLinkedText } from './content-links';

/** Untrusted chat/translation text: Angular escapes every part; only HTTP(S) becomes a link. */
@Component({
  selector: 'app-linked-text',
  host: { dir: 'auto' },
  template: `@for (part of parts(); track $index) {
    @if (part.href) {
      <a [href]="part.href" (click)="$event.stopPropagation()">{{ part.text }}</a>
    } @else {
      <span>{{ part.text }}</span>
    }
  }`,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      /* Chat previews stay single-line; message/translation parents preserve newlines. */
      white-space: inherit;
      overflow-wrap: anywhere;
    }
  `,
})
export class LinkedText {
  readonly text = input.required<string>();
  protected readonly parts = computed(() => splitLinkedText(this.text()));
}
