import {
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MbButton } from '../button/button';

let nextId = 0;
/** Click-open, nonmodal surface. Native popover supplies light dismissal and top-layer ordering. */
@Component({
  selector: 'mb-popover',
  imports: [MbButton],
  template: `
    <button
      #trigger
      mbButton
      variant="outline"
      size="small"
      type="button"
      [class.help-trigger]="icon() === 'help'"
      [attr.aria-label]="label()"
      [attr.aria-haspopup]="kind()"
      [attr.aria-expanded]="opened()"
      [attr.aria-controls]="id"
      (click)="toggle()"
      (keydown)="triggerKey.emit($event)"
    >
      @if (icon() === 'help') {
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 0 1 5 .3c0 1.7-2.5 1.8-2.5 3.7" />
          <circle cx="12" cy="16.5" r=".8" fill="currentColor" stroke="none" />
        </svg>
      } @else {
        {{ label() }}
      }
    </button>
    <div
      #panel
      popover="auto"
      [class.roomy]="roomy()"
      tabindex="-1"
      [id]="id"
      [attr.role]="kind()"
      [attr.aria-label]="label()"
      [style.left.px]="position().x"
      [style.top.px]="position().y"
      (toggle)="sync($event)"
      (keydown)="keys($event)"
      (focusout)="leave($event)"
    >
      <ng-content />
    </div>
  `,
  styleUrl: './popover.css',
  host: { '(window:resize)': 'close()', '(window:scroll)': 'close()' },
})
export class MbPopover {
  readonly label = input.required<string>();
  readonly kind = input<'dialog' | 'menu'>('dialog');
  readonly roomy = input(false);
  readonly icon = input<'help' | null>(null);
  readonly openedChange = output<boolean>();
  readonly triggerKey = output<KeyboardEvent>();
  readonly opened = signal(false);
  readonly position = signal({ x: 0, y: 0 });
  readonly id = `mb-popover-${nextId++}`;
  readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  readonly trigger = viewChild.required<MbButton, ElementRef<HTMLButtonElement>>('trigger', {
    read: ElementRef,
  });

  private observer?: ResizeObserver;
  constructor() {
    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());
  }

  private reposition(): void {
    if (!this.opened()) return;
    const panel = this.panel().nativeElement;
    const anchor = this.trigger().nativeElement.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const rtl = getComputedStyle(panel).direction === 'rtl';
    this.position.set({
      x: Math.max(
        8,
        Math.min(rtl ? anchor.right - box.width : anchor.left, innerWidth - box.width - 8),
      ),
      y: Math.max(
        8,
        anchor.bottom + box.height + 8 <= innerHeight
          ? anchor.bottom + 4
          : anchor.top - box.height - 4,
      ),
    });
  }

  show(focus = true): void {
    if (this.opened()) return;
    const panel = this.panel().nativeElement;
    panel.showPopover();
    this.opened.set(true);
    this.reposition();
    if (typeof ResizeObserver !== 'undefined') {
      this.observer?.disconnect();
      this.observer = new ResizeObserver(() => this.reposition());
      this.observer.observe(panel);
    }
    if (focus && this.kind() === 'dialog')
      (
        panel.querySelector<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href], select:not([disabled]), textarea:not([disabled])',
        ) ?? panel
      ).focus({ preventScroll: true });
    this.openedChange.emit(true);
  }

  toggle(): void {
    if (this.opened()) this.close(false);
    else this.show();
  }

  close(restore = true): void {
    if (!this.opened()) return;
    this.panel().nativeElement.hidePopover();
    this.opened.set(false);
    this.observer?.disconnect();
    if (restore) this.trigger().nativeElement.focus({ preventScroll: true });
    this.openedChange.emit(false);
  }

  sync(event: Event): void {
    const open = (event as ToggleEvent).newState === 'open';
    if (this.opened() !== open) {
      this.opened.set(open);
      this.openedChange.emit(open);
    }
  }

  keys(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }

  leave(event: FocusEvent): void {
    const target = event.relatedTarget as Node | null;
    if (
      target &&
      !this.panel().nativeElement.contains(target) &&
      target !== this.trigger().nativeElement
    )
      this.close(false);
  }
}
