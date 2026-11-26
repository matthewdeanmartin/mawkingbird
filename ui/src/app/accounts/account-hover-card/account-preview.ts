import {
  Component,
  DestroyRef,
  inject,
  input,
  signal,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbPopover } from '../../design-system/popover/popover';
import { Account } from '../../platform/api/models';
import { AccountHoverCard } from './account-hover-card';

// i18n accountPreview.open: Preview profile
// i18n accountPreview.close: Close preview
@Component({
  selector: 'app-account-preview',
  imports: [MbPopover, AccountHoverCard, TranslocoPipe],
  template: `
    <div
      #anchor
      class="summary"
      tabindex="0"
      aria-haspopup="dialog"
      [attr.aria-expanded]="opened()"
      [attr.aria-label]="'accountPreview.open' | transloco"
      (pointerenter)="enter($event)"
      (pointerleave)="leave()"
      (focusin)="focusIn($event)"
      (focusout)="focusOut($event)"
      (keydown)="anchorKey($event)"
    >
      <ng-content />
      <mb-popover
        [label]="'accountPreview.open' | transloco"
        [roomy]="true"
        [anchor]="anchor"
        (openedChange)="changed($event)"
        (panelEntered)="cancelClose()"
        (panelLeft)="leave()"
      >
        @if (opened()) {
          <app-account-hover-card [account]="account()" inline embedded />
        }
      </mb-popover>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      display: block;
      flex: 1;
      min-width: 0;
    }
    .summary {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
  `,
})
export class AccountPreview {
  readonly account = input.required<Account>();
  protected readonly popover = viewChild.required(MbPopover);
  protected opened = signal(false);
  private timer?: ReturnType<typeof setTimeout>;
  private destroyRef = inject(DestroyRef);

  constructor() {
    this.destroyRef.onDestroy(() => this.cancelClose());
  }
  protected focusIn(event: FocusEvent): void {
    this.cancelClose();
    // Escape returning focus from the card must not immediately reopen it.
    if (
      event.relatedTarget &&
      this.popover()
        .panel()
        .nativeElement.contains(event.relatedTarget as Node)
    )
      return;
    this.popover().show(false);
  }
  protected focusOut(event: FocusEvent): void {
    // Disabling a busy Follow button can blur it with no next target.
    // That is not a request to dismiss the profile the user is interacting with.
    if (
      event.relatedTarget &&
      !(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)
    )
      this.leave();
  }
  protected anchorKey(event: KeyboardEvent): void {
    if (event.target === event.currentTarget && ['Enter', ' ', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      if (this.opened()) this.popover().panel().nativeElement.focus({ preventScroll: true });
      else this.popover().show();
    }

    if (event.key === 'Escape') {
      this.popover().close();
      event.stopPropagation();
    }
  }
  protected enter(event: PointerEvent): void {
    if (event.pointerType === 'touch') return;
    this.cancelClose();
    this.timer = setTimeout(() => this.popover().show(false), 250);
  }
  protected cancelClose(): void {
    clearTimeout(this.timer);
  }
  protected leave(): void {
    this.cancelClose();
    this.timer = setTimeout(() => {
      const popover = this.popover();
      if (popover.panel().nativeElement.matches(':hover') || popover.anchor()?.matches(':hover'))
        return;
      popover.close(false);
    }, 400);
  }
  protected changed(open: boolean): void {
    this.opened.set(open);
    if (!open) this.cancelClose();
  }
}
