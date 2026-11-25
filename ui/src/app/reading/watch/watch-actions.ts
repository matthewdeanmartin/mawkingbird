import { NgTemplateOutlet } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MbPostAction, MbPostActions } from '../../design-system/post-actions/post-actions';

/** 24×24 stroke icons, hand-drawn for this row. */
const ICONS = {
  like: 'M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z',
  boost: 'M5 11V8h11M13 5l3 3-3 3M19 13v3H8M11 19l-3-3 3-3',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1-4 4-5 8-5s7 1 8 5',
  creator:
    'M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 19c1-4 3.5-5 7-5 1 0 2 .1 2.8.3M16 14v6l5-3z',
  rss: 'M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8M6 18h.01',
  bell: 'M6 17V11a6 6 0 0 1 12 0v6M4 17h16M10 20h4',
  channel: 'M4 6h16v11H4zM10 9.5v4l3.5-2zM8 20h8',
  share: 'M12 15V4M8 8l4-4 4 4M5 13v6h14v-6',
  queue: 'M4 6h16M4 11h16M4 16h8M18 14v6M15 17h6',
  open: 'M13 5h6v6M19 5l-8 8M17 14v5H5V7h5',
  find: 'M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM20 20l-4.5-4.5',
} as const;

/** One thing to do with the video or its post: a button, an app link or a web link. */
export interface WatchAction {
  id: string;
  icon: keyof typeof ICONS;
  label: string;
  title?: string;
  /** Set on toggles only. */
  pressed?: boolean;
  disabled?: boolean;
  run?: (event: Event) => void;
  link?: (string | number)[];
  href?: string;
}

/** The actions under the Watch player: the post card's action row, with words. */
@Component({
  selector: 'app-watch-actions',
  imports: [NgTemplateOutlet, RouterLink, MbPostAction, MbPostActions],
  template: `
    <ng-template #inside let-action>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="iconOf(action)" /></svg>
      <span>{{ action.label }}</span>
    </ng-template>
    <mb-post-actions [label]="label()">
      @for (action of actions(); track action.id) {
        @if (action.link) {
          <a mbPostAction class="act" [routerLink]="action.link" [attr.title]="action.title || null"
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
            [attr.title]="action.title || null"
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
            [attr.title]="action.title || null"
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
  styles: `
    svg {
      fill: none;
      flex: none;
      height: 18px;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.8;
      width: 18px;
    }
    .act:not(:disabled) {
      color: var(--ds-action-text);
    }
  `,
  host: { '[style.display]': '"block"' },
})
export class WatchActions {
  readonly actions = input.required<readonly WatchAction[]>();
  readonly label = input.required<string>();

  /** Template contexts are untyped; this restores the action's type. */
  protected iconOf(action: WatchAction): string {
    return ICONS[action.icon];
  }
}
