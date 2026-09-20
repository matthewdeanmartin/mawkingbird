import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Account } from '../models';
import { AccountHoverCard } from './account-hover-card';

// i18n accountPreview.open: Preview profile
// i18n accountPreview.close: Close preview
@Component({
  selector: 'app-account-preview',
  imports: [AccountHoverCard, TranslocoPipe],
  template: `
    <div class="summary" (pointerenter)="enter($event)" (pointerleave)="leave()">
      <ng-content />
      <button
        #toggle
        type="button"
        class="btn btn-sm btn-outline"
        [attr.aria-expanded]="opened()"
        (click)="pinned = !pinned; opened.set(pinned)"
        (keydown.escape)="dismiss(); $event.stopPropagation()"
      >
        {{ (opened() ? 'accountPreview.close' : 'accountPreview.open') | transloco }}
      </button>
    </div>
    @if (opened()) {
      <div
        tabindex="-1"
        (pointerenter)="cancelClose()"
        (pointerleave)="leave()"
        (focusin)="pinned = true"
        (keydown.escape)="dismiss(); toggle.focus(); $event.stopPropagation()"
      >
        <app-account-hover-card [account]="account()" inline />
      </div>
    }
  `,
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
    .summary button {
      font-size: 12px;
    }
  `,
})
export class AccountPreview {
  readonly account = input.required<Account>();
  protected opened = signal(false);
  protected pinned = false;
  private timer?: ReturnType<typeof setTimeout>;
  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancelClose());
  }
  protected enter(event: PointerEvent): void {
    if (event.pointerType === 'touch') return;
    this.cancelClose();
    this.timer = setTimeout(() => this.opened.set(true), 200);
  }
  protected cancelClose(): void {
    clearTimeout(this.timer);
  }
  protected leave(): void {
    this.cancelClose();
    if (!this.pinned) this.timer = setTimeout(() => this.opened.set(false), 250);
  }
  protected dismiss(): void {
    this.cancelClose();
    this.pinned = false;
    this.opened.set(false);
  }
}
