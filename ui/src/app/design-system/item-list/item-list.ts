import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { Params, RouterLink } from '@angular/router';

/** A list of things to act on. `ol` numbers its rows; `ul` does not. */
@Component({
  selector: 'ul[mbItemList], ol[mbItemList]',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './item-list.css',
})
export class MbItemList {}

/**
 * One row: an optional picture, a title with a quiet line under it, and the
 * row's own actions at the end, which drop below the title when narrow.
 *
 * Put a compact embedded toolbar (buttons) or post actions (links too) in the
 * default slot. Pills do not belong here; see design_system/action-rows.md.
 */
@Component({
  selector: 'li[mbItemRow]',
  template: `<div class="row">
    <ng-content select="mb-item-picture" />
    <div class="text">
      <ng-content select="[mbItemTitle]" />
      <ng-content select="[mbItemMeta]" />
    </div>
    <div class="actions"><ng-content /></div>
  </div>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './item-row.css',
})
export class MbItemRow {}

/** The row's name. As a link it opens the thing, so the row needs no Open button. */
@Component({
  selector: 'a[mbItemTitle], span[mbItemTitle]',
  template: '<ng-content />',
  styleUrl: './item-title.css',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { dir: 'auto' },
})
export class MbItemTitle {}

@Component({
  selector: 'span[mbItemMeta]',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './item-meta.css',
})
export class MbItemMeta {}

/** Decorative. With a `link` it repeats the title's, and stays out of the Tab order. */
@Component({
  selector: 'mb-item-picture',
  imports: [RouterLink],
  template: `
    @if (link(); as target) {
      <a [routerLink]="target" [queryParams]="queryParams()" tabindex="-1" aria-hidden="true"
        ><img [src]="src()" alt="" loading="lazy" referrerpolicy="no-referrer"
      /></a>
    } @else {
      <img [src]="src()" alt="" loading="lazy" referrerpolicy="no-referrer" />
    }
  `,
  styleUrl: './item-picture.css',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { '[attr.data-shape]': 'shape()' },
})
export class MbItemPicture {
  readonly src = input.required<string>();
  readonly link = input<string | null>(null);
  readonly queryParams = input<Params | null>(null);
  readonly shape = input<'square' | 'wide'>('square');
}
