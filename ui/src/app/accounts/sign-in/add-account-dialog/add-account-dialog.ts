import { Component, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbDialog } from '../../../design-system/dialog/dialog';
import { LoginDoors } from '../login-doors/login-doors';

// i18n addAccount.title: Add an account
// i18n addAccount.subtitle: Which network is the account on?
// i18n addAccount.close: Close

/**
 * One "+ Add account" entry in place of one per network: the menu stays short,
 * and the choice is the same list the `/login` page offers. Mount with @if.
 */
@Component({
  selector: 'app-add-account-dialog',
  imports: [MbDialog, LoginDoors, TranslocoPipe],
  template: `
    <mb-dialog
      [title]="'addAccount.title' | transloco"
      [description]="'addAccount.subtitle' | transloco"
      [closeLabel]="'addAccount.close' | transloco"
      [closeOnBackdrop]="true"
      (dismissed)="closed.emit()"
    >
      <app-login-doors [adding]="true" [reload]="true" />
    </mb-dialog>
  `,
})
export class AddAccountDialog {
  readonly closed = output<void>();
}
