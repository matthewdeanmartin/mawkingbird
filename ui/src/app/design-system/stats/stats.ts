import {
  Component,
  computed,
  input,
  ViewEncapsulation,
  ChangeDetectionStrategy,
} from '@angular/core';

/**
 * A grid of headline numbers as a native description list:
 * `<dl mbStatGrid>` with `<div><dt>Label</dt><dd>1,234</dd></div>` children.
 *
 * The caller formats the numbers for the reader's locale and owns what they
 * mean. Tiles wrap to the available width, two to a row on phones. Styles are
 * namespaced under `[mbStatGrid]` because projected `dt`/`dd` cannot be
 * reached by encapsulated CSS.
 */
@Component({
  selector: 'dl[mbStatGrid]',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './stats.css',
})
export class MbStatGrid {}

export interface MbBarItem {
  label: string;
  value: number;
  /** The formatted value shown beside the bar; `value` as text when absent. */
  display?: string;
}

/**
 * A short ranked or ordered list with a proportional bar per row: posts per
 * year, top hashtags. Every row shows its label and its value as text, so the
 * bars are decoration (`aria-hidden`) and the list reads the same without them.
 * Not a chart: no axes, tooltips or interaction. Bars scale to the largest
 * value; a zero value keeps a hairline so its row is not mistaken for missing.
 */
@Component({
  selector: 'mb-bar-list',
  template: `
    <ol [attr.aria-label]="label()">
      @for (item of items(); track item.label) {
        <li>
          <span class="label">{{ item.label }}</span>
          <span class="track" aria-hidden="true">
            <span class="bar" [style.inline-size.%]="(100 * item.value) / peak()"></span>
          </span>
          <span class="value">{{ item.display ?? item.value }}</span>
        </li>
      }
    </ol>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './bar-list.css',
})
export class MbBarList {
  /** The list's accessible name. */
  readonly label = input.required<string>();
  readonly items = input<readonly MbBarItem[]>([]);

  protected readonly peak = computed(() => Math.max(1, ...this.items().map((item) => item.value)));
}
