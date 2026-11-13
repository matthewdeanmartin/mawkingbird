import { Component, computed, input } from '@angular/core';
import { splitLinkedText } from './content-links';

/** Untrusted chat/translation text: Angular escapes every part; only HTTP(S) becomes a link. */
@Component({
  selector: 'app-linked-text',
  template: `@for (part of parts(); track $index) {
    @if (part.href) {
      <a [href]="part.href" (click)="$event.stopPropagation()">{{ part.text }}</a>
    } @else {
      <span>{{ part.text }}</span>
    }
  }`,
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
