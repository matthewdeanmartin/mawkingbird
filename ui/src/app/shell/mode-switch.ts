import { Component, computed, ElementRef, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { APP_MODES, AppModeService } from '../app-mode';
import { MbMenuItem } from '../design-system/menu/menu-item';
import { MB_MENU_SURFACE, MbMenuSurface } from '../design-system/menu/menu-surface';
import { MbPopover } from '../design-system/popover/popover';
import { MODE_ENTRIES, suggestedMode } from './mode-nav';

/**
 * The primary nav's last slot: the way between Mastodon, RSS and Video.
 *
 * Its face shows where you would most likely go next; opening it lists every
 * mode. An anchored {@link MbPopover} rather than a `<details>` like More,
 * because on phones this sits in the bottom bar: the popover measures the
 * room and opens upward there by itself, in the top layer, with no fixed-bar
 * stacking to fight. The rows are links, so each mode is a real destination;
 * arriving there is what changes the mode (see {@link AppModeService}).
 */
@Component({
  selector: 'app-mode-switch',
  imports: [RouterLink, TranslocoPipe, MbPopover, MbMenuItem],
  providers: [{ provide: MB_MENU_SURFACE, useExisting: ModeSwitch }],
  template: `
    <button
      #trigger
      type="button"
      class="mode-switch"
      aria-haspopup="dialog"
      [attr.aria-expanded]="popup.opened()"
      [attr.aria-controls]="popup.id"
      [attr.aria-label]="
        'shell.modeNav.switchAria' | transloco: { mode: (current().labelKey | transloco) }
      "
      (pointerdown)="openAtPointerDown = popup.opened()"
      (click)="toggle()"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="suggested().icon" /></svg>
      <span class="label">{{ suggested().labelKey | transloco }}</span>
      <svg class="caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
    </button>
    <mb-popover #popup [label]="'shell.modeNav.menu' | transloco" [anchor]="trigger" layout="list">
      @for (entry of entries; track entry.mode) {
        <a
          mbMenuItem
          class="mode-row"
          [routerLink]="entry.link"
          [attr.aria-current]="entry.mode === mode.mode() ? 'true' : null"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="entry.icon" /></svg>
          {{ entry.labelKey | transloco }}
        </a>
      }
    </mb-popover>
  `,
  styles: `
    :host {
      display: flex;
      align-items: stretch;
    }
    .mode-switch {
      min-width: 60px;
      padding: 0 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 0;
      background: transparent;
      color: var(--text);
      font: inherit;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
    }
    .mode-switch:hover,
    .mode-switch[aria-expanded='true'] {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .mode-switch:focus-visible {
      outline: 2px solid var(--text);
      outline-offset: -2px;
    }
    svg {
      width: 20px;
      height: 20px;
      flex: 0 0 auto;
      fill: none;
      stroke: currentcolor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.9;
    }
    .caret {
      width: 14px;
      height: 14px;
    }
    .mode-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .mode-row[aria-current='true'] {
      font-weight: 700;
    }
    .mode-row[aria-current='true']::after {
      content: '✓' / '';
      margin-inline-start: auto;
    }
    /* Mirrors the shell: tighter tabs below 1320px, the bottom bar at 720px. */
    @media (max-width: 1320px) {
      .mode-switch {
        min-width: 56px;
        padding-inline: 8px;
      }
    }
    @media (max-width: 720px) {
      :host {
        flex: 1;
      }
      .mode-switch {
        flex: 1;
        min-width: 0;
        padding: 0;
        gap: 2px;
      }
      .label {
        display: none;
      }
      /* The bar is at the bottom, so the menu opens upward: say so. */
      .caret {
        transform: rotate(180deg);
      }
    }
  `,
})
export class ModeSwitch implements MbMenuSurface {
  protected readonly mode = inject(AppModeService);
  protected readonly entries = APP_MODES.map((mode) => MODE_ENTRIES[mode]);
  protected readonly current = computed(() => MODE_ENTRIES[this.mode.mode()]);
  protected readonly suggested = computed(() => MODE_ENTRIES[suggestedMode(this.mode.mode())]);
  private readonly popup = viewChild.required(MbPopover);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  /**
   * Whether the menu was open when the trigger was pressed.
   *
   * The panel is `popover="auto"`, and the anchor is outside it, so pressing
   * the trigger light-dismisses an open menu before the click arrives. Without
   * remembering, that click would reopen the menu it was meant to close.
   */
  protected openAtPointerDown = false;

  protected toggle(): void {
    const wasOpen = this.openAtPointerDown || this.popup().opened();
    this.openAtPointerDown = false;
    if (wasOpen) {
      this.popup().close(false);
    } else {
      this.popup().show();
    }
  }

  close(restoreFocus = true): void {
    this.popup().close(false);
    if (restoreFocus) {
      this.trigger().nativeElement.focus({ preventScroll: true });
    }
  }
}
