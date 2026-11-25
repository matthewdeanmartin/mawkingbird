import { NgTemplateOutlet } from '@angular/common';
import { booleanAttribute, Component, input } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { MbIcon } from '../icon/icon';
import { MbIconName } from '../icon/icon-paths';
import { MbPostAction, MbPostActions } from '../post-actions/post-actions';

/** One thing to do with an item: a button, an app link or a web link. */
export interface MbItemAction {
  id: string;
  icon: MbIconName;
  label: string;
  title?: string;
  /** Set on toggles only. */
  pressed?: boolean;
  disabled?: boolean;
  run?: (event: Event) => void;
  link?: string | (string | number)[];
  queryParams?: Params | null;
  href?: string;
}

/**
 * A row of icon-and-word actions without boxes: what a card uses instead of a
 * row of pills (design_system/action-rows.md). Buttons and links keep their
 * native roles and Tab order. Projected content follows the actions.
 */
@Component({
  selector: 'mb-item-actions',
  imports: [NgTemplateOutlet, RouterLink, MbIcon, MbPostAction, MbPostActions],
  template: `
    <ng-template #inside let-action>
      <mb-icon [name]="iconOf(action)" size="small" />
      <span [class.narrow-hidden]="iconsWhenNarrow()">{{ action.label }}</span>
    </ng-template>
    <mb-post-actions [label]="label()">
      @for (action of actions(); track action.id) {
        @if (action.link) {
          <a
            mbPostAction
            class="act"
            [routerLink]="action.link"
            [queryParams]="action.queryParams"
            [attr.title]="titleOf(action)"
            ><ng-container
              [ngTemplateOutlet]="inside"
              [ngTemplateOutletContext]="{ $implicit: action }"
          /></a>
        } @else if (action.href) {
          <a
            mbPostAction
            class="act"
            [href]="action.href"
            target="_blank"
            rel="noopener noreferrer"
            [attr.title]="titleOf(action)"
            ><ng-container
              [ngTemplateOutlet]="inside"
              [ngTemplateOutletContext]="{ $implicit: action }"
          /></a>
        } @else {
          <button
            mbPostAction
            class="act"
            type="button"
            [pressed]="action.pressed ?? null"
            [disabled]="!!action.disabled"
            [attr.title]="titleOf(action)"
            (click)="action.run?.($event)"
          >
            <ng-container
              [ngTemplateOutlet]="inside"
              [ngTemplateOutletContext]="{ $implicit: action }"
            />
          </button>
        }
      }
      <ng-content />
    </mb-post-actions>
  `,
  styleUrl: './item-actions.css',
})
export class MbItemActions {
  readonly actions = input.required<readonly MbItemAction[]>();
  readonly label = input.required<string>();
  /** In a feed of many rows: icons at phone width, names kept for assistive technology. */
  readonly iconsWhenNarrow = input(false, { transform: booleanAttribute });

  /** Template contexts are untyped; this restores the action's type. */
  protected iconOf(action: MbItemAction): MbIconName {
    return action.icon;
  }

  protected titleOf(action: MbItemAction): string | null {
    return action.title || (this.iconsWhenNarrow() ? action.label : null);
  }
}
