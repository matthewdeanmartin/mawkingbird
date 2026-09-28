import {
  afterNextRender,
  Component,
  ElementRef,
  input,
  OnDestroy,
  output,
  viewChild,
} from '@angular/core';
import { MbButton } from '../button/button';

let nextId = 0;
const locks = new WeakMap<HTMLElement, { count: number; overflow: string; gutter: string }>();

/** Mount with @if. The caller owns dismissal, saving and confirmation. */
@Component({
  selector: 'mb-dialog',
  imports: [MbButton],
  template: `
    <dialog
      #dialog
      [attr.role]="dialogRole()"
      [attr.aria-labelledby]="id"
      [attr.aria-describedby]="description() ? id + '-description' : null"
      (cancel)="cancel($event)"
    >
      <header>
        <h2 [id]="id">{{ title() }}</h2>
        @if (showClose()) {
          <button
            mbButton
            variant="outline"
            size="small"
            type="button"
            [disabled]="busy()"
            (click)="dismissed.emit('button')"
          >
            {{ closeLabel() }}
          </button>
        }
      </header>
      @if (description()) {
        <p [id]="id + '-description'">{{ description() }}</p>
      }
      <div class="body"><ng-content /></div>
      <footer><ng-content select="[mbDialogActions]" /></footer>
    </dialog>
  `,
  styleUrl: './dialog.css',
})
export class MbDialog implements OnDestroy {
  readonly title = input.required<string>();
  readonly closeLabel = input.required<string>();
  readonly description = input('');
  readonly dialogRole = input<'dialog' | 'alertdialog'>('dialog');
  readonly showClose = input(true);
  readonly busy = input(false);
  readonly closeOnBackdrop = input(false);
  readonly dismissed = output<'button' | 'escape' | 'backdrop'>();
  readonly id = `mb-dialog-${nextId++}`;
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private root?: HTMLElement;
  private opener?: HTMLElement;
  private startedOutside = false;
  private readonly listeners = new AbortController();

  constructor() {
    afterNextRender(() => {
      const dialog = this.dialog().nativeElement;
      // Native dialog already supports focus; register its pointer/Tab boundary
      // behavior directly rather than adding an artificial tabindex to it.
      const options = { signal: this.listeners.signal };
      dialog.addEventListener('pointerdown', (event) => this.backdropStart(event), options);
      dialog.addEventListener('click', (event) => this.backdrop(event), options);
      dialog.addEventListener(
        'keydown',
        (event) => {
          if (event.key === 'Tab') this.cycleFocus(event);
          // Do not let legacy document-level Escape handlers dismiss a parent.
          // The native cancel event still handles this dialog's dismissal.
          if (event.key === 'Escape') {
            event.stopPropagation();
            // Dismissal restores parent focus before keyup. Consume that matching
            // release too, or a legacy parent's keyup.escape closes it as well.
            // This one-shot listener intentionally survives this dialog's removal.
            dialog.ownerDocument.addEventListener(
              'keyup',
              (release) => {
                if (release.key === 'Escape') release.stopPropagation();
              },
              { capture: true, once: true },
            );
          }
        },
        options,
      );
      this.opener = dialog.ownerDocument.activeElement as HTMLElement;
      dialog.showModal();
      this.root = dialog.ownerDocument.documentElement;
      const lock = locks.get(this.root);
      if (lock) lock.count++;
      else {
        locks.set(this.root, {
          count: 1,
          overflow: this.root.style.overflow,
          gutter: this.root.style.scrollbarGutter,
        });
        this.root.style.scrollbarGutter = 'stable';
        this.root.style.overflow = 'hidden';
      }
    });
  }

  cancel(event: Event): void {
    event.preventDefault();
    if (!this.busy()) this.dismissed.emit('escape');
  }

  /** Native modality makes the background inert; keep Tab at the dialog's ends too. */
  cycleFocus(event: KeyboardEvent): void {
    const dialog = this.dialog().nativeElement;
    const target = event.target as HTMLElement;
    if (target.closest('dialog') !== dialog || target.closest('[popover]:popover-open')) return;
    const items = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex]',
      ),
    ].filter(
      (item) =>
        item.tabIndex >= 0 &&
        !item.matches(':disabled') &&
        item.getClientRects().length > 0 &&
        item.closest('dialog') === dialog,
    );
    if (!items.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (target === first || target === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (target === last || target === dialog)) {
      event.preventDefault();
      first.focus();
    }
  }

  backdrop(event: MouseEvent): void {
    const dialog = this.dialog().nativeElement;
    if (!this.startedOutside || event.target !== dialog || this.busy() || !this.closeOnBackdrop())
      return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      this.dismissed.emit('backdrop');
  }

  backdropStart(event: PointerEvent): void {
    const dialog = this.dialog().nativeElement;
    const rect = dialog.getBoundingClientRect();
    this.startedOutside =
      event.target === dialog &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom);
  }

  ngOnDestroy(): void {
    this.listeners.abort();
    const dialog = this.dialog().nativeElement;
    const active = dialog.ownerDocument.activeElement;
    const restore =
      active === dialog.ownerDocument.body || active === dialog || dialog.contains(active);
    if (dialog.open) dialog.close();
    if (this.root) {
      const lock = locks.get(this.root)!;
      if (--lock.count === 0) {
        this.root.style.overflow = lock.overflow;
        this.root.style.scrollbarGutter = lock.gutter;
        locks.delete(this.root);
      }
    }
    if (restore && this.opener?.isConnected) this.opener.focus({ preventScroll: true });
  }
}
