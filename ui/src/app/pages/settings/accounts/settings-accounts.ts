import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  AccountDataRef,
  deleteAccountData,
  formatBytes,
  inspectAccountData,
} from '../../../account-data';
import { Auth } from '../../../auth';
import { ConfirmDialog } from '../../../confirm-dialog/confirm-dialog';
import { Account } from '../../../models';
import { AnonymousAccount } from '../../../providers/anonymous/anonymous-account';
import { TranslocoPipe } from '@jsverse/transloco';

/** One credential stored in this browser, with the size of the data it owns. */
interface StoredAccount {
  /** Stable row key; also the token for Mastodon rows. */
  key: string;
  /** Mastodon token; null for Bluesky and Anonymous rows. */
  token: string | null;
  did?: string;
  kind: 'mastodon' | 'bluesky' | 'anonymous';
  scope: AccountDataRef;
  account: Account | null;
  /** Base URL this credential belongs to ('' = this server). */
  server: string;
  /** True when this is the account currently signed in. */
  active: boolean;
  keyCount: number;
  bytes: number;
}

/** What the open confirmation dialog would do. */
type PendingAction =
  | { kind: 'data'; target: StoredAccount }
  | { kind: 'data-and-logout'; target: StoredAccount };

/**
 * Signed-in accounts: list every credential saved in this browser and clean them up.
 *
 * This is the account-level counterpart to the Local storage page. That page is a
 * key-by-key inspector for whoever is signed in right now; this one works on whole
 * accounts — including ones you are *not* currently using — which is what you need
 * when you're logged in twice to the same server, or want to reset one account's
 * local data without signing out of it.
 *
 * The active account is deliberately restricted: wiping the data out from under the
 * running session leaves the app in a half-torn-down state. The one exception is
 * when it's the only account left, since there is then somewhere coherent to land
 * (the logged-out main screen), so that case is allowed and navigates away.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.accounts.title: Signed-in accounts
// i18n settings.accounts.intro: Every credential saved in this browser, and the local data each one owns. Use this to clean up duplicate logins, or to reset one account's local data without signing out of it.
// i18n settings.accounts.signedIn: Signed in
// i18n settings.accounts.localOnly: Local only
// i18n settings.accounts.keys.one: {{count}} key
// i18n settings.accounts.keys.other: {{count}} keys
// i18n settings.accounts.deleteData: Delete data
// i18n settings.accounts.deleteAndLeave: Delete data & leave
// i18n settings.accounts.deleteAndLogout: Delete data & log out
// i18n settings.accounts.footnote.before: Deleting data removes this browser's saved settings for that account — RSS feeds, linked accounts, local moderation and similar. It never touches anything on the server. For a key-by-key view of the current account, see
// i18n settings.accounts.footnote.link: Local storage
// i18n settings.accounts.footnote.after: .
// i18n common.delete: Delete
@Component({
  selector: 'app-settings-accounts',
  imports: [ConfirmDialog, TranslocoPipe],
  templateUrl: './settings-accounts.html',
  styleUrl: './settings-accounts.css',
})
export class SettingsAccounts {
  private auth = inject(Auth);
  private anonymous = inject(AnonymousAccount);
  private router = inject(Router);

  protected readonly formatBytes = formatBytes;

  /** Bumped after every mutation to re-read localStorage sizes. */
  private revision = signal(0);

  protected accounts = computed<StoredAccount[]>(() => {
    this.revision();
    const mode = this.auth.mode();
    const activeToken = this.auth.token();
    const rows: StoredAccount[] = this.auth.sessions().map((session) => ({
      key: `mastodon:${session.id}`,
      token: session.token,
      kind: 'mastodon' as const,
      scope: {
        kind: 'mastodon' as const,
        token: session.token,
        accountId: session.account?.id,
        server: session.server,
      },
      account: session.account,
      server: session.server ?? '',
      active: mode === 'mastodon' && session.token === activeToken,
      ...this.sizeOf({
        kind: 'mastodon',
        token: session.token,
        accountId: session.account?.id,
        server: session.server,
      }),
    }));
    for (const identity of this.auth.blueskyAccounts()) {
      if (!identity.did) continue;
      rows.push({
        key: identity.key,
        token: null,
        did: identity.did,
        kind: 'bluesky',
        scope: { kind: 'bluesky', did: identity.did },
        account: identity.account,
        server: identity.server,
        active: mode === 'bluesky' && this.auth.account()?.id === `bsky:${identity.did}`,
        ...this.sizeOf({ kind: 'bluesky', did: identity.did }),
      });
    }
    // Anonymous is a permanent local identity, so it is always a row — it owns
    // browser data (follows, posts) whether or not it is the active account.
    rows.push({
      key: 'anonymous',
      token: null,
      kind: 'anonymous',
      scope: { kind: 'anonymous' },
      account: this.anonymous.account(),
      server: this.anonymous.server(),
      active: mode === 'anonymous',
      ...this.sizeOf({ kind: 'anonymous' }),
    });
    return rows;
  });

  /**
   * True when there is no *other* account to fall back to. Anonymous is always
   * present as a row but is not a saved login, so "last" means: no saved
   * Mastodon sessions other than the active one. In that state, acting on the
   * active account is allowed precisely because signing out is a valid landing
   * place (the main screen).
   */
  protected isLastAccount = computed(() => {
    const others = this.accounts().filter((row) => !row.active && row.kind !== 'anonymous');
    return others.length === 0;
  });

  protected pending = signal<PendingAction | null>(null);
  protected notice = signal('');

  private sizeOf(scope: AccountDataRef): { keyCount: number; bytes: number } {
    const report = inspectAccountData(scope);
    return { keyCount: report.entries.length, bytes: report.totalBytes };
  }

  protected label(row: StoredAccount): string {
    if (row.kind === 'anonymous') {
      return 'Anonymous (local)';
    }
    const account = row.account;
    return account ? account.display_name || account.username : 'Unverified account';
  }

  protected handle(row: StoredAccount): string {
    const acct = row.account?.acct;
    const host = row.server.replace(/^https?:\/\//, '') || 'this server';
    return acct ? `@${acct}` : host;
  }

  /**
   * Whether this row's destructive actions are available. The active account is
   * blocked unless it is the last one, because there would otherwise be no
   * coherent state to return to.
   */
  protected canModify(row: StoredAccount): boolean {
    return !row.active || this.isLastAccount();
  }

  protected blockedReason(row: StoredAccount): string {
    return row.active && !this.canModify(row)
      ? 'Switch to another account first, or remove the others.'
      : '';
  }

  askDeleteData(row: StoredAccount): void {
    this.pending.set({ kind: 'data', target: row });
  }

  askDeleteDataAndLogout(row: StoredAccount): void {
    this.pending.set({ kind: 'data-and-logout', target: row });
  }

  protected dialogTitle = computed(() => {
    const action = this.pending();
    if (!action) {
      return '';
    }
    return action.kind === 'data' ? 'Delete this account’s data?' : 'Delete data and sign out?';
  });

  protected dialogMessage = computed(() => {
    const action = this.pending();
    if (!action) {
      return '';
    }
    const row = action.target;
    const what = `${row.keyCount} ${row.keyCount === 1 ? 'key' : 'keys'} (${formatBytes(row.bytes)})`;
    const scope = `${this.label(row)} ${this.handle(row)}`;
    if (action.kind === 'data') {
      return `This permanently deletes ${what} of browser data belonging to ${scope}. The saved login is kept, so you stay signed in. This can't be undone.`;
    }
    return `This permanently deletes ${what} of browser data belonging to ${scope} and removes the saved login. This can't be undone.`;
  });

  cancel(): void {
    this.pending.set(null);
  }

  confirm(): void {
    const action = this.pending();
    this.pending.set(null);
    if (!action || !this.canModify(action.target)) {
      return;
    }
    const row = action.target;
    const removed = deleteAccountData(row.scope);
    const logout = action.kind === 'data-and-logout';

    if (logout) {
      if (row.kind === 'anonymous') {
        // Anonymous can't be removed from the stable (it's permanent), so the
        // equivalent of "log out" is to leave it for the logged-out screen.
        this.auth.exitAnonymous();
      } else if (row.kind === 'bluesky' && row.did) {
        this.auth.removeBlueskyIdentity(row.did);
      } else if (row.token) {
        this.auth.removeSession(row.token);
      }
    }

    // Wiping the *active* account's data mid-session leaves the app holding
    // state that no longer exists, so land the user somewhere coherent instead.
    if (row.active) {
      if (logout || this.isLastAccount()) {
        this.auth.logout();
      }
      void this.router.navigateByUrl('/').then(() => location.reload());
      return;
    }

    this.revision.update((n) => n + 1);
    this.notice.set(
      removed
        ? `Deleted ${removed} ${removed === 1 ? 'key' : 'keys'} for ${this.label(row)}.`
        : `${this.label(row)} had no local data to delete.`,
    );
    setTimeout(() => this.notice.set(''), 4000);
  }
}
