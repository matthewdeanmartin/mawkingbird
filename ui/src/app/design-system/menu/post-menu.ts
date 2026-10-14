import { Component, input, output, viewChild } from '@angular/core';
import { MbPopover } from '../popover/popover';
import { MbMenuItem } from './menu-item';
import { MbMenuSeparator } from './menu-separator';
import { MB_MENU_SURFACE, MbMenuSurface } from './menu-surface';

/**
 * A post's ••• overflow menu: a compact PostAction trigger and a nonmodal
 * list-layout popover of projected menu rows, ending with a Close row.
 *
 * Native popover supplies tap-outside dismissal, Escape, top-layer ordering over
 * neighbouring cards and viewport clamping. The built-in Close row stays because
 * on a small screen a tall menu can sit over the trigger that opened it.
 * Clicks and keys are kept from the parent card, as with Help.
 */
@Component({
  selector: 'mb-post-menu',
  imports: [MbPopover, MbMenuItem, MbMenuSeparator],
  providers: [{ provide: MB_MENU_SURFACE, useExisting: MbPostMenu }],
  template: `<mb-popover
    [label]="label()"
    icon="more"
    layout="list"
    (openedChange)="openedChange.emit($event)"
  >
    <ng-content />
    <mb-menu-separator />
    <button type="button" mbMenuItem class="close">{{ closeLabel() }}</button>
  </mb-popover>`,
  host: {
    '(click)': '$event.stopPropagation()',
    '(keydown)': 'keys($event)',
    '[style.display]': '"inline-flex"',
  },
})
export class MbPostMenu implements MbMenuSurface {
  readonly label = input.required<string>();
  readonly closeLabel = input.required<string>();
  readonly openedChange = output<boolean>();
  readonly popup = viewChild.required(MbPopover);

  close(restoreFocus = true): void {
    this.popup().close(restoreFocus);
  }

  protected keys(event: KeyboardEvent): void {
    if (event.key !== 'Escape') event.stopPropagation();
  }
}
