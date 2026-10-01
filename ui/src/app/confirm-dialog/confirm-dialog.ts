import { Component, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbDialog } from '../design-system/dialog/dialog';
import { MbField, MbControl } from '../design-system/field/field';
import { MbButton } from '../design-system/button/button';

// i18n confirm.cancel: Cancel

/**
 * A small yes/no confirmation modal. The host owns the open/closed state and
 * reacts to (confirmed); the dialog just renders the prompt and two buttons.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MbDialog, MbField, MbControl, MbButton, TranslocoPipe],
  templateUrl: './confirm-dialog.html',
})
export class ConfirmDialog {
  readonly title = input.required<string>();
  readonly message = input<string>('');
  readonly confirmLabel = input<string>('Confirm');
  readonly danger = input<boolean>(true);
  readonly mode = input<'alert' | 'confirm' | 'prompt'>('confirm');
  readonly inputLabel = input<string>('');
  readonly value = signal('');
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
