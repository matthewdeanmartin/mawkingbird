import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccountDataRef, inspectAccountData } from '../../../account-data';
import { Auth } from '../../../auth';
import {
  clearIndexedDbStore,
  DatabaseInfo,
  IndexedDbReport,
  inspectIndexedDb,
  StoreInfo,
} from '../../../observability/indexed-db-inspector';
import {
  formatBytes,
  StorageEntry,
  StorageReport,
} from '../../../observability/local-storage-inspector';
import { AnonymousAccount } from '../../../providers/anonymous/anonymous-account';
import { PageDiagnostics } from '../../../page-diagnostics';
import { TranslocoPipe } from '@jsverse/transloco';

interface StorageAccount {
  key: string;
  label: string;
  detail: string;
  scope: AccountDataRef;
  active: boolean;
}

/** Browser storage manager for every saved account plus origin-wide IndexedDB caches. */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.storage.title: Local storage
// i18n settings.storage.intro: Inspect account-scoped data without switching the active account.
// i18n settings.storage.clearAccount: Clear this account
// i18n settings.storage.account: Account
// i18n settings.storage.account.aria: Storage account
// i18n settings.storage.active: (active)
// i18n settings.storage.summary: {{count}} keys · {{size}}
// i18n settings.storage.deleteKey: Delete {{key}}
// i18n settings.storage.empty: This account has no local storage.
// i18n settings.storage.idb: IndexedDB
// i18n settings.storage.idb.hint: Shared browser caches, grouped by schema category. Sizes are approximate serialized payload sizes.
// i18n settings.storage.scanning: Scanning…
// i18n settings.storage.refresh: Refresh
// i18n settings.storage.records: {{count}} records
// i18n settings.storage.unknown: unknown
// i18n settings.storage.sizeUnavailable: size unavailable
// i18n settings.storage.deleteCategory: Delete category
// i18n settings.storage.idb.empty: No IndexedDB data is stored for this site.
// i18n settings.storage.idb.scanning: Scanning IndexedDB…
@Component({
  selector: 'app-settings-storage',
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './settings-storage.html',
  styleUrl: './settings-storage.css',
})
export class SettingsStorage {
  private readonly auth = inject(Auth);
  private readonly anonymous = inject(AnonymousAccount);
  private readonly diagnostics = inject(PageDiagnostics);

  protected readonly formatBytes = formatBytes;
  protected readonly accounts = computed<StorageAccount[]>(() => {
    const activeToken = this.auth.token();
    const rows = this.auth.sessions().map((session): StorageAccount => {
      const account = session.account;
      const host = (session.server ?? '').replace(/^https?:\/\//, '') || 'this server';
      return {
        key: `mastodon:${session.id}`,
        label: account?.display_name || account?.username || 'Unverified account',
        detail: account?.acct ? `@${account.acct}` : host,
        scope: {
          kind: 'mastodon',
          token: session.token,
          accountId: session.account?.id,
          server: session.server,
        },
        active: this.auth.mode() === 'mastodon' && session.token === activeToken,
      };
    });
    for (const identity of this.auth.blueskyAccounts()) {
      if (!identity.did) continue;
      rows.push({
        key: identity.key,
        label: identity.account?.display_name || identity.account?.username || 'Bluesky account',
        detail: identity.account?.acct ? `@${identity.account.acct}` : identity.did,
        scope: { kind: 'bluesky', did: identity.did },
        active:
          this.auth.mode() === 'bluesky' && this.auth.account()?.id === `bsky:${identity.did}`,
      });
    }
    rows.push({
      key: 'anonymous',
      label: 'Anonymous (local)',
      detail: `@${this.anonymous.account().acct}`,
      scope: { kind: 'anonymous' },
      active: this.auth.mode() === 'anonymous',
    });
    return rows;
  });

  protected readonly selectedAccount = signal(this.initialAccountKey());
  protected readonly storage = signal<StorageReport>(this.inspectSelectedAccount());
  protected readonly idb = signal<IndexedDbReport | null>(null);
  protected readonly idbLoading = signal(false);
  protected readonly idbError = signal('');

  constructor() {
    void this.refreshIndexedDb();
  }

  protected selectAccount(key: string): void {
    this.selectedAccount.set(key);
    this.storage.set(this.inspectSelectedAccount());
  }

  deleteKey(entry: StorageEntry): void {
    if (!confirm(`Delete local storage key "${entry.key}"? This can't be undone.`)) {
      return;
    }
    localStorage.removeItem(entry.key);
    this.storage.set(this.inspectSelectedAccount());
  }

  clearAll(): void {
    const entries = this.storage().entries;
    const account = this.selected();
    if (
      !entries.length ||
      !confirm(
        `Clear all local storage for ${account?.label ?? 'this account'}? This can't be undone.`,
      )
    ) {
      return;
    }
    for (const entry of entries) {
      localStorage.removeItem(entry.key);
    }
    if (account?.active) {
      location.reload();
    } else {
      this.storage.set(this.inspectSelectedAccount());
    }
  }

  protected async refreshIndexedDb(): Promise<void> {
    this.idbLoading.set(true);
    this.idbError.set('');
    try {
      this.idb.set(await inspectIndexedDb());
    } finally {
      this.idbLoading.set(false);
    }
  }

  protected async clearStore(database: DatabaseInfo, store: StoreInfo): Promise<void> {
    const label = this.storeLabel(database.name, store.name);
    if (
      !store.count ||
      !confirm(`Delete all ${store.count} records in ${label}? This can't be undone.`)
    ) {
      return;
    }
    this.idbLoading.set(true);
    this.idbError.set('');
    try {
      await clearIndexedDbStore(database.name, store.name);
      this.idb.set(await inspectIndexedDb());
    } catch (error: unknown) {
      this.diagnostics.error('Storage', 'indexeddb-delete:error', error, {
        database: database.name,
        store: store.name,
      });
      this.idbError.set(
        error instanceof Error ? error.message : 'IndexedDB data could not be deleted.',
      );
    } finally {
      this.idbLoading.set(false);
    }
  }

  protected storeLabel(database: string, store: string): string {
    const known: Record<string, string> = {
      'mockingbird_rss/feeds': 'RSS feed cache',
      'mockingbird_rss/profile_probes': 'Checked websites (friends’ blogs)',
      'mockingbird_rss/friend_opml': 'Friends’ blogs, as OPML',
      'mockingbird_twitter/timelines': 'Twitter timeline cache',
    };
    return known[`${database}/${store}`] ?? `${database} / ${store}`;
  }

  protected quotaLabel(): string {
    const quota = this.idb()?.quota;
    if (!quota || quota.usage === null) {
      return 'Browser storage usage unavailable';
    }
    return quota.quota === null
      ? `${formatBytes(quota.usage)} used`
      : `${formatBytes(quota.usage)} of ${formatBytes(quota.quota)} used`;
  }

  private initialAccountKey(): string {
    if (this.auth.mode() === 'mastodon') {
      const token = this.auth.token();
      const active = this.auth.sessions().find((session) => session.token === token);
      if (active) {
        return `mastodon:${active.id}`;
      }
    }
    if (this.auth.mode() === 'bluesky') {
      const active = this.auth
        .blueskyAccounts()
        .find((account) => account.account?.id === this.auth.account()?.id);
      if (active) return active.key;
    }
    return 'anonymous';
  }

  private selected(): StorageAccount | undefined {
    return this.accounts().find((account) => account.key === this.selectedAccount());
  }

  private inspectSelectedAccount(): StorageReport {
    const account = this.selected();
    return account ? inspectAccountData(account.scope) : { entries: [], totalBytes: 0 };
  }
}
