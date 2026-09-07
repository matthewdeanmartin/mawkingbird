import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { Api } from '../api';
import { Account } from '../models';
import { Terminology } from '../terminology';
import { FocusTrap } from '../a11y/focus-trap';

// i18n accountList.loading: Loading…
// i18n accountList.empty: Nobody yet.
// i18n accountList.close: Close

/** Which set of accounts to show for a status. */
export type AccountListMode = 'favourited_by' | 'reblogged_by';

/** A modal listing the accounts that favourited or boosted a status. */
@Component({
  selector: 'app-account-list-dialog',
  imports: [FocusTrap, RouterLink, TranslocoPipe],
  templateUrl: './account-list-dialog.html',
  styleUrl: './account-list-dialog.css',
})
export class AccountListDialog implements OnInit {
  private api = inject(Api);

  readonly statusId = input.required<string>();
  readonly mode = input.required<AccountListMode>();
  readonly closed = output<void>();

  protected accounts = signal<Account[]>([]);
  protected loading = signal(true);

  private words = inject(Terminology).words;

  protected get title(): string {
    return this.mode() === 'favourited_by' ? 'Favourited by' : this.words().BoostedBy;
  }

  ngOnInit(): void {
    const call: Observable<Account[]> =
      this.mode() === 'favourited_by'
        ? this.api.favouritedBy(this.statusId())
        : this.api.rebloggedBy(this.statusId());
    call.subscribe({
      next: (accounts) => {
        this.accounts.set(accounts);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
