import { Component, input, output, viewChild } from '@angular/core';
import { MbPopover } from '../popover/popover';

export interface MbMenuAction {
  id: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
}

@Component({
  selector: 'mb-action-menu',
  imports: [MbPopover],
  template: `<mb-popover
    #popup
    [label]="label()"
    kind="menu"
    (openedChange)="opened($event)"
    (triggerKey)="triggerKey($event)"
  >
    @for (action of actions(); track action.id) {
      <button
        type="button"
        role="menuitem"
        tabindex="-1"
        [disabled]="action.disabled"
        [attr.data-danger]="action.danger || null"
        (click)="choose(action)"
        (keydown)="navigate($event)"
      >
        {{ action.label }}
      </button>
    }
  </mb-popover>`,
  styleUrl: './action-menu.css',
})
export class MbActionMenu {
  readonly label = input.required<string>();
  readonly actions = input.required<readonly MbMenuAction[]>();
  readonly chosen = output<string>();
  readonly popup = viewChild.required<MbPopover>('popup');
  private buffer = '';
  private typedAt = 0;

  private items(): HTMLButtonElement[] {
    return [
      ...this.popup()
        .panel()
        .nativeElement.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    ];
  }

  focus(index: number): void {
    const items = this.items();
    const panel = this.popup().panel().nativeElement;
    if (!items.length) {
      panel.focus({ preventScroll: true });
      return;
    }
    const item = items[(index + items.length) % items.length];
    item.focus({ preventScroll: true });
    if (item.offsetTop < panel.scrollTop) panel.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > panel.scrollTop + panel.clientHeight)
      panel.scrollTop = item.offsetTop + item.offsetHeight - panel.clientHeight;
  }

  opened(open: boolean): void {
    if (!open) return;
    this.buffer = '';
    this.typedAt = 0;
    this.focus(0);
  }

  triggerKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    this.popup().show();
    this.focus(event.key === 'ArrowUp' ? -1 : 0);
  }

  choose(action: MbMenuAction): void {
    if (action.disabled) return;
    this.popup().close();
    this.chosen.emit(action.id);
  }

  navigate(event: KeyboardEvent): void {
    const items = this.items();
    const current = items.indexOf(event.target as HTMLButtonElement);
    if (event.key === 'Tab') {
      this.popup().close();
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = current + 1;
        break;
      case 'ArrowUp':
        next = current - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default: {
        if (event.key.length !== 1 || event.key === ' ') return;
        const now = Date.now();
        this.buffer =
          now - this.typedAt < 500
            ? this.buffer + event.key.toLocaleLowerCase()
            : event.key.toLocaleLowerCase();
        this.typedAt = now;
        const query = [...this.buffer].every((letter) => letter === this.buffer[0])
          ? this.buffer[0]
          : this.buffer;
        next = items.findIndex((_, offset) =>
          items[(current + 1 + offset) % items.length].textContent
            ?.trim()
            .toLocaleLowerCase()
            .startsWith(query),
        );
        if (next < 0) return;
        next = current + 1 + next;
      }
    }
    event.preventDefault();
    this.focus(next);
  }
}
