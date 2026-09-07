import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AdminApi } from '../admin-api';
import { AdminAccount } from '../../models';

const STATUSES = ['active', 'pending', 'silenced', 'suspended', 'disabled'] as const;

// i18n adminAccounts.status.active: active
// i18n adminAccounts.status.pending: pending
// i18n adminAccounts.status.silenced: silenced
// i18n adminAccounts.status.suspended: suspended
// i18n adminAccounts.status.disabled: disabled
// i18n adminAccounts.loading: Loading…
// i18n adminAccounts.empty: No {{status}} accounts.
// i18n adminAccounts.actions.approve: Approve
// i18n adminAccounts.actions.reject: Reject
// i18n adminAccounts.actions.unsensitive: Unsensitive
// i18n adminAccounts.actions.unsilence: Unsilence
// i18n adminAccounts.actions.silence: Silence
// i18n adminAccounts.actions.unsuspend: Unsuspend
// i18n adminAccounts.actions.suspend: Suspend
// i18n adminAccounts.actions.enable: Enable
// i18n adminAccounts.actions.disable: Disable
// i18n adminAccounts.actions.delete: Delete
// i18n adminAccounts.confirm.reject: Reject and delete the pending registration for @{{username}}?
// i18n adminAccounts.confirm.delete: Permanently delete @{{username}}? This cannot be undone.
@Component({
  selector: 'app-admin-accounts',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './admin-accounts.html',
  styleUrl: './admin-accounts.css',
})
export class AdminAccounts implements OnInit {
  private api = inject(AdminApi);
  private transloco = inject(TranslocoService);

  protected readonly statuses = STATUSES;
  protected status = signal<string>('active');
  protected statusLabel = computed(() => this.statusLabelFor(this.status()));

  statusLabelFor(status: string): string {
    return this.transloco.translate<string>(`adminAccounts.status.${status}`);
  }
  protected accounts = signal<AdminAccount[]>([]);
  protected loading = signal(true);

  ngOnInit(): void {
    this.load();
  }

  setStatus(status: string): void {
    if (this.status() === status) {
      return;
    }
    this.status.set(status);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.accounts(this.status()).subscribe({
      next: (a) => {
        this.accounts.set(a);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  // After a state change the account usually moves between status tabs, so reload
  // the current view rather than patching one row. (The /action endpoint also
  // returns an empty body, so there is nothing to patch from.)
  moderate(a: AdminAccount, type: string): void {
    this.api.moderate(a.id, type).subscribe(() => this.load());
  }

  unsilence(a: AdminAccount): void {
    this.api.unsilence(a.id).subscribe(() => this.load());
  }

  unsuspend(a: AdminAccount): void {
    this.api.unsuspend(a.id).subscribe(() => this.load());
  }

  enable(a: AdminAccount): void {
    this.api.enable(a.id).subscribe(() => this.load());
  }

  approve(a: AdminAccount): void {
    this.api.approve(a.id).subscribe(() => this.load());
  }

  reject(a: AdminAccount): void {
    const message = this.transloco.translate<string>('adminAccounts.confirm.reject', {
      username: a.username,
    });
    if (!confirm(message)) {
      return;
    }
    this.api.reject(a.id).subscribe(() => this.load());
  }

  unsensitive(a: AdminAccount): void {
    this.api.unsensitive(a.id).subscribe(() => this.load());
  }

  remove(a: AdminAccount): void {
    const message = this.transloco.translate<string>('adminAccounts.confirm.delete', {
      username: a.username,
    });
    if (!confirm(message)) {
      return;
    }
    this.api.deleteAccount(a.id).subscribe(() => this.load());
  }
}
