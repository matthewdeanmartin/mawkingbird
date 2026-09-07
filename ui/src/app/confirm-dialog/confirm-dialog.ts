import { Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FocusTrap } from '../a11y/focus-trap';

// i18n confirm.cancel: Cancel

/**
 * A small yes/no confirmation modal. The host owns the open/closed state and
 * reacts to (confirmed); the dialog just renders the prompt and two buttons.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [FocusTrap, TranslocoPipe],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.css',
})
export class ConfirmDialog {
  readonly title = input.required<string>();
  readonly message = input<string>('');
  readonly confirmLabel = input<string>('Confirm');
  readonly danger = input<boolean>(true);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
