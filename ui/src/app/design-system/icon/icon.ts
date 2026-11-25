import { booleanAttribute, Component, computed, input } from '@angular/core';
import { ICON_PATHS, MbIconName } from './icon-paths';

/**
 * One of the app's shared glyphs. Decorative: the owning control carries the
 * accessible name, so an icon is always hidden from assistive technology.
 */
@Component({
  selector: 'mb-icon',
  template: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path [attr.d]="path()" [attr.fill]="solid() ? 'currentColor' : null" />
  </svg>`,
  styleUrl: './icon.css',
  host: { '[attr.data-size]': 'size()', '[attr.data-mirror]': 'mirrored() || null' },
})
export class MbIcon {
  readonly name = input.required<MbIconName>();
  readonly size = input<'regular' | 'small'>('regular');
  /** Solid rather than outlined, for a toggle that is on. Closed shapes only. */
  readonly filled = input(false, { transform: booleanAttribute });
  protected readonly path = computed(() => ICON_PATHS[this.name()]);
  protected readonly solid = computed(() => this.filled() || this.name() === 'play');
  /** Glyphs that point along the line of text. Transport keys never mirror. */
  protected readonly mirrored = computed(() => ['reply', 'list', 'queue'].includes(this.name()));
}
