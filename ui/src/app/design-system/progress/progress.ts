import { Component, computed, input } from '@angular/core';

let nextId = 0;

/**
 * A labelled native `<progress>` for long-running work the reader can watch:
 * a visible label, an optional caption ("Checked 120 of 3,400"), and the bar.
 *
 * Native semantics carry the value to assistive technology; the caption is
 * plain text, not a live region. A caller that wants changes announced owns
 * that region (usually the surrounding summary). Without a `max` the bar is
 * indeterminate.
 */
@Component({
  selector: 'mb-progress',
  template: `
    <div class="row">
      <span class="label" [id]="labelId">{{ label() }}</span>
      @if (caption()) {
        <span class="caption">{{ caption() }}</span>
      }
    </div>
    @if (determinate()) {
      <progress [attr.aria-labelledby]="labelId" [value]="value()" [max]="max()"></progress>
    } @else {
      <progress [attr.aria-labelledby]="labelId"></progress>
    }
  `,
  styleUrl: './progress.css',
})
export class MbProgress {
  readonly label = input.required<string>();
  readonly caption = input('');
  readonly value = input(0);
  /** Zero or less means indeterminate. */
  readonly max = input(0);

  protected readonly labelId = `mb-progress-${nextId++}`;
  protected readonly determinate = computed(() => this.max() > 0);
}
