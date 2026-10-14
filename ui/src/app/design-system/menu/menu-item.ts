import { booleanAttribute, Component, inject, input } from '@angular/core';
import { MbMenuGroup } from './menu-group';
import { MB_MENU_SURFACE } from './menu-surface';

/**
 * One row of a mixed-content menu: a native button or link, never a menuitem
 * role. Commands close the surrounding menu (focus returns to its trigger before
 * the caller's handler runs, so a follow-up dialog has a valid opener). Toggles
 * (`pressed`), disclosures (`expanded`) and `keepOpen` rows leave it open.
 */
@Component({
  selector: 'button[mbMenuItem], a[mbMenuItem]',
  template: '<ng-content />',
  styleUrl: './menu-item.css',
  host: {
    '[attr.data-tone]': 'tone()',
    '[attr.aria-pressed]': 'pressed()',
    '[attr.aria-expanded]': 'expanded()',
    '[attr.data-inline]': "group?.layout() === 'inline' || null",
    '(click)': 'activate()',
  },
})
export class MbMenuItem {
  readonly tone = input<'default' | 'danger'>('default');
  readonly pressed = input<boolean | null>(null);
  readonly expanded = input<boolean | null>(null);
  readonly keepOpen = input(false, { transform: booleanAttribute });
  protected readonly group = inject(MbMenuGroup, { optional: true });
  private readonly surface = inject(MB_MENU_SURFACE, { optional: true });

  protected activate(): void {
    if (this.keepOpen() || this.pressed() !== null || this.expanded() !== null) return;
    this.surface?.close();
  }
}
