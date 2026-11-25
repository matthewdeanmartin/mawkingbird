import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbPostAction, MbPostActions } from '../../design-system/post-actions/post-actions';

// i18n watch.actions.groupPost: This post
// i18n watch.actions.groupVideo: This video

/** 24×24 stroke icons, hand-drawn for this row. */
const ICONS = {
  like: 'M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z',
  boost: 'M5 11V8h11M13 5l3 3-3 3M19 13v3H8M11 19l-3-3 3-3',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1-4 4-5 8-5s7 1 8 5',
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
  group: 'post' | 'video';
  title?: string;
  /** Set on toggles only. */
  pressed?: boolean;
  disabled?: boolean;
  run?: (event: Event) => void;
  link?: (string | number)[];
  linkParams?: Params;
  href?: string;
}

/**
 * How the row is drawn. Five candidates for the owner to choose from; the four
 * not chosen are to be deleted with this type.
 */
export type WatchActionsLook = 'columns' | 'post' | 'text' | 'strip' | 'groups';

/** The actions under the Watch player. */
@Component({
  selector: 'app-watch-actions',
  imports: [NgTemplateOutlet, RouterLink, TranslocoPipe, MbPostAction, MbPostActions],
  template: `
    <ng-template #inside let-action>
      @if (look() !== 'text') {
        <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons[iconOf(action)]" /></svg>
      }
      <span class="label">{{ action.label }}</span>
    </ng-template>

    <ng-template #item let-action>
      @if (action.link) {
        <a
          class="act"
          [routerLink]="action.link"
          [queryParams]="action.linkParams"
          [attr.title]="action.title || null"
          ><ng-container
            [ngTemplateOutlet]="inside"
            [ngTemplateOutletContext]="{ $implicit: action }"
        /></a>
      } @else if (action.href) {
        <a
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
          class="act"
          type="button"
          [disabled]="!!action.disabled"
          [attr.aria-pressed]="action.pressed ?? null"
          [attr.title]="action.title || null"
          (click)="action.run?.($event)"
        >
          <ng-container
            [ngTemplateOutlet]="inside"
            [ngTemplateOutletContext]="{ $implicit: action }"
          />
        </button>
      }
    </ng-template>

    @switch (look()) {
      @case ('post') {
        <mb-post-actions [label]="label()">
          @for (action of actions(); track action.id) {
            @if (action.link) {
              <a
                mbPostAction
                [routerLink]="action.link"
                [queryParams]="action.linkParams"
                [attr.title]="action.title || null"
                ><ng-container
                  [ngTemplateOutlet]="inside"
                  [ngTemplateOutletContext]="{ $implicit: action }"
              /></a>
            } @else if (action.href) {
              <a
                mbPostAction
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
        </mb-post-actions>
      }
      @case ('groups') {
        <div class="groups" role="group" [attr.aria-label]="label()">
          @for (group of groups(); track group.id) {
            <section>
              <h3>{{ group.title | transloco }}</h3>
              <div class="row">
                @for (action of group.actions; track action.id) {
                  <ng-container
                    [ngTemplateOutlet]="item"
                    [ngTemplateOutletContext]="{ $implicit: action }"
                  />
                }
              </div>
            </section>
          }
        </div>
      }
      @default {
        <div class="row" role="group" [attr.aria-label]="label()">
          @for (action of actions(); track action.id) {
            <ng-container
              [ngTemplateOutlet]="item"
              [ngTemplateOutletContext]="{ $implicit: action }"
            />
          }
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
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
    .row {
      display: flex;
      flex-wrap: wrap;
    }
    .act {
      align-items: center;
      background: none;
      border: 0;
      color: var(--text);
      cursor: pointer;
      display: inline-flex;
      font: 500 13px / 1.3 var(--app-font-family);
      gap: 6px;
      max-width: 100%;
      min-height: 32px;
      overflow-wrap: anywhere;
      padding: 4px 8px;
      text-decoration: none;
    }
    .act:hover:not(:disabled) {
      background: var(--hover);
    }
    .act:focus-visible {
      outline: 2px solid var(--ds-action-text);
      outline-offset: -2px;
    }
    .act:disabled {
      color: var(--muted);
      cursor: default;
    }
    .act[aria-pressed='true'] {
      color: var(--ds-action-text);
      font-weight: 700;
    }

    /* 1: icon over label. */
    :host([data-look='columns']) .act {
      border-radius: 8px;
      flex-direction: column;
      gap: 3px;
      justify-content: flex-start;
      padding: 6px;
      text-align: center;
      width: 92px;
    }
    :host([data-look='columns']) svg {
      height: 22px;
      width: 22px;
    }
    :host([data-look='columns']) .label {
      font-size: 12px;
    }

    /* 3: words and hairlines. */
    :host([data-look='text']) .act {
      color: var(--ds-action-text);
      padding-block: 2px;
    }
    :host([data-look='text']) .act + .act {
      border-inline-start: 1px solid var(--border);
    }
    :host([data-look='text']) .act:hover:not(:disabled) {
      background: none;
      text-decoration: underline;
    }
    :host([data-look='text']) .act:disabled {
      color: var(--muted);
    }

    /* 4: one ruled box of cells; the grid's gaps are the rules. */
    :host([data-look='strip']) .row {
      background: var(--border);
      border: 1px solid var(--border);
      border-radius: 4px;
      gap: 1px;
      overflow: hidden;
    }
    :host([data-look='strip']) .act {
      background: var(--col-bg);
      flex: 1 1 auto;
      justify-content: center;
      min-height: 36px;
      padding-inline: 10px;
    }
    :host([data-look='strip']) .act:hover:not(:disabled) {
      background: var(--hover);
    }
    :host([data-look='strip']) .act[aria-pressed='true'] {
      background: var(--accent-soft);
    }

    /* 5: what is about the post, and what is about the video. */
    .groups {
      border-block: 1px solid var(--border);
      display: flex;
      flex-wrap: wrap;
      gap: 4px 24px;
      padding-block: 6px;
    }
    .groups h3 {
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
      margin: 0;
    }
    .groups .act {
      border-radius: 4px;
      margin-inline-end: 8px;
      padding-inline: 0;
    }
    .groups .act:hover:not(:disabled) {
      background: none;
      text-decoration: underline;
    }
    @media (pointer: coarse) {
      .act {
        min-height: 44px;
      }
    }
  `,
  host: { '[attr.data-look]': 'look()' },
})
export class WatchActions {
  readonly actions = input.required<readonly WatchAction[]>();
  readonly look = input.required<WatchActionsLook>();
  readonly label = input.required<string>();
  protected readonly icons = ICONS;
  protected readonly groups = computed(() =>
    (
      [
        { id: 'post', title: 'watch.actions.groupPost' },
        { id: 'video', title: 'watch.actions.groupVideo' },
      ] as const
    )
      .map((group) => ({
        ...group,
        actions: this.actions().filter((action) => action.group === group.id),
      }))
      .filter((group) => group.actions.length),
  );

  /** Template contexts are untyped; this restores the icon's type. */
  protected iconOf(action: WatchAction): keyof typeof ICONS {
    return action.icon;
  }
}
